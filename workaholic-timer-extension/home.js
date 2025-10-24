const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');
const hours = document.getElementById('hours');
const minutes = document.getElementById('minutes');
const seconds = document.getElementById('seconds');
const dangerZoneThreshold = document.getElementById('danger-zone-threshold');
const loadingMessage = document.getElementById('loading-message');
const mainContent = document.getElementById('main-content');

let updateInterval = null;

// Initialize home ui
void updateUI();

async function updateUI() {
    const response = await getTimerStateWhenIsLoaded();

    loadingMessage.style.display = 'none';
    mainContent.style.display = 'block';

    if(response.goalReached) {
        timerDisplay.textContent = 'Overtime';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        hours.disabled = true;
        minutes.disabled = true;
        seconds.disabled = true;

        return;
    }

    if (!response.isRunning) {
        timerDisplay.textContent = '00:00:00';
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        hours.disabled = false;
        minutes.disabled = false;
        seconds.disabled = false;

        return;
    }

    let currentWorkTime = response.elapsedSeconds;
    timerDisplay.textContent = formatTime(currentWorkTime);
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    hours.disabled = true;
    minutes.disabled = true;
    seconds.disabled = true;

    updateInterval = setInterval(() => {
        currentWorkTime++;
        if(currentWorkTime === response.goalTime) {
            timerDisplay.textContent = 'Overtime';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            hours.disabled = true;
            minutes.disabled = true;
            seconds.disabled = true;

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
        response = await chrome.runtime.sendMessage({ action: "getTimerState" });
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
    const hoursValue = parseInt(hours.value) || 0;
    const minutesValue = parseInt(minutes.value) || 0;
    const secondsValue = parseInt(seconds.value) || 0;
    const goalTime = hoursValue * 3600 + minutesValue * 60 + secondsValue;

    if (goalTime === 0) {
        alert('Please set a goal time greater than 0');
        return;
    }

    const dangerZoneThresholdValue = parseInt(dangerZoneThreshold.value) || 0;
    if (goalTime < dangerZoneThreshold) {
        alert('Please set danger zone threshold greater than goal time');
        return;
    }

    chrome.runtime.sendMessage({
        action: 'startTimer',
        goalTime,
        dangerZoneThreshold: dangerZoneThresholdValue
    }).then(() => {
        void updateUI();
    })
});

stopBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'stopTimer' }).then(() => {
        clearInterval(updateInterval);
        updateInterval = null;

        void updateUI();
    })
});
