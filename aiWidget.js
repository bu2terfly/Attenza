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

    // --- Query: Can I Bunk? ---
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

    // --- Query: Recovery ---
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

    // --- Query: Analysis ---
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

    // --- Query: Forecast ---
    const FORECAST_OPENERS = [
        "Based on your attendance pattern,", "Following your current trend,",
        "Tracking your pattern,", "Your trajectory shows,", "At current pace,",
        "Your trend indicates,", "Pattern analysis shows,",
        "Current rate indicates,", "Following this pattern,",
        "As per trajectory,"
    ];

    const FORECAST_INTERPS = [
        "In next 7 days at your current pace, overall will be around {forecast}%.",
        "Expect your attendance to be about {forecast}% by end of next week.",
        "Next week's projection puts you at {forecast}% overall.",
        "By the end of 7 days, you'll likely be at {forecast}% overall.",
        "Your next week forecast shows {forecast}% overall attendance."
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

    // --- Query: Absence Impact ---
    const ABSENCE_INPUT_PROMPTS = [
        "Okay! To show the impact, tell me how many classes / days you're planning to skip .",
        "Alright! For calculation, I need the number of classes/days you'll be absent . Just tell me .",
        "Sure! To calculate impact, Say how many classes or days will you miss( absent ) .",
        "Got it . so for impact calculation, how many classes/days are you planning to skip .",
        "Understood! But I need the count of classes / days you will skip ( absent) . Just tell me ."
    ];

    const IMPACT_VELOCITY_PROMPTS = [
        "On an average working day, how many classes do you have?",
        "How many classes usually happen in one day for you?",
        "Quick — how many classes are scheduled on a normal day?",
        "Just need one more thing — how many classes per day on average?"
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

    // Words to highlight alongside numbers
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

    function buildContentArray(parts) {
        const result = [];
        const wordSet = new Set(HIGHLIGHT_WORDS);

        parts.forEach((part, idx) => {
            if (!part) return;
            if (idx > 0 && part) {
                result.push({ text: ' ', type: 'normal' });
            }
            const segments = part.split(/(\d+\.?\d*%?|\s+)/);
            segments.forEach(seg => {
                if (!seg) return;
                if (/^\d+\.?\d*%?$/.test(seg)) {
                    result.push({ text: seg, type: 'highlight' });
                } else if (/^\s+$/.test(seg)) {
                    result.push({ text: seg, type: 'normal' });
                } else {
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

    /** ISO week key matching app.js getWeekKey */
    function getWeekKeyLocal(dateStr) {
        const d = new Date(dateStr + 'T12:00:00');
        const dayNum = d.getDay() || 7;
        d.setDate(d.getDate() + 4 - dayNum);
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
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
        } catch (e) { return null; }
    }

    function getSubjectsData() {
        try {
            const raw = localStorage.getItem('attenza_subjects_v2');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return parsed.data || parsed || [];
        } catch (e) { return []; }
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
                total: t, attended: a,
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


    // =============================================
    // 4. QUERY HANDLERS
    // =============================================

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
            return buildContentArray([opener, dataSt, interp, pickRandom(BUNK_CLOSERS)]);
        } else {
            return buildContentArray([opener, dataSt, fillTemplate(pickRandom(BUNK_INTERP_NOT_ALLOWED), vars)]);
        }
    }

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

        let interp = needed === 0
            ? "You're already at or above 75% — no recovery needed!"
            : fillTemplate(pickRandom(RECOVERY_INTERPS), vars);

        const parts = [opener, dataSt, interp];
        if (lowest && lowest.percentage < 75) parts.push(fillTemplate(pickRandom(SUBJECT_ALERTS), { subject: lowest.name }));
        if (majorsAtRisk) parts.push(pickRandom(MAJOR_ALERTS));
        return buildContentArray(parts);
    }

    function queryAnalysis() {
        const data = getOverallData();
        const lowest = getLowestSubject();
        const majorsAtRisk = areMajorsAtRisk();
        const vars = { current: data.percentage, total: data.total, attended: data.attended };

        let opener;
        if (data.percentage > 75) opener = pickRandom(ANALYSIS_OPENERS_SAFE);
        else if (data.percentage >= 50) opener = pickRandom(ANALYSIS_OPENERS_WARNING);
        else opener = pickRandom(ANALYSIS_OPENERS_DANGER);

        const dataSt = fillTemplate(pickRandom(ANALYSIS_DATA_STATEMENTS), vars);
        const parts = [opener, dataSt];
        if (lowest && lowest.percentage < 75) parts.push(fillTemplate(pickRandom(SUBJECT_ALERTS), { subject: lowest.name }));
        if (majorsAtRisk) parts.push(pickRandom(MAJOR_ALERTS));
        return buildContentArray(parts);
    }

    // =============================================
    // 4a. FORECAST — Hybrid Momentum Engine
    // =============================================

    /**
     * Hybrid Momentum Forecast
     * Always asks user for velocity (classes per day).
     * Uses momentum EMA (recent form) + overallPercentage (career history).
     */
    function queryForecast() {
        const data = getOverallData();
        if (data.total < 5) {
            return { type: 'error', content: buildContentArray([pickRandom(FORECAST_TOO_SHORT)]) };
        }
        // Always ask user for velocity
        return {
            type: 'velocity_prompt',
            content: buildContentArray([pickRandom(FORECAST_VELOCITY_PROMPTS)]),
            options: [3, 4, 5, 6, 7, 8]
        };
    }

    function forecastWithUserVelocity(userVelocity) {
        const data = getOverallData();
        const summary = getSummaryData();
        // Momentum EMA (recent form), default to overallPercentage
        const momentum = (summary && summary.momentum != null) ? summary.momentum : data.percentage;
        // Hybrid formula: 70% momentum + 30% overall
        const effectiveRate = (0.70 * momentum) + (0.30 * data.percentage);
        // 6 working days (Sunday off)
        const futureTotalClasses = Math.round(userVelocity * 6);
        const futureAttended = Math.round(futureTotalClasses * (effectiveRate / 100));
        const newTotal = data.total + futureTotalClasses;
        const newAttended = data.attended + futureAttended;
        const forecastPct = newTotal > 0 ? parseFloat(((newAttended / newTotal) * 100).toFixed(1)) : 0;

        const vars = { forecast: forecastPct, current: data.percentage };
        const opener = pickRandom(FORECAST_OPENERS);
        const interp = fillTemplate(pickRandom(FORECAST_INTERPS), vars);
        const closer = pickRandom(FORECAST_CLOSERS);
        return { type: 'result', content: buildContentArray([opener, interp, closer]) };
    }

    // =============================================
    // 4b. ABSENCE IMPACT
    // =============================================

    function queryAbsencePrompt() {
        return buildContentArray([pickRandom(ABSENCE_INPUT_PROMPTS)]);
    }

    function queryAbsenceResult(classCount, inputLabel) {
        const data = getOverallData();
        const newPct = data.total + classCount > 0
            ? parseFloat(((data.attended / (data.total + classCount)) * 100).toFixed(1))
            : 0;

        const vars = { current: data.percentage, input: inputLabel, new: newPct };
        const opener = fillTemplate(pickRandom(UNIVERSAL_OPENERS), vars);
        const dataSt = fillTemplate(pickRandom(ABSENCE_DATA_STATEMENTS), vars);
        const interp = fillTemplate(pickRandom(ABSENCE_INTERPS), vars);
        const closer = newPct >= 75 ? pickRandom(ABSENCE_CLOSERS_SAFE) : pickRandom(ABSENCE_CLOSERS_UNSAFE);
        return buildContentArray([opener, dataSt, interp, closer]);
    }


    // =============================================
    // 5. INPUT PARSER
    // =============================================

    function parseAbsenceInput(raw) {
        if (!raw || !raw.trim()) return { valid: false, error: "Please enter a number." };
        let input = raw.trim().toLowerCase();
        if (/^[^a-z0-9]+$/.test(input)) return { valid: false, error: "Invalid input." };

        let cleaned = input.replace(/(-)(?=\d)/g, '').replace(/(\d)\.(\d)/g, '$1$2');
        const merged = mergeAdjacentNumbers(cleaned);
        const numMatch = merged.match(/\d+/);
        if (!numMatch) return { valid: false, error: "No number found. Type like 3 or 5 days." };

        let count = parseInt(numMatch[0], 10);
        if (count === 0) return { valid: false, error: "Zero is not valid." };

        const dayRx = /\d+\s*(d[aysin]*)\b/;
        const classRx = /\d+\s*(c[lass]*|k[las]*|l[ec]*|p[eriod]*)\b/;

        let unit = 'class', label = count + ' classes';
        if (dayRx.test(merged)) { unit = 'day'; label = count + ' days'; }
        else if (classRx.test(merged)) { unit = 'class'; label = count + ' classes'; }

        return { valid: true, count, unit, label };
    }

    function mergeAdjacentNumbers(str) {
        const tokens = str.split(/\s+/);
        const result = [];
        let numBuffer = '';
        for (let i = 0; i < tokens.length; i++) {
            if (/^\d+$/.test(tokens[i])) { numBuffer += tokens[i]; }
            else { if (numBuffer) { result.push(numBuffer); numBuffer = ''; } result.push(tokens[i]); }
        }
        if (numBuffer) result.push(numBuffer);
        return result.join(' ');
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
    let lastDefaultHTML = '';

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

    // --- CORE ANIMATION ---

    async function showLoader(duration, signal) {
        if (!aiText) return;
        aiText.classList.remove('cursor');
        const loader = document.createElement('div');
        loader.className = 'loader';
        loader.innerHTML = '<div class="stripe"></div><div class="stripe"></div><div class="stripe"></div><div class="stripe"></div>';
        aiText.appendChild(loader);

        return new Promise(resolve => {
            const tid = setTimeout(() => {
                if (loader.parentNode === aiText) loader.remove();
                aiText.classList.add('cursor');
                resolve();
            }, duration);
            if (signal) signal.addEventListener('abort', () => { clearTimeout(tid); if (loader.parentNode === aiText) loader.remove(); resolve(); });
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
                if (chunk.type === 'highlight') span.textContent += char;
                else span.nodeValue += char;
                await new Promise(r => setTimeout(r, 20));
            }
        }
        aiText.classList.remove('cursor');
    }

    /**
     * Line reveal: shows stored HTML with gentle fade-in.
     * Does NOT re-parse or re-wrap nodes → no duplicate highlights.
     */
    function lineReveal(html) {
        if (!aiText) return;
        if (typingAbortController) typingAbortController.abort();

        aiText.classList.remove('cursor');
        aiText.style.opacity = '0';
        aiText.style.transform = 'translateY(6px)';
        aiText.innerHTML = html;

        void aiText.offsetWidth; // force reflow
        aiText.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        aiText.style.opacity = '1';
        aiText.style.transform = 'translateY(0)';

        setTimeout(() => {
            aiText.style.transition = '';
            aiText.style.transform = '';
        }, 450);
    }

    // --- VELOCITY OPTIONS UI ---

    function showVelocityOptions(options, onSelect) {
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

        const summaryBlock = document.querySelector('.summary-block');
        if (summaryBlock) summaryBlock.parentNode.insertBefore(container, summaryBlock.nextSibling);
    }

    // --- QUERY MAP ---

    const QUERY_MAP = {
        'Can I Bunk?': { handler: queryBunk, type: 'bunk' },
        'Simulate Impact': { handler: null, type: 'impact' },
        'Recovery Plan': { handler: queryRecovery, type: 'recovery' },
        'Forecast': { handler: null, type: 'forecast' }
    };

    // --- MAIN QUERY CLICK HANDLER ---
    // Matches original reference: gradient strip = pill width, then expands to totalWidth

    function handleQueryClick(queryName, requiresInput) {
        if (!queryDock || !activeQueryDock) return;

        const velOpts = document.querySelector('.velocity-options');
        if (velOpts) velOpts.remove();

        // 1. Swap views
        queryDock.style.display = 'none';
        activeQueryDock.style.display = 'block';
        if (activeScrollTrack) activeScrollTrack.scrollLeft = 0;

        // 2. Setup
        currentActiveQuery = queryName;
        if (activePillText) activePillText.textContent = queryName;
        if (aiInput) { aiInput.value = ''; aiInput.placeholder = 'e.g. 3 days or 5 classes'; }
        if (sendBtn) sendBtn.classList.remove('visible');

        // 3. Snap widths — NO transitions initially (matches original)
        if (activeContentRow) activeContentRow.style.transition = 'none';
        if (gradientStrip) gradientStrip.style.transition = 'none';
        if (activeInputArea) activeInputArea.style.transition = 'none';

        // Hide input area
        if (activeInputArea) {
            activeInputArea.style.width = '0px';
            activeInputArea.style.opacity = '0';
            activeInputArea.style.paddingRight = '0px';
        }

        // Lock row to natural pill width
        if (activeContentRow) activeContentRow.style.width = 'fit-content';
        const pillWidth = activePill ? activePill.offsetWidth : 120;
        if (activeContentRow) activeContentRow.style.width = pillWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = pillWidth + 'px';

        // Force reflow
        if (activeContentRow) void activeContentRow.offsetWidth;

        // 4. Execute query
        if (requiresInput) {
            const promptContent = queryAbsencePrompt();
            typeWriter(promptContent).then(() => {
                if (typingAbortController && typingAbortController.signal.aborted) return;
                expandInputArea(pillWidth);
            });
        } else if (queryName === 'Forecast') {
            handleForecastQuery();
        } else {
            const config = QUERY_MAP[queryName];
            if (config && config.handler) typeWriter(config.handler());
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
                    // Validate: only 1-10 allowed
                    const v = parseInt(selected, 10);
                    if (isNaN(v) || v < 1 || v > 10) return;
                    typeWriter(forecastWithUserVelocity(v).content);
                });
            });
        }
    }

    function expandInputArea(pillWidth) {
        if (!activeQueryDock || !activeInputArea) return;

        // Math: 70% of visible dock for input (matches original)
        const visibleDockWidth = activeQueryDock.offsetWidth;
        const calculatedInputWidth = visibleDockWidth * 0.70;
        const targetTotalWidth = calculatedInputWidth + pillWidth + 8;

        // Re-enable smooth transitions
        if (activeContentRow) activeContentRow.style.transition = 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
        if (gradientStrip) gradientStrip.style.transition = 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
        if (activeInputArea) activeInputArea.style.transition = 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)';

        // Expand to target
        if (activeContentRow) activeContentRow.style.width = targetTotalWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = targetTotalWidth + 'px';

        // Show input
        if (activeInputArea) {
            activeInputArea.style.width = calculatedInputWidth + 'px';
            activeInputArea.style.opacity = '1';
            activeInputArea.style.paddingRight = '8px';
        }

        if (aiInput) aiInput.focus();
    }

    function cancelActive() {
        if (typingAbortController) typingAbortController.abort();

        const velOpts = document.querySelector('.velocity-options');
        if (velOpts) velOpts.remove();

        if (activeQueryDock) activeQueryDock.style.display = 'none';
        if (queryDock) queryDock.style.display = 'block';

        currentActiveQuery = '';
        pendingImpactDays = null;

        // Re-trigger fresh default analysis (matches original behavior)
        runDefaultInsight();
    }

    // Pending impact state for day-based input (two-step flow)
    let pendingImpactDays = null;

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

        if (parsed.unit === 'day') {
            // Step 1: Stash days, collapse input, ask for velocity
            pendingImpactDays = parsed.count;

            // Collapse input area
            if (activeInputArea) {
                activeInputArea.style.width = '0px';
                activeInputArea.style.opacity = '0';
                activeInputArea.style.paddingRight = '0px';
            }
            const newPillWidth = activePill ? activePill.offsetWidth : 120;
            if (activeContentRow) activeContentRow.style.width = newPillWidth + 'px';
            if (gradientStrip) gradientStrip.style.width = newPillWidth + 'px';
            if (activeScrollTrack) activeScrollTrack.scrollLeft = 0;

            // Ask how many classes per day (same UI as forecast velocity)
            typeWriter(buildContentArray([pickRandom(IMPACT_VELOCITY_PROMPTS)])).then(() => {
                if (typingAbortController && typingAbortController.signal.aborted) return;
                showVelocityOptions([3, 4, 5, 6, 7, 8], (selected) => {
                    const v = parseInt(selected, 10);
                    if (isNaN(v) || v < 1 || v > 10) return;
                    const classCount = Math.round(pendingImpactDays * v);
                    const label = pendingImpactDays + ' days (~' + classCount + ' classes)';
                    pendingImpactDays = null;

                    if (activePillText) activePillText.textContent = label + ', Impact';
                    typeWriter(queryAbsenceResult(classCount, label));
                });
            });
            return;
        }

        // Direct class input — compute immediately
        let classCount = parsed.count;

        // Update pill text with result
        if (activePillText) activePillText.textContent = parsed.label + ', Impact';

        // Collapse input, shrink to pill
        if (activeInputArea) {
            activeInputArea.style.width = '0px';
            activeInputArea.style.opacity = '0';
            activeInputArea.style.paddingRight = '0px';
        }

        const newPillWidth = activePill ? activePill.offsetWidth : 120;
        if (activeContentRow) activeContentRow.style.width = newPillWidth + 'px';
        if (gradientStrip) gradientStrip.style.width = newPillWidth + 'px';
        if (activeScrollTrack) activeScrollTrack.scrollLeft = 0;

        typeWriter(queryAbsenceResult(classCount, parsed.label));
    }

    // --- DEFAULT + RESET ---

    function runDefaultInsight() {
        const data = getOverallData();
        if (data.total === 0) {
            const welcome = buildContentArray(["Welcome to AI Insights! Start marking your attendance to get personalized analysis."]);
            typeWriter(welcome).then(() => { if (aiText) lastDefaultHTML = aiText.innerHTML; });
            return;
        }
        typeWriter(queryAnalysis()).then(() => {
            if (aiText) lastDefaultHTML = aiText.innerHTML;
        });
    }

    function resetWidget() {
        const velOpts = document.querySelector('.velocity-options');
        if (velOpts) velOpts.remove();

        if (currentActiveQuery && QUERY_MAP[currentActiveQuery]) {
            const config = QUERY_MAP[currentActiveQuery];
            if (config.type === 'forecast') handleForecastQuery();
            else if (config.type === 'impact') {
                typeWriter(queryAbsencePrompt()).then(() => {
                    if (typingAbortController && typingAbortController.signal.aborted) return;
                    expandInputArea(activePill ? activePill.offsetWidth : 120);
                });
            } else if (config.handler) typeWriter(config.handler());
        } else {
            runDefaultInsight();
        }
    }


    // =============================================
    // 7. INITIALIZATION
    // =============================================

    function initAIWidget() {
        initDomRefs();
        if (!aiText) { console.warn('[AI Widget] ai-text not found.'); return; }

        const pills = document.querySelectorAll('#query-dock .query-pill');
        pills.forEach(pill => { if (pill.getAttribute('onclick')) pill.removeAttribute('onclick'); });

        // Pill order: Can I Bunk(0), Simulate Impact(1), Recovery Plan(2), Forecast(3)
        const pillConfigs = [
            { index: 0, name: 'Can I Bunk?', input: false },
            { index: 1, name: 'Simulate Impact', input: true },
            { index: 2, name: 'Recovery Plan', input: false },
            { index: 3, name: 'Forecast', input: false }
        ];

        pillConfigs.forEach(cfg => {
            if (pills[cfg.index]) {
                pills[cfg.index].addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleQueryClick(cfg.name, cfg.input);
                });
            }
        });

        if (sendBtn) sendBtn.addEventListener('click', (e) => { e.stopPropagation(); handleSendClick(); });

        if (aiInput) {
            aiInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && aiInput.value.trim().length > 0) handleSendClick();
            });
            aiInput.addEventListener('input', () => {
                if (sendBtn) sendBtn.classList.toggle('visible', aiInput.value.trim().length > 0);
            });
        }

        if (activePill) activePill.addEventListener('click', (e) => { e.stopPropagation(); cancelActive(); });

        const refreshIcon = document.querySelector('.ai-widget-wrapper .refresh-icon');
        if (refreshIcon) refreshIcon.addEventListener('click', (e) => { e.stopPropagation(); resetWidget(); });

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(initAIWidget, 500));
    } else {
        setTimeout(initAIWidget, 500);
    }

    window.resetAIWidget = resetWidget;
    window.handleAIQueryClick = handleQueryClick;

})();
