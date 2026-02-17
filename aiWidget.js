/**
 * aiWidget.js — Deterministic Rule-Based AI Insights Engine
 * Runs entirely client-side. Uses memoryCache from app.js.
 * No external LLM calls. Randomized sentence assembly.
 */

(function () {
    'use strict';

    // =============================================
    // 1. CONTENT BANK
    // =============================================

    const UNIVERSAL_OPENERS = [
        "Alright 👍,", "Lets calculate,", "Here's my findings,", "Got it,", "Based on stats,",
        "As per u're stats,", "Okay so,", "Check this 👉🏻,", "Quick review,", "Listen up,",
        "Lets see,", "Noted!", "Simple calculation,", "Shortly,", "U're stats saying,",
        "Looking at U'r stats,", "Metrics says,", "Analyzed,"
    ];

    const UNIVERSAL_DATA_STATEMENTS = [
        "75% is requirements & u r overall is {current}%",
        "You got {current}% , but need 75% for exam",
        "Sitting at {current}% overall , vs 75% compulsory",
        "Your overall is {current}% , but need only 75%",
        "75% is threshold , but u'r overall is {current}%",
        "75% is compulsory but you got {current}%",
        "Assuming 75% threshold and ur overall {current}%",
        "Needs 75% for exam , but you got {current}%",
        "With {current}% Overall where 75% is needed",
        "Threshold is 75% But You got {current}%"
    ];

    const SUBJECT_ALERTS = [
        "{subject} is at risk", "{subject} need attention", "Must attend {subject}",
        "High prioritize {subject}", "Keep eye on {subject}", "Dont miss {subject}",
        "{subject} is critical", "{subject} needs improvement", "Dont ignore {subject}",
        "{subject} has weak stats", "{subject} is at risk", "{subject} has lowest counts",
        "{subject} falling short", "{subject} going down", "{subject} is in trouble"
    ];

    const MAJOR_ALERTS = [
        "Also focus on majors", "And majors subjects too", "Also majors lagging too",
        "Also consider majors subs", "And majors struggling too", "And also majors are at risk"
    ];

    // --- Query 1: Can I Bunk? ---
    const BUNK_INTERP_ALLOWED = [
        "U can safely bunk {count} classes.", "So {count} classes allowed to bunk.",
        "So bunking {count} classes is allowed.", "So safe to bunk {count} classes",
        "U have {count} classes for bunk", "U got {count} safe bunking classes",
        "You may bunk {count} classes", "Your safe bunk count is {count}"
    ];

    const BUNK_INTERP_NOT_ALLOWED = [
        "So dont miss any classes strictly without any reason.",
        "You're already down from threshold . No bunking allowed",
        "So Bunking = regret later . Must attend all classes.",
        "So be a good student temporarily , no bunking at any cost",
        "So strictly keep in mind bunking Not allowed for you",
        "U have zero safe bunk classes , don't do it",
        "So bunking more will down your attendance to worse .",
        "So dont even think about bunking classes ."
    ];

    const BUNK_CLOSERS = [
        "Spend wisely, these ain't unlimited!", "Maybe u should save 1 for that gf birthday😜?",
        "But be smart , strategic bunking > random bunking",
        "But dont waste all on canteen singra session .😅",
        "But bunked smartly , not stupidity",
        "But avoid bunking without reason – karma's real! 😅",
        "But bunking why ? Oho Adda with friendzone 😜",
        "But remember CCTV is watching u 🤪",
        "But save some for emergency sickness",
        "Walk out confidently , CCTV can't argue with 75% + .",
        "All is well with those safe bunks",
        "Attendance king will now do Adda with homies 😅",
        "Have a break , have a kitkat😜🍫 ,",
        "Darr ke aage jit he bunk fearlessly & drink mountain dew🤪",
        "HOD can't complain when math is in u'r side",
        "But keep in mind HOD knows faces 🤣",
        "So that 9 AM classes is optional for you 😛",
        "Then now tell u'r friend ' You go i won't '",
        "Anyway Scientist confirms that bunks = happy neurons!🤪",
        "Yikes! Backbencher spotted 😆 But spend wisely",
        "Ohoo! pure backbencher extinct hunger for bunks 😁",
        "Exhausted & bored naah ! I can feel it 😄",
        "Feeling bored , guilt free to bunk but not recommended."
    ];

    // --- Query 2: Recovery ---
    const RECOVERY_INTERPS = [
        "Attend next {count} consecutive classes to reach 75%.",
        "Now You need to attend {count} continuous classes to recover",
        "So Attend {count} classes continuously without skipping.",
        "Now {count} classes in a row required to attend to hit 75%.",
        "No skiping , just attend {count} classes straight to hit 75%",
        "So attend {count} classes back to back to recover 75%",
        "Next {count} classes crucial so attend all to reach 75%",
        "You must attend next {count} classes continuously to hit 75%",
        "So just attend {count} classes in a row & u will be fine at 75%",
        "{count} classes will bring u to 75% if u attend all straight"
    ];

    // --- Query 3: Analysis ---
    const ANALYSIS_OPENERS_SAFE = [
        "Attendance looks solid!", "U're doing great!", "Attendance on track!",
        "Overall is good .", "Stats is decent !", "Attendance is healthy!",
        "You're in safe zone!", "Solid performance!", "Attendance strong!",
        "Numbers looking good!"
    ];

    const ANALYSIS_OPENERS_WARNING = [
        "Attendance needs work!", "Trailing by some percentage!",
        "Numbers could be better!", "Attendance below target!",
        "Need to catch up!", "Falling short currently!",
        "Attendance needs push!", "Numbers looking low!",
        "Below threshold right now!", "Room for improvement!"
    ];

    const ANALYSIS_OPENERS_DANGER = [
        "Attendance is critical", "Serious attention needed",
        "Attendance suffering !", "Attendance weak",
        "Attendance too low", "Attendance failing",
        "Attendance near bottom", "Numbers hit bottom",
        "Stats looking bad", "Very low Attendance"
    ];

    const ANALYSIS_DATA_STATEMENTS = [
        "You've attended {attended} out of {total} total classes so far .",
        "U are present in {attended} classes , out of {total} total till date .",
        "Out of {total} classes , you attended {attended} classes overall",
        "Total {total} classes happened & U attended {attended} classes overall",
        "{total} classes held till date & u attended {attended} classes",
        "{attended} classes attended from total {total} classes till now"
    ];

    // --- Query 4: Predict Future ---
    const FUTURE_OPENERS = [
        "If current trend persists ,", "Based on current patterns,",
        "Following current trend ,", "Tracking your pattern,",
        "Current trajectory shows,", "At current pace,",
        "Your trend indicates,", "Pattern analysis shows,",
        "Current rate indicates,", "Following this pattern,",
        "As per trajectory,"
    ];

    const FUTURE_INTERPS = [
        "Next week you'll be at {week1}%, in 15 days around {week2}%, by next month {week4}%.",
        "Expect {week1}% in a week, {week2}% after 15 days, {month1}% by next month .",
        "1 week from now it's {week1}%, 15 days later {week2}%, next month {month1}% .",
        "Within a week you'll see {week1}%, by day 15 around {week2}%, next month {month1}%,",
        "Next week puts you at {week1}%, 15 days at {week2}%, next month at {week4}% ."
    ];

    const FUTURE_CLOSERS = [
        "Not fixed, varies as per your pattern", "Actual stats depends on you.",
        "This changes based on your marking", "It varies with your attendance habits.",
        "Not guaranteed, Just depends on you.", "Estimates only, you control results."
    ];

    // --- Query 5: Absence Impact ---
    const ABSENCE_INPUT_PROMPTS = [
        "Okay! To show the impact, tell me how many classes / days you're planning to skip .",
        "Alright! For calculation, I need the number of classes/days you'll be absent . Just tell me .",
        "Sure! To calculate impact, Say how many classes or days will you miss( absent ) .",
        "Got it . so for impact calculation, how many classes/days are you planning to skip .",
        "Understood! But I need the count of classes / days you will skip ( absent) . Just tell me ."
    ];

    const ABSENCE_DATA_STATEMENTS = [
        "Your current overall is {current}%.", "Right now u're at {current}%.",
        "Overall attendance is {current}% now .", "You're at {current}% as of now.",
        "Present overall : {current}%.", "Stats show {current}% overall"
    ];

    const ABSENCE_INTERPS = [
        "After missing {input} ,you'll drop to {new}%.",
        "Skipping {input} will bring you down to {new}%.",
        "After {input} absences, Overall will be {new}% .",
        "Skipping {input} drops you to {new}%",
        "After {input} absent , attendance becomes {new}%.",
        "{input} absences will reduce your overall to {new}%."
    ];

    const ABSENCE_CLOSERS_SAFE = [
        "Safe to skip if necessary", "Absent allowed but stay cautious.",
        "Still safe, but don't overdo.", "Hence Allowed, but be careful.",
        "Yes, Safe margin maintained.", "Threshold safe, skip responsibly",
        "Above the line but think twice"
    ];

    const ABSENCE_CLOSERS_UNSAFE = [
        "Not safe, skip only if urgent.", "Risky, avoid unless emergency.",
        "Below threshold, think twice", "Dangerous drop, reconsider",
        "Unsafe zone, think twice.", "Strongly advise against absences"
    ];


    // =============================================
    // 2. HELPERS
    // =============================================

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function fillTemplate(str, vars) {
        return str.replace(/\{(\w+)\}/g, (_, key) => {
            return vars[key] !== undefined ? vars[key] : `{${key}}`;
        });
    }

    /**
     * Build a contentArray for the typewriter from assembled parts.
     * Each "part" is a string. We highlight numbers and key data inside parts.
     */
    function buildContentArray(parts) {
        const result = [];
        parts.forEach((part, idx) => {
            if (!part) return;
            // Add separator between parts
            if (idx > 0 && part) {
                result.push({ text: ' ', type: 'normal' });
            }
            // Find patterns to highlight: numbers with %, counts, subject names
            const segments = part.split(/(\d+\.?\d*%?)/);
            segments.forEach(seg => {
                if (!seg) return;
                if (/^\d+\.?\d*%?$/.test(seg)) {
                    result.push({ text: seg, type: 'highlight' });
                } else {
                    result.push({ text: seg, type: 'normal' });
                }
            });
        });
        return result;
    }


    // =============================================
    // 3. DATA ACCESS LAYER
    // =============================================

    /**
     * Gets the memoryCache from app.js – it's a module-level variable.
     * We access it through the window or by reading the summary from localStorage.
     */
    function getSummaryData() {
        // Try window-level memoryCache first (set by app.js module)
        // Since app.js is a module, memoryCache isn't on window.
        // We read from localStorage as the reliable bridge.
        try {
            const raw = localStorage.getItem('attenza_summary_v2');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed.data || parsed;
        } catch (e) {
            console.warn('[AI] Summary read failed:', e);
            return null;
        }
    }

    function getSubjectsData() {
        try {
            const raw = localStorage.getItem('attenza_subjects_v2');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return parsed.data || parsed || [];
        } catch (e) {
            console.warn('[AI] Subjects read failed:', e);
            return [];
        }
    }

    function getOverallData() {
        const summary = getSummaryData();
        if (!summary) return { total: 0, attended: 0, percentage: 0 };

        const total = (summary.pastTotalClasses || 0) + (summary.trackedTotal || 0);
        const attended = (summary.pastAttendedClasses || 0) + (summary.trackedPresent || 0);
        const percentage = total > 0 ? parseFloat(((attended / total) * 100).toFixed(1)) : 0;

        return { total, attended, percentage };
    }

    function getSubjectStats() {
        const summary = getSummaryData();
        const subjects = getSubjectsData();
        if (!summary || !subjects.length) return {};

        const tracked = summary.subjects || {};
        const stats = {};

        subjects.forEach(sub => {
            const pastT = (sub.pastAttendance && sub.pastAttendance.total) || 0;
            const pastP = (sub.pastAttendance && sub.pastAttendance.attended) || 0;
            const trackT = (tracked[sub.name] && tracked[sub.name].trackedTotal) || 0;
            const trackP = (tracked[sub.name] && tracked[sub.name].trackedPresent) || 0;

            const t = pastT + trackT;
            const a = pastP + trackP;
            stats[sub.name] = {
                total: t,
                attended: a,
                percentage: t > 0 ? parseFloat(((a / t) * 100).toFixed(1)) : 0
            };
        });

        return stats;
    }

    function getLowestSubject() {
        const stats = getSubjectStats();
        const entries = Object.entries(stats).filter(([_, s]) => s.total > 0);
        if (!entries.length) return null;
        entries.sort((a, b) => a[1].percentage - b[1].percentage);
        return { name: entries[0][0], ...entries[0][1] };
    }

    function getMajorSubjects() {
        try {
            const stored = localStorage.getItem('attenza_majors');
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    }

    function areMajorsAtRisk() {
        const majors = getMajorSubjects();
        if (!majors.length) return false;
        const stats = getSubjectStats();
        return majors.some(name => {
            const s = stats[name];
            return s && s.percentage < 75;
        });
    }

    function getWeeklyAggregates() {
        try {
            const raw = localStorage.getItem('attenza_weekly_v2');
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed.data || parsed || {};
        } catch (e) { return {}; }
    }

    /**
     * Get last N week keys sorted descending (most recent first).
     */
    function getLastNWeekKeys(n) {
        const aggregates = getWeeklyAggregates();
        const keys = Object.keys(aggregates).sort().reverse();
        return keys.slice(0, n);
    }

    /**
     * Compute average classes per day from past 4 weeks.
     * Total classes held across 4 weeks / (4 * 6.5)
     * 6.5 because we don't know if Sunday is scheduled.
     */
    function getAvgClassesPerDay() {
        const aggregates = getWeeklyAggregates();
        const weekKeys = getLastNWeekKeys(4);

        if (!weekKeys.length) {
            // Fallback: use number of subjects as rough estimate
            const subjects = getSubjectsData();
            return subjects.length || 5;
        }

        let totalClasses = 0;
        let weeksUsed = 0;
        weekKeys.forEach(key => {
            const week = aggregates[key];
            if (week && week.total > 0) {
                totalClasses += week.total;
                weeksUsed++;
            }
        });

        if (weeksUsed === 0) {
            const subjects = getSubjectsData();
            return subjects.length || 5;
        }

        // Average classes per day = total across weeks / (weeks * 6.5)
        const avgPerDay = totalClasses / (weeksUsed * 6.5);
        return Math.round(avgPerDay * 10) / 10; // 1 decimal
    }


    // =============================================
    // 4. QUERY HANDLERS
    // =============================================

    /**
     * Query 1: Can I Bunk?
     * Safe bunks = floor((attended - 0.75 * total) / 0.25)
     * If percentage < 75 → 0 safe bunks
     */
    function queryBunk() {
        const data = getOverallData();
        const vars = { current: data.percentage };

        // Calculate safe bunks: how many classes can miss and stay >= 75%
        // After missing X classes: attended / (total + X) >= 0.75
        // attended >= 0.75 * (total + X)
        // attended - 0.75 * total >= 0.75 * X
        // X <= (attended - 0.75 * total) / 0.75
        let safeBunks = Math.floor((data.attended - 0.75 * data.total) / 0.75);
        if (safeBunks < 0) safeBunks = 0;
        vars.count = safeBunks;

        const opener = fillTemplate(pickRandom(UNIVERSAL_OPENERS), vars);
        const dataSt = fillTemplate(pickRandom(UNIVERSAL_DATA_STATEMENTS), vars);

        if (safeBunks > 0) {
            const interp = fillTemplate(pickRandom(BUNK_INTERP_ALLOWED), vars);
            const closer = pickRandom(BUNK_CLOSERS);
            return buildContentArray([opener, dataSt, interp, closer]);
        } else {
            const interp = fillTemplate(pickRandom(BUNK_INTERP_NOT_ALLOWED), vars);
            // CRITICAL: No closer when not allowed
            return buildContentArray([opener, dataSt, interp]);
        }
    }

    /**
     * Query 2: Recovery Plan
     * Consecutive classes needed = ceil((0.75 * total - attended) / 0.25)
     * After attending X more: (attended + X) / (total + X) >= 0.75
     * 0.25 * X >= 0.75 * total - attended
     * X >= (0.75 * total - attended) / 0.25
     */
    function queryRecovery() {
        const data = getOverallData();
        const lowest = getLowestSubject();
        const majorsAtRisk = areMajorsAtRisk();
        const vars = { current: data.percentage };

        const opener = fillTemplate(pickRandom(UNIVERSAL_OPENERS), vars);
        const dataSt = fillTemplate(pickRandom(UNIVERSAL_DATA_STATEMENTS), vars);

        let needed = Math.ceil((0.75 * data.total - data.attended) / 0.25);
        if (needed < 0) needed = 0;
        vars.count = needed;

        let interp;
        if (needed === 0) {
            interp = "You're already at or above 75% — no recovery needed!";
        } else {
            interp = fillTemplate(pickRandom(RECOVERY_INTERPS), vars);
        }

        const parts = [opener, dataSt, interp];

        // Subject alert
        if (lowest && lowest.percentage < 75) {
            parts.push(fillTemplate(pickRandom(SUBJECT_ALERTS), { subject: lowest.name }));
        }

        // Major alert
        if (majorsAtRisk) {
            parts.push(pickRandom(MAJOR_ALERTS));
        }

        return buildContentArray(parts);
    }

    /**
     * Query 3: Attendance Summary (Run Analysis)
     * Structure: [Category Opener] + [Summary Data Statement] + [Subject Alert] + [Major Alert]
     * No interpretations.
     */
    function queryAnalysis() {
        const data = getOverallData();
        const lowest = getLowestSubject();
        const majorsAtRisk = areMajorsAtRisk();
        const vars = {
            current: data.percentage,
            total: data.total,
            attended: data.attended
        };

        let opener;
        if (data.percentage > 75) {
            opener = pickRandom(ANALYSIS_OPENERS_SAFE);
        } else if (data.percentage >= 50) {
            opener = pickRandom(ANALYSIS_OPENERS_WARNING);
        } else {
            opener = pickRandom(ANALYSIS_OPENERS_DANGER);
        }

        const dataSt = fillTemplate(pickRandom(ANALYSIS_DATA_STATEMENTS), vars);

        const parts = [opener, dataSt];

        if (lowest && lowest.percentage < 75) {
            parts.push(fillTemplate(pickRandom(SUBJECT_ALERTS), { subject: lowest.name }));
        }

        if (majorsAtRisk) {
            parts.push(pickRandom(MAJOR_ALERTS));
        }

        return buildContentArray(parts);
    }

    /**
     * Query 4: Predict Trend (Future Trajectory)
     * Uses last 4 weekly aggregates to compute weekly delta.
     * Projects 1 week, 15 days (~2 weeks), 30 days (~4 weeks).
     * Structure: [Future Opener] + [Future Interpretation] + [Future Closer]
     */
    function queryPredict() {
        const data = getOverallData();
        const aggregates = getWeeklyAggregates();
        const weekKeys = getLastNWeekKeys(4);

        // Calculate weekly percentages in chronological order
        let weeklyPcts = [];
        const sortedKeys = [...weekKeys].reverse(); // chronological

        sortedKeys.forEach(key => {
            const w = aggregates[key];
            if (w && w.total > 0) {
                weeklyPcts.push((w.present / w.total) * 100);
            }
        });

        // Compute average weekly delta
        let avgDelta = 0;
        if (weeklyPcts.length >= 2) {
            let totalDelta = 0;
            for (let i = 1; i < weeklyPcts.length; i++) {
                totalDelta += weeklyPcts[i] - weeklyPcts[i - 1];
            }
            avgDelta = totalDelta / (weeklyPcts.length - 1);
        }

        // Project from current overall
        const currentPct = data.percentage;
        const week1 = Math.min(100, Math.max(0, currentPct + avgDelta)).toFixed(1);
        const week2 = Math.min(100, Math.max(0, currentPct + avgDelta * 2)).toFixed(1);
        const week4 = Math.min(100, Math.max(0, currentPct + avgDelta * 4)).toFixed(1);

        const vars = {
            week1: week1,
            week2: week2,
            week4: week4,
            month1: week4 // month1 alias for week4
        };

        const opener = pickRandom(FUTURE_OPENERS);
        const interp = fillTemplate(pickRandom(FUTURE_INTERPS), vars);
        const closer = pickRandom(FUTURE_CLOSERS);

        return buildContentArray([opener, interp, closer]);
    }

    /**
     * Query 5: Absence Impact
     * Step 1: Show input prompt
     * Step 2: After input → calculate new %
     */
    function queryAbsencePrompt() {
        return buildContentArray([pickRandom(ABSENCE_INPUT_PROMPTS)]);
    }

    function queryAbsenceResult(classCount, inputLabel) {
        const data = getOverallData();
        const newPct = data.total + classCount > 0
            ? parseFloat(((data.attended / (data.total + classCount)) * 100).toFixed(1))
            : 0;

        const vars = {
            current: data.percentage,
            input: inputLabel,
            new: newPct
        };

        const opener = fillTemplate(pickRandom(UNIVERSAL_OPENERS), vars);
        const dataSt = fillTemplate(pickRandom(ABSENCE_DATA_STATEMENTS), vars);
        const interp = fillTemplate(pickRandom(ABSENCE_INTERPS), vars);
        const closer = newPct >= 75
            ? pickRandom(ABSENCE_CLOSERS_SAFE)
            : pickRandom(ABSENCE_CLOSERS_UNSAFE);

        return buildContentArray([opener, dataSt, interp, closer]);
    }


    // =============================================
    // 5. INPUT PARSER (Absence Impact)
    // =============================================

    /**
     * Parse user input for Absence Impact query.
     * Returns: { valid: boolean, count: number, unit: 'class'|'day', label: string, error?: string }
     */
    function parseAbsenceInput(raw) {
        if (!raw || !raw.trim()) {
            return { valid: false, error: "Please enter a number of classes or days." };
        }

        let input = raw.trim().toLowerCase();

        // Check 1: Only special characters → invalid
        if (/^[^a-z0-9]+$/.test(input)) {
            return { valid: false, error: "Invalid input. Please enter a number." };
        }

        // Remove leading special chars if followed by content
        // e.g. "& 5 days" → "5 days" (keep the rest)

        // Extract the first number from the input
        // Handle edge cases:
        // - "-2" → 2 (typing mistake)
        // - "2.5" → 25 (no decimal support, concat digits)
        // - "13 4" (no words between) → 134

        // Step: Remove negative signs attached to numbers
        let cleaned = input.replace(/-(\d)/g, '$1');

        // Step: Remove decimal points between digits (2.5 → 25)
        cleaned = cleaned.replace(/(\d)\.(\d)/g, '$1$2');

        // Step: Concatenate numbers separated only by spaces (no words between)
        // "13 4" → "134" but "13 day 4" stays as is
        cleaned = cleaned.replace(/(\d+)\s+(?=\d)/g, (match, p1) => {
            // Check if there are only spaces (no letters) between numbers
            return p1;
        });
        // More precise: find all number groups, check what's between them
        const numberMerged = mergeAdjacentNumbers(cleaned);

        // Extract first number
        const numMatch = numberMerged.match(/\d+/);
        if (!numMatch) {
            return { valid: false, error: "No number found. Please type a number like 3 or 5 days." };
        }

        let count = parseInt(numMatch[0], 10);

        // Check: number is 0 → invalid
        if (count === 0) {
            return { valid: false, error: "Zero is not valid. Enter at least 1." };
        }

        // Determine unit: DAY vs CLASS
        // Priority 1: DAY regex
        const dayRegex = /\d+\s*(d[aysin]*)\b/;
        // Priority 2: CLASS regex
        const classRegex = /\d+\s*(c[lass]*|k[las]*|l[ec]*|p[eriod]*)\b/;

        let unit = 'class'; // default
        let label = count + ' classes (assumed)';

        if (dayRegex.test(numberMerged)) {
            unit = 'day';
            label = count + ' days';
        } else if (classRegex.test(numberMerged)) {
            unit = 'class';
            label = count + ' classes';
        }
        // If neither matches → default to class, no popup, specify assumption in response

        return { valid: true, count, unit, label };
    }

    /**
     * Merge numbers that are only separated by whitespace (no letters between).
     * "13 4" → "134"   but   "13 day 4" → "13 day 4"
     */
    function mergeAdjacentNumbers(str) {
        // Split into tokens
        const tokens = str.split(/\s+/);
        const result = [];
        let numBuffer = '';

        for (let i = 0; i < tokens.length; i++) {
            if (/^\d+$/.test(tokens[i])) {
                numBuffer += tokens[i];
            } else {
                if (numBuffer) {
                    result.push(numBuffer);
                    numBuffer = '';
                }
                result.push(tokens[i]);
            }
        }
        if (numBuffer) result.push(numBuffer);

        return result.join(' ');
    }


    // =============================================
    // 6. UI INTEGRATION
    // =============================================

    // DOM References (set after DOM ready)
    let aiText, queryDock, activeQueryDock, activeScrollTrack;
    let activeContentRow, activeInputArea, activePill, activePillText;
    let gradientStrip, aiInput, sendBtn;
    let typingAbortController = null;
    let currentActiveQuery = '';
    let hasActivated = false;
    let currentQueryType = ''; // tracks which query is active

    function initDomRefs() {
        aiText = document.getElementById('ai-text');
        queryDock = document.getElementById('query-dock');
        activeQueryDock = document.getElementById('active-query-dock');
        activeScrollTrack = document.getElementById('active-scroll-track');
        activeContentRow = document.getElementById('active-content-row');
        activeInputArea = document.getElementById('active-input-area');
        activePill = document.getElementById('active-pill');
        activePillText = document.getElementById('active-pill-text');
        gradientStrip = document.getElementById('gradient-strip');
        aiInput = document.getElementById('ai-input');
        sendBtn = document.getElementById('send-btn');
    }

    // --- CORE ANIMATION LOGIC ---

    async function showLoader(duration, signal) {
        if (!aiText) return;
        aiText.classList.remove('cursor');
        const loader = document.createElement('div');
        loader.className = 'loader';
        loader.innerHTML = `
            <div class="stripe"></div><div class="stripe"></div>
            <div class="stripe"></div><div class="stripe"></div>
        `;
        aiText.appendChild(loader);

        return new Promise(resolve => {
            const timeoutId = setTimeout(() => {
                if (loader.parentNode === aiText) loader.remove();
                aiText.classList.add('cursor');
                resolve();
            }, duration);

            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    if (loader.parentNode === aiText) loader.remove();
                    resolve();
                });
            }
        });
    }

    async function typeWriter(contentArray) {
        if (typingAbortController) typingAbortController.abort();
        typingAbortController = new AbortController();
        const signal = typingAbortController.signal;

        if (!aiText) return;
        aiText.innerHTML = '';
        aiText.classList.remove('cursor');

        await showLoader(1000, signal);
        if (signal.aborted) return;

        for (let chunk of contentArray) {
            if (chunk.type === 'highlight') {
                aiText.classList.remove('cursor');
                await showLoader(600, signal);
                if (signal.aborted) return;
            }

            aiText.classList.add('cursor');

            let span;
            if (chunk.type === 'highlight') {
                span = document.createElement('span');
                span.className = 'ai-text-magic';
                aiText.appendChild(span);
            } else {
                span = document.createTextNode('');
                aiText.appendChild(span);
            }

            for (let char of chunk.text) {
                if (signal.aborted) return;
                if (chunk.type === 'highlight') {
                    span.textContent += char;
                } else {
                    span.nodeValue += char;
                }
                await new Promise(r => setTimeout(r, 20));
            }
        }
        aiText.classList.remove('cursor');
    }

    // --- QUERY MAPPING ---

    const QUERY_MAP = {
        'Can I Bunk?': { handler: queryBunk, requiresInput: false, type: 'bunk' },
        'Recovery Plan': { handler: queryRecovery, requiresInput: false, type: 'recovery' },
        'Comprehensive Midterm Risk Analysis & Audit': { handler: queryAnalysis, requiresInput: false, type: 'analysis' },
        'Forecast': { handler: queryPredict, requiresInput: false, type: 'forecast' },
        'Simulate Impact': { handler: null, requiresInput: true, type: 'impact' }
    };

    // --- MAIN QUERY CLICK HANDLER ---

    function handleQueryClick(queryName, requiresInput) {
        if (!queryDock || !activeQueryDock) return;

        // Swap views
        queryDock.style.display = 'none';
        activeQueryDock.style.display = 'block';
        if (activeScrollTrack) activeScrollTrack.scrollLeft = 0;

        // Setup
        currentActiveQuery = queryName;
        currentQueryType = requiresInput ? 'impact' : (QUERY_MAP[queryName]?.type || '');
        if (activePillText) activePillText.textContent = queryName;
        if (aiInput) {
            aiInput.value = '';
            aiInput.placeholder = 'Type number of classes/days...';
        }
        if (sendBtn) sendBtn.classList.remove('visible');

        // Snap widths
        if (activeContentRow) activeContentRow.style.transition = 'none';
        if (gradientStrip) gradientStrip.style.transition = 'none';
        if (activeInputArea) activeInputArea.style.transition = 'none';

        if (activeInputArea) {
            activeInputArea.style.width = '0px';
            activeInputArea.style.opacity = '0';
            activeInputArea.style.paddingRight = '0px';
        }

        if (activeContentRow) activeContentRow.style.width = 'fit-content';
        const pillWidth = activePill ? activePill.offsetWidth : 120;

        if (activeContentRow) activeContentRow.style.width = pillWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = pillWidth + 'px';

        // Force reflow
        if (activeContentRow) void activeContentRow.offsetWidth;

        if (requiresInput) {
            // Absence Impact — show input prompt
            const promptContent = queryAbsencePrompt();
            typeWriter(promptContent).then(() => {
                if (typingAbortController && typingAbortController.signal.aborted) return;
                expandInputArea(pillWidth);
            });
        } else {
            // Non-input queries — generate and type result
            const config = QUERY_MAP[queryName];
            if (config && config.handler) {
                const result = config.handler();
                typeWriter(result);
            } else {
                typeWriter(buildContentArray(["Processing your query..."]));
            }
        }
    }

    function expandInputArea(pillWidth) {
        if (!activeQueryDock || !activeInputArea) return;

        const visibleDockWidth = activeQueryDock.offsetWidth;
        const calculatedInputWidth = visibleDockWidth * 0.70;
        const targetTotalWidth = calculatedInputWidth + pillWidth + 8;

        if (activeContentRow) activeContentRow.style.transition = 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
        if (gradientStrip) gradientStrip.style.transition = 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
        if (activeInputArea) activeInputArea.style.transition = 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)';

        if (activeContentRow) activeContentRow.style.width = targetTotalWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = targetTotalWidth + 'px';

        activeInputArea.style.width = calculatedInputWidth + 'px';
        activeInputArea.style.opacity = '1';
        activeInputArea.style.paddingRight = '8px';

        if (aiInput) aiInput.focus();
    }

    function cancelActive() {
        if (typingAbortController) typingAbortController.abort();

        if (activeQueryDock) activeQueryDock.style.display = 'none';
        if (queryDock) queryDock.style.display = 'block';

        currentQueryType = '';
        // Show default analysis on cancel
        runDefaultInsight();
    }

    function handleSendClick() {
        if (!aiInput) return;
        const rawInput = aiInput.value.trim();
        if (!rawInput) return;

        const parsed = parseAbsenceInput(rawInput);

        if (!parsed.valid) {
            // Show error in the input area — flash the input bar
            aiInput.value = '';
            aiInput.placeholder = parsed.error;
            aiInput.classList.add('input-error');
            setTimeout(() => {
                aiInput.classList.remove('input-error');
                aiInput.placeholder = 'Type number of classes/days...';
            }, 2500);
            return;
        }

        // Calculate class count
        let classCount = parsed.count;
        if (parsed.unit === 'day') {
            const avgPerDay = getAvgClassesPerDay();
            classCount = Math.round(parsed.count * avgPerDay);
            parsed.label = parsed.count + ' days (~' + classCount + ' classes)';
        }

        // Update pill text
        if (activePillText) activePillText.textContent = parsed.label + ', Impact';

        // Measure new pill width
        const newPillWidth = activePill ? activePill.offsetWidth : 120;

        // Collapse input area
        if (activeInputArea) {
            activeInputArea.style.width = '0px';
            activeInputArea.style.opacity = '0';
            activeInputArea.style.paddingRight = '0px';
        }

        if (activeContentRow) activeContentRow.style.width = newPillWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = newPillWidth + 'px';

        if (activeScrollTrack) activeScrollTrack.scrollLeft = 0;

        // Generate and type the result
        const result = queryAbsenceResult(classCount, parsed.label);
        typeWriter(result);
    }

    // --- DEFAULT INSIGHT (Attendance Summary on viewport entry) ---

    function runDefaultInsight() {
        const data = getOverallData();
        if (data.total === 0) {
            // No data yet — show welcome message
            typeWriter(buildContentArray([
                "Welcome to AI Insights! Start marking your attendance to get personalized analysis."
            ]));
            return;
        }
        const result = queryAnalysis();
        typeWriter(result);
    }

    // --- RESET ---

    function resetWidget() {
        cancelActive();
    }

    // =============================================
    // 7. INITIALIZATION
    // =============================================

    function initAIWidget() {
        initDomRefs();

        if (!aiText) {
            console.warn('[AI Widget] ai-text element not found. Widget not initialized.');
            return;
        }

        // Wire up query pill clicks
        const pills = document.querySelectorAll('#query-dock .query-pill');
        pills.forEach(pill => {
            const originalOnclick = pill.getAttribute('onclick');
            if (originalOnclick) {
                // Remove old onclick — we'll handle it
                pill.removeAttribute('onclick');
            }
        });

        // Re-assign click handlers for all query pills
        const pillConfigs = [
            { index: 0, name: 'Can I Bunk?', input: false },
            { index: 1, name: 'Comprehensive Midterm Risk Analysis & Audit', input: false },
            { index: 2, name: 'Recovery Plan', input: false },
            { index: 3, name: 'Forecast', input: false },
            { index: 4, name: 'Simulate Impact', input: true }
        ];

        pillConfigs.forEach(cfg => {
            if (pills[cfg.index]) {
                pills[cfg.index].addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleQueryClick(cfg.name, cfg.input);
                });
            }
        });

        // Send button click
        if (sendBtn) {
            sendBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleSendClick();
            });
        }

        // Input enter key
        if (aiInput) {
            aiInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && aiInput.value.trim().length > 0) {
                    handleSendClick();
                }
            });

            // Send arrow visibility
            aiInput.addEventListener('input', () => {
                if (aiInput.value.trim().length > 0) {
                    if (sendBtn) sendBtn.classList.add('visible');
                } else {
                    if (sendBtn) sendBtn.classList.remove('visible');
                }
            });
        }

        // Cancel pill click
        if (activePill) {
            activePill.addEventListener('click', (e) => {
                e.stopPropagation();
                cancelActive();
            });
        }

        // Refresh icon
        const refreshIcon = document.querySelector('.ai-widget-wrapper .refresh-icon');
        if (refreshIcon) {
            refreshIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                resetWidget();
            });
        }

        // IntersectionObserver: auto-run analysis when widget scrolls into view
        const triggerZone = document.getElementById('trigger-zone');
        if (triggerZone) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !hasActivated) {
                        hasActivated = true;
                        // Small delay after viewport entry
                        setTimeout(() => runDefaultInsight(), 300);
                    }
                });
            }, { threshold: 0.5 });

            observer.observe(triggerZone);
        }
    }

    // Wait for DOM + a delay for app.js to populate caches
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initAIWidget, 500));
    } else {
        setTimeout(initAIWidget, 500);
    }

    // Expose for external use
    window.resetAIWidget = resetWidget;
    window.handleAIQueryClick = handleQueryClick;

})();
