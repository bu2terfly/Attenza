/**
 * aiWidget.js — Deterministic Rule-Based AI Insights Engine
 * Runs entirely client-side. Reads from localStorage caches.
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

    // --- Query 4: Forecast ---
    const FORECAST_OPENERS = [
        "Based on your attendance pattern,", "Following your current trend,",
        "Tracking your pattern,", "Your trajectory shows,", "At current pace,",
        "Your trend indicates,", "Pattern analysis shows,",
        "Current rate indicates,", "Following this pattern,",
        "As per trajectory,"
    ];

    const FORECAST_INTERPS = [
        "Next week you'll be at {week1}%, in 15 days around {week2}%, by next month {week4}%.",
        "Expect {week1}% in a week, {week2}% after 15 days, {week4}% by next month .",
        "1 week from now it's {week1}%, 15 days later {week2}%, next month {week4}% .",
        "Within a week you'll see {week1}%, by day 15 around {week2}%, next month {week4}%,",
        "Next week puts you at {week1}%, 15 days at {week2}%, next month at {week4}% ."
    ];

    const FORECAST_CLOSERS = [
        "Not fixed, varies as per your pattern", "Actual stats depends on you.",
        "This changes based on your marking", "It varies with your attendance habits.",
        "Not guaranteed, Just depends on you.", "Estimates only, you control results."
    ];

    const FORECAST_VELOCITY_PROMPTS = [
        "One quick thing — roughly how many classes do you have on a normal scheduled day?",
        "Just need one input — on a regular day, how many classes are usually scheduled?",
        "Almost there — on a typical day, about how many classes do you attend?",
        "Quick question — how many classes does a normal college day have for you?"
    ];

    const FORECAST_TOO_SHORT = [
        "Your attendance history is too short. Please mark attendance correctly for at least 3 days to enable predictions.",
        "Need more data! Mark your attendance for at least 3 days so I can calculate a reliable forecast.",
        "Not enough data yet. Track attendance for 3+ days and I'll generate an accurate prediction for you."
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

    // Important words to highlight
    const HIGHLIGHT_WORDS = [
        'bunk', 'bunking', 'bunks', 'bunked', 'recover', 'recovery', 'attend', 'skip',
        'safe', 'unsafe', 'critical', 'risk', 'threshold', 'consecutive', 'continuous',
        'danger', 'improvement', 'healthy', 'strong', 'solid', 'failing', 'weak',
        'absent', 'absences', 'strictly', 'allowed', 'compulsory', 'majors'
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
     * Highlights numbers AND important keywords.
     */
    function buildContentArray(parts) {
        const result = [];
        const wordSet = new Set(HIGHLIGHT_WORDS);

        parts.forEach((part, idx) => {
            if (!part) return;
            if (idx > 0 && part) {
                result.push({ text: ' ', type: 'normal' });
            }

            // Split on numbers, %, and word boundaries for keyword matching
            const segments = part.split(/(\d+\.?\d*%?|\s+)/);
            segments.forEach(seg => {
                if (!seg) return;
                if (/^\d+\.?\d*%?$/.test(seg)) {
                    result.push({ text: seg, type: 'highlight' });
                } else if (/^\s+$/.test(seg)) {
                    result.push({ text: seg, type: 'normal' });
                } else {
                    // Check each word for keyword match
                    const words = seg.split(/\b/);
                    words.forEach(w => {
                        if (!w) return;
                        if (wordSet.has(w.toLowerCase())) {
                            result.push({ text: w, type: 'highlight' });
                        } else {
                            result.push({ text: w, type: 'normal' });
                        }
                    });
                }
            });
        });
        return result;
    }


    // =============================================
    // 3. DATA ACCESS LAYER
    // =============================================

    function getSummaryData() {
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

    function getLastNWeekKeys(n) {
        const aggregates = getWeeklyAggregates();
        const keys = Object.keys(aggregates).sort().reverse();
        return keys.slice(0, n);
    }

    /**
     * Calculate velocity (daily class count) from weekly aggregates.
     * Uses activeDays (week-index array) for accuracy.
     * Returns { velocity, weeksAnalyzed, weekData[] }
     */
    function calculateVelocity() {
        const aggregates = getWeeklyAggregates();
        const weekKeys = getLastNWeekKeys(4);

        const weekData = [];
        let totalClasses = 0;
        let totalActiveDays = 0;

        weekKeys.forEach(key => {
            const w = aggregates[key];
            if (w && w.total > 0) {
                const days = (w.activeDays && w.activeDays.length) || 0;
                const speed = days > 0 ? w.total / days : 0;
                const successRate = w.total > 0 ? w.present / w.total : 0;
                weekData.push({ key, total: w.total, present: w.present, activeDays: days, speed, successRate });
                totalClasses += w.total;
                totalActiveDays += days;
            }
        });

        const velocity = totalActiveDays > 0 ? totalClasses / totalActiveDays : 0;
        return { velocity, weeksAnalyzed: weekData.length, weekData, totalActiveDays };
    }


    // =============================================
    // 4. QUERY HANDLERS
    // =============================================

    /**
     * Query 1: Can I Bunk?
     */
    function queryBunk() {
        const data = getOverallData();
        const vars = { current: data.percentage };

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
            return buildContentArray([opener, dataSt, interp]);
        }
    }

    /**
     * Query 2: Recovery Plan
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

        if (lowest && lowest.percentage < 75) {
            parts.push(fillTemplate(pickRandom(SUBJECT_ALERTS), { subject: lowest.name }));
        }

        if (majorsAtRisk) {
            parts.push(pickRandom(MAJOR_ALERTS));
        }

        return buildContentArray(parts);
    }

    /**
     * Query 3: Attendance Summary (Run Analysis)
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
     * Query 4: Forecast
     * Two-path logic: New user (<3 weeks) vs Established user (≥3 weeks)
     */
    function queryForecast() {
        const aggregates = getWeeklyAggregates();
        const weekKeys = getLastNWeekKeys(4);

        // Check: No weekly aggregates at all
        if (!weekKeys.length) {
            return { type: 'error', content: buildContentArray([pickRandom(FORECAST_TOO_SHORT)]) };
        }

        const { velocity, weeksAnalyzed, weekData, totalActiveDays } = calculateVelocity();

        // Check: activeDays < 3 across all available weeks
        if (totalActiveDays < 3) {
            return { type: 'error', content: buildContentArray([pickRandom(FORECAST_TOO_SHORT)]) };
        }

        // Path B: Established user (≥ 3 weeks with data)
        if (weeksAnalyzed >= 3) {
            return forecastEstablishedUser(weekData);
        }

        // Path A: New user (1-2 weeks) — needs velocity confirmation
        const roundedVelocity = Math.floor(velocity);
        const options = generateVelocityOptions(roundedVelocity);
        return {
            type: 'velocity_prompt',
            content: buildContentArray([pickRandom(FORECAST_VELOCITY_PROMPTS)]),
            options: options,
            weekData: weekData
        };
    }

    function generateVelocityOptions(baseVelocity) {
        const center = Math.max(2, Math.min(6, baseVelocity));
        const opts = new Set();
        for (let i = Math.max(2, center - 1); i <= Math.min(7, center + 2); i++) {
            opts.add(i);
        }
        return Array.from(opts).sort((a, b) => a - b);
    }

    function forecastEstablishedUser(weekData) {
        // Step A: Per-week analysis already in weekData (speed + successRate)
        // Step B: Optimistic filter — remove weakest week
        const sorted = [...weekData].sort((a, b) => a.successRate - b.successRate);
        const filtered = sorted.slice(1); // Remove lowest successRate

        // Step C: Average the remaining weeks
        let avgSpeed = 0;
        let avgHabit = 0;
        filtered.forEach(w => {
            avgSpeed += w.speed;
            avgHabit += w.successRate;
        });
        avgSpeed /= filtered.length;
        avgHabit /= filtered.length;

        // Step D: Forecast
        return generateForecastResult(avgSpeed, avgHabit);
    }

    function forecastWithUserVelocity(userVelocity) {
        const data = getOverallData();
        const habit = data.percentage / 100;
        return generateForecastResult(userVelocity, habit);
    }

    function generateForecastResult(speed, habit) {
        const data = getOverallData();

        const forecast = [7, 15, 30].map(days => {
            const futureClasses = Math.round(days * speed);
            const futureAttends = Math.round(futureClasses * habit);
            const newTotal = data.total + futureClasses;
            const newAttended = data.attended + futureAttends;
            const newPct = newTotal > 0 ? parseFloat(((newAttended / newTotal) * 100).toFixed(1)) : 0;
            return newPct;
        });

        const vars = {
            week1: forecast[0],
            week2: forecast[1],
            week4: forecast[2]
        };

        const opener = pickRandom(FORECAST_OPENERS);
        const interp = fillTemplate(pickRandom(FORECAST_INTERPS), vars);
        const closer = pickRandom(FORECAST_CLOSERS);

        return { type: 'result', content: buildContentArray([opener, interp, closer]) };
    }

    /**
     * Query 5: Absence Impact
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

    function parseAbsenceInput(raw) {
        if (!raw || !raw.trim()) {
            return { valid: false, error: "Please enter a number of classes or days." };
        }

        let input = raw.trim().toLowerCase();

        if (/^[^a-z0-9]+$/.test(input)) {
            return { valid: false, error: "Invalid input. Please enter a number." };
        }

        let cleaned = input.replace(/-(\d)/g, '$1');
        cleaned = cleaned.replace(/(\d)\.(\d)/g, '$1$2');

        const numberMerged = mergeAdjacentNumbers(cleaned);

        const numMatch = numberMerged.match(/\d+/);
        if (!numMatch) {
            return { valid: false, error: "No number found. Please type a number like 3 or 5 days." };
        }

        let count = parseInt(numMatch[0], 10);

        if (count === 0) {
            return { valid: false, error: "Zero is not valid. Enter at least 1." };
        }

        const dayRegex = /\d+\s*(d[aysin]*)\b/;
        const classRegex = /\d+\s*(c[lass]*|k[las]*|l[ec]*|p[eriod]*)\b/;

        let unit = 'class';
        let label = count + ' classes (assumed)';

        if (dayRegex.test(numberMerged)) {
            unit = 'day';
            label = count + ' days';
        } else if (classRegex.test(numberMerged)) {
            unit = 'class';
            label = count + ' classes';
        }

        return { valid: true, count, unit, label };
    }

    function mergeAdjacentNumbers(str) {
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

    /**
     * Calculate velocity for day-to-class conversion in Simulate Impact.
     * Same logic as Forecast — uses activeDays from weekly aggregates.
     * Requires at least 3 activeDays to be reliable.
     */
    function getVelocityForImpact() {
        const { velocity, totalActiveDays, weeksAnalyzed, weekData } = calculateVelocity();

        if (totalActiveDays < 3) {
            // Fallback: use subject count as rough estimate
            const subjects = getSubjectsData();
            return subjects.length || 4;
        }

        // For established users (≥3 weeks), use optimistic filter
        if (weeksAnalyzed >= 3) {
            const sorted = [...weekData].sort((a, b) => a.successRate - b.successRate);
            const filtered = sorted.slice(1);
            let avgSpeed = 0;
            filtered.forEach(w => { avgSpeed += w.speed; });
            return avgSpeed / filtered.length;
        }

        return velocity;
    }


    // =============================================
    // 6. UI INTEGRATION
    // =============================================

    let aiText, queryDock, activeQueryDock, activeScrollTrack;
    let activeContentRow, activeInputArea, activePill, activePillText;
    let gradientStrip, aiInput, sendBtn;
    let typingAbortController = null;
    let currentActiveQuery = '';
    let hasActivated = false;
    let currentQueryType = '';
    let lastDefaultHTML = ''; // Store last default analysis HTML for line-reveal

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

    /**
     * Line-reveal animation: renders stored HTML instantly but with
     * gentle per-word fade-in from top, simulating AI re-reading.
     */
    function lineReveal(html) {
        if (!aiText) return;
        if (typingAbortController) typingAbortController.abort();

        aiText.innerHTML = '';
        aiText.classList.remove('cursor');

        // Create a temp container to parse the HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Extract all text nodes and element nodes
        const walker = document.createTreeWalker(temp, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return NodeFilter.FILTER_ACCEPT;
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_SKIP;
            }
        });

        // Wrap each segment in a span for animation
        const fragments = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) {
                // Split text into word-chunks
                const words = node.textContent.split(/(\s+)/);
                words.forEach(w => {
                    if (w) {
                        const span = document.createElement('span');
                        span.textContent = w;
                        span.style.opacity = '0';
                        span.style.display = 'inline';
                        fragments.push(span);
                    }
                });
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const clone = node.cloneNode(true);
                clone.style.opacity = '0';
                clone.style.display = 'inline';
                fragments.push(clone);
            }
        }

        fragments.forEach(f => aiText.appendChild(f));

        // Stagger reveal
        fragments.forEach((f, i) => {
            setTimeout(() => {
                f.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                f.style.opacity = '1';
            }, i * 40);
        });
    }

    // --- VELOCITY OPTIONS UI ---

    function showVelocityOptions(options, onSelect) {
        // Clear existing options
        const existing = document.querySelector('.velocity-options');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'velocity-options';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'velocity-option';
            btn.textContent = opt;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                container.remove();
                onSelect(opt);
            });
            container.appendChild(btn);
        });

        // Insert after query dock area
        const summaryBlock = document.querySelector('.summary-block');
        if (summaryBlock) {
            summaryBlock.parentNode.insertBefore(container, summaryBlock.nextSibling);
        }
    }

    // --- QUERY MAPPING ---

    const QUERY_MAP = {
        'Can I Bunk?': { handler: queryBunk, requiresInput: false, type: 'bunk' },
        'Recovery Plan': { handler: queryRecovery, requiresInput: false, type: 'recovery' },
        'Forecast': { handler: null, requiresInput: false, type: 'forecast' },
        'Simulate Impact': { handler: null, requiresInput: true, type: 'impact' }
    };

    // --- MAIN QUERY CLICK HANDLER ---

    function handleQueryClick(queryName, requiresInput) {
        if (!queryDock || !activeQueryDock) return;

        // Remove any velocity options
        const velOpts = document.querySelector('.velocity-options');
        if (velOpts) velOpts.remove();

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
            aiInput.placeholder = 'e.g. 3 days or 5 classes';
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
        if (gradientStrip) gradientStrip.style.width = '100%';

        // Force reflow
        if (activeContentRow) void activeContentRow.offsetWidth;

        if (requiresInput) {
            // Simulate Impact — show input prompt
            const promptContent = queryAbsencePrompt();
            typeWriter(promptContent).then(() => {
                if (typingAbortController && typingAbortController.signal.aborted) return;
                expandInputArea(pillWidth);
            });
        } else if (currentQueryType === 'forecast') {
            // Forecast has special multi-step logic
            handleForecastQuery();
        } else {
            // Non-input queries — generate and type result
            const config = QUERY_MAP[queryName];
            if (config && config.handler) {
                const result = config.handler();
                typeWriter(result);
            }
        }
    }

    function handleForecastQuery() {
        const result = queryForecast();

        if (result.type === 'error') {
            typeWriter(result.content);
        } else if (result.type === 'velocity_prompt') {
            typeWriter(result.content).then(() => {
                if (typingAbortController && typingAbortController.signal.aborted) return;
                showVelocityOptions(result.options, (selected) => {
                    const forecast = forecastWithUserVelocity(selected);
                    typeWriter(forecast.content);
                });
            });
        } else if (result.type === 'result') {
            typeWriter(result.content);
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
        if (gradientStrip) gradientStrip.style.width = '100%';

        activeInputArea.style.width = calculatedInputWidth + 'px';
        activeInputArea.style.opacity = '1';
        activeInputArea.style.paddingRight = '8px';

        if (aiInput) aiInput.focus();
    }

    function cancelActive() {
        if (typingAbortController) typingAbortController.abort();

        // Remove velocity options if any
        const velOpts = document.querySelector('.velocity-options');
        if (velOpts) velOpts.remove();

        if (activeQueryDock) activeQueryDock.style.display = 'none';
        if (queryDock) queryDock.style.display = 'block';

        currentQueryType = '';
        currentActiveQuery = '';

        // Don't re-trigger analysis — keep previous response with gentle line-reveal
        if (lastDefaultHTML && aiText) {
            lineReveal(lastDefaultHTML);
        }
        // If no stored HTML, leave current content as-is
    }

    function handleSendClick() {
        if (!aiInput) return;
        const rawInput = aiInput.value.trim();
        if (!rawInput) return;

        const parsed = parseAbsenceInput(rawInput);

        if (!parsed.valid) {
            aiInput.value = '';
            aiInput.placeholder = parsed.error;
            aiInput.classList.add('input-error');
            setTimeout(() => {
                aiInput.classList.remove('input-error');
                aiInput.placeholder = 'e.g. 3 days or 5 classes';
            }, 2500);
            return;
        }

        // Calculate class count
        let classCount = parsed.count;
        if (parsed.unit === 'day') {
            // Use velocity for day-to-class conversion
            const avgPerDay = getVelocityForImpact();
            classCount = Math.round(parsed.count * avgPerDay);
            parsed.label = parsed.count + ' days (~' + classCount + ' classes)';
        }

        // Update pill text
        if (activePillText) activePillText.textContent = parsed.label + ', Impact';

        // Collapse input area
        if (activeInputArea) {
            activeInputArea.style.width = '0px';
            activeInputArea.style.opacity = '0';
            activeInputArea.style.paddingRight = '0px';
        }

        const newPillWidth = activePill ? activePill.offsetWidth : 120;
        if (activeContentRow) activeContentRow.style.width = newPillWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = '100%';

        if (activeScrollTrack) activeScrollTrack.scrollLeft = 0;

        // Generate and type the result
        const result = queryAbsenceResult(classCount, parsed.label);
        typeWriter(result);
    }

    // --- DEFAULT INSIGHT (Attendance Summary on viewport entry) ---

    function runDefaultInsight() {
        const data = getOverallData();
        if (data.total === 0) {
            const welcomeContent = buildContentArray([
                "Welcome to AI Insights! Start marking your attendance to get personalized analysis."
            ]);
            typeWriter(welcomeContent).then(() => {
                if (aiText) lastDefaultHTML = aiText.innerHTML;
            });
            return;
        }
        const result = queryAnalysis();
        typeWriter(result).then(() => {
            // Store the final HTML for line-reveal on cancel
            if (aiText) lastDefaultHTML = aiText.innerHTML;
        });
    }

    // --- RESET: Re-run current active query with fresh data ---

    function resetWidget() {
        // Remove velocity options if any
        const velOpts = document.querySelector('.velocity-options');
        if (velOpts) velOpts.remove();

        if (currentActiveQuery && QUERY_MAP[currentActiveQuery]) {
            // Re-run the same query with fresh stats
            const config = QUERY_MAP[currentActiveQuery];
            if (config.type === 'forecast') {
                handleForecastQuery();
            } else if (config.type === 'impact') {
                // For impact, just re-show the prompt
                const promptContent = queryAbsencePrompt();
                typeWriter(promptContent).then(() => {
                    if (typingAbortController && typingAbortController.signal.aborted) return;
                    const pillWidth = activePill ? activePill.offsetWidth : 120;
                    expandInputArea(pillWidth);
                });
            } else if (config.handler) {
                const result = config.handler();
                typeWriter(result);
            }
        } else {
            // No active query — re-run default insight
            runDefaultInsight();
        }
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
                pill.removeAttribute('onclick');
            }
        });

        // Pill configs: 4 queries (Comprehensive Midterm removed)
        const pillConfigs = [
            { index: 0, name: 'Can I Bunk?', input: false },
            { index: 1, name: 'Recovery Plan', input: false },
            { index: 2, name: 'Forecast', input: false },
            { index: 3, name: 'Simulate Impact', input: true }
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

        // Refresh icon — re-run current query with fresh data
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
