
import { auth, db } from './firebase-init.js';
import {
  doc, getDoc, getDocs, collection, query, where, documentId,
  runTransaction, serverTimestamp, orderBy, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Global State ---
let currentUser = null;
let userProfile = null;
let unsubscribeToday = null; // Listener for today's attendance

// --- Dashboard Initialization ---
window.initializeDashboard = async function (profileData) {
  console.log("Initializing Dashboard for:", profileData.name);
  currentUser = auth.currentUser;
  userProfile = profileData;

  // 1. Update Welcome Text
  const firstName = profileData.name.split(' ')[0];
  const welcomeTitle = document.getElementById('welcomeTitle');
  if (welcomeTitle) welcomeTitle.innerText = `Hello, ${firstName}!`;

  try {
    // 2. Load Summary & Update Ring/Stats
    await loadSummary();

    // 3. Load Today's Routine (Carousel)
    await loadTodayRoutine(profileData);

    // 4. Load Major Subjects (Local Cache + Calc)
    loadMajorSubjects();

  } catch (e) {
    console.error("Dashboard Init Error:", e);
  }
}

// --- 1. Summary & Stats Logic ---
async function loadSummary() {
  if (!currentUser) return;

  // Doc path: users/{uid}/summary (as per arch)
  // Note: We try 'users/{uid}/summary/summary' first (subcollection pattern) 
  // or just 'users/{uid}/summary' if it's a doc. 
  // The Setup writes to `users/{uid}/metadata/summary` (line 791 of setup.html). 
  // Let's stick to that path since Setup uses it!
  const summaryRef = doc(db, 'users', currentUser.uid, 'metadata', 'summary');

  try {
    const snap = await getDoc(summaryRef);
    let data = snap.exists() ? snap.data() : null;

    if (!data) {
      // Fallback: Calculate from subjects if summary missing (first run)
      console.log("No summary found, assuming fresh start.");
      updateRingUI(100);
      updateQuote(100);
      return;
    }

    // Calculate overall
    // Note: Summary has pastTotalClasses, pastAttendedClasses, trackedTotal, trackedPresent
    const pastTotal = data.pastTotalClasses || 0;
    const pastPresent = data.pastAttendedClasses || 0;
    const trackTotal = data.trackedTotal || 0;
    const trackPresent = data.trackedPresent || 0;

    const total = pastTotal + trackTotal;
    const present = pastPresent + trackPresent;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    updateRingUI(percentage);
    updateQuote(percentage);

    // Update Periodical Subject Cards (Bento Grid)
    // For initial load, we showing overall summary. 
    // Wait, updateSubjectCards logic below tries to merge 'subjectStats' with 'fetchUserSubjects' (past).
    // If we pass 'data.subjects', it contains only "tracked" stats.
    // The previous implementation was a bit confused on merge.
    // Let's make updateSubjectCards robust: if passed stats (like for a period), show ONLY that.
    // But for "Overall" (initial load), we want (Past + Tracked).

    // Let's build a "Global Summary Stats" object here to pass.

    const allSubjects = await fetchUserSubjects(); // Name + Past
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

    // Also update Major card with this full summary
    // Logic inside updateMajorCard re-fetches things. We should optimize?
    // For now let's just call it.
    loadMajorSubjects();

  } catch (e) {
    console.error("Load Summary Failed:", e);
  }
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

function updateQuote(percentage) {
  const quoteElement = document.getElementById('welcomeSubtitle');
  if (!quoteElement) return;

  if (percentage >= 85) {
    quoteElement.textContent = "Excellent! You're a role model for attendance.";
  } else if (percentage >= 75) {
    quoteElement.textContent = "Great progress! Keep maintaining your attendance streak.";
  } else if (percentage >= 65) {
    quoteElement.textContent = "Good effort! A few more classes to reach the goal.";
  } else {
    quoteElement.textContent = "Time to catch up! Every class counts.";
  }
}

// --- 2. Routine & Carousel Logic ---
async function loadTodayRoutine(profile) {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;
  carousel.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">Loading schedule...</div>';

  // Fetch subjects first
  const subjects = await fetchUserSubjects();
  if (subjects.length === 0) {
    carousel.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">No subjects set. Go to Menu > Select Subjects.</div>';
    return;
  }

  // Determine Routine
  let todaysSubjects = []; // Array of subject names/objects

  if (profile.college === 'Dispur College') {
    // Fetch from Google Sheet
    try {
      todaysSubjects = await fetchDispurSheet(profile.course_or_class || profile.class, new Date());
      if (todaysSubjects.length === 0) {
        // Fallback if sheet has no data for today (e.g. Sunday) or fetch fails
        console.log("No routine found in sheet for today, showing all subjects as fallback optional.");
        todaysSubjects = subjects.map(s => ({ name: s.name, time: 'Daily', room: '—', faculty: '—', duration: '1 hr' }));
      }
    } catch (err) {
      console.error("Routine fetch failed, fallback:", err);
      todaysSubjects = subjects.map(s => ({ name: s.name, time: 'Daily', room: '—', faculty: '—', duration: '1 hr' }));
    }
  } else {
    // Default: Show ALL subjects for the user
    todaysSubjects = subjects.map(s => ({
      name: s.name,
      time: 'Daily',
      room: '—',
      faculty: '—',
      duration: '1 hr'
    }));
  }

  // Sort or Organize? For now just list them

  // Render Cards
  carousel.innerHTML = '';
  todaysSubjects.forEach(sub => {
    const card = createClassCard(sub);
    carousel.appendChild(card);
  });

  // Setup Listener for Today's Attendance Status
  setupTodayListener(todaysSubjects);
}

// Fetch Routine from Google Sheet CSV
async function fetchDispurSheet(userClass, dateObj) {
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRWCOvXokdqJy8pGPqf9JZdejf20T-V8SzeOMbdHb9-PhiWJXS-W4NDk0l3DA7ywq12FZXmRfoJ_WPK/pub?gid=0&single=true&output=csv";

  // Day Name (e.g., "Monday")
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  console.log("Fetching routine for:", dayName, userClass);

  const response = await fetch(SHEET_URL);
  const text = await response.text();

  // Parse CSV (Simple split by line and comma)
  // Handle potential quotes in CSV if complex, but assuming simple format as per desc.
  const rows = text.split('\n').map(r => r.trim()).filter(r => r).map(row => {
    // Handle comma inside quotes? For simple routine, maybe not needed.
    // Let's stick to split(',') for now.
    return row.split(',').map(c => c.trim());
  });

  // Structure: College | Class | Day | StartTime | Subject | Faculty | RoomNo
  // Index: 0, 1, 2, 3, 4, 5, 6

  const todays = rows.filter(r => {
    if (r.length < 5) return false;
    // Case-insensitive comparison
    const sheetCollege = (r[0] || "").toLowerCase();
    const sheetClass = (r[1] || "").toLowerCase();
    const sheetDay = (r[2] || "").toLowerCase();

    return sheetCollege.includes('dispur') &&
      sheetClass === (userClass || "").toLowerCase() &&
      sheetDay === dayName.toLowerCase();
  });

  return todays.map(r => ({
    name: r[4],        // Subject
    time: r[3],        // StartTime
    faculty: r[5] || '—',
    room: r[6] || '—',
    duration: '1 hr'
  }));
}

// Fetch all subjects from users/{uid}/subjects
async function fetchUserSubjects() {
  if (!currentUser) return [];
  try {
    const colRef = collection(db, 'users', currentUser.uid, 'subjects');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.error("Fetch Subjects Error:", e);
    return [];
  }
}

function createClassCard(subject) {
  const div = document.createElement('div');
  div.className = 'class-card';
  div.dataset.subjectName = subject.name; // For finding it later

  div.innerHTML = `
        <div class="class-header">  
            <span class="class-subject">${subject.name}</span>  
            <span class="class-time">${subject.time}</span>  
        </div>  
        <div class="class-details">  
            <div><strong>Room:</strong> ${subject.room || '—'}</div>  
            <div><strong>Faculty:</strong> ${subject.faculty || '—'}</div>  
            <div><strong>Duration:</strong> ${subject.duration || '1 hr'}</div>  
        </div>  
        <div class="attendance-actions">  
            <button class="attendance-btn btn-attend" onclick="markAttendance('${subject.name}', 'present')">Attend</button>  
            <button class="attendance-btn btn-skip" onclick="markAttendance('${subject.name}', 'absent')">Skip</button>  
            <button class="attendance-btn btn-not-held" onclick="markAttendance('${subject.name}', 'not-held')">Not Held</button>  
        </div>
    `;
  return div;
}

// Listen to users/{uid}/attendance/{YYYY-MM-DD}
function setupTodayListener(subjects) {
  if (!currentUser) return;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const todayRef = doc(db, 'users', currentUser.uid, 'attendance', today);

  if (unsubscribeToday) unsubscribeToday();

  unsubscribeToday = onSnapshot(todayRef, (docSnap) => {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const records = data.records || {};

    // Update UI for each card
    const cards = document.querySelectorAll('.class-card');
    cards.forEach(card => {
      const subjectName = card.dataset.subjectName;
      const status = records[subjectName]?.status;
      updateCardStatus(card, status);
    });
  });
}

function updateCardStatus(card, status) {
  const btns = card.querySelectorAll('.attendance-btn');
  btns.forEach(b => {
    b.classList.remove('active');
    b.style.opacity = '1';
    b.style.transform = 'scale(1)';
  });

  if (!status) return; // No status yet

  // Visual feedback for marked status
  if (status === 'present') {
    const btn = card.querySelector('.btn-attend');
    if (btn) btn.classList.add('active'); // You might need CSS for .active
    // For now, let's just style inline or assume existing CSS handles 'active' or focus
    btn.style.backgroundColor = '#4ade80'; // Green
    btn.style.color = '#fff';
  } else if (status === 'absent') {
    const btn = card.querySelector('.btn-skip');
    if (btn) {
      btn.style.backgroundColor = '#ef4444'; // Red
      btn.style.color = '#fff';
    }
  } else if (status === 'not-held') {
    const btn = card.querySelector('.btn-not-held');
    if (btn) {
      btn.style.backgroundColor = '#9ca3af'; // Gray
      btn.style.color = '#fff';
    }
  }
}

// --- 3. Mark Attendance Logic ---
window.markAttendance = async function (subjectName, status) {
  if (!currentUser) return;
  console.log(`Marking ${status} for ${subjectName}`);

  let remarks = "";
  if (status === 'present') {
    remarks = prompt(`Add a short remark for ${subjectName} (optional):`, "");
    if (remarks === null) remarks = ""; // User cancelled prompt? Treat as empty remarks
  }

  const today = new Date().toISOString().split('T')[0];
  const todayRef = doc(db, 'users', currentUser.uid, 'attendance', today);
  const summaryRef = doc(db, 'users', currentUser.uid, 'metadata', 'summary');

  try {
    await runTransaction(db, async (transaction) => {
      // Read Today's Doc
      const todaySnap = await transaction.get(todayRef);
      let todayData = todaySnap.exists() ? todaySnap.data() : { date: today, records: {} };
      if (!todayData.records) todayData.records = {}; // Ensure records object exists
      let oldStatus = todayData.records[subjectName]?.status;

      // Read Summary
      const summarySnap = await transaction.get(summaryRef);
      let summaryData = summarySnap.exists() ? summarySnap.data() : { trackedTotal: 0, trackedPresent: 0, subjects: {} };

      // Logic to adjust totals
      // Remove old effect
      if (oldStatus === 'present') {
        summaryData.trackedTotal = (summaryData.trackedTotal || 0) - 1;
        summaryData.trackedPresent = (summaryData.trackedPresent || 0) - 1;
        // Subject level
        if (summaryData.subjects && summaryData.subjects[subjectName]) {
          summaryData.subjects[subjectName].trackedTotal--;
          summaryData.subjects[subjectName].trackedPresent--;
        }
      } else if (oldStatus === 'absent') {
        summaryData.trackedTotal = (summaryData.trackedTotal || 0) - 1;
        // Subject level
        if (summaryData.subjects && summaryData.subjects[subjectName]) {
          summaryData.subjects[subjectName].trackedTotal--;
        }
      }

      // Add new effect
      if (status === 'present') {
        summaryData.trackedTotal = (summaryData.trackedTotal || 0) + 1;
        summaryData.trackedPresent = (summaryData.trackedPresent || 0) + 1;

        if (!summaryData.subjects) summaryData.subjects = {};
        if (!summaryData.subjects[subjectName]) summaryData.subjects[subjectName] = { trackedTotal: 0, trackedPresent: 0 };

        summaryData.subjects[subjectName].trackedTotal++;
        summaryData.subjects[subjectName].trackedPresent++;

      } else if (status === 'absent') {
        summaryData.trackedTotal = (summaryData.trackedTotal || 0) + 1;

        if (!summaryData.subjects) summaryData.subjects = {};
        if (!summaryData.subjects[subjectName]) summaryData.subjects[subjectName] = { trackedTotal: 0, trackedPresent: 0 };

        summaryData.subjects[subjectName].trackedTotal++;
      }

      // Update Today's Record
      todayData.records[subjectName] = {
        status: status,
        remarks: remarks || todayData.records[subjectName]?.remarks || "",
        timestamp: serverTimestamp()
      };

      transaction.set(todayRef, todayData);
      transaction.set(summaryRef, summaryData, { merge: true });
    });

    // UI Update handled by listener (setupTodayListener) or calculateSummary re-run
    await loadSummary();

  } catch (e) {
    console.error("Attendance Transaction Failed full error:", e);
    alert(`Failed: ${e.message || "Unknown error"}`);
  }
}


// --- 4. Bento Grid Subject Cards ---
// --- 4. Bento Grid Subject Cards ---
function updateSubjectCards(finalStats) {
  // finalStats expected: { "Math": { total: 20, attended: 15 } }

  const bentoGrid = document.querySelector('.bento-grid');
  if (!bentoGrid) return;

  const oldCards = bentoGrid.querySelectorAll('.subject-card');
  oldCards.forEach(c => c.remove());

  Object.entries(finalStats).forEach(([name, stat]) => {
    const total = stat.total || 0;
    const attended = stat.attended || 0;
    const percent = total > 0 ? Math.round((attended / total) * 100) : 0;

    // Only show subjects that have data? Or all?
    // If this is "Periodical", we might only show active subjects.
    // If "Overall", show all.
    // Let's show all that are in the stats object having > 0 total?
    // Or just all passed.

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
  // 1. Get Majors from localStorage or User Profile
  // Architecture says: "Stored locally in browser (localStorage)"
  // Key: 'attenza_majors'
  const stored = localStorage.getItem('attenza_majors');
  let majors = stored ? JSON.parse(stored) : [];

  // Also check if userProfile has them? Doc says "Local Cache".
  updateMajorCard(majors);

  // Wire up the Major Modal
  const editBtn = document.getElementById('majorEdit');
  const modal = document.getElementById('majorModal');
  const cancel = document.getElementById('majorCancel');
  const save = document.getElementById('majorSave');

  if (editBtn) editBtn.onclick = () => {
    if (modal) modal.style.display = 'block';
    // Populate Checkboxes
    // We need list of all subjects.
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

// Update Major Card UI
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
    if (halfPath) halfPath.style.strokeDashoffset = 100; // Empty
    if (summaryBody) summaryBody.innerHTML = '<ul><li>Detailed summary awaits.</li><li>Select majors to see combined stats.</li></ul>';
    return;
  }

  let totalM = 0;
  let presentM = 0;

  if (overrideStats) {
    // Use provided stats (Periodical)
    majors.forEach(m => {
      if (overrideStats[m]) {
        totalM += overrideStats[m].total;
        presentM += overrideStats[m].attended;
      }
    });
  } else {
    // Default: Calculate Overall (Past + Tracked)
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

  // Animate Half Ring
  const len = 126;
  const offset = 0; // Full ring for 100%

  if (halfPath) {
    halfPath.style.strokeDasharray = len;
    halfPath.style.strokeDashoffset = offset;
  }

  if (summaryBody) {
    // Update summary text appropriately
    const isPeriodical = !!overrideStats;
    const periodText = isPeriodical ? "this period" : "overall";
    summaryBody.innerHTML = `<ul><li>Your ${periodText} major attendance is ${percent}%.</li><li>You are safe!</li></ul>`;
  }
}


// --- 6. Date-Wise Records Logic (Replaces existing mock) ---
// Note: The HTML imports 'flatpickr' and 'app.js'
// We need to attach listeners for the date strip and edit modal.

const attendanceData = {}; // Cache for fetched dates

// Init Date Strip
const dateStrip = document.getElementById('dateStrip');
const cardsContainer = document.getElementById('dateCardsContainer');
let currentSelectedDateKey = null;

if (dateStrip) initDateStrip();

function initDateStrip() {
  initMonthYearSelect();
  const today = new Date();
  renderDateStrip(today);
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

function renderDateStrip(centerDate) {
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

    if (dKey === todayStr) btn.classList.add('today');

    btn.innerHTML = `
            <span class="day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
            <span class="day-number">${String(d.getDate()).padStart(2, '0')}</span>
        `;

    btn.onclick = () => loadDateRecords(dKey, btn);
    dateStrip.appendChild(btn);

    const centerMonthKey = `${centerDate.getFullYear()}-${String(centerDate.getMonth() + 1).padStart(2, '0')}`;
    const isTodayInthisMonth = todayStr.startsWith(centerMonthKey);
    if (isTodayInthisMonth) {
      if (dKey === todayStr) loadDateRecords(dKey, btn);
    } else if (d.getDate() === 1) {
      loadDateRecords(dKey, btn);
    }
  }
}

async function loadDateRecords(dateKey, btnElement) {
  currentSelectedDateKey = dateKey;

  // UI Active State
  document.querySelectorAll('.date-item').forEach(b => b.classList.remove('selected'));
  if (btnElement) btnElement.classList.add('selected');

  document.getElementById('selectedDateLabel').innerText = new Date(dateKey).toDateString();

  cardsContainer.innerHTML = '<div class="loader">Loading...</div>';

  if (!currentUser) return;

  // Fetch from Firestore: users/{uid}/attendance/{dateKey}
  try {
    const docRef = doc(db, 'users', currentUser.uid, 'attendance', dateKey);
    const snap = await getDoc(docRef);

    cardsContainer.innerHTML = ''; // Clear loader

    if (!snap.exists() || !snap.data().records) {
      cardsContainer.innerHTML = '<div class="empty-state">No records for this date.</div>';
      return;
    }

    const records = snap.data().records; // Map: { SubjectName: { status, timestamp, remarks } }

    if (Object.keys(records).length === 0) {
      cardsContainer.innerHTML = '<div class="empty-state">No classes marked.</div>';
      return;
    }

    Object.keys(records).forEach(subName => {
      const rec = records[subName];
      cardsContainer.appendChild(createDateRecordCard(subName, rec));
    });

  } catch (e) {
    console.error("Date Load Error:", e);
    cardsContainer.innerHTML = `<div class="error">Failed to load: ${e.message} (${e.code || ''})</div>`;
  }
}

function createDateRecordCard(subjectName, record) {
  const art = document.createElement('article');
  art.className = 'record-card';
  // Use data attributes to store data safely for the edit button
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

      // Adjust totals if status changed
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
// Because we are module, window functions are needed for onclick="" in HTML
window.openMenu = function () {
  const menu = document.getElementById("menuOverlay");
  if (menu) menu.style.left = "0";
}

// ==========================================
// === UI LOGIC (Appended) ===
// ==========================================

// --- Carousel Drag Logic ---
const carouselEl = document.getElementById('carousel');
if (carouselEl) {
  let isDown = false;
  let startX;
  let scrollLeft;

  carouselEl.addEventListener('mousedown', (e) => {
    isDown = true;
    carouselEl.style.cursor = 'grabbing';
    startX = e.pageX - carouselEl.offsetLeft;
    scrollLeft = carouselEl.scrollLeft;
  });

  carouselEl.addEventListener('mouseleave', () => {
    isDown = false;
    carouselEl.style.cursor = 'grab';
  });

  carouselEl.addEventListener('mouseup', () => {
    isDown = false;
    carouselEl.style.cursor = 'grab';
  });

  carouselEl.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - carouselEl.offsetLeft;
    const walk = (x - startX) * 2;
    carouselEl.scrollLeft = scrollLeft - walk;
  });
}

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

// === Calendar Logic (Periodical Records) ===
const rangePicker = document.getElementById("rangePicker");
if (rangePicker && window.flatpickr) {
  flatpickr(rangePicker, {
    mode: "range",
    dateFormat: "Y-m-d",
    onChange: function (selectedDates, dateStr, instance) {
      // Update Text
      const startSpan = document.getElementById("startDate");
      const endSpan = document.getElementById("endDate");

      if (selectedDates.length > 0) {
        if (startSpan) startSpan.innerText = selectedDates[0].toLocaleDateString();
        if (startSpan) startSpan.classList.remove('empty');
      }
      if (selectedDates.length > 1) {
        if (endSpan) endSpan.innerText = selectedDates[1].toLocaleDateString();
        if (endSpan) endSpan.classList.remove('empty');

        // Trigger Logic to Filter Stats
        const start = selectedDates[0];
        const end = selectedDates[1];
        // Convert to YYYY-MM-DD for firestore keys
        // Note: JS dates are local, split ISO string gives UTC. 
        // Best: use simple conversion or consistent logic.
        // Assuming keys are YYYY-MM-DD
        const toKey = (d) => {
          const offset = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - offset).toISOString().split('T')[0];
        };

        calculatePeriodicalStats(toKey(start), toKey(end));
      }
    }
  });
}

// --- Periodical Stats Logic ---
window.calculatePeriodicalStats = async function (startKey, endKey) {
  if (!currentUser) return;
  console.log(`Filtering from ${startKey} to ${endKey}`);

  // UI Feedback (maybe loader?)
  document.getElementById('percentageText').innerText = '...';

  try {
    // Query Attendance Collection
    const attRef = collection(db, 'users', currentUser.uid, 'attendance');
    const q = query(attRef, where(documentId(), '>=', startKey), where(documentId(), '<=', endKey));

    const snaps = await getDocs(q);

    // Aggregate
    let periodTotal = 0;
    let periodPresent = 0;
    const subjectAgg = {}; // { 'Math': { total: 0, attended: 0 } }

    if (snaps.empty) {
      console.log("No records in range");
    }

    snaps.forEach(docSnap => {
      const dayData = docSnap.data();
      const records = dayData.records || {};

      Object.entries(records).forEach(([subName, rec]) => {
        const status = rec.status;
        if (!subjectAgg[subName]) subjectAgg[subName] = { total: 0, attended: 0 };

        if (status === 'present') {
          periodTotal++;
          periodPresent++;
          subjectAgg[subName].total++;
          subjectAgg[subName].attended++;
        } else if (status === 'absent') {
          periodTotal++;
          subjectAgg[subName].total++;
        }
        // 'not-held' ignored for totals
      });
    });

    // Update UI Parts

    // 1. Overall Ring
    const overallPct = periodTotal > 0 ? Math.round((periodPresent / periodTotal) * 100) : 0;
    updateRingUI(overallPct);

    // Update Label to indicate Periodical view
    const label = document.querySelector('.percentage-label');
    if (label) label.innerText = "Period";

    // 2. Major Card
    const stored = localStorage.getItem('attenza_majors');
    const majors = stored ? JSON.parse(stored) : [];
    updateMajorCard(majors, subjectAgg);

    // 3. Bento Grid Subjects (Only show relevant ones or show all with 0?)
    // Let's show all that have activity, or if none, effectively clear.
    // Better: Fetch all user subjects to keep grid stable, but fill with period data (mostly 0).
    const allUserSubs = await fetchUserSubjects();
    const finalMap = {};
    allUserSubs.forEach(s => {
      // Fill with 0 if not in agg
      finalMap[s.name] = subjectAgg[s.name] || { total: 0, attended: 0 };
    });
    updateSubjectCards(finalMap);

    // Update Summary Text Area
    const sumBody = document.getElementById('summaryBody');
    if (sumBody) {
      sumBody.innerHTML = `<ul>
                <li><b>Period:</b> ${startKey} to ${endKey}</li>
                <li>Attended ${periodPresent} of ${periodTotal} classes (${overallPct}%).</li>
             </ul>`;
    }

  } catch (e) {
    console.error("Periodical calculation error:", e);
    alert("Failed to calculate periodical stats.");
  }
}

