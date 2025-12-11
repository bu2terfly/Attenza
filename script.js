/* ---------------------------------------------------------
   ATTENDANCE RING
--------------------------------------------------------- */
const progressCircle = document.getElementById("progressCircle");
const percentageText = document.getElementById("percentage");
const fadeText = document.getElementById("fadeText");
const radius = progressCircle.r.baseVal.value;
const circumference = 2 * Math.PI * radius;

progressCircle.style.strokeDasharray = `${circumference}`;
progressCircle.style.strokeDashoffset = `${circumference}`;

function setProgress(percent) {
    const offset = circumference - (percent / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
    percentageText.textContent = `${percent}%`;
}

setTimeout(() => {
    fadeText.style.opacity = 1;
}, 1500);

setTimeout(() => {
    setProgress(45);
}, 200);

/* ---------------------------------------------------------
   HEADER EXPAND / COLLAPSE
--------------------------------------------------------- */
function toggleExpand() {
    const header = document.getElementById("header");
    const expandArrow = document.getElementById("expandArrow");
    const expandedContent = document.getElementById("expandedContent");

    header.classList.toggle("expanded");
    expandArrow.classList.toggle("rotated");
    expandedContent.classList.toggle("show");

    if (expandedContent.classList.contains("show")) {
        expandedContent.style.maxHeight = expandedContent.scrollHeight + "px";
    } else {
        expandedContent.style.maxHeight = "0px";
    }
}

/* ---------------------------------------------------------
   AI BOARD OPEN / CLOSE
--------------------------------------------------------- */
const aiBoard = document.getElementById("aiBoard");
const openAIBtn = document.getElementById("openAIBtn");
const closeAIBtn = document.getElementById("closeAIBtn");

openAIBtn.addEventListener("click", () => {
    aiBoard.classList.add("visible");
});
closeAIBtn.addEventListener("click", () => {
    aiBoard.classList.remove("visible");
});

/* ---------------------------------------------------------
   TYPEWRITER EFFECT ON AI CARD
--------------------------------------------------------- */
const typewriterText = document.querySelector(".typewriter-text");
const promptInput = document.querySelector(".prompt-input");
const sendBtn = document.querySelector(".send-btn");

let text = "Ask me anything...";
let index = 0;

function typeEffect() {
    if (index < text.length) {
        typewriterText.textContent += text.charAt(index);
        index++;
        setTimeout(typeEffect, 60);
    } else {
        promptInput.style.display = "block";
        typewriterText.style.display = "none";
        sendBtn.classList.add("visible");
    }
}

setTimeout(typeEffect, 800);

/* ---------------------------------------------------------
   DATE PICKER (Flatpickr Display System)
--------------------------------------------------------- */
function updateDateDisplay(selectedDates, dateStr) {
    if (!selectedDates.length) return;

    const date = selectedDates[0];
    const dayEl = document.querySelector(".date-part.day");
    const monthEl = document.querySelector(".date-part.month");
    const yearEl = document.querySelector(".date-part.year");

    dayEl.textContent = date.toLocaleDateString("en-US", { day: "numeric" });
    monthEl.textContent = date.toLocaleDateString("en-US", { month: "short" });
    yearEl.textContent = date.toLocaleDateString("en-US", { year: "numeric" });

    dayEl.classList.remove("empty");
    monthEl.classList.remove("empty");
    yearEl.classList.remove("empty");
}

/* ---------------------------------------------------------
   MAJOR SELECTION EDIT MODAL
--------------------------------------------------------- */
const majorEditIcon = document.getElementById("majorEditIcon");
const majorModal = document.getElementById("majorModal");
const majorClose = document.getElementById("majorClose");
const majorApply = document.getElementById("majorApply");

majorEditIcon.addEventListener("click", () => {
    majorModal.style.display = "block";
});
majorClose.addEventListener("click", () => {
    majorModal.style.display = "none";
});
majorApply.addEventListener("click", () => {
    majorModal.style.display = "none";
});

/* ---------------------------------------------------------
   EDIT CARD MODAL
--------------------------------------------------------- */
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalSave = document.getElementById("modalSave");

// Multiple edit buttons
document.querySelectorAll(".edit-card-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        modalBackdrop.classList.remove("hidden");
    });
});

modalClose.addEventListener("click", () => {
    modalBackdrop.classList.add("hidden");
});
modalSave.addEventListener("click", () => {
    modalBackdrop.classList.add("hidden");
});
