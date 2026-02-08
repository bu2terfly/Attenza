import { auth, db } from './firebase-init.js';
import {
    doc, getDoc, getDocs, collection, query, where, documentId,
    runTransaction, serverTimestamp, orderBy, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Routine Service Import ---
import {
    fetchRoutineWithVersionCheck,
    buildTodaySchedule,
    saveUserClassId,
    getUserClassId,
    clearRoutineCache
} from './routine-service.js';

// --- Global State ---
let currentUser = null;
let userProfile = null;
let unsubscribeToday = null; // Listener for today's attendance
let todaySubjectsList = []; // Track today's subjects globally
let pendingResetSubject = null; // Track subject being reset to prevent listener override
let currentPeriodMode = 'all'; // 'all' | '7days' | 'custom'
let userSignupKey = null; // Cached signup date for "All Time" calculations

// ============================================
// === AGGRESSIVE CACHING LAYER (Production) ===
// ============================================

// Cache Keys
const CACHE_KEYS = {
    PROFILE: 'attenza_profile_v2',
    SUBJECTS: 'attenza_subjects_v2',
    SUMMARY: 'attenza_summary_v2',
    WEEKLY: 'attenza_weekly_v2',
    ATTENDANCE: 'attenza_attendance_v2'
};

// In-Memory Caches (Session-level, super fast)
let memoryCache = {
    subjects: null,        // Array of subject objects
    summary: null,         // Summary data object
    weeklyAggregates: {},  // { 'yyyy-Www': { total, present, subjects: {} } }
    attendanceByDate: {}   // { 'yyyy-mm-dd': { records: {} } }
};

// --- Cache Helper Functions ---

function saveToLocalStorage(key, data) {
    try {
        const payload = { ts: Date.now(), uid: currentUser?.uid, data };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) { console.warn('Cache save failed:', key, e); }
}

function loadFromLocalStorage(key, maxAgeMs = 24 * 60 * 60 * 1000) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || !parsed?.data) return null;
        // Validate UID matches current user
        if (parsed.uid && currentUser && parsed.uid !== currentUser.uid) {
            localStorage.removeItem(key);
            return null;
        }
        // Check TTL
        if (Date.now() - parsed.ts > maxAgeMs) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed.data;
    } catch (e) {
        console.warn('Cache load failed:', key, e);
        return null;
    }
}

function clearUserCache() {
    Object.values(CACHE_KEYS).forEach(key => localStorage.removeItem(key));
    memoryCache = { subjects: null, summary: null, weeklyAggregates: {}, attendanceByDate: {} };
}

// --- Date Utility Functions ---

function getWeekKey(dateStr) {
    // Convert yyyy-mm-dd to ISO week key: yyyy-Www
    const d = new Date(dateStr + 'T00:00:00');
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeeksInRange(startKey, endKey) {
    // Returns array of week keys between two dates
    const weeks = new Set();
    const start = new Date(startKey + 'T00:00:00');
    const end = new Date(endKey + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        weeks.add(getWeekKey(d.toISOString().split('T')[0]));
    }
    return Array.from(weeks);
}

function getYesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

// --- Dashboard Initialization ---
window.initializeDashboard = async function (profileData) {
    console.log("Initializing Dashboard for:", profileData.name);
    currentUser = auth.currentUser;
    userProfile = profileData;

    // === CACHE PROFILE FOR MENU (0 reads for menu) ===
    saveToLocalStorage(CACHE_KEYS.PROFILE, {
        name: profileData.name,
        email: profileData.email,
        rollNumber: profileData.rollNumber,
        section: profileData.section,
        semester: profileData.semester,
        department: profileData.department,
        collegeId: profileData.collegeId,
        subjectsSetup: profileData.subjectsSetup
    });

    // Load weekly cache from localStorage
    const storedWeekly = loadFromLocalStorage(CACHE_KEYS.WEEKLY);
    if (storedWeekly) {
        memoryCache.weeklyAggregates = storedWeekly;
    }

    // 1. Update Welcome Text
    const firstName = profileData.name.split(' ')[0];
    const welcomeTitle = document.getElementById('welcomeTitle');
    if (welcomeTitle) welcomeTitle.innerText = `All set, ${firstName}!`;

    // 2. Set Today's Date (Short Format: 22/01/2026)
    const dateEl = document.getElementById('dynamicDateDisplay');
    if (dateEl) {
        dateEl.innerText = new Date().toLocaleDateString('en-GB');
    }

    try {
        // 3. Load Summary & Update Ring/Stats
        await loadSummary();

        // 4. Load Today's Routine (Vertical Timeline)
        await loadTodayRoutine(profileData);

        // 5. Load Major Subjects (Local Cache + Calc)
        loadMajorSubjects();

        // 6. Initialize Period Chips and load Default Periodical View
        const signupDate = profileData.createdAt
            ? (profileData.createdAt.toDate ? profileData.createdAt.toDate() : new Date(profileData.createdAt))
            : new Date();
        userSignupKey = signupDate.toISOString().split('T')[0];
        initPeriodChips();

        // 7. Load Date-wise Section (default: yesterday)
        initDateWiseSection();

    } catch (e) {
        console.error("Dashboard Init Error:", e);
    }
}

// --- 1. Summary & Stats Logic (CACHED) ---
async function loadSummary(forceRefresh = false) {
    if (!currentUser) return;

    // 1. Try Memory Cache first (fastest)
    if (!forceRefresh && memoryCache.summary) {
        console.log('[Cache] Using memory-cached summary (0 reads)');
        applyUISummaryData(memoryCache.summary);
        return memoryCache.summary;
    }

    // 2. Try localStorage cache
    if (!forceRefresh) {
        const cached = loadFromLocalStorage(CACHE_KEYS.SUMMARY);
        if (cached && cached.uid === currentUser.uid) {
            console.log('[Cache] Using localStorage summary (0 reads)');
            memoryCache.summary = cached;
            applyUISummaryData(cached);
            return cached;
        }
    }

    // 3. Fetch from Firestore (only on cold start)
    console.log('[Firestore] Fetching summary (1 read)');
    const summaryRef = doc(db, 'users', currentUser.uid, 'metadata', 'summary');

    try {
        const snap = await getDoc(summaryRef);
        let data = snap.exists() ? snap.data() : null;

        if (!data) {
            console.log("No summary found, assuming fresh start.");
            data = {
                pastTotalClasses: 0,
                pastAttendedClasses: 0,
                trackedTotal: 0,
                trackedPresent: 0,
                subjects: {}
            };
        }

        // Cache it
        data.uid = currentUser.uid;
        memoryCache.summary = data;
        saveToLocalStorage(CACHE_KEYS.SUMMARY, data);

        applyUISummaryData(data);
        return data;

    } catch (e) {
        console.error("Load Summary Failed:", e);
        return null;
    }
}

// Helper: Apply summary data to UI without re-fetching
async function applyUISummaryData(data) {
    if (!data) {
        updateRingUI(100);
        updateQuote(100);
        return;
    }

    const pastTotal = data.pastTotalClasses || 0;
    const pastPresent = data.pastAttendedClasses || 0;
    const trackTotal = data.trackedTotal || 0;
    const trackPresent = data.trackedPresent || 0;

    const total = pastTotal + trackTotal;
    const present = pastPresent + trackPresent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    updateRingUI(percentage);
    updateQuote(percentage);

    // Prepare stats for Periodical/Bento cards using cached subjects
    const allSubjects = await fetchUserSubjects();
    const trackedSubjects = data.subjects || {};

    const summaryStatsForCards = {};
    allSubjects.forEach(sub => {
        const pastT = (sub.pastAttendance && sub.pastAttendance.total) || 0;
        const pastP = (sub.pastAttendance && sub.pastAttendance.attended) || 0;
        const trackT = (trackedSubjects[sub.name] && trackedSubjects[sub.name].trackedTotal) || 0;
        const trackP = (trackedSubjects[sub.name] && trackedSubjects[sub.name].trackedPresent) || 0;

        summaryStatsForCards[sub.name] = {
            total: pastT + trackT,
            attended: pastP + trackP
        };
    });

    updateSubjectCards(summaryStatsForCards);
}

function updateRingUI(percent) {
    const text = document.getElementById('percentageText');
    const circle = document.getElementById('progressCircle');

    if (text) text.innerText = `${percent}%`;

    if (circle) {
        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDasharray = `${circumference}`;
        circle.style.strokeDashoffset = offset;
    }
}

// --- UPDATED QUOTE LOGIC (Targets Notebook) ---
function updateQuote(percentage) {
    const notebookEl = document.getElementById('notebookQuote');
    if (!notebookEl) return;

    if (percentage >= 90) {
        notebookEl.innerHTML = "Dear Diary,<br>I am absolutely crushing it! Attendance is perfect. Maybe I should ask the Principal for a medal?";
    } else if (percentage >= 75) {
        notebookEl.innerHTML = "Note to self:<br>Doing great so far. Just need to keep showing up to maintain this safe zone.";
    } else if (percentage >= 65) {
        notebookEl.innerHTML = "Reminder:<br>Things are getting a bit risky. I need to wake up earlier and stop skipping the morning classes!";
    } else {
        notebookEl.innerHTML = "URGENT:<br>Attendance is critical! No more bunking allowed. I need to attend every single class from now on.";
    }
}

// --- 2. Routine Logic (Vertical Timeline) with Hybrid Safety Approach ---
/**
 * Hybrid Safety Logic:
 * 1. Loop through USER's saved subjects (not routine rows)
 * 2. For each subject, check if it matches today's routine (Day + Section + Subject)
 * 3. Scenario A: Match Found → Use sheet data (time, room, teacher)
 * 4. Scenario B: No Match + (isCustom OR fetchFailed) → Show as "Daily"
 * 5. Scenario C: No Match + Official Subject → Hide (not scheduled today)
 */
async function loadTodayRoutine(profile) {
    const listWrapper = document.getElementById('dynamic-list-wrapper');
    if (!listWrapper) return;

    listWrapper.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">Loading schedule...</div>';

    // Fetch user's saved subjects from Firestore
    const userSubjects = await fetchUserSubjects();
    if (userSubjects.length === 0) {
        listWrapper.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">No subjects set. Go to Menu > Select Subjects.</div>';
        return;
    }

    // Determine class_id from profile
    const classId = profile.class_id || profile.course_or_class || profile.class || '';
    const userSection = profile.section || 'A';

    // Save class ID for future reference
    if (classId) saveUserClassId(classId);

    let todaysSubjects = [];
    let routineData = [];
    let fetchFailed = false;

    // Try to fetch routine with version check (caching optimization)
    try {
        const result = await fetchRoutineWithVersionCheck(classId);
        routineData = result.routineData || [];
        fetchFailed = result.fetchFailed;

        if (result.fromCache) {
            console.log('Using cached routine data');
        } else if (routineData.length > 0) {
            console.log('Fetched fresh routine data');
        }
    } catch (err) {
        console.error('Routine fetch error:', err);
        fetchFailed = true;
    }

    // Build today's schedule using Hybrid Safety approach
    todaysSubjects = buildTodaySchedule(userSubjects, routineData, userSection, fetchFailed);

    // Handle case where no subjects match today's schedule and not in fallback mode
    if (todaysSubjects.length === 0 && !fetchFailed) {
        // Check if it's a day off (Saturday/Sunday) or just no classes today
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const isSunday = dayName.toLowerCase() === 'sunday';

        if (isSunday) {
            listWrapper.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">It\'s Sunday! No scheduled classes today. Enjoy your rest! 🎉</div>';
        } else {
            listWrapper.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">No classes scheduled for today.</div>';
        }
        return;
    }

    // Store globally for reference
    todaySubjectsList = todaysSubjects;

    // Render Vertical Items
    listWrapper.innerHTML = '';
    todaysSubjects.forEach((sub, index) => {
        const safeId = `item-${index}`;
        const itemEl = createVerticalClassItem(sub, safeId);
        listWrapper.appendChild(itemEl);
    });

    // Setup Listener FIRST, then open first item
    setupTodayListener(todaysSubjects);
}

// Fetch all subjects (CACHED - 0 reads after first load)
async function fetchUserSubjects(forceRefresh = false) {
    if (!currentUser) return [];

    // 1. Check memory cache first (fastest)
    if (!forceRefresh && memoryCache.subjects?.length) {
        console.log('[Cache] Using memory-cached subjects (0 reads)');
        return memoryCache.subjects;
    }

    // 2. Check userProfile.cachedSubjects (set during setup)
    if (!forceRefresh && userProfile?.cachedSubjects?.length) {
        console.log('[Cache] Using profile cachedSubjects (0 reads)');
        // Convert to full subject objects if needed
        const subjects = userProfile.cachedSubjects.map(s => {
            if (typeof s === 'string') return { name: s };
            return s;
        });
        memoryCache.subjects = subjects;
        saveToLocalStorage(CACHE_KEYS.SUBJECTS, subjects);
        return subjects;
    }

    // 3. Try localStorage cache
    if (!forceRefresh) {
        const cached = loadFromLocalStorage(CACHE_KEYS.SUBJECTS);
        if (cached?.length) {
            console.log('[Cache] Using localStorage subjects (0 reads)');
            memoryCache.subjects = cached;
            return cached;
        }
    }

    // 4. Fallback to Firestore (only on cold start with no cache)
    console.log('[Firestore] Fetching subjects from collection (N reads - COLD START ONLY)');
    try {
        const colRef = collection(db, 'users', currentUser.uid, 'subjects');
        const snap = await getDocs(colRef);
        const subjects = snap.docs.map(d => d.data());

        // Cache for future use
        memoryCache.subjects = subjects;
        saveToLocalStorage(CACHE_KEYS.SUBJECTS, subjects);

        return subjects;
    } catch (e) {
        console.error("Fetch Subjects Error:", e);
        return [];
    }
}

// Create timeline item - Buttons are rendered via updateCardStatus
function createVerticalClassItem(subject, domId) {
    const div = document.createElement('div');
    div.className = 'class-item';
    div.id = domId;
    div.dataset.subjectName = subject.name;

    const shortTime = subject.time ? subject.time.split('-')[0].trim() : '—';

    div.onclick = (e) => {
        // Prevent toggle if clicking on buttons/inputs
        if (e.target.closest('button') || e.target.closest('input')) return;
        toggleItemUI(div);
    };

    div.innerHTML = `
    <div class="dot"></div>
    <div class="view-compact">
      <span class="time-compact">${shortTime}</span>
      <span class="subject-compact">${subject.name}</span>
      <span class="status-badge-area"></span> 
    </div>

    <div class="view-expanded active-card-style" id="card-inner-${domId}">
      <div class="row-header">
        <div>
          <span class="time-text active-time">${subject.time}</span>
          <h4 class="subject-text">${subject.name}</h4>
          <div class="details-text">${subject.room} • ${subject.faculty}</div>
        </div>
      </div>
      
      <div class="action-area" style="margin-top: 15px;"></div>
    </div>
  `;
    return div;
}


// Setup Listener for Today's Attendance - This handles initial render and updates
function setupTodayListener(subjects) {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const todayRef = doc(db, 'users', currentUser.uid, 'attendance', today);

    if (unsubscribeToday) unsubscribeToday();

    unsubscribeToday = onSnapshot(todayRef, (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : {};
        const records = data.records || {};

        const items = document.querySelectorAll('.class-item');
        let firstUnmarkedItem = null;
        let allMarked = true;

        items.forEach(item => {
            const subjectName = item.dataset.subjectName;
            const status = records[subjectName]?.status || null;

            // Skip update if user is manually resetting this subject's status
            if (subjectName === pendingResetSubject) {
                pendingResetSubject = null;
                // Track unmarked for shifting logic
                if (!status && !firstUnmarkedItem) {
                    firstUnmarkedItem = item;
                }
                if (!status) {
                    allMarked = false;
                }
                return; // Don't update this card's UI
            }

            // Update UI immediately
            updateCardStatus(item, status);

            // Track first unmarked item
            if (!status && !firstUnmarkedItem) {
                firstUnmarkedItem = item;
            }
            if (!status) {
                allMarked = false;
            }
        });

        // Handle UI state based on marking status
        const scrollArea = document.getElementById('scrollContainer');

        if (allMarked && items.length > 0) {
            // All subjects marked - collapse active cards but keep clickable
            scrollArea?.classList.add('all-marked');
            items.forEach(item => {
                item.classList.remove('focused-item');
            });
            scrollArea?.classList.remove('focus-mode');
            // Don't remove 'active' class - let user keep viewing if they want
        } else {
            scrollArea?.classList.remove('all-marked');

            // Close currently active card and open first unmarked
            const currentActiveItem = document.querySelector('.class-item.active');
            if (firstUnmarkedItem) {
                // If there's an active card that is now marked, shift to next unmarked
                if (currentActiveItem && currentActiveItem !== firstUnmarkedItem) {
                    const currentSubject = currentActiveItem.dataset.subjectName;
                    const currentStatus = records[currentSubject]?.status || null;
                    if (currentStatus) {
                        // Current active is marked, shift to first unmarked
                        currentActiveItem.classList.remove('active');
                        setTimeout(() => toggleItemUI(firstUnmarkedItem), 100);
                    }
                } else if (!currentActiveItem) {
                    // No active item, open first unmarked
                    setTimeout(() => toggleItemUI(firstUnmarkedItem), 100);
                }
            }
        }
    });
}

// Updates UI based on Firestore data - FIXED to always show buttons for unmarked
function updateCardStatus(card, status) {
    const badgeArea = card.querySelector('.status-badge-area');
    const actionArea = card.querySelector('.action-area');
    const subjectName = card.dataset.subjectName;
    const domId = card.id;

    // 1. Handle "Past" visual style
    if (status) {
        card.classList.add('is-past');
    } else {
        card.classList.remove('is-past');
    }

    // 2. Update Compact Badge
    if (badgeArea) {
        if (status === 'present') {
            badgeArea.innerHTML = `<span class="status-tag tag-green">Attended</span>`;
        } else if (status === 'absent') {
            badgeArea.innerHTML = `<span class="status-tag tag-red">Skipped</span>`;
        } else if (status === 'not-held') {
            badgeArea.innerHTML = `<span class="status-tag tag-gray">Not Held</span>`;
        } else {
            badgeArea.innerHTML = '';
        }
    }

    // 3. Update Action Area (Buttons vs. Status Label)
    if (!actionArea) return;

    if (!status) {
        // Show Buttons - FIXED: Using proper event handling
        actionArea.innerHTML = `
      <div class="btn-container">
        <button class="choice-btn btn-attend" data-action="attend" data-subject="${subjectName}" data-domid="${domId}">
          <span class="btn-text">Attend</span>
          <span class="btn-loader" style="display:none;"></span>
        </button>
        <button class="choice-btn btn-skip" data-action="skip" data-subject="${subjectName}">
          <span class="btn-text">Skip</span>
          <span class="btn-loader" style="display:none;"></span>
        </button>
        <button class="choice-btn btn-na" data-action="not-held" data-subject="${subjectName}">
          <span class="btn-text">Not Held</span>
          <span class="btn-loader" style="display:none;"></span>
        </button>
      </div>
    `;

        // Attach event listeners
        const attendBtn = actionArea.querySelector('[data-action="attend"]');
        const skipBtn = actionArea.querySelector('[data-action="skip"]');
        const notHeldBtn = actionArea.querySelector('[data-action="not-held"]');

        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                startFocusModeInternal(domId, subjectName);
            });
        }
        if (skipBtn) {
            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleQuickMark(skipBtn, subjectName, 'absent');
            });
        }
        if (notHeldBtn) {
            notHeldBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleQuickMark(notHeldBtn, subjectName, 'not-held');
            });
        }
    } else {
        // Show Status - NO remarks input, just status and change option
        let tagClass = 'tag-gray';
        let label = status;
        if (status === 'present') { tagClass = 'tag-green'; label = 'Attended'; }
        if (status === 'absent') { tagClass = 'tag-red'; label = 'Skipped'; }
        if (status === 'not-held') { label = 'Not Held'; }

        actionArea.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="status-tag ${tagClass}">${label}</span>
        <span class="edit-status-link" data-domid="${domId}" data-subject="${subjectName}">Change Status</span>
      </div>
    `;

        // Attach change status listener
        const changeLink = actionArea.querySelector('.edit-status-link');
        if (changeLink) {
            changeLink.addEventListener('click', (e) => {
                e.stopPropagation();
                resetCardStatusInternal(domId, subjectName);
            });
        }
    }
}

// Handle quick mark (Skip / Not Held) with loader
async function handleQuickMark(btn, subjectName, status) {
    // Clear pending reset flag since user is now marking
    if (pendingResetSubject === subjectName) {
        pendingResetSubject = null;
    }

    // Show loader
    const textSpan = btn.querySelector('.btn-text');
    const loaderSpan = btn.querySelector('.btn-loader');
    if (textSpan) textSpan.style.display = 'none';
    if (loaderSpan) loaderSpan.style.display = 'inline-block';

    // Disable all buttons in container
    const container = btn.closest('.btn-container');
    if (container) {
        container.querySelectorAll('button').forEach(b => b.disabled = true);
    }

    await markAttendanceInternal(subjectName, status, '');
}


// --- 3. Mark Attendance Logic ---
async function markAttendanceInternal(subjectName, status, optionalRemark = "") {
    if (!currentUser) return;
    console.log(`Marking ${status} for ${subjectName}`);

    const today = new Date().toISOString().split('T')[0];
    const todayRef = doc(db, 'users', currentUser.uid, 'attendance', today);
    const summaryRef = doc(db, 'users', currentUser.uid, 'metadata', 'summary');

    // Weekly Ref
    const weekKey = getWeekKey(today);
    const weekRef = doc(db, 'users', currentUser.uid, 'weekly', weekKey);

    try {
        await runTransaction(db, async (transaction) => {
            // Read Today's Doc
            const todaySnap = await transaction.get(todayRef);
            let todayData = todaySnap.exists() ? todaySnap.data() : { date: today, records: {} };
            if (!todayData.records) todayData.records = {};
            let oldStatus = todayData.records[subjectName]?.status;

            // Read Summary
            const summarySnap = await transaction.get(summaryRef);
            let summaryData = summarySnap.exists() ? summarySnap.data() : { trackedTotal: 0, trackedPresent: 0, subjects: {} };

            // Read Weekly
            const weekSnap = await transaction.get(weekRef);
            let weekData = weekSnap.exists() ? weekSnap.data() : { total: 0, present: 0, subjects: {} };

            // 1. Revert Old Stats
            if (oldStatus === 'present') {
                // Summary
                summaryData.trackedTotal = (summaryData.trackedTotal || 0) - 1;
                summaryData.trackedPresent = (summaryData.trackedPresent || 0) - 1;
                if (summaryData.subjects && summaryData.subjects[subjectName]) {
                    summaryData.subjects[subjectName].trackedTotal--;
                    summaryData.subjects[subjectName].trackedPresent--;
                }
                // Weekly
                weekData.total = Math.max(0, (weekData.total || 0) - 1);
                weekData.present = Math.max(0, (weekData.present || 0) - 1);
                if (weekData.subjects && weekData.subjects[subjectName]) {
                    weekData.subjects[subjectName].total--;
                    weekData.subjects[subjectName].attended--;
                }
            } else if (oldStatus === 'absent') {
                // Summary
                summaryData.trackedTotal = (summaryData.trackedTotal || 0) - 1;
                if (summaryData.subjects && summaryData.subjects[subjectName]) {
                    summaryData.subjects[subjectName].trackedTotal--;
                }
                // Weekly
                weekData.total = Math.max(0, (weekData.total || 0) - 1);
                if (weekData.subjects && weekData.subjects[subjectName]) {
                    weekData.subjects[subjectName].total--;
                }
            }

            // 2. Apply New Stats
            if (status === 'present') {
                // Summary
                summaryData.trackedTotal = (summaryData.trackedTotal || 0) + 1;
                summaryData.trackedPresent = (summaryData.trackedPresent || 0) + 1;

                if (!summaryData.subjects) summaryData.subjects = {};
                if (!summaryData.subjects[subjectName]) summaryData.subjects[subjectName] = { trackedTotal: 0, trackedPresent: 0 };
                summaryData.subjects[subjectName].trackedTotal++;
                summaryData.subjects[subjectName].trackedPresent++;

                // Weekly
                weekData.total = (weekData.total || 0) + 1;
                weekData.present = (weekData.present || 0) + 1;
                if (!weekData.subjects) weekData.subjects = {};
                if (!weekData.subjects[subjectName]) weekData.subjects[subjectName] = { total: 0, visited: 0, attended: 0 };
                weekData.subjects[subjectName].total++;
                weekData.subjects[subjectName].attended++;

            } else if (status === 'absent') {
                // Summary
                summaryData.trackedTotal = (summaryData.trackedTotal || 0) + 1;

                if (!summaryData.subjects) summaryData.subjects = {};
                if (!summaryData.subjects[subjectName]) summaryData.subjects[subjectName] = { trackedTotal: 0, trackedPresent: 0 };
                summaryData.subjects[subjectName].trackedTotal++;

                // Weekly
                weekData.total = (weekData.total || 0) + 1;
                if (!weekData.subjects) weekData.subjects = {};
                if (!weekData.subjects[subjectName]) weekData.subjects[subjectName] = { total: 0, visited: 0, attended: 0 };
                weekData.subjects[subjectName].total++;
            }

            // 3. Update Record
            todayData.records[subjectName] = {
                status: status,
                remarks: optionalRemark,
                timestamp: serverTimestamp()
            };

            transaction.set(todayRef, todayData);
            transaction.set(summaryRef, summaryData, { merge: true });
            transaction.set(weekRef, weekData, { merge: true });

            // === CACHE UPDATE (0 reads) ===
            // Update memory cache with computed summaryData
            summaryData.uid = currentUser.uid;
            memoryCache.summary = summaryData;
            saveToLocalStorage(CACHE_KEYS.SUMMARY, summaryData);

            // Update weekly aggregate cache
            // We already computed weekData, so we can just use it!
            memoryCache.weeklyAggregates[weekKey] = weekData;
            saveToLocalStorage(CACHE_KEYS.WEEKLY, memoryCache.weeklyAggregates);

            // Cache today's attendance for date-wise view
            memoryCache.attendanceByDate[today] = todayData;
        });

        // Apply UI from cached data (0 reads)
        applyUISummaryData(memoryCache.summary);

        // Note: UI updates are handled by the onSnapshot listener automatically

    } catch (e) {
        console.error("Attendance Transaction Failed:", e);
    }
}

// Helper: Update weekly aggregate cache after marking attendance
function updateWeeklyCacheAfterMark(weekKey, subjectName, oldStatus, newStatus) {
    if (!memoryCache.weeklyAggregates[weekKey]) {
        memoryCache.weeklyAggregates[weekKey] = { total: 0, present: 0, subjects: {} };
    }
    const week = memoryCache.weeklyAggregates[weekKey];

    // Revert old status
    if (oldStatus === 'present') {
        week.total = Math.max(0, (week.total || 0) - 1);
        week.present = Math.max(0, (week.present || 0) - 1);
        if (week.subjects[subjectName]) {
            week.subjects[subjectName].total = Math.max(0, (week.subjects[subjectName].total || 0) - 1);
            week.subjects[subjectName].attended = Math.max(0, (week.subjects[subjectName].attended || 0) - 1);
        }
    } else if (oldStatus === 'absent') {
        week.total = Math.max(0, (week.total || 0) - 1);
        if (week.subjects[subjectName]) {
            week.subjects[subjectName].total = Math.max(0, (week.subjects[subjectName].total || 0) - 1);
        }
    }

    // Apply new status
    if (newStatus === 'present') {
        week.total = (week.total || 0) + 1;
        week.present = (week.present || 0) + 1;
        if (!week.subjects[subjectName]) week.subjects[subjectName] = { total: 0, attended: 0 };
        week.subjects[subjectName].total++;
        week.subjects[subjectName].attended++;
    } else if (newStatus === 'absent') {
        week.total = (week.total || 0) + 1;
        if (!week.subjects[subjectName]) week.subjects[subjectName] = { total: 0, attended: 0 };
        week.subjects[subjectName].total++;
    }

    // Persist to localStorage
    saveToLocalStorage(CACHE_KEYS.WEEKLY, memoryCache.weeklyAggregates);
}

// Expose for window access
window.markAttendance = markAttendanceInternal;


// --- 4. Bento Grid Subject Cards ---
function updateSubjectCards(finalStats) {
    const bentoGrid = document.querySelector('.bento-grid');
    if (!bentoGrid) return;

    const oldCards = bentoGrid.querySelectorAll('.subject-card');
    oldCards.forEach(c => c.remove());

    Object.entries(finalStats).forEach(([name, stat]) => {
        const total = stat.total || 0;
        const attended = stat.attended || 0;
        const percent = total > 0 ? Math.round((attended / total) * 100) : 0;

        const card = createBentoCard(name, total, attended, percent);
        bentoGrid.appendChild(card);
    });
}

function createBentoCard(name, total, present, percent) {
    const article = document.createElement('article');
    article.className = 'card subject-card span-2';

    const styles = [
        {
            color: 'lavender',
            icon: `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="#323544" stroke-linejoin="round" d="m17 13 3.4641-2V7L17 5l-3.4641 2v4M17 13l-3.4641-2M17 13v4l-7.00001 4M17 13V9m0 4-7.00001 4m3.53591-6L10.5 12.7348M9.99999 21l-3.4641-2.1318M9.99999 21v-4m-3.4641 2v-.1318m0 0V15L10.5 12.7348m-3.96411 6.1334L3.5 17V5m0 0L7 3l3.5 2m-7 0 2.99999 2M10.5 5v7.7348M10.5 5 6.49999 7M17 9l3.5-2M17 9l-3.5-2M9.99999 17l-3.5-2m0 .5V7" /></svg>`
        },
        {
            color: 'orange',
            icon: `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#323544" viewBox="0 0 24 24"><path d="M20 14h-2.722L11 20.278a5.511 5.511 0 0 1-.9.722H20a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1ZM9 3H4a1 1 0 0 0-1 1v13.5a3.5 3.5 0 1 0 7 0V4a1 1 0 0 0-1-1ZM6.5 18.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM19.132 7.9 15.6 4.368a1 1 0 0 0-1.414 0L12 6.55v9.9l7.132-7.132a1 1 0 0 0 0-1.418Z" /></svg>`
        },
        {
            color: 'mint',
            icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.9933 3.50879C11.6316 3.50879 11.2683 3.58158 10.9266 3.7263L3.4825 6.85273C3.06333 7.02875 3.07417 7.62121 3.4925 7.79726L10.9775 10.8086C11.6332 11.0786 12.3667 11.0786 13.0225 10.8086L20.5075 7.79726C20.9266 7.63137 20.9266 7.02875 20.5175 6.85273L13.0533 3.7263C12.7179 3.58228 12.3575 3.5083 11.9933 3.50879ZM21.5 8.66308C21.4365 8.6635 21.3736 8.67644 21.315 8.70117L12.9716 11.9825C12.8783 12.0213 12.7984 12.0874 12.742 12.1723C12.6857 12.2573 12.6554 12.3574 12.655 12.4598V19.989C12.6558 20.0714 12.6763 20.1524 12.7148 20.225C12.7533 20.2975 12.8087 20.3595 12.876 20.4055C12.9433 20.4515 13.0207 20.4801 13.1014 20.4889C13.1821 20.4978 13.2637 20.4865 13.3392 20.4562L21.6833 17.1639C21.7769 17.1286 21.8574 17.0649 21.9141 16.9814C21.9708 16.898 22.0007 16.7989 22 16.6975V9.16836C21.9991 9.03426 21.946 8.90598 21.8523 8.81146C21.7587 8.71694 21.632 8.66305 21.5 8.66308ZM2.56333 8.69609C2.48934 8.69343 2.41561 8.70634 2.34678 8.73399C2.27794 8.76166 2.21548 8.80352 2.16333 8.85688C2.07167 8.95082 2 9.06425 2 9.19965V16.271C2 16.645 2.42916 16.8947 2.75667 16.728L10.7116 12.8441C11.1 12.6579 11.07 12.0756 10.6608 11.9198L2.73583 8.73246C2.68113 8.70923 2.62262 8.69746 2.56333 8.69609Z" fill="#323544" /></svg>`
        },
        {
            color: 'peach',
            icon: `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#323544" viewBox="0 0 24 24"><path d="M3 4.92857C3 3.90506 3.80497 3 4.88889 3H19.1111C20.195 3 21 3.90506 21 4.92857V13h-3v-2c0-.5523-.4477-1-1-1h-4c-.5523 0-1 .4477-1 1v2H3V4.92857ZM3 15v1.0714C3 17.0949 3.80497 18 4.88889 18h3.47608L7.2318 19.3598c-.35356.4243-.29624 1.0548.12804 1.4084.42428.3536 1.05484.2962 1.40841-.128L10.9684 18h2.0632l2.2002 2.6402c.3535 lands.4242.9841.4816 1.4084.128.4242-.3536.4816-.9841.128-1.4084L15.635 18h3.4761C20.195 18 21 17.0949 21 16.0714V15H3Z" /><path d="M16 12v1h-2v-1h2Z" /></svg>`
        }
    ];

    const index = Array.from(document.querySelectorAll('.subject-card')).length % styles.length;
    const style = styles[index];

    article.classList.add(style.color);
    const iconSvg = style.icon;

    article.innerHTML = `
    <div class="subject-header">  
      <span class="subject-name">${name}</span>  
      <span class="subject-icon" aria-hidden="true">${iconSvg}</span>  
    </div>  
    <div class="subject-meta-group">  
      <div class="subject-meta">Total classes - ${total}</div>  
      <div class="subject-meta">Attended - ${present}</div>  
    </div>  
    <div class="subject-percentage">${percent}%</div> 
  `;
    return article;
}


// --- 5. Major Subjects (Client Side) ---
function loadMajorSubjects() {
    const stored = localStorage.getItem('attenza_majors');
    let majors = stored ? JSON.parse(stored) : [];

    updateMajorCard(majors);

    const editBtn = document.getElementById('majorEdit');
    const modal = document.getElementById('majorModal');
    const cancel = document.getElementById('majorCancel');
    const save = document.getElementById('majorSave');

    if (editBtn) editBtn.onclick = () => {
        if (modal) modal.style.display = 'block';
        fetchUserSubjects().then(subs => {
            const list = document.getElementById('majorList');
            if (!list) return;
            list.innerHTML = '';
            subs.forEach(s => {
                const checked = majors.includes(s.name) ? 'checked' : '';
                list.innerHTML += `
          <label>  
            <input type="checkbox" value="${s.name}" class="major-checkbox" ${checked} />  
            <span>${s.name}</span>  
          </label> 
        `;
            });
        });
    };

    if (cancel) cancel.onclick = () => { if (modal) modal.style.display = 'none'; };

    if (save) save.onclick = () => {
        const checkboxes = document.querySelectorAll('.major-checkbox:checked');
        majors = Array.from(checkboxes).map(c => c.value);
        localStorage.setItem('attenza_majors', JSON.stringify(majors));
        updateMajorCard(majors);
        if (modal) modal.style.display = 'none';
    };
}

async function updateMajorCard(majors, overrideStats = null) {
    const card = document.getElementById('majorCard');
    if (!card) return;

    const percentEl = document.getElementById('majorPercent');
    const footerEl = document.getElementById('majorFooter');
    const halfPath = document.getElementById('majorHalfPath');
    const summaryBody = document.getElementById('summaryBody');

    if (majors.length === 0) {
        if (percentEl) percentEl.innerText = "0%";
        if (footerEl) footerEl.innerText = "Select major, click pencil button";
        if (halfPath) halfPath.style.strokeDashoffset = 100;
        if (summaryBody) summaryBody.innerHTML = '<ul><li>Detailed summary awaits.</li><li>Select majors to see combined stats.</li></ul>';
        return;
    }

    let totalM = 0;
    let presentM = 0;

    if (overrideStats) {
        majors.forEach(m => {
            if (overrideStats[m]) {
                totalM += overrideStats[m].total;
                presentM += overrideStats[m].attended;
            }
        });
    } else {
        const summaryRef = doc(db, 'users', currentUser.uid, 'metadata', 'summary');
        const summarySnap = await getDoc(summaryRef);
        const summaryData = summarySnap.exists() ? summarySnap.data() : { subjects: {} };
        const trackedMap = (summaryData && summaryData.subjects) ? summaryData.subjects : {};

        const subjects = await fetchUserSubjects();

        majors.forEach(m => {
            const sub = subjects.find(s => s.name === m);
            const pastT = (sub && sub.pastAttendance && sub.pastAttendance.total) || 0;
            const pastP = (sub && sub.pastAttendance && sub.pastAttendance.attended) || 0;

            const trackT = (trackedMap[m] && trackedMap[m].trackedTotal) || 0;
            const trackP = (trackedMap[m] && trackedMap[m].trackedPresent) || 0;

            totalM += (pastT + trackT);
            presentM += (pastP + trackP);
        });
    }

    const percent = totalM > 0 ? Math.round((presentM / totalM) * 100) : 0;

    if (percentEl) percentEl.innerText = `${percent}%`;
    if (footerEl) footerEl.innerText = `${majors.length} major subjects`;

    const len = 126;
    const offset = 0;

    if (halfPath) {
        halfPath.style.strokeDasharray = len;
        halfPath.style.strokeDashoffset = offset;
    }

    if (summaryBody) {
        const isPeriodical = !!overrideStats;
        const periodText = isPeriodical ? "this period" : "overall";
        summaryBody.innerHTML = `<ul><li>Your ${periodText} major attendance is ${percent}%.</li><li>You are safe!</li></ul>`;
    }
}


// --- 6. Date-Wise Records Logic (CACHED) ---
const attendanceData = {}; // Legacy compatibility

const dateStrip = document.getElementById('dateStrip');
const cardsContainer = document.getElementById('dateCardsContainer');
let currentSelectedDateKey = null;

// Auto-init strip if element exists (page load), but wait for dashboard
if (dateStrip) initDateStrip();

function initDateStrip() {
    initMonthYearSelect();
    const today = new Date();
    renderDateStrip(today, false); // Don't auto-load on strip init
}

// Called from dashboard init - loads yesterday by default
function initDateWiseSection() {
    if (!dateStrip) return;

    // Find yesterday's button and click it
    const yesterdayKey = getYesterdayKey();
    const buttons = dateStrip.querySelectorAll('.date-item');
    let yesterdayBtn = null;

    buttons.forEach(btn => {
        // Get the date key from button's onclick context
        const dateStr = btn.getAttribute('data-date');
        if (dateStr === yesterdayKey) {
            yesterdayBtn = btn;
        }
    });

    if (yesterdayBtn) {
        loadDateRecords(yesterdayKey, yesterdayBtn);
    } else {
        // Yesterday not in current month strip, just load the data
        loadDateRecords(yesterdayKey, null);
    }
}

function initMonthYearSelect() {
    const select = document.getElementById('monthYearSelect');
    if (!select) return;

    const now = new Date();
    const options = [];
    for (let i = -12; i <= 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        options.push({ label, value });
    }

    select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    select.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    select.onchange = () => {
        const [year, month] = select.value.split('-');
        const newDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        renderDateStrip(newDate);
    };
}

// (Legacy function removed)
function renderDateStrip(centerDate, autoLoad = false) {
    if (!dateStrip) return;
    dateStrip.innerHTML = '';

    const startOfMonth = new Date(centerDate.getFullYear(), centerDate.getMonth(), 1);
    const endOfMonth = new Date(centerDate.getFullYear(), centerDate.getMonth() + 1, 0);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
        const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const btn = document.createElement('button');
        btn.className = 'date-item';
        btn.setAttribute('data-date', dKey);

        if (dKey === todayStr) btn.classList.add('today');

        btn.innerHTML = `
      <span class="day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
      <span class="day-number">${String(d.getDate()).padStart(2, '0')}</span>
    `;

        btn.onclick = () => loadDateRecords(dKey, btn);
        dateStrip.appendChild(btn);
    }
}

async function loadDateRecords(dateKey, btnElement) {
    currentSelectedDateKey = dateKey;

    document.querySelectorAll('.date-item').forEach(b => b.classList.remove('selected'));
    if (btnElement) btnElement.classList.add('selected');

    document.getElementById('selectedDateLabel').innerText = new Date(dateKey).toDateString();

    cardsContainer.innerHTML = '<div class="loader">Loading...</div>';

    if (!currentUser) return;

    // 1. Check Memory Cache (0 reads)
    let records = null;
    if (memoryCache.attendanceByDate[dateKey]) {
        console.log(`[Cache] Using memory attendance for ${dateKey} (0 reads)`);
        records = memoryCache.attendanceByDate[dateKey].records || {};
    } else {
        // 2. Fetch from Firestore (1 read)
        console.log(`[Firestore] Fetching attendance for ${dateKey} (1 read)`);
        try {
            const docRef = doc(db, 'users', currentUser.uid, 'attendance', dateKey);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                const data = snap.data();
                memoryCache.attendanceByDate[dateKey] = data; // Cache it
                records = data.records || {};
            } else {
                memoryCache.attendanceByDate[dateKey] = { records: {} }; // Cache empty
                records = {};
            }
        } catch (e) {
            console.error("Date Load Error:", e);
            cardsContainer.innerHTML = `<div class="error">Failed to load: ${e.message} (${e.code || ''})</div>`;
            return;
        }
    }

    // Render
    cardsContainer.innerHTML = '';

    if (!records || Object.keys(records).length === 0) {
        cardsContainer.innerHTML = '<div class="empty-state">No classes marked.</div>';
        return;
    }

    Object.keys(records).forEach(subName => {
        const rec = records[subName];
        cardsContainer.appendChild(createDateRecordCard(subName, rec));
    });
}

function createDateRecordCard(subjectName, record) {
    const art = document.createElement('article');
    art.className = 'record-card';
    art.dataset.subject = subjectName;
    art.dataset.status = record.status;
    art.dataset.remarks = record.remarks || '';

    art.innerHTML = `
    <div class="card-header">
      <div class="card-header-left">
        <div class="subject-name">${subjectName}</div>
        <div class="status-badge ${record.status}">${record.status}</div>
      </div>
      <button class="edit-btn" onclick="openEditModalFromCard(this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit record
      </button>
    </div>
    <div class="remarks">
      <div class="remarks-label">REMARKS</div>
      <div class="remarks-content">${record.remarks || 'No notes.'}</div>
    </div>
  `;
    return art;
}

window.openEditModalFromCard = function (btn) {
    const card = btn.closest('.record-card');
    const subject = card.dataset.subject;
    const status = card.dataset.status;
    const remarks = card.dataset.remarks;
    openEditModal(subject, status, remarks);
};

window.openEditModal = function (subject, status, remarks) {
    const modal = document.getElementById('editModal');
    if (!modal) return;

    document.getElementById('modalSubject').innerText = subject;
    document.getElementById('modalStatus').value = status;
    document.getElementById('modalRemarks').value = remarks;

    modal.classList.remove('hidden');

    document.getElementById('modalSave').onclick = () => saveEditRecord(subject);
    document.getElementById('modalCancel').onclick = () => modal.classList.add('hidden');
};

async function saveEditRecord(subjectName) {
    const status = document.getElementById('modalStatus').value;
    const remarks = document.getElementById('modalRemarks').value;
    const dateKey = currentSelectedDateKey;

    if (!currentUser) return;

    const todayRef = doc(db, 'users', currentUser.uid, 'attendance', dateKey);
    const summaryRef = doc(db, 'users', currentUser.uid, 'metadata', 'summary');

    try {
        await runTransaction(db, async (transaction) => {
            const todaySnap = await transaction.get(todayRef);
            let todayData = todaySnap.exists() ? todaySnap.data() : { date: dateKey, records: {} };
            let oldStatus = todayData.records[subjectName]?.status;

            if (oldStatus === status && todayData.records[subjectName]?.remarks === remarks) return;

            const summarySnap = await transaction.get(summaryRef);
            let summaryData = summarySnap.exists() ? summarySnap.data() : { trackedTotal: 0, trackedPresent: 0, subjects: {} };

            if (oldStatus !== status) {
                if (oldStatus === 'present') {
                    summaryData.trackedTotal--;
                    summaryData.trackedPresent--;
                    if (summaryData.subjects[subjectName]) {
                        summaryData.subjects[subjectName].trackedTotal--;
                        summaryData.subjects[subjectName].trackedPresent--;
                    }
                } else if (oldStatus === 'absent') {
                    summaryData.trackedTotal--;
                    if (summaryData.subjects[subjectName]) {
                        summaryData.subjects[subjectName].trackedTotal--;
                    }
                }

                if (status === 'present') {
                    summaryData.trackedTotal++;
                    summaryData.trackedPresent++;
                    if (!summaryData.subjects[subjectName]) summaryData.subjects[subjectName] = { trackedTotal: 0, trackedPresent: 0 };
                    summaryData.subjects[subjectName].trackedTotal++;
                    summaryData.subjects[subjectName].trackedPresent++;
                } else if (status === 'absent') {
                    summaryData.trackedTotal++;
                    if (!summaryData.subjects[subjectName]) summaryData.subjects[subjectName] = { trackedTotal: 0, trackedPresent: 0 };
                    summaryData.subjects[subjectName].trackedTotal++;
                }
            }

            todayData.records[subjectName] = {
                status: status,
                remarks: remarks,
                timestamp: serverTimestamp()
            };

            transaction.set(todayRef, todayData);
            transaction.set(summaryRef, summaryData, { merge: true });
        });

        document.getElementById('editModal').classList.add('hidden');
        loadDateRecords(dateKey, null);
        loadSummary();
    } catch (e) {
        console.error("Save Edit Error:", e);
        alert("Failed to save changes.");
    }
}


// --- Expose for HTML access ---
window.openMenu = function () {
    const menu = document.getElementById("menuOverlay");
    if (menu) {
        menu.style.left = "0";
        document.body.classList.add('menu-open');
    }
}

// --- Timeline Item Expand/Collapse Logic ---
window.toggleItemUI = function (clickedItem) {
    const container = document.getElementById('scrollContainer');
    const allItems = document.querySelectorAll('.class-item');

    // If already active, do nothing
    if (clickedItem.classList.contains('active')) return;

    // Close others
    allItems.forEach(item => item.classList.remove('active'));

    // Open this one
    clickedItem.classList.add('active');

    // Smooth scroll to position
    setTimeout(() => {
        let prevItem = clickedItem.previousElementSibling;
        if (prevItem && prevItem.classList.contains('class-item')) {
            container.scrollTo({
                top: prevItem.offsetTop - 10,
                behavior: 'smooth'
            });
        } else {
            container.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    }, 300);
}

// ==========================================
// === UI LOGIC (Font Scaling, AI, etc.) ===
// ==========================================

// --- Dynamic Font Scaling ---
function getLineCount(element) {
    const cs = window.getComputedStyle(element);
    const lineHeight = parseFloat(cs.lineHeight) || 1.2 * parseFloat(cs.fontSize);
    return element.scrollHeight / lineHeight;
}

function adjustSubjectFont(subjectNameEl) {
    const MAX_LINES = 2.1;
    subjectNameEl.style.fontSize = '14px';
    let currentSize = 14;

    while (getLineCount(subjectNameEl) > MAX_LINES && currentSize > 10) {
        currentSize -= 0.5;
        subjectNameEl.style.fontSize = currentSize + 'px';
        if (currentSize <= 10.5) break;
    }
}
setInterval(() => {
    document.querySelectorAll('.card.subject-card .subject-name').forEach(adjustSubjectFont);
}, 2000);

// --- AI Board JS ---
const aiBoardEl = document.getElementById("aiBoard");
const aiCloseBtnEl = document.getElementById("aiCloseBtn");
const aiCopyBtnEl = document.getElementById("aiCopyBtn");
const aiStatusTextEl = document.getElementById("aiStatusText");
const aiResponseEl = document.getElementById("aiResponse");
const userMessageCardEl = document.getElementById("userMessageCard");

function openBoardWithPrompt(text) {
    if (userMessageCardEl) userMessageCardEl.textContent = text || "Your question will appear here.";
    if (aiBoardEl) aiBoardEl.classList.add("visible");
}

if (aiCloseBtnEl) aiCloseBtnEl.addEventListener("click", () => {
    aiBoardEl.classList.remove("visible");
});

if (aiCopyBtnEl) aiCopyBtnEl.addEventListener("click", () => {
    const text = aiResponseEl.textContent.trim();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const labelSpan = aiCopyBtnEl.querySelector("span:last-child");
        const prev = labelSpan.textContent;
        labelSpan.textContent = "Copied!";
        setTimeout(() => (labelSpan.textContent = prev), 1500);
    });
});

const statuses = ["Analyzing…", "Thinking…", "Almost there…", "Preparing answer…"];
let statusIndex = 0;
if (aiStatusTextEl) setInterval(() => {
    statusIndex = (statusIndex + 1) % statuses.length;
    aiStatusTextEl.textContent = statuses[statusIndex];
}, 2000);

// --- AI CARD JS (typewriter + input) ---
const phrases = ["Ask attenza ai your doubts", "Can i bunk eng class ?"];
const typewriterEl = document.getElementById("typewriterText");
const promptArea = document.getElementById("promptArea");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");

let currentPhraseIndex = 0;
let currentCharIndex = 0;
let isDeleting = false;
let typingActive = true;
let typingTimeout;

function typeLoop() {
    if (!typingActive || !typewriterEl) return;

    const currentPhrase = phrases[currentPhraseIndex];
    if (!isDeleting) {
        typewriterEl.textContent = currentPhrase.slice(0, currentCharIndex + 1);
        currentCharIndex++;

        if (currentCharIndex === currentPhrase.length) {
            typingTimeout = setTimeout(() => {
                isDeleting = true;
                typeLoop();
            }, 1200);
            return;
        }

        typingTimeout = setTimeout(typeLoop, 120);
    } else {
        typewriterEl.textContent = currentPhrase.slice(0, currentCharIndex - 1);
        currentCharIndex--;

        if (currentCharIndex === 0) {
            isDeleting = false;
            currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
            typingTimeout = setTimeout(typeLoop, 300);
            return;
        }

        typingTimeout = setTimeout(typeLoop, 80);
    }
}

function stopTypewriter() {
    typingActive = false;
    if (typingTimeout) clearTimeout(typingTimeout);
    if (typewriterEl) typewriterEl.style.display = "none";
    if (promptInput) promptInput.style.display = "block";
}

typeLoop();

if (promptArea) promptArea.addEventListener("click", () => {
    if (typingActive) {
        stopTypewriter();
    }
    if (promptInput) promptInput.focus();
});

if (promptInput) promptInput.addEventListener("input", () => {
    if (promptInput.value.trim().length > 0) {
        if (sendBtn) sendBtn.classList.add("visible");
    } else {
        if (sendBtn) sendBtn.classList.remove("visible");
    }
});

if (sendBtn) sendBtn.addEventListener("click", () => {
    if (!promptInput) return;
    const value = promptInput.value.trim();
    if (!value) return;

    openBoardWithPrompt(value);
    promptInput.value = "";
    sendBtn.classList.remove("visible");
});


// === Iframe Communication ===
window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'USER_SIGNED_OUT') {
        window.location.reload();
    } else if (data.type === 'NAVIGATE') {
        if (data.to === 'setup') {
            window.location.href = 'setup.html';
        } else if (data.to === 'edit_profile') {
            alert("Profile editing is a future feature.");
        }
    }
});

// === Period Chips & Date Picker Logic ===

function initPeriodChips() {
    const container = document.getElementById('periodSelector');
    if (!container) return;

    const chips = container.querySelectorAll('.period-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const period = chip.dataset.period;
            selectPeriodChip(period);
        });
    });

    // Load default "All Time" on init
    selectPeriodChip('all');
}

function selectPeriodChip(mode) {
    currentPeriodMode = mode;
    const container = document.getElementById('periodSelector');
    const chips = container.querySelectorAll('.period-chip');

    // Update chip active states
    chips.forEach(chip => {
        chip.classList.remove('active');
        if (chip.dataset.period === mode) {
            chip.classList.add('active');
        }
    });

    const todayKey = getTodayKey();

    if (mode === 'all') {
        // All Time: signup to today
        calculatePeriodicalStats(userSignupKey || todayKey, todayKey, true);
    } else if (mode === 'thisweek') {
        // This Week: fetches current week's aggregate (data already stored per week)
        calculatePeriodicalStats(todayKey, todayKey, false);
    } else if (mode === 'custom') {
        // Open date picker sheet
        openDatePickerSheet();
    }
}

// === Date Picker Sheet Logic ===
const dpMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dpFixedYears = [2024, 2025, 2026, 2027, 2028];

let dpState = {
    mode: 'start',
    isYearExpanded: false,
    start: { year: new Date().getFullYear(), month: null, day: null },
    end: { year: null, month: null, day: null },
    visualMonth: new Date().getMonth(),
    visualYear: new Date().getFullYear()
};

function openDatePickerSheet() {
    // Reset state
    dpState = {
        mode: 'start',
        isYearExpanded: false,
        start: { year: new Date().getFullYear(), month: null, day: null },
        end: { year: null, month: null, day: null },
        visualMonth: new Date().getMonth(),
        visualYear: new Date().getFullYear()
    };

    const overlay = document.getElementById('datepickerOverlay');
    const sheet = document.getElementById('datepickerSheet');

    if (overlay && sheet) {
        overlay.classList.add('active');
        sheet.classList.add('active');
        document.body.classList.add('no-scroll');

        // Initialize picker UI
        dpRenderMonths();
        dpRenderDays();
        dpRenderYearList();
        dpHighlightUI();
        dpUpdateHeaderUI();
        dpSetMode('start');
        setTimeout(() => dpMoveHighlight('start'), 50);
    }

    // Setup overlay click to close
    overlay.onclick = closeDatePickerSheet;
}

function closeDatePickerSheet() {
    const overlay = document.getElementById('datepickerOverlay');
    const sheet = document.getElementById('datepickerSheet');

    if (overlay && sheet) {
        overlay.classList.remove('active');
        sheet.classList.remove('active');
        document.body.classList.remove('no-scroll');
    }
}

function dpRenderMonths() {
    const leftList = document.getElementById('dpLeftList');
    if (!leftList) return;
    leftList.innerHTML = '';

    dpMonths.forEach((m, i) => {
        const el = document.createElement('div');
        el.className = 'dp-list-item';
        el.textContent = m;
        el.onclick = () => dpHandleMonthClick(i);
        el.dataset.val = i;
        leftList.appendChild(el);
    });

    const yearText = document.getElementById('dpStaticYearText');
    if (yearText) yearText.textContent = dpState.visualYear;
}

function dpRenderYearList() {
    const container = document.getElementById('dpYearListContainer');
    if (!container) return;
    container.innerHTML = '';

    dpFixedYears.forEach(y => {
        const item = document.createElement('div');
        item.className = `dp-year-item ${y === dpState.visualYear ? 'active' : ''}`;
        item.textContent = y;
        item.onclick = (e) => {
            e.stopPropagation();
            dpHandleYearSelect(y, item);
        };
        container.appendChild(item);
    });
}

function dpGetDaysInMonth(m, y) {
    return new Date(y, m + 1, 0).getDate();
}

function dpRenderDays() {
    const grid = document.getElementById('dpDayGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const daysCount = dpGetDaysInMonth(dpState.visualMonth, dpState.visualYear);

    for (let i = 1; i <= daysCount; i++) {
        const el = document.createElement('div');
        el.className = 'dp-day-item';
        el.textContent = i;
        el.onclick = () => dpHandleDayClick(i);
        el.dataset.day = i;
        grid.appendChild(el);
    }
}

function dpSetMode(mode) {
    dpState.mode = mode;
    dpCloseYearBar();

    const startDisplay = document.getElementById('dpStartDisplay');
    const endDisplay = document.getElementById('dpEndDisplay');

    if (mode === 'start') {
        startDisplay?.classList.add('active');
        endDisplay?.classList.remove('active');
    } else {
        startDisplay?.classList.remove('active');
        endDisplay?.classList.add('active');
    }

    dpMoveHighlight(mode);

    const currentData = dpState[mode];
    dpState.visualMonth = currentData.month !== null ? currentData.month : dpState.visualMonth;
    if (currentData.year !== null) {
        dpState.visualYear = currentData.year;
    }

    dpRenderDays();
    dpHighlightUI();
    dpCheckButtonVisibility();
}

function dpMoveHighlight(mode) {
    const highlight = document.getElementById('dpHighlight');
    const target = mode === 'start'
        ? document.getElementById('dpStartDisplay')
        : document.getElementById('dpEndDisplay');

    if (highlight && target) {
        highlight.style.width = `${target.offsetWidth}px`;
        highlight.style.transform = `translateX(${target.offsetLeft}px)`;
    }
}

function dpToggleYearExpand() {
    dpState.isYearExpanded ? dpCloseYearBar() : dpOpenYearBar();
}

function dpOpenYearBar() {
    dpState.isYearExpanded = true;
    dpRenderYearList();
    document.getElementById('dpExpandableBar')?.classList.add('active');
}

function dpCloseYearBar() {
    dpState.isYearExpanded = false;
    document.getElementById('dpExpandableBar')?.classList.remove('active');
}

function dpHandleYearSelect(year, eventEl) {
    const allItems = document.querySelectorAll('.dp-year-item');
    allItems.forEach(el => el.classList.remove('active'));
    eventEl.classList.add('active');

    setTimeout(() => {
        dpState.visualYear = year;
        dpState[dpState.mode].year = year;
        dpRenderDays();
        dpHighlightUI();
        dpUpdateHeaderUI();
        dpCloseYearBar();
    }, 350);
}

function dpHandleMonthClick(monthIdx) {
    dpState[dpState.mode].month = monthIdx;
    dpState.visualMonth = monthIdx;

    if (dpState[dpState.mode].year === null) {
        dpState[dpState.mode].year = dpState.visualYear;
    }

    dpRenderDays();
    dpHighlightUI();
    dpUpdateHeaderUI();
}

function dpHandleDayClick(day) {
    if (dpState[dpState.mode].month === null) dpState[dpState.mode].month = dpState.visualMonth;
    if (dpState[dpState.mode].year === null) dpState[dpState.mode].year = dpState.visualYear;

    dpState[dpState.mode].day = day;
    dpUpdateHeaderUI();

    const clickedEl = document.querySelector(`.dp-day-item[data-day="${day}"]`);
    if (clickedEl) clickedEl.classList.add('confirmed');

    if (dpState.mode === 'start') {
        setTimeout(() => dpSetMode('end'), 500);
    } else {
        setTimeout(() => {
            dpHighlightUI();
            dpCheckButtonVisibility();
        }, 400);
    }
}

function dpHighlightUI() {
    // Month highlight
    const leftList = document.getElementById('dpLeftList');
    if (leftList) {
        const mItems = leftList.querySelectorAll('.dp-list-item');
        mItems.forEach(el => el.classList.remove('selected'));
        const activeM = leftList.querySelector(`[data-val="${dpState.visualMonth}"]`);
        if (activeM) {
            activeM.classList.add('selected');
            activeM.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }

    // Day highlight
    const dayGrid = document.getElementById('dpDayGrid');
    if (dayGrid) {
        dayGrid.querySelectorAll('.dp-day-item').forEach(el => {
            el.classList.remove('selected', 'confirmed');
        });

        const stored = dpState[dpState.mode];
        const yearCheck = stored.year === null ? dpState.visualYear : stored.year;

        if (stored.day !== null &&
            stored.month === dpState.visualMonth &&
            yearCheck === dpState.visualYear) {
            const dEl = dayGrid.querySelector(`[data-day="${stored.day}"]`);
            if (dEl) dEl.classList.add('selected');
        }
    }

    const yearText = document.getElementById('dpStaticYearText');
    if (yearText) yearText.textContent = dpState.visualYear;
}

function dpUpdateHeaderUI() {
    const fmt = (dObj) => {
        if (dObj.day !== null && dObj.month !== null) {
            const y = dObj.year || dpState.visualYear;
            return `${dpMonths[dObj.month].substring(0, 3)} ${dObj.day}, ${y}`;
        }
        return "Select Date";
    };

    const startVal = document.getElementById('dpStartVal');
    const endVal = document.getElementById('dpEndVal');

    if (startVal) {
        startVal.textContent = fmt(dpState.start);
        startVal.style.color = dpState.start.day ? '#000' : '#B0B0B0';
        startVal.style.fontWeight = dpState.start.day ? '600' : '400';
    }

    if (endVal) {
        endVal.textContent = fmt(dpState.end);
        endVal.style.color = dpState.end.day ? '#000' : '#B0B0B0';
        endVal.style.fontWeight = dpState.end.day ? '600' : '400';
    }
}

function dpCheckButtonVisibility() {
    const btn = document.getElementById('dpActionBtn');
    if (btn) {
        if (dpState.start.day !== null && dpState.end.day !== null) {
            btn.classList.remove('dp-hidden');
        } else {
            btn.classList.add('dp-hidden');
        }
    }
}

function dpHandleAction() {
    const sY = dpState.start.year || new Date().getFullYear();
    const eY = dpState.end.year || new Date().getFullYear();

    const startTs = new Date(sY, dpState.start.month, dpState.start.day).getTime();
    const endTs = new Date(eY, dpState.end.month, dpState.end.day).getTime();
    const todayTs = new Date().setHours(0, 0, 0, 0);
    const oneDayMs = 24 * 60 * 60 * 1000;

    const btn = document.getElementById('dpActionBtn');
    const originalText = "Apply Custom Range";

    // Validation: No future dates
    if (startTs > todayTs || endTs > todayTs) {
        dpShowError(btn, "Cannot select future dates", originalText);
        return;
    }

    // Validation: End cannot be before start
    if (startTs > endTs) {
        dpShowError(btn, "End date cannot be before start", originalText);
        return;
    }

    // Validation: No same start and end date
    if (startTs === endTs) {
        dpShowError(btn, "Start and end date cannot be same", originalText);
        return;
    }

    // Validation: Minimum 2 days interval (e.g., Feb 1 to Feb 3, not Feb 2 to Feb 3)
    const daysDiff = Math.round((endTs - startTs) / oneDayMs);
    if (daysDiff < 2) {
        dpShowError(btn, "Minimum 2 days interval required", originalText);
        return;
    }

    // Success - apply the range
    const toKey = (y, m, d) => {
        const date = new Date(y, m, d);
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().split('T')[0];
    };

    const startKey = toKey(sY, dpState.start.month, dpState.start.day);
    const endKey = toKey(eY, dpState.end.month, dpState.end.day);

    closeDatePickerSheet();
    calculatePeriodicalStats(startKey, endKey, false);
}

function dpShowError(btn, msg, originalText) {
    if (!btn) return;
    btn.classList.add('error');
    btn.innerText = msg;
    setTimeout(() => {
        btn.classList.remove('error');
        btn.innerText = originalText;
    }, 2000);
}

// Setup event listeners for date picker sheet elements
document.addEventListener('DOMContentLoaded', () => {
    // Year bar toggle
    const expandableBar = document.getElementById('dpExpandableBar');
    if (expandableBar) {
        expandableBar.onclick = dpToggleYearExpand;
    }

    // Start/End display clicks
    const startDisplay = document.getElementById('dpStartDisplay');
    const endDisplay = document.getElementById('dpEndDisplay');
    if (startDisplay) startDisplay.onclick = () => dpSetMode('start');
    if (endDisplay) endDisplay.onclick = () => dpSetMode('end');

    // Action button
    const actionBtn = document.getElementById('dpActionBtn');
    if (actionBtn) actionBtn.onclick = dpHandleAction;
});

// --- Periodical Stats Logic (CACHED with Weekly Aggregates) ---
window.calculatePeriodicalStats = async function (startKey, endKey, isDefaultView = false) {
    if (!currentUser) return;
    console.log(`[Periodical] Filtering from ${startKey} to ${endKey}${isDefaultView ? ' (default view)' : ''}`);

    document.getElementById('percentageText').innerText = '...';

    try {
        let periodTotal = 0;
        let periodPresent = 0;
        let subjectAgg = {};

        // For default view (signup to today), use cached summary directly (0 reads)
        if (isDefaultView && memoryCache.summary) {
            console.log('[Cache] Using summary for default periodical view (0 reads)');
            const data = memoryCache.summary;
            periodTotal = (data.pastTotalClasses || 0) + (data.trackedTotal || 0);
            periodPresent = (data.pastAttendedClasses || 0) + (data.trackedPresent || 0);

            // Build subject aggregates from summary
            const allSubjects = await fetchUserSubjects();
            const trackedSubjects = data.subjects || {};
            allSubjects.forEach(sub => {
                const pastT = (sub.pastAttendance && sub.pastAttendance.total) || 0;
                const pastP = (sub.pastAttendance && sub.pastAttendance.attended) || 0;
                const trackT = (trackedSubjects[sub.name] && trackedSubjects[sub.name].trackedTotal) || 0;
                const trackP = (trackedSubjects[sub.name] && trackedSubjects[sub.name].trackedPresent) || 0;
                subjectAgg[sub.name] = { total: pastT + trackT, attended: pastP + trackP };
            });
        } else {
            // Custom range: Use weekly aggregates (fetches only needed weeks)
            const weeks = getWeeksInRange(startKey, endKey);
            console.log(`[Periodical] Need ${weeks.length} weeks:`, weeks);

            // Try to load from memory/localStorage cache first
            let cachedWeekly = memoryCache.weeklyAggregates;
            if (!Object.keys(cachedWeekly).length) {
                const stored = loadFromLocalStorage(CACHE_KEYS.WEEKLY);
                if (stored) {
                    cachedWeekly = stored;
                    memoryCache.weeklyAggregates = stored;
                }
            }

            // Fetch only weeks not in cache
            const missingWeeks = weeks.filter(w => !cachedWeekly[w]);
            if (missingWeeks.length > 0) {
                console.log(`[Firestore] Fetching ${missingWeeks.length} missing weeks`);
                for (const weekKey of missingWeeks) {
                    const weekRef = doc(db, 'users', currentUser.uid, 'weekly', weekKey);
                    const weekSnap = await getDoc(weekRef);
                    if (weekSnap.exists()) {
                        cachedWeekly[weekKey] = weekSnap.data();
                    } else {
                        // Week doesn't exist in Firestore yet, initialize empty
                        cachedWeekly[weekKey] = { total: 0, present: 0, subjects: {} };
                    }
                }
                memoryCache.weeklyAggregates = cachedWeekly;
                saveToLocalStorage(CACHE_KEYS.WEEKLY, cachedWeekly);
            } else {
                console.log('[Cache] All weeks found in cache (0 reads)');
            }

            // Aggregate from weeks
            weeks.forEach(weekKey => {
                const weekData = cachedWeekly[weekKey] || { total: 0, present: 0, subjects: {} };
                periodTotal += weekData.total || 0;
                periodPresent += weekData.present || 0;

                if (weekData.subjects) {
                    Object.entries(weekData.subjects).forEach(([subName, stat]) => {
                        if (!subjectAgg[subName]) subjectAgg[subName] = { total: 0, attended: 0 };
                        subjectAgg[subName].total += stat.total || 0;
                        subjectAgg[subName].attended += stat.attended || 0;
                    });
                }
            });
        }

        const overallPct = periodTotal > 0 ? Math.round((periodPresent / periodTotal) * 100) : 0;
        updateRingUI(overallPct);

        const label = document.querySelector('.percentage-label');
        if (label) label.innerText = isDefaultView ? "Overall" : "Period";

        const stored = localStorage.getItem('attenza_majors');
        const majors = stored ? JSON.parse(stored) : [];
        updateMajorCard(majors, subjectAgg);

        const allUserSubs = await fetchUserSubjects();
        const finalMap = {};
        allUserSubs.forEach(s => {
            finalMap[s.name] = subjectAgg[s.name] || { total: 0, attended: 0 };
        });
        updateSubjectCards(finalMap);

        const sumBody = document.getElementById('summaryBody');
        if (sumBody) {
            if (isDefaultView) {
                sumBody.innerHTML = `<ul>
                    <li><b>Period:</b> Since signup (overall)</li>
                    <li>Attended ${periodPresent} of ${periodTotal} classes (${overallPct}%).</li>
                </ul>`;
            } else {
                sumBody.innerHTML = `<ul>
                    <li><b>Period:</b> ${startKey} to ${endKey}</li>
                    <li>Attended ${periodPresent} of ${periodTotal} classes (${overallPct}%).</li>
                </ul>`;
            }
        }

    } catch (e) {
        console.error("Periodical calculation error:", e);
        alert("Failed to calculate periodical stats.");
    }
}

// --- FOCUS MODE LOGIC ---

// 1. Enter Focus Mode (Injects Input) - Internal function
function startFocusModeInternal(domId, subjectName) {
    // Clear pending reset flag since user is now marking attended
    if (pendingResetSubject === subjectName) {
        pendingResetSubject = null;
    }

    const scrollArea = document.getElementById('scrollContainer');
    const itemEl = document.getElementById(domId);
    const cardInner = document.getElementById(`card-inner-${domId}`);

    if (!scrollArea || !itemEl || !cardInner) return;

    // Trigger CSS Animation
    scrollArea.classList.add('focus-mode');
    itemEl.classList.add('focused-item');

    // Swap HTML to Input Mode
    cardInner.innerHTML = `
    <div style="animation: fadeIn 0.3s ease;" onclick="event.stopPropagation()">
      
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 class="subject-text">${subjectName}</h4>
        <span class="status-tag tag-green" style="display:inline-block;">Attended</span>
      </div>

      <label class="remark-label">Add short remarks (optional)</label>
      <input type="text" id="input-${domId}" class="remark-input-line" 
             placeholder="e.g. Chapter 5 completed..." 
             maxlength="40"
             autocomplete="off">

      <div class="remark-footer">
        <button id="btn-${domId}" class="btn-action-small btn-mode-skip">
          <span class="btn-text">Skip Remark</span>
          <span class="btn-loader" style="display:none;"></span>
        </button>
      </div>
    </div>
  `;

    // Attach event listeners
    const input = document.getElementById(`input-${domId}`);
    const btn = document.getElementById(`btn-${domId}`);

    if (input) {
        input.addEventListener('input', () => {
            const textSpan = btn.querySelector('.btn-text');
            if (input.value.trim().length > 0) {
                textSpan.innerText = "Save";
                btn.className = "btn-action-small btn-mode-save";
            } else {
                textSpan.innerText = "Skip Remark";
                btn.className = "btn-action-small btn-mode-skip";
            }
        });
        setTimeout(() => input.focus(), 50);
    }

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            endFocusModeInternal(domId, subjectName);
        });
    }
}

// Expose for window access
window.startFocusMode = startFocusModeInternal;

// 3. Exit Focus Mode & Save to DB - Internal function
async function endFocusModeInternal(domId, subjectName) {
    const scrollArea = document.getElementById('scrollContainer');
    const itemEl = document.getElementById(domId);
    const cardInner = document.getElementById(`card-inner-${domId}`);
    const input = document.getElementById(`input-${domId}`);
    const btn = document.getElementById(`btn-${domId}`);
    const remarkVal = input ? input.value.trim() : "";

    // Show loader on button
    if (btn) {
        const textSpan = btn.querySelector('.btn-text');
        const loaderSpan = btn.querySelector('.btn-loader');
        if (textSpan) textSpan.style.display = 'none';
        if (loaderSpan) loaderSpan.style.display = 'inline-block';
        btn.disabled = true;
    }

    // Save to DB first
    await markAttendanceInternal(subjectName, 'present', remarkVal);

    // Reverse Animation after save
    scrollArea?.classList.remove('focus-mode');
    itemEl?.classList.remove('focused-item');

    // Restore card structure so listener can update it properly
    // Get subject details from todaySubjectsList
    const subjectData = todaySubjectsList.find(s => s.name === subjectName) || { time: '', room: '—', faculty: '—' };
    if (cardInner) {
        cardInner.innerHTML = `
      <div class="row-header">
        <div>
          <span class="time-text active-time">${subjectData.time}</span>
          <h4 class="subject-text">${subjectName}</h4>
          <div class="details-text">${subjectData.room} • ${subjectData.faculty}</div>
        </div>
      </div>
      
      <div class="action-area" style="margin-top: 15px;"></div>
    `;
    }

    // Update card status immediately (listener will also fire but this ensures immediate feedback)
    if (itemEl) {
        updateCardStatus(itemEl, 'present');
    }
}

// Expose for window access
window.endFocusMode = endFocusModeInternal;

// 4. "Change Status" Click - Resets to show buttons again
function resetCardStatusInternal(domId, subjectName) {
    const itemEl = document.getElementById(domId);
    if (!itemEl) return;

    // Set pending flag to prevent listener from overwriting
    pendingResetSubject = subjectName;

    // Force re-render with null status to show buttons
    updateCardStatus(itemEl, null);
}

// Expose for window access
window.resetCardStatus = resetCardStatusInternal;

// --- Handle Menu Close from iframe ---
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLOSE_MENU') {
        const menu = document.getElementById("menuOverlay");
        if (menu) {
            menu.style.left = "-100vw";
        }
        document.body.classList.remove('menu-open');
    }
});
