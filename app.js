// Header expand/collapse
const expandArrow = document.getElementById('expandArrow');
const expandedContent = document.getElementById('expandedContent');
const header = document.getElementById('header');

expandArrow.addEventListener('click', function() {
    expandedContent.classList.toggle('show');
    expandArrow.classList.toggle('rotated');
    header.classList.toggle('expanded');
});

// Attendance ring
function updateRing(percentage) {
    const circle = document.getElementById('progressCircle');
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
}

// Dynamic quote
function updateQuote(percentage) {
    const quoteElement = document.querySelector('.welcome-text-content p');
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

// Smooth text change (kept for future use)
function changeWelcomeText(title, subtitle) {
    const titleEl = document.getElementById('welcomeTitle');
    const subtitleEl = document.getElementById('welcomeSubtitle');

    titleEl.classList.add('fade-text');
    subtitleEl.classList.add('fade-text');

    setTimeout(() => {
        titleEl.textContent = title;
        subtitleEl.textContent = subtitle;

        titleEl.classList.remove('fade-text');
        subtitleEl.classList.remove('fade-text');
    }, 350);
}

// Carousel drag scroll
const carousel = document.getElementById('carousel');
let isDown = false;
let startX;
let scrollLeft;

carousel.addEventListener('mousedown', (e) => {
    isDown = true;
    carousel.style.cursor = 'grabbing';
    startX = e.pageX - carousel.offsetLeft;
    scrollLeft = carousel.scrollLeft;
});

carousel.addEventListener('mouseleave', () => {
    isDown = false;
    carousel.style.cursor = 'grab';
});

carousel.addEventListener('mouseup', () => {
    isDown = false;
    carousel.style.cursor = 'grab';
});

carousel.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - carousel.offsetLeft;
    const walk = (x - startX) * 2;
    carousel.scrollLeft = scrollLeft - walk;
});

// Attendance buttons
document.querySelectorAll('.attendance-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const card = this.closest('.class-card');
        const subject = card.querySelector('.class-subject').textContent;
        const action = this.textContent;

        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = '';
        }, 100);

        console.log(`${action} for ${subject}`);
    });
});

// Initialize ring + quote
updateRing(75);
updateQuote(75);
carousel.style.cursor = 'grab';

// PWA Install
let deferredPrompt;
const installStrip = document.getElementById('installStrip');
const installText = document.getElementById('installText');
const closeStripBtn = document.getElementById('closeStrip');

if (localStorage.getItem('installStripDismissed') === 'true') {
    installStrip.classList.add('hidden');
}

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('beforeinstallprompt event fired');
    e.preventDefault();
    deferredPrompt = e;
    installStrip.classList.remove('hidden');
});

installText.addEventListener('click', async function() {
    console.log('Install text clicked');
    if (!deferredPrompt) {
        console.log('No deferred prompt available');
        alert('App install is not available. Try using Chrome or Edge browser.');
        return;
    }

    try {
        deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        console.log('User choice:', choiceResult.outcome);

        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
            installText.textContent = 'Installing...';
            setTimeout(() => {
                installStrip.classList.add('hidden');
            }, 1500);
        } else {
            console.log('User dismissed the install prompt');
        }

        deferredPrompt = null;
    } catch (err) {
        console.error('Error during install prompt:', err);
    }
});

closeStripBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    installStrip.classList.add('hidden');
    localStorage.setItem('installStripDismissed', 'true');
    console.log('Install strip dismissed');
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(err => {
                console.log('Service Worker registration failed:', err);
            });
    });
}

window.addEventListener('appinstalled', () => {
    console.log('PWA was installed successfully');
    installStrip.classList.add('hidden');
    localStorage.setItem('installStripDismissed', 'true');
});

/* AI BOARD JS */
const aiBoard = document.getElementById("aiBoard");
const aiCloseBtn = document.getElementById("aiCloseBtn");
const aiCopyBtn = document.getElementById("aiCopyBtn");
const aiStatusText = document.getElementById("aiStatusText");
const aiResponse = document.getElementById("aiResponse");
const userMessageCard = document.getElementById("userMessageCard");

function openBoardWithPrompt(text) {
    userMessageCard.textContent = text || "Your question will appear here.";
    aiBoard.classList.add("visible");
}

aiCloseBtn.addEventListener("click", () => {
    aiBoard.classList.remove("visible");
});

aiCopyBtn.addEventListener("click", () => {
    const text = aiResponse.textContent.trim();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const labelSpan = aiCopyBtn.querySelector("span:last-child");
        const prev = labelSpan.textContent;
        labelSpan.textContent = "Copied!";
        setTimeout(() => (labelSpan.textContent = prev), 1500);
    });
});

const statuses = ["Analyzing…", "Thinking…", "Almost there…", "Preparing answer…"];
let statusIndex = 0;
setInterval(() => {
    statusIndex = (statusIndex + 1) % statuses.length;
    aiStatusText.textContent = statuses[statusIndex];
}, 2000);

/* AI CARD JS (typewriter + input) */
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
    if (!typingActive) return;

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
    typewriterEl.style.display = "none";
    promptInput.style.display = "block";
}

// Start typewriter
typeLoop();

// Switch to input on tap
promptArea.addEventListener("click", () => {
    if (typingActive) {
        stopTypewriter();
    }
    promptInput.focus();
});

// Show send button when text present
promptInput.addEventListener("input", () => {
    if (promptInput.value.trim().length > 0) {
        sendBtn.classList.add("visible");
    } else {
        sendBtn.classList.remove("visible");
    }
});

// Send -> open AI board
sendBtn.addEventListener("click", () => {
    const value = promptInput.value.trim();
    if (!value) return;
    console.log("User asked:", value);

    openBoardWithPrompt(value);

    promptInput.value = "";
    sendBtn.classList.remove("visible");
});

/* flatpickr usage and other scripts */
const startDateEl = document.getElementById("startDate");
const endDateEl = document.getElementById("endDate");

function updateDisplay(instance) {
    const dates = instance.selectedDates;
    const format = d => instance.formatDate(d, "d M Y");

    if (dates.length === 0) {
        startDateEl.textContent = "Select date";
        startDateEl.classList.add("empty");
        endDateEl.textContent = "Select date";
        endDateEl.classList.add("empty");
    } else if (dates.length === 1) {
        startDateEl.textContent = format(dates[0]);
        startDateEl.classList.remove("empty");
        endDateEl.textContent = "Select date";
        endDateEl.classList.add("empty");
    } else {
        startDateEl.textContent = format(dates[0]);
        startDateEl.classList.remove("empty");
        endDateEl.textContent = format(dates[1]);
        endDateEl.classList.remove("empty");
    }
}

flatpickr("#rangePicker", {
    mode: "range",
    dateFormat: "Y-m-d",
    defaultDate: [
        "2019-10-21",
        "2019-11-06"
    ],
    onReady: function(selectedDates, dateStr, instance) {
        updateDisplay(instance);
    },
    onChange: function(selectedDates, dateStr, instance) {
        updateDisplay(instance);
    },
    onOpen: function() {
        document.querySelector(".calendar-icon").style.color = "#4b5563";
    },
    onClose: function() {
        document.querySelector(".calendar-icon").style.color = "#9ca3af";
    }
});

/* --- JS for dynamic font scaling --- */

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

/* Major subjects selection & calculation */
const subjectsData = {
    "Mathematics of division": { attended: 18, total: 22 },
    "Physics": { attended: 15, total: 20 },
    "fundamental of financial investment": { attended: 16, total: 21 },
    "Computer Science": { attended: 11, total: 14 }
};

let majorSubjects = []; // selected majors

const majorModal = document.getElementById("majorModal");
const majorEdit = document.getElementById("majorEdit");
const majorSave = document.getElementById("majorSave");
const majorCancel = document.getElementById("majorCancel");
const majorCheckboxes = document.querySelectorAll(".major-checkbox");
const majorPercentEl = document.getElementById("majorPercent");
const majorFooterEl = document.getElementById("majorFooter");
const majorHalfPath = document.getElementById("majorHalfPath");
const summaryBodyEl = document.getElementById("summaryBody");

function openMajorModal() {
    majorCheckboxes.forEach(cb => {
        cb.checked = majorSubjects.includes(cb.value);
    });
    majorModal.style.display = "block";
}

function closeMajorModal() {
    majorModal.style.display = "none";
}

function updateAttendanceSummary(overallPercent, majorPercent, majorsCount) {
    const lines = [];
    lines.push(`Overall attendance is ${overallPercent}% for this period.`);

    if (majorsCount === 0) {
        lines.push("Major subjects are not selected yet. Choose majors to track their combined attendance.");
    } else if (majorPercent < 75) {
        lines.push(`Major subjects are at ${majorPercent}%, which is below the 75% safety threshold.`);
    } else {
        lines.push(`Major subjects are at ${majorPercent}%, which is above the 75% safety threshold.`);
    }

    summaryBodyEl.innerHTML = "<ul>" + lines.map(l => `<li>${l}</li>`).join("") + "</ul>";
}

function updateMajorCard() {
    const overallPercent = 75;

    if (majorSubjects.length === 0) {
        majorPercentEl.textContent = "0%";
        majorFooterEl.textContent = "Select major, click pencil button";
        majorHalfPath.style.strokeDashoffset = 100;
        updateAttendanceSummary(overallPercent, 0, 0);
        return;
    }

    let totalAttended = 0;
    let totalClasses = 0;

    majorSubjects.forEach(name => {
        const data = subjectsData[name];
        if (data) {
            totalAttended += data.attended;
            totalClasses += data.total;
        }
    });

    const percent = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 100) : 0;
    majorPercentEl.textContent = percent + "%";
    majorFooterEl.textContent = majorSubjects.length + " subjects combined";

    const offset = 100 - Math.max(0, Math.min(100, percent));
    majorHalfPath.style.strokeDashoffset = offset;

    updateAttendanceSummary(overallPercent, percent, majorSubjects.length);
}

majorEdit.addEventListener("click", openMajorModal);
majorCancel.addEventListener("click", closeMajorModal);

majorSave.addEventListener("click", () => {
    const selected = [];
    majorCheckboxes.forEach(cb => {
        if (cb.checked) selected.push(cb.value);
    });
    majorSubjects = selected;
    updateMajorCard();
    closeMajorModal();
});

updateAttendanceSummary(75, 0, 0);
updateMajorCard();

// Run the dynamic font adjustment when the page loads
document.querySelectorAll('.card.subject-card .subject-name').forEach(adjustSubjectFont);

// Optional: Re-run oindow resize if the layout changes significantly
window.addEventListener('resize', () => {
    document.querySelectorAll('.card.subject-card .subject-name').forEach(adjustSubjectFont);
});

/* ---------------- DATE-WISE RECORDS JS (NEW) ---------------- */
const attendanceData = {
  "2026-01-02": [
    {
      subject: "Data Structures",
      time: "09:00 – 10:00",
      room: "C-204",
      faculty: "Prof. Mehta",
      remarks: "Intro to trees. Bring previous assignment.",
      status: "present"
    },
    {
      subject: "Engineering Mathematics",
      time: "11:00 – 12:00",
      room: "A-103",
      faculty: "Dr. Rao",
      remarks: "Missed quiz, check makeup options.",
      status: "absent"
    },
    {
      subject: "Computer Networks",
      time: "13:00 – 14:00",
      room: "Lab-2",
      faculty: "Mr. Sharma",
      remarks: "Configured basic routing tables.",
      status: "present"
    },
    {
      subject: "Discrete Mathematics",
      time: "15:00 – 16:00",
      room: "B-210",
      faculty: "Dr. Iyer",
      remarks: "Revision of combinatorics; test next week.",
      status: "present"
    }
  ],
  "2026-01-03": [
    {
      subject: "Operating Systems",
      time: "10:00 – 11:00",
      room: "Lab-1",
      faculty: "Ms. Kulkarni",
      remarks: "Lab cancelled due to network issue.",
      status: "not-held"
    }
  ]
};

const monthYearSelect = document.getElementById("monthYearSelect");
const dateStrip = document.getElementById("dateStrip");
const cardsContainer = document.getElementById("dateCardsContainer");
const selectedDateLabel = document.getElementById("selectedDateLabel");

const editModal = document.getElementById("editModal");
const modalSubject = document.getElementById("modalSubject");
const modalStatus = document.getElementById("modalStatus");
const modalRemarks = document.getElementById("modalRemarks");
const modalCancel = document.getElementById("modalCancel");
const modalSave = document.getElementById("modalSave");

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

let currentYear = 2026;
let currentMonth = 0;
let selectedDateKey = null;
let editContext = null;

function initSelectors() {
  const startYear = 2024;
  const endYear = 2030;

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 0; m < 12; m++) {
      const opt = document.createElement("option");
      const monthLabel = monthNames[m];
      const valueMonth = String(m + 1).padStart(2, "0");
      opt.value = `${y}-${valueMonth}`;
      opt.textContent = `${monthLabel} ${y}`;
      monthYearSelect.appendChild(opt);
    }
  }

  const defaultMonth = String(currentMonth + 1).padStart(2, "0");
  monthYearSelect.value = `${currentYear}-${defaultMonth}`;

  monthYearSelect.addEventListener("change", () => {
    const [year, month] = monthYearSelect.value.split("-").map(Number);
    currentYear = year;
    currentMonth = month - 1;
    renderMonth();
  });
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDateKey(year, monthIndex, day) {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function formatReadableDate(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const full = date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return `${weekday}, ${full}`;
}

function getStartTimeLabel(timeStr) {
  if (!timeStr) return "";
  let part = timeStr.split("–")[0].split("-")[0].trim();
  part = part.replace(":", ".");
  return part;
}

function renderMonth() {
  dateStrip.innerHTML = "";
  const days = getDaysInMonth(currentYear, currentMonth);

  for (let d = 1; d <= days; d++) {
    const date = new Date(currentYear, currentMonth, d);
    const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
    const dateKey = formatDateKey(currentYear, currentMonth, d);

    const btn = document.createElement("button");
    btn.className = "date-item";
    btn.dataset.dateKey = dateKey;

    const dayNameSpan = document.createElement("span");
    dayNameSpan.className = "day-name";
    dayNameSpan.textContent = weekday;

    const dayNumberSpan = document.createElement("span");
    dayNumberSpan.className = "day-number";
    dayNumberSpan.textContent = String(d).padStart(2, "0");

    btn.appendChild(dayNameSpan);
    btn.appendChild(dayNumberSpan);

    btn.addEventListener("click", () => {
      selectDate(dateKey, d);
      ensureVisible(btn);
    });

    dateStrip.appendChild(btn);
  }

  let defaultDay = 1;
  if (selectedDateKey) {
    const [yr, m, d] = selectedDateKey.split("-").map(Number);
    if (yr === currentYear && m === currentMonth + 1) {
      defaultDay = d;
    }
  }

  const defaultKey = formatDateKey(currentYear, currentMonth, defaultDay);
  const defaultButton = [...dateStrip.children].find(el => el.dataset.dateKey === defaultKey);
  if (defaultButton) {
    selectDate(defaultKey, defaultDay);
    ensureVisible(defaultButton);
  }
}

function selectDate(dateKey, dayNumber) {
  selectedDateKey = dateKey;

  [...dateStrip.children].forEach(el =>
    el.classList.toggle("selected", el.dataset.dateKey === dateKey)
  );

  const [year, month, day] = dateKey.split("-").map(Number);
  selectedDateLabel.textContent = formatReadableDate(year, month - 1, dayNumber || day);

  renderCards(dateKey);
}

function renderCards(dateKey) {
  cardsContainer.innerHTML = "";

  const records = attendanceData[dateKey] || [];

  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent =
      "No records saved for this date. Once you add classes, they will appear here with your notes and status.";
    cardsContainer.appendChild(empty);
    return;
  }

  records.forEach((rec, index) => {
    const card = document.createElement("article");
    card.className = "record-card";

    const header = document.createElement("div");
    header.className = "card-header";

    const left = document.createElement("div");
    left.className = "card-header-left";

    const subject = document.createElement("div");
    subject.className = "subject-name";
    subject.textContent = rec.subject;
    left.appendChild(subject);

    const meta = document.createElement("div");
    meta.className = "meta-line";

    const startTimeLabel = getStartTimeLabel(rec.time);

    // Time
    const timeRow = document.createElement("div");
    timeRow.className = "meta-item";
    timeRow.innerHTML = `
      <span class="meta-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
          <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="meta-text">${startTimeLabel}</span>
    `;
    meta.appendChild(timeRow);

    // Room
    const roomRow = document.createElement("div");
    roomRow.className = "meta-item";
    roomRow.innerHTML = `
      <span class="meta-icon" aria-hidden="true">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke="currentColor" stroke-width="2" d="M20 14H4m6.5 3L8 20m5.5-3 2.5 3M4.88889 17H19.1111c.4909 0 .8889-.4157.8889-.9286V4.92857C20 4.41574 19.602 4 19.1111 4H4.88889C4.39797 4 4 4.41574 4 4.92857V16.0714c0 .5129.39797.9286.88889.9286ZM13 14v-3h4v3h-3Z"/>
        </svg>
      </span>
      <span class="meta-text">${rec.room}</span>
    `;
    meta.appendChild(roomRow);

    // Faculty
    const facultyRow = document.createElement("div");
    facultyRow.className = "meta-item faculty";
    facultyRow.innerHTML = `
      <span class="meta-icon" aria-hidden="true">
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke="currentColor" stroke-width="2" d="M14.7141 15h4.268c.4043 0 .732-.3838.732-.8571V3.85714c0-.47338-.3277-.85714-.732-.85714H6.71411c-.55228 0-1 .44772-1 1v4m10.99999 7v-3h3v3h-3Zm-3 6H6.71411c-.55228 0-1-.4477-1-1 0-1.6569 1.34315-3 3-3h2.99999c1.6569 0 3 1.3431 3 3 0 .5523-.4477 1-1 1Zm-1-9.5c0 1.3807-1.1193 2.5-2.5 2.5s-2.49999-1.1193-2.49999-2.5S8.8334 9 10.2141 9s2.5 1.1193 2.5 2.5Z"/>
        </svg>
      </span>
      <span class="meta-text">${rec.faculty}</span>
    `;
    meta.appendChild(facultyRow);

    left.appendChild(meta);
    header.appendChild(left);

    // Status pill
    const statusPill = document.createElement("span");
    statusPill.classList.add("status-pill");

    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    statusPill.appendChild(statusDot);

    const statusText = document.createElement("span");
    if (rec.status === "present") {
      statusPill.classList.add("status-present");
      statusText.textContent = "Present";
    } else if (rec.status === "absent") {
      statusPill.classList.add("status-absent");
      statusText.textContent = "Absent";
    } else {
      statusPill.classList.add("status-notheld");
      statusText.textContent = "not held";
    }
    statusPill.appendChild(statusText);

    header.appendChild(statusPill);
    card.appendChild(header);

    const remarksWrapper = document.createElement("div");
    const remarksLabel = document.createElement("div");
    remarksLabel.className = "remarks-label";
    remarksLabel.textContent = "Remarks";
    const remarksBody = document.createElement("div");
    remarksBody.className = "remarks";
    remarksBody.textContent = rec.remarks || "No notes yet.";
    remarksWrapper.appendChild(remarksLabel);
    remarksWrapper.appendChild(remarksBody);

    card.appendChild(remarksWrapper);

    const footer = document.createElement("div");
    footer.className = "card-footer";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-card-btn";
    editBtn.title = "Edit record";
    editBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
           class="icon icon-tabler icon-tabler-pencil-discount">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
        <path d="M13.5 6.5l4 4" />
        <path d="M16 21l5 -5" />
        <path d="M21 21v.01" />
        <path d="M16 16v.01" />
      </svg>
      <span class="edit-card-btn-label">Edit records</span>
    `;
    editBtn.addEventListener("click", () => openEditModal(dateKey, index));

    footer.appendChild(editBtn);
    card.appendChild(footer);

    cardsContainer.appendChild(card);
  });
}

function ensureVisible(element) {
  const parent = dateStrip;
  const parentRect = parent.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();

  if (elRect.left < parentRect.left) {
    parent.scrollLeft -= (parentRect.left - elRect.left) + 10;
  } else if (elRect.right > parentRect.right) {
    parent.scrollLeft += (elRect.right - parentRect.right) + 10;
  }
}

function openEditModal(dateKey, index) {
  const rec = (attendanceData[dateKey] || [])[index];
  if (!rec) return;

  editContext = { dateKey, index };

  const startTimeLabel = getStartTimeLabel(rec.time);
  modalSubject.textContent = `${rec.subject} · ${startTimeLabel} · ${rec.room}`;
  modalStatus.value = rec.status;
  modalRemarks.value = rec.remarks || "";

  editModal.classList.remove("hidden");
}

function closeEditModal() {
  editContext = null;
  editModal.classList.add("hidden");
}

modalCancel.addEventListener("click", closeEditModal);

modalSave.addEventListener("click", () => {
  if (!editContext) return;
  const { dateKey, index } = editContext;
  const list = attendanceData[dateKey];
  if (!list || !list[index]) return;

  list[index].status = modalStatus.value;
  list[index].remarks = modalRemarks.value.trim();

  closeEditModal();
  renderCards(dateKey);
});

editModal.addEventListener("click", (e) => {
  if (e.target === editModal) {
    closeEditModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !editModal.classList.contains("hidden")) {
    closeEditModal();
  }
});

initSelectors();
renderMonth();

// Menu integration
const menuButton = document.querySelector('.icon-btn[aria-label="Menu"]');
const menuView = document.getElementById('menu-view');
const menuCloseButton = menuView.querySelector('.nav-btn[aria-label="Close Menu"]');

// Initially hide menu
menuView.style.transform = 'translateX(-100%)';
menuView.style.transition = 'transform 0.3s ease-in-out';

menuButton.addEventListener('click', () => {
    menuView.style.transform = 'translateX(0)';
});

menuCloseButton.addEventListener('click', () => {
    menuView.style.transform = 'translateX(-100%)';
});

// Menu search functionality
const searchInput = document.getElementById('mainSearchInput');
const searchBox = document.getElementById('searchBoxContainer');
const actionBtn = document.getElementById('actionBtn');
const scrollContent = document.getElementById('scrollContent'); // This gets blurred
const overlayContainer = document.getElementById('result-overlay-container');
const classDropdown = document.getElementById('classDropdown');
const selectedClassText = document.getElementById('selectedClassText');
const foundState = document.getElementById('foundState');
const emptyState = document.getElementById('emptyState');
const overlayBackdrop = overlayContainer.querySelector('.overlay-backdrop');

// --- SEARCH INPUT LOGIC ---
searchInput.addEventListener('focus', () => {
    searchBox.classList.add('active');
});

searchInput.addEventListener('blur', () => {
    if (searchInput.value.length === 0) {
        searchBox.classList.remove('active');
    }
});

searchInput.addEventListener('input', (e) => {
    // Strictly numeric
    const val = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = val;

    if (val.length > 0) {
        actionBtn.classList.add('visible');
    } else {
        actionBtn.classList.remove('visible');
    }
});

actionBtn.addEventListener('click', activateSearchMode);

overlayBackdrop.addEventListener('click', exitSearchMode);

// --- TRANSITION LOGIC ---
function activateSearchMode() {
    // Blur just the content, not the header
    scrollContent.classList.add('content-blurred');
    
    // Show Overlay
    overlayContainer.style.display = 'flex';
    
    // Dismiss keyboard
    searchInput.blur();
}

function exitSearchMode() {
    // Unblur content
    scrollContent.classList.remove('content-blurred');
    
    // Hide Overlay
    overlayContainer.style.display = 'none';
    
    // Cleanup inputs
    searchInput.value = '';
    actionBtn.classList.remove('visible');
    searchBox.classList.remove('active');
}

// --- DROPDOWN LOGIC ---
classDropdown.querySelector('.class-pill').addEventListener('click', toggleDropdown);

function toggleDropdown() {
    classDropdown.classList.toggle('active');
}

const dropdownItems = classDropdown.querySelectorAll('.dropdown-item');
dropdownItems.forEach(item => {
    item.addEventListener('click', () => {
        selectClass(item.textContent);
    });
});

function selectClass(className) {
    selectedClassText.textContent = className;
    classDropdown.classList.remove('active');

    if (className === 'B.Com Sem 5') {
        foundState.style.display = 'flex';
        emptyState.style.display = 'none';
    } else {
        foundState.style.display = 'none';
        emptyState.style.display = 'block';
    }
}

document.addEventListener('click', function(event) {
    if (!classDropdown.contains(event.target) && !event.target.closest('.class-pill')) {
        classDropdown.classList.remove('active');
    }
});
