// Configuration Variables
// This variable is now expected to be defined in a script tag in index.html
const timeAccelarator = document.body.dataset.timeAccelerator || 1;
const msPerSec = 1000 / timeAccelarator;

// Thresholds (in simulated milliseconds)
// These will be calculated once timeAccelarator is determined
const YELLOW_THRESHOLD = 25 * 60 * msPerSec;
const RED_THRESHOLD = 40 * 60 * msPerSec;
const AUTO_RECORD_THRESHOLD = 50 * 60 * msPerSec;
// Break timer thresholds in milliseconds
const DEFAULT_BREAK_TIME = 5 * 60 * msPerSec;
const YELLOW_BREAK_TIME = 10 * 60 * msPerSec;
const RED_BREAK_TIME = 15 * 60 * msPerSec;

// DOM Element References
const mainTimerDisplay = document.getElementById('mainTimerDisplay');
const continuousTimerDisplay = document.getElementById('continuousTimerDisplay');
const startButton = document.getElementById('startButton');
const pauseButton = document.getElementById('pauseButton');
const cancelButton = document.getElementById('cancelButton');
const recordButton = document.getElementById('recordButton');
const referenceText = document.getElementById('referenceText');
const entriesTableBody = document.querySelector('#entriesTable tbody');
const pearFruitFlesh = document.querySelector('#pear-fruit #flesh');
const themeToggle = document.getElementById('themeToggle');
const copyButton = document.getElementById('copyButton');
const clearButton = document.getElementById('clearButton');
const customModal = document.getElementById('customModal');
const modalContent = document.getElementById('modalContent');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const continuousTimerLabel = document.querySelector('.continuous-timer-panel .timer-label');

// Tone.js Synths for Audio Feedback
const toneSynth = new Tone.Synth({
            oscillator: { type: "sine" },
            envelope: { attack: 0.1, decay: 1, release: 0.4 }
        }).toDestination();

// Timer State Variables
let startTimeContinuous = 0;
let elapsedTimeContinuous = 0;
let maxFocusTimeMs = 0; // Tracks the maximum value of any continuous session
let mainTimerSegmentStartTime = 0;
let elapsedTimeMain = 0;
let timerInterval = null;
let isMainTimerRunning = false;
let isContinuousTimerRunning = false;
let isBreakTimerRunning = false;
let breakTimeRemaining = 0;

// Color State and Auto-Record Flag
let hasReachedYellow = false;
let hasReachedRed = false;
let hasStoppedAutomatically = false;

// Pear color set functions

function setPearColor(targetColor) {
    switch (targetColor) {
        case 'Green':
            pearFruitFlesh.classList.replace('yellow-pear', 'green-pear');
            pearFruitFlesh.classList.replace('red-pear', 'green-pear');
            break;
        case 'Yellow':
            pearFruitFlesh.classList.replace('green-pear', 'yellow-pear');
            pearFruitFlesh.classList.replace('red-pear', 'yellow-pear');
            break;
        case 'Red':
            pearFruitFlesh.classList.replace('green-pear', 'red-pear');
            pearFruitFlesh.classList.replace('yellow-pear', 'red-pear');
            break;
    }
};

// Format milliseconds into HH:MM:SS format
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / msPerSec);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Play sound based on state
async function playSound(state) {
    switch (state) {
        case "Yellow":
            toneSynth.triggerAttackRelease("C5", "0.1");
            break;
        case "Red":
            toneSynth.triggerAttackRelease("E5", "0.3");
            break;
        case "Cancel":
            toneSynth.triggerAttackRelease("G5", "0.5");
            break;
    }
}

// Generates a simple hash of a string
function generateHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

// Shows a custom Modal
function showModal(title, message, isConfirm = false) {
    return new Promise((resolve) => {
        let existingTitle = document.getElementById('modalTitle');
        if (existingTitle) {
            existingTitle.remove();
        }

        const newTitle = document.createElement('h3');
        newTitle.id = 'modalTitle';
        newTitle.className = 'modal-title';
        newTitle.textContent = title;
        modalContent.prepend(newTitle);

        modalMessage.textContent = message;
        modalConfirmBtn.classList.add('hidden');
        modalCancelBtn.textContent = 'Close';

        if (isConfirm) {
            modalConfirmBtn.classList.remove('hidden');
            modalCancelBtn.textContent = 'Cancel';
            modalConfirmBtn.onclick = () => {
                customModal.classList.add('hidden');
                resolve(true);
            };
            modalCancelBtn.onclick = () => {
                customModal.classList.add('hidden');
                resolve(false);
            };
        } else {
            modalCancelBtn.onclick = () => {
                customModal.classList.add('hidden');
                resolve(false);
            };
        }
        customModal.classList.remove('hidden');
    });
}

// Update Timers and UI
function updateTimers() {
    const now = Date.now();

    // Update continuous timer or break timer
    if (isContinuousTimerRunning) {
        elapsedTimeContinuous = now - startTimeContinuous;
        continuousTimerDisplay.textContent = formatTime(elapsedTimeContinuous);
    } else if (isBreakTimerRunning) {
        // Break timer counts down
        breakTimeRemaining -= msPerSec;
        if (breakTimeRemaining <= 0) {
            breakTimeRemaining = 0;
            stopBreakTimer();
        }
        continuousTimerDisplay.textContent = formatTime(breakTimeRemaining);
    }

    // Update main timer
    let currentMainTime = elapsedTimeMain;
    if (isMainTimerRunning) {
        const currentSegmentTime = now - mainTimerSegmentStartTime;
        currentMainTime = elapsedTimeMain + currentSegmentTime;
        mainTimerDisplay.textContent = formatTime(currentMainTime);
    }

    // Check for color changes and play sounds
    if (elapsedTimeContinuous >= YELLOW_THRESHOLD && !hasReachedYellow) {
        setPearColor('Yellow');
        hasReachedYellow = true;
        playSound("Yellow");
    }
    if (elapsedTimeContinuous >= RED_THRESHOLD && !hasReachedRed) {
        setPearColor('Red');;
        hasReachedRed = true;
        playSound("Red");
    }

    // Auto-record at maximum time threshold
    if (elapsedTimeContinuous >= AUTO_RECORD_THRESHOLD && !hasStoppedAutomatically) {
        hasStoppedAutomatically = true;
        playSound("Cancel");
        recordEntry();
    }
}

// Reset Functions
//****************************************************************************************************
function resetContinuousTimerState() {
    elapsedTimeContinuous = 0;
    startTimeContinuous = 0;
    continuousTimerDisplay.textContent = '00:00:00';
    setPearColor('Green');
    hasReachedYellow = false;
    hasReachedRed = false;
    hasStoppedAutomatically = false;
    continuousTimerLabel.textContent = 'Focus Time';
}

function resetMainTimerState() {
    elapsedTimeMain = 0;
    mainTimerSegmentStartTime = 0;
    mainTimerDisplay.textContent = '00:00:00';
    referenceText.value = '';
}
//****************************************************************************************************
function startBreakTimer() {
    // Before starting the break, check and update maxFocusTimeMs with the latest continuous session.
    // Note: maxFocusTimeMs is NOT reset here, as it should persist until the user records or cancels.
    if (elapsedTimeContinuous > maxFocusTimeMs) {
        maxFocusTimeMs = elapsedTimeContinuous;
    }

    // Stop the running interval before starting the new one.
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    // Determine break duration based on the just-finished focus time
    if (hasReachedRed) {
        breakTimeRemaining = RED_BREAK_TIME;
    } else if (hasReachedYellow) {
        breakTimeRemaining = YELLOW_BREAK_TIME;
    } else {
        breakTimeRemaining = DEFAULT_BREAK_TIME;
    }

    isContinuousTimerRunning = false;
    isBreakTimerRunning = true;
    continuousTimerLabel.textContent = 'Break Time';
    setPearColor('Green'); // New color for break

    // Start a new interval for the break countdown.
    timerInterval = setInterval(updateTimers, msPerSec);

    startButton.disabled = true;
    pauseButton.disabled = true;
    cancelButton.disabled = false;
    recordButton.disabled = false;
}

function stopBreakTimer() {

    // Stop the break timer interval.
    clearInterval(timerInterval);
    timerInterval = null;
    isBreakTimerRunning = false;

    // Reset continuous timer state for a new session.
    resetContinuousTimerState();

    // Re-enable start button to resume focus time
    startButton.textContent = 'Resume';
    startButton.disabled = false;
    pauseButton.disabled = true;
    cancelButton.disabled = false;
    recordButton.disabled = false;
}

// Button Functionality
//****************************************************************************************************
async function startTimer() {

    // Only start if not already running.
    if (!isMainTimerRunning) {
        isMainTimerRunning = true;
        mainTimerSegmentStartTime = Date.now();
    }

    // Start or resume the continuous timer
    if (!isContinuousTimerRunning) {
        isContinuousTimerRunning = true;
        startTimeContinuous = Date.now() - elapsedTimeContinuous; // Use this to resume from the last value.
    }

    // Clear any existing timer to prevent multiple intervals.
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    timerInterval = setInterval(updateTimers, msPerSec);
    startButton.disabled = true;
    pauseButton.disabled = false;
    cancelButton.disabled = false;
    recordButton.disabled = false;
}

function pauseTimer() {
    // Before pausing, add the current continuous segment time to the elapsed time.
    if (isContinuousTimerRunning) {
        elapsedTimeContinuous = Date.now() - startTimeContinuous;
        isContinuousTimerRunning = false;
    }

    if (isMainTimerRunning) {
        // Pause the main timer by adding the current segment time to the total elapsed time
        elapsedTimeMain += Date.now() - mainTimerSegmentStartTime;
        isMainTimerRunning = false;
    }

    clearInterval(timerInterval);
    timerInterval = null;

    // Transition to break time.
    startBreakTimer();
}

function cancelTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    isMainTimerRunning = false;
    isContinuousTimerRunning = false;
    isBreakTimerRunning = false;

    // Reset all timer states, including maxFocusTimeMs
    resetMainTimerState();
    resetContinuousTimerState();
    maxFocusTimeMs = 0;

    startButton.textContent = 'Start';
    startButton.disabled = false;
    pauseButton.disabled = true;
    cancelButton.disabled = true;
    recordButton.disabled = true;
}
function recordEntry() {
    // Before recording, make sure the final segment is included in maxFocusTimeMs
    // This logic ensures that even if the timer is paused for a break,
    // the max focus time from the previous session is captured correctly.
    if (isContinuousTimerRunning) {
        elapsedTimeContinuous = Date.now() - startTimeContinuous;
    }
    if (elapsedTimeContinuous > maxFocusTimeMs) {
        maxFocusTimeMs = elapsedTimeContinuous;
    }

    if (isMainTimerRunning) {
        elapsedTimeMain += Date.now() - mainTimerSegmentStartTime;
    }

    const timeRecorded = formatTime(elapsedTimeMain);
    const textReference = referenceText.value.trim();
    // Use the new maxFocusTimeMs variable
    const maxFocusTimeFormatted = formatTime(maxFocusTimeMs);

    if (elapsedTimeMain === 0) {
        showModal('Cannot Record', 'The timer is at 00:00:00. Please start the timer before recording.');
        return;
    }

    const newRow = entriesTableBody.insertRow(0);

    const rowData = `${timeRecorded}${textReference}${maxFocusTimeFormatted}`;
    const id = generateHash(rowData);

    newRow.insertCell().textContent = id;
    newRow.insertCell().textContent = timeRecorded;
    newRow.insertCell().textContent = textReference;
    newRow.insertCell().textContent = maxFocusTimeFormatted;

    // Reset both timers and the max focus time after recording
    cancelTimer();
}
async function copyTable() {
    let tableText = "ID\tTotal Task Time\tReference\tMax Focus Time\n";
    entriesTableBody.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 4) {
            tableText += `${cells[0].innerText}\t${cells[1].innerText}\t${cells[2].innerText}\t${cells[3].innerText}\n`;
        }
    });

    try {
        await navigator.clipboard.writeText(tableText);
        copyButton.textContent = 'Copied!';
        setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showModal('Copy Error', 'Failed to copy table to clipboard. Your browser may not support this action or it is blocked by the environment. Please manually copy the data.');
    }
}

function clearTable() {
    if (entriesTableBody.rows.length > 0) {
        showModal('Clear Entries', 'Are you sure you want to clear all recorded entries? This cannot be undone.', true).then(result => {
            if (result) {
                entriesTableBody.innerHTML = '';
            }
        });
    } else {
        showModal('info', 'The table is already empty.');
    }
}

// Theme Toggle

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        themeToggle.checked = true;
    } else if (theme === 'light') {
        document.documentElement.classList.remove('dark-mode');
        themeToggle.checked = false;
    }
}
themeToggle.addEventListener('change', () => {
    const newTheme = themeToggle.checked ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
});
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    startButton.addEventListener('click', startTimer);
    startButton.addEventListener('click', () => {
        Tone.start();
    }, { once: true });
    pauseButton.addEventListener('click', pauseTimer);
    cancelButton.addEventListener('click', cancelTimer);
    recordButton.addEventListener('click', recordEntry);
    copyButton.addEventListener('click', copyTable);
    clearButton.addEventListener('click', clearTable);
});

