/**
 * Attenza Routine Service
 * Centralized module for Google Sheets routine data management with caching
 * 
 * Data Flow:
 * 1. Master Sheet → College/Class/Section mappings + version control
 * 2. Routine Sheets → Daily schedules per class
 * 3. LocalStorage → Caching layer for offline/performance
 */

// ============================================
// CACHE KEYS
// ============================================
const CACHE_KEYS = {
    MASTER_SHEET: 'attenza_master_cache',
    MASTER_TIMESTAMP: 'attenza_master_timestamp',
    ROUTINE_DATA: (classId) => `attenza_routine_${classId}`,
    ROUTINE_VERSION: (classId) => `attenza_routine_version_${classId}`,
    USER_CLASS_ID: 'attenza_user_class_id'
};

// Master Sheet CSV Export URL (to be configured)
const MASTER_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQfNCRyXxZSbL-pMT-MOxZ3c5ucXzajfqH48fKt3WTQOD77sSfzPe8xG6sx4sIP85j74_vXgQ5xGTJq/pub?output=csv";

// Build CSV export URL from Sheet ID
function buildRoutineSheetURL(sheetId) {
    return `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?gid=0&single=true&output=csv`;
}

// ============================================
// STRING SANITIZATION HELPERS
// ============================================

/**
 * Normalize subject name for comparison
 * @param {string} subject - Subject name to normalize
 * @returns {string} - Trimmed, lowercase subject name
 */
export function normalizeSubject(subject) {
    if (!subject) return '';
    return subject.trim().toLowerCase();
}

/**
 * Convert to Title Case
 * @param {string} str - String to convert
 * @returns {string} - Title cased string
 */
export function toTitleCase(str) {
    if (!str) return '';
    return str.trim().replace(/\w\S*/g, (txt) =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

/**
 * Compare two subject names with normalization
 * @param {string} a - First subject
 * @param {string} b - Second subject
 * @returns {boolean} - True if subjects match
 */
export function compareSubjects(a, b) {
    return normalizeSubject(a) === normalizeSubject(b);
}

// ============================================
// MASTER SHEET OPERATIONS
// ============================================

/**
 * Parse CSV text to array of objects
 * @param {string} csvText - Raw CSV text
 * @param {string[]} headers - Expected headers
 * @returns {Object[]} - Array of row objects
 */
function parseCSV(csvText, headers = null) {
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length === 0) return [];

    // Use first row as headers if not provided
    const headerRow = headers || lines[0].split(',').map(h => h.trim());
    const dataLines = headers ? lines : lines.slice(1);

    return dataLines.map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headerRow.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
}

/**
 * Fetch and cache Master Sheet data
 * @returns {Promise<Object[]>} - Master sheet rows
 */
export async function fetchMasterSheet() {
    try {
        const response = await fetch(MASTER_SHEET_URL);
        if (!response.ok) throw new Error('Master sheet fetch failed');

        const csvText = await response.text();
        // Expected columns: college_id, class_label, class_id, routine_sheet_id, sections_available, version
        const headers = ['college_id', 'class_label', 'class_id', 'routine_sheet_id', 'sections_available', 'version'];
        const data = parseCSV(csvText, null); // Use sheet headers

        // Cache the data
        localStorage.setItem(CACHE_KEYS.MASTER_SHEET, JSON.stringify(data));
        localStorage.setItem(CACHE_KEYS.MASTER_TIMESTAMP, Date.now().toString());

        return data;
    } catch (error) {
        console.error('Failed to fetch master sheet:', error);
        // Return cached data if available
        const cached = localStorage.getItem(CACHE_KEYS.MASTER_SHEET);
        if (cached) {
            console.log('Returning cached master sheet data');
            return JSON.parse(cached);
        }
        return [];
    }
}

/**
 * Get cached Master Sheet data (or fetch if empty)
 * @returns {Promise<Object[]>} - Master sheet rows
 */
export async function getMasterSheet() {
    const cached = localStorage.getItem(CACHE_KEYS.MASTER_SHEET);
    if (cached) {
        return JSON.parse(cached);
    }
    return await fetchMasterSheet();
}

/**
 * Get classes available for a specific college
 * @param {string} collegeId - College identifier
 * @returns {Promise<Object[]>} - Filtered class entries
 */
export async function getClassesForCollege(collegeId) {
    const masterData = await getMasterSheet();
    const normalizedCollegeId = collegeId.toLowerCase().trim();

    return masterData.filter(row =>
        row.college_id && row.college_id.toLowerCase().trim() === normalizedCollegeId
    );
}

/**
 * Get sections available for a specific class
 * @param {string} classId - Class identifier
 * @returns {Promise<string[]>} - Array of section names
 */
export async function getSectionsForClass(classId) {
    const masterData = await getMasterSheet();
    const classRow = masterData.find(row =>
        row.class_id && row.class_id.toLowerCase().trim() === classId.toLowerCase().trim()
    );

    if (!classRow || !classRow.sections_available) {
        return ['A', 'B', 'C']; // Default sections
    }

    return classRow.sections_available.split(',').map(s => s.trim()).filter(s => s);
}

/**
 * Get routine sheet ID for a class
 * @param {string} classId - Class identifier
 * @returns {Promise<string|null>} - Routine sheet ID or null
 */
export async function getRoutineSheetId(classId) {
    const masterData = await getMasterSheet();
    const classRow = masterData.find(row =>
        row.class_id && row.class_id.toLowerCase().trim() === classId.toLowerCase().trim()
    );

    return classRow?.routine_sheet_id || null;
}

/**
 * Get current version for a class from master sheet
 * @param {string} classId - Class identifier
 * @returns {Promise<number>} - Version number
 */
export async function getCurrentVersion(classId) {
    const masterData = await fetchMasterSheet(); // Always fetch fresh for version check
    const classRow = masterData.find(row =>
        row.class_id && row.class_id.toLowerCase().trim() === classId.toLowerCase().trim()
    );

    return parseInt(classRow?.version || '0', 10);
}

// ============================================
// ROUTINE SHEET OPERATIONS
// ============================================

/**
 * Fetch routine data from a specific sheet
 * @param {string} sheetId - Google Sheet ID
 * @returns {Promise<Object[]>} - Routine rows
 */
export async function fetchRoutineSheet(sheetId) {
    if (!sheetId) return [];

    try {
        const url = buildRoutineSheetURL(sheetId);
        const response = await fetch(url);
        if (!response.ok) throw new Error('Routine sheet fetch failed');

        const csvText = await response.text();
        // Expected columns: day, section, subject, start_time, room, teacher
        const data = parseCSV(csvText, null);

        return data;
    } catch (error) {
        console.error('Failed to fetch routine sheet:', error);
        return [];
    }
}

/**
 * Fetch routine with version handshake (cache optimization)
 * @param {string} classId - Class identifier
 * @returns {Promise<{routineData: Object[], fromCache: boolean, fetchFailed: boolean}>}
 */
export async function fetchRoutineWithVersionCheck(classId) {
    if (!classId) {
        return { routineData: [], fromCache: false, fetchFailed: true };
    }

    try {
        // Step 1: Get current version from master sheet
        const currentVersion = await getCurrentVersion(classId);

        // Step 2: Get local version
        const localVersionStr = localStorage.getItem(CACHE_KEYS.ROUTINE_VERSION(classId));
        const localVersion = parseInt(localVersionStr || '0', 10);

        // Step 3: Version comparison
        if (currentVersion === localVersion && localVersion > 0) {
            // Cache is valid - return cached data
            const cachedRoutine = localStorage.getItem(CACHE_KEYS.ROUTINE_DATA(classId));
            if (cachedRoutine) {
                console.log(`Routine cache hit for ${classId} (v${localVersion})`);
                return {
                    routineData: JSON.parse(cachedRoutine),
                    fromCache: true,
                    fetchFailed: false
                };
            }
        }

        // Step 4: Cache is stale or missing - fetch new data
        console.log(`Fetching fresh routine for ${classId} (v${currentVersion})`);
        const sheetId = await getRoutineSheetId(classId);
        const routineData = await fetchRoutineSheet(sheetId);

        if (routineData.length > 0) {
            // Update cache
            localStorage.setItem(CACHE_KEYS.ROUTINE_DATA(classId), JSON.stringify(routineData));
            localStorage.setItem(CACHE_KEYS.ROUTINE_VERSION(classId), currentVersion.toString());
        }

        return {
            routineData,
            fromCache: false,
            fetchFailed: routineData.length === 0
        };

    } catch (error) {
        console.error('Routine version check failed:', error);

        // Try to return cached data on error
        const cachedRoutine = localStorage.getItem(CACHE_KEYS.ROUTINE_DATA(classId));
        if (cachedRoutine) {
            return {
                routineData: JSON.parse(cachedRoutine),
                fromCache: true,
                fetchFailed: false
            };
        }

        return { routineData: [], fromCache: false, fetchFailed: true };
    }
}

// ============================================
// SUBJECT EXTRACTION (for Setup flow)
// ============================================

/**
 * Extract unique subjects from routine data
 * @param {Object[]} routineData - Routine rows
 * @returns {string[]} - Unique subject names (Title Cased)
 */
export function extractSubjectsFromRoutine(routineData) {
    if (!routineData || routineData.length === 0) return [];

    const subjectSet = new Set();

    routineData.forEach(row => {
        const subject = row.subject || row.Subject || '';
        if (subject.trim()) {
            subjectSet.add(toTitleCase(subject.trim()));
        }
    });

    return Array.from(subjectSet).sort();
}

/**
 * Fetch subjects for a class (for setup/onboarding)
 * @param {string} classId - Class identifier
 * @returns {Promise<string[]>} - Array of unique subject names
 */
export async function fetchSubjectsForClass(classId) {
    const sheetId = await getRoutineSheetId(classId);
    if (!sheetId) return [];

    const routineData = await fetchRoutineSheet(sheetId);
    return extractSubjectsFromRoutine(routineData);
}

// ============================================
// TODAY'S SCHEDULE FILTERING (Hybrid Safety Approach)
// ============================================

/**
 * Build today's schedule using Hybrid Safety approach
 * 
 * Logic:
 * 1. Loop through USER's saved subjects (not routine rows)
 * 2. For each subject, check if it matches today's routine (Day + Section + Subject)
 * 3. Scenario A: Match found → Use sheet data (time, room, teacher)
 * 4. Scenario B: No match + (isCustom OR fetchFailed) → Show as "Daily"
 * 5. Scenario C: No match + official subject → Hide (not scheduled today)
 * 
 * @param {Object[]} userSubjects - User's saved subjects from Firestore
 * @param {Object[]} routineData - Fetched routine data for the class
 * @param {string} userSection - User's section (A, B, C, etc.)
 * @param {boolean} fetchFailed - True if routine fetch failed
 * @returns {Object[]} - Today's timeline items
 */
export function buildTodaySchedule(userSubjects, routineData, userSection, fetchFailed = false) {
    const timeline = [];
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // If fetch failed completely, show all subjects as daily (fallback mode)
    if (fetchFailed || !routineData || routineData.length === 0) {
        console.log('Routine fetch failed - showing all subjects as Daily');
        return userSubjects.map(sub => ({
            name: sub.name,
            time: 'Daily',
            room: '—',
            faculty: '—',
            duration: '1 hr',
            isCustom: sub.isCustom || false,
            isFallback: true
        }));
    }

    // Filter routine for today and user's section
    const todaysRoutine = routineData.filter(row => {
        const rowDay = (row.day || row.Day || '').toLowerCase().trim();
        const rowSection = (row.section || row.Section || '').trim();

        // Match day
        if (rowDay !== dayName.toLowerCase()) return false;

        // Match section (empty section means all sections)
        if (rowSection && rowSection.toLowerCase() !== userSection.toLowerCase()) return false;

        return true;
    });

    // Process each user subject
    userSubjects.forEach(userSub => {
        const subjectName = userSub.name;
        const isCustom = userSub.isCustom === true;

        // Find match in today's routine
        const routineMatch = todaysRoutine.find(row => {
            const routineSubject = row.subject || row.Subject || '';
            return compareSubjects(routineSubject, subjectName);
        });

        if (routineMatch) {
            // Scenario A: Match Found - Use sheet data
            timeline.push({
                name: subjectName,
                time: routineMatch.start_time || routineMatch.time || routineMatch.Time || '—',
                room: routineMatch.room || routineMatch.Room || '—',
                faculty: routineMatch.teacher || routineMatch.Teacher || routineMatch.faculty || '—',
                duration: '1 hr',
                isCustom: false,
                isFallback: false
            });
        } else if (isCustom) {
            // Scenario B: No Match + Custom Subject - Show as Daily
            timeline.push({
                name: subjectName,
                time: 'Daily',
                room: '—',
                faculty: '—',
                duration: '1 hr',
                isCustom: true,
                isFallback: false
            });
        }
        // Scenario C: No Match + Official Subject - Hidden (not added to timeline)
    });

    return timeline;
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Clear routine cache (call when user changes subjects)
 * @param {string} classId - Class identifier
 */
export function clearRoutineCache(classId) {
    if (classId) {
        localStorage.removeItem(CACHE_KEYS.ROUTINE_DATA(classId));
        localStorage.removeItem(CACHE_KEYS.ROUTINE_VERSION(classId));
    }
}

/**
 * Clear all routine-related cache
 */
export function clearAllRoutineCache() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('attenza_routine_')) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(CACHE_KEYS.MASTER_SHEET);
    localStorage.removeItem(CACHE_KEYS.MASTER_TIMESTAMP);
}

/**
 * Save user's class ID for quick reference
 * @param {string} classId - Class identifier
 */
export function saveUserClassId(classId) {
    localStorage.setItem(CACHE_KEYS.USER_CLASS_ID, classId);
}

/**
 * Get saved user class ID
 * @returns {string|null} - Class ID or null
 */
export function getUserClassId() {
    return localStorage.getItem(CACHE_KEYS.USER_CLASS_ID);
}

// ============================================
// EXPORTS SUMMARY
// ============================================
// String Helpers: normalizeSubject, toTitleCase, compareSubjects
// Master Sheet: fetchMasterSheet, getMasterSheet, getClassesForCollege, getSectionsForClass, getRoutineSheetId, getCurrentVersion
// Routine Sheet: fetchRoutineSheet, fetchRoutineWithVersionCheck, extractSubjectsFromRoutine, fetchSubjectsForClass
// Today's Schedule: buildTodaySchedule
// Cache: clearRoutineCache, clearAllRoutineCache, saveUserClassId, getUserClassId
