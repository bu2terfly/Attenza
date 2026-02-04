/**
 * cache-service.js
 * Centralized multi-layer caching for Firestore read optimization
 * 
 * Layer 1: Session Cache (in-memory) - fastest, cleared on page reload
 * Layer 2: Browser Cache (localStorage) - survives reloads, invalidation-based
 * 
 * NO TTL - all caches are invalidation-based only
 */

// ============ SESSION CACHE (In-Memory) ============
const sessionCache = {
    profile: null,
    subjects: null,
    summary: null,
    dailyAttendance: {},   // { "yyyy-mm-dd": data }
    weeklyAggregates: {},  // { "yyyy-WW": data }
    weeklyBackfillDone: false
};

// ============ CACHE KEYS ============
const CACHE_KEYS = {
    PROFILE: 'attenza_profile',
    SUBJECTS: 'attenza_subjects',
    WEEKLY_BACKFILL: 'attenza_weekly_backfill_done'
};

// ============ HELPER FUNCTIONS ============

function safeGetLocalStorage(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.warn('Cache read error:', e);
        return null;
    }
}

function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('Cache write error:', e);
    }
}

function safeRemoveLocalStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('Cache remove error:', e);
    }
}

// ============ PROFILE CACHE ============

/**
 * Get profile from cache (session → localStorage)
 * @param {string} uid - User ID to validate cache
 * @returns {Object|null} Profile data or null
 */
export function getProfile(uid) {
    // 1. Session cache
    if (sessionCache.profile && sessionCache.profile.uid === uid) {
        return sessionCache.profile.data;
    }

    // 2. localStorage
    const stored = safeGetLocalStorage(CACHE_KEYS.PROFILE);
    if (stored && stored.uid === uid) {
        // Hydrate session cache
        sessionCache.profile = stored;
        return stored.data;
    }

    return null;
}

/**
 * Set profile in both cache layers
 * @param {string} uid - User ID
 * @param {Object} data - Profile data
 */
export function setProfile(uid, data) {
    const cached = { uid, data };
    sessionCache.profile = cached;
    safeSetLocalStorage(CACHE_KEYS.PROFILE, cached);
}

/**
 * Invalidate profile cache (both layers)
 */
export function invalidateProfile() {
    sessionCache.profile = null;
    safeRemoveLocalStorage(CACHE_KEYS.PROFILE);
}

// ============ SUBJECTS CACHE ============

/**
 * Get subjects from cache (session → localStorage)
 * @returns {Array|null} Subjects array or null
 */
export function getSubjects() {
    // 1. Session cache
    if (sessionCache.subjects && sessionCache.subjects.length > 0) {
        return sessionCache.subjects;
    }

    // 2. localStorage
    const stored = safeGetLocalStorage(CACHE_KEYS.SUBJECTS);
    if (stored && Array.isArray(stored) && stored.length > 0) {
        sessionCache.subjects = stored;
        return stored;
    }

    return null;
}

/**
 * Set subjects in both cache layers
 * @param {Array} subjects - Subjects array
 */
export function setSubjects(subjects) {
    sessionCache.subjects = subjects;
    safeSetLocalStorage(CACHE_KEYS.SUBJECTS, subjects);
}

/**
 * Invalidate subjects cache (both layers)
 */
export function invalidateSubjects() {
    sessionCache.subjects = null;
    safeRemoveLocalStorage(CACHE_KEYS.SUBJECTS);
}

// ============ SUMMARY CACHE ============

/**
 * Get summary from session cache only (never persisted)
 * @returns {Object|null} Summary data or null
 */
export function getSummary() {
    return sessionCache.summary;
}

/**
 * Set summary in session cache
 * @param {Object} data - Summary data
 */
export function setSummary(data) {
    sessionCache.summary = data;
}

/**
 * Mutate summary in-place (avoids re-fetch after marking)
 * @param {Function} mutator - Function that modifies summary
 */
export function mutateSummary(mutator) {
    if (sessionCache.summary) {
        mutator(sessionCache.summary);
    }
}

/**
 * Invalidate summary (only session, used rarely)
 */
export function invalidateSummary() {
    sessionCache.summary = null;
}

// ============ DAILY ATTENDANCE CACHE ============

/**
 * Get daily attendance for a specific date
 * @param {string} dateKey - Date in yyyy-mm-dd format
 * @returns {Object|null} Attendance data or null
 */
export function getDailyAttendance(dateKey) {
    return sessionCache.dailyAttendance[dateKey] || null;
}

/**
 * Set daily attendance for a specific date
 * @param {string} dateKey - Date in yyyy-mm-dd format
 * @param {Object} data - Attendance data
 */
export function setDailyAttendance(dateKey, data) {
    sessionCache.dailyAttendance[dateKey] = data;
}

/**
 * Invalidate daily attendance for a specific date
 * @param {string} dateKey - Date in yyyy-mm-dd format
 */
export function invalidateDailyAttendance(dateKey) {
    delete sessionCache.dailyAttendance[dateKey];
}

// ============ WEEKLY AGGREGATES CACHE ============

/**
 * Get weekly aggregate for a specific week
 * @param {string} weekKey - Week in yyyy-WW format
 * @returns {Object|null} Weekly data or null
 */
export function getWeekly(weekKey) {
    return sessionCache.weeklyAggregates[weekKey] || null;
}

/**
 * Set weekly aggregate for a specific week
 * @param {string} weekKey - Week in yyyy-WW format
 * @param {Object} data - Weekly aggregate data
 */
export function setWeekly(weekKey, data) {
    sessionCache.weeklyAggregates[weekKey] = data;
}

/**
 * Invalidate weekly aggregate for a specific week (precise invalidation)
 * @param {string} weekKey - Week in yyyy-WW format
 */
export function invalidateWeekly(weekKey) {
    delete sessionCache.weeklyAggregates[weekKey];
}

// ============ WEEKLY BACKFILL STATUS ============

/**
 * Check if weekly backfill has been completed
 * @returns {boolean} True if backfill done
 */
export function isWeeklyBackfillDone() {
    if (sessionCache.weeklyBackfillDone) return true;

    const stored = localStorage.getItem(CACHE_KEYS.WEEKLY_BACKFILL);
    if (stored === 'true') {
        sessionCache.weeklyBackfillDone = true;
        return true;
    }

    return false;
}

/**
 * Mark weekly backfill as completed
 */
export function markWeeklyBackfillDone() {
    sessionCache.weeklyBackfillDone = true;
    localStorage.setItem(CACHE_KEYS.WEEKLY_BACKFILL, 'true');
}

/**
 * Reset weekly backfill status (for testing/debug)
 */
export function resetWeeklyBackfill() {
    sessionCache.weeklyBackfillDone = false;
    localStorage.removeItem(CACHE_KEYS.WEEKLY_BACKFILL);
}

// ============ UTILITY FUNCTIONS ============

/**
 * Get ISO week key from a Date object
 * @param {Date} date - Date object
 * @returns {string} Week key in yyyy-WW format
 */
export function getWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

/**
 * Get ISO week key from a date string (yyyy-mm-dd)
 * @param {string} dateKey - Date in yyyy-mm-dd format
 * @returns {string} Week key in yyyy-WW format
 */
export function getWeekKeyFromDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return getWeekKey(new Date(year, month - 1, day));
}

/**
 * Get all week keys between two date strings (inclusive)
 * @param {string} startKey - Start date yyyy-mm-dd
 * @param {string} endKey - End date yyyy-mm-dd
 * @returns {Array<string>} Array of week keys
 */
export function getWeeksInRange(startKey, endKey) {
    const weeks = new Set();
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ey, em, ed] = endKey.split('-').map(Number);

    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    const current = new Date(start);
    while (current <= end) {
        weeks.add(getWeekKey(current));
        current.setDate(current.getDate() + 1);
    }

    return Array.from(weeks).sort();
}

// ============ CLEAR ALL ============

/**
 * Clear all caches (both layers)
 */
export function clearAll() {
    // Session
    sessionCache.profile = null;
    sessionCache.subjects = null;
    sessionCache.summary = null;
    sessionCache.dailyAttendance = {};
    sessionCache.weeklyAggregates = {};
    sessionCache.weeklyBackfillDone = false;

    // LocalStorage
    safeRemoveLocalStorage(CACHE_KEYS.PROFILE);
    safeRemoveLocalStorage(CACHE_KEYS.SUBJECTS);
    safeRemoveLocalStorage(CACHE_KEYS.WEEKLY_BACKFILL);
}

/**
 * Clear session cache only (localStorage preserved)
 */
export function clearSession() {
    sessionCache.profile = null;
    sessionCache.subjects = null;
    sessionCache.summary = null;
    sessionCache.dailyAttendance = {};
    sessionCache.weeklyAggregates = {};
    // Keep weeklyBackfillDone - it's persistent
}
