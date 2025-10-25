const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');

const workTimeHours = document.getElementById('work-time-hours');
const workTimeMinutes = document.getElementById('work-time-minutes');
const dangerZoneThresholdHours = document.getElementById('danger-zone-threshold-hours');
const dangerZoneThresholdMinutes = document.getElementById('danger-zone-threshold-minutes');

const loadingMessage = document.getElementById('loading-message');
const mainContent = document.getElementById('main-content');

let updateInterval = null;

// Initialize home ui
void updateUI();

async function updateUI() {
    const response = await getTimerStateWhenIsLoaded();

    loadingMessage.style.display = 'none';
    mainContent.style.display = 'block';

    if (response.goalReached) {
        timerDisplay.textContent = 'Overtime';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        workTimeHours.disabled = true;
        workTimeMinutes.disabled = true;

        return;
    }

    if (!response.isRunning) {
        timerDisplay.textContent = '00:00:00';
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        workTimeHours.disabled = false;
        workTimeMinutes.disabled = false;

        return;
    }

    let currentWorkTime = response.elapsedSeconds;
    timerDisplay.textContent = formatTime(currentWorkTime);
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    workTimeHours.disabled = true;
    workTimeMinutes.disabled = true;

    updateInterval = setInterval(() => {
        currentWorkTime++;
        if (currentWorkTime === response.goalTime) {
            timerDisplay.textContent = 'Overtime';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            workTimeHours.disabled = true;
            workTimeMinutes.disabled = true;

            clearInterval(updateInterval);
            updateInterval = null;

            return;
        }

        timerDisplay.textContent = formatTime(currentWorkTime);
    }, 1000);
}

async function getTimerStateWhenIsLoaded() {
    let response;
    while (true) {
        response = await chrome.runtime.sendMessage({ action: 'getTimerState' });
        if (response.timerStateLoadedFromStorage) break;
        await new Promise(r => setTimeout(r, 100));
    }
    return response;
}

// noinspection DuplicatedCode
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

startBtn.addEventListener('click', async () => {
    const workTimeHoursValue = parseInt(workTimeHours.value) || 0;
    const workTimeMinutesValue = parseInt(workTimeMinutes.value) || 0;
    const goalTime = workTimeHoursValue * 3600 + workTimeMinutesValue * 60;

    if (goalTime === 0) {
        alert('Please set a goal time greater than 0');
        return;
    }

    const dangerZoneThresholdHoursValue = parseInt(dangerZoneThresholdHours.value) || 0;
    const dangerZoneThresholdMinutesValue = parseInt(dangerZoneThresholdMinutes.value) || 0;
    const dangerZoneThreshold = dangerZoneThresholdHoursValue * 3600 + dangerZoneThresholdMinutesValue * 60;

    if (goalTime < dangerZoneThreshold) {
        alert('Please set danger zone threshold greater than goal time');
        return;
    }

    chrome.runtime.sendMessage({
        action: 'startTimer',
        goalTime,
        dangerZoneThreshold,
    }).then(() => {
        void updateUI();
    });
});

stopBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'stopTimer' }).then(() => {
        clearInterval(updateInterval);
        updateInterval = null;

        void updateUI();
    });
});
