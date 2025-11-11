let devSetup = true;

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('timer-display');

const goalTimeHours = document.getElementById('goal-time-hours');
const goalTimeMinutes = document.getElementById('goal-time-minutes');
const dangerZoneThresholdHours = document.getElementById('danger-zone-threshold-hours');
const dangerZoneThresholdMinutes = document.getElementById('danger-zone-threshold-minutes');

const loadingMessage = document.getElementById('loading-message');
const mainView = document.getElementById('main-view');

const configSelector = document.getElementById('config-selector');

let updateInterval = null;
let configs = [];
let currentConfigIndex = 0;

void initializeHomeUI();
async function initializeHomeUI() {
    await loadConfigsFromStorage();
    loadConfigsToSelector();
    void updateHomeUI();
}

async function loadConfigsFromStorage() {
    const configsFromStorage = await chrome.storage.local.get('configs')
    if(devSetup) {
        configs = [{
            name: 'Default',
            goalTime: 1800,
            dangerZoneThreshold: 2100
        }];
        await saveConfigs();
        return;
    }

    configs = configsFromStorage || [];
    if (configs.length === 0) {
        configs = [{
            name: 'Default',
            goalTime: 1800,
            dangerZoneThreshold: 2100
        }]
        await saveConfigs();
    }
}

async function saveConfigs() {
    await chrome.storage.local.set({ configs });
}

function loadConfigsToSelector() {
    while (configSelector.firstChild) {
        configSelector.removeChild(configSelector.firstChild);
    }

    for (let i = 0; i < configs.length; i++) {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = configs[i].name;
        configSelector.appendChild(option);
    }

    if (currentConfigIndex >= configs.length) {
        currentConfigIndex = 0;
    }

    configSelector.value = String(currentConfigIndex);
    applyConfig(configs[currentConfigIndex]);

    if (!configSelector._listenerAdded) {
        configSelector.addEventListener('change', () => {
            currentConfigIndex = Number(configSelector.value);
            applyConfig(configs[currentConfigIndex]);
        });
        configSelector._listenerAdded = true;
    }
}


function applyConfig(config) {
    goalTimeHours.value = Math.floor(config.goalTime / 3600);
    goalTimeMinutes.value = Math.floor((config.goalTime % 3600) / 60);
    dangerZoneThresholdHours.value = Math.floor(config.dangerZoneThreshold / 3600);
    dangerZoneThresholdMinutes.value = Math.floor((config.dangerZoneThreshold % 3600) / 60);
}

async function updateHomeUI() {
    const response = await getTimerStateWhenIsLoaded();

    if (response.goalTime) {
        goalTimeHours.value = Math.floor(response.goalTime / 3600);
        goalTimeMinutes.value = Math.floor((response.goalTime % 3600) / 60);
    }

    if (response.dangerZoneThreshold) {
        dangerZoneThresholdHours.value = Math.floor(response.dangerZoneThreshold / 3600);
        dangerZoneThresholdMinutes.value = Math.floor((response.dangerZoneThreshold % 3600) / 60);
    }

    if (response.goalReached) {
        timerDisplay.textContent = 'Overtime';
        setWorkTimeIsRunningState();
        changeLoadingScreenToHomeScreen();

        return;
    }
    if (!response.isRunning) {
        timerDisplay.textContent = '00:00:00';
        setWorkTimeNotRunningState();
        changeLoadingScreenToHomeScreen();

        return;
    }

    let currentWorkTime = response.currentWorkTime;
    timerDisplay.textContent = formatTime(currentWorkTime);
    setWorkTimeIsRunningState();
    changeLoadingScreenToHomeScreen();

    updateInterval = setInterval(() => {
        currentWorkTime++;
        if (currentWorkTime === response.goalTime) {
            timerDisplay.textContent = 'Overtime';
            clearInterval(updateInterval);
            updateInterval = null;

            return;
        }

        timerDisplay.textContent = formatTime(currentWorkTime);
    }, 1000);
}

function changeLoadingScreenToHomeScreen() {
    loadingMessage.style.display = 'none';
    mainView.style.display = 'block';
}

function setWorkTimeIsRunningState() {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    goalTimeHours.disabled = true;
    goalTimeMinutes.disabled = true;
    dangerZoneThresholdHours.disabled = true;
    dangerZoneThresholdMinutes.disabled = true;
}

function setWorkTimeNotRunningState() {
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    goalTimeHours.disabled = false;
    goalTimeMinutes.disabled = false;
    dangerZoneThresholdHours.disabled = false;
    dangerZoneThresholdMinutes.disabled = false;
}

async function getTimerStateWhenIsLoaded() {
    let response;
    while (true) {
        response = await chrome.runtime.sendMessage({ action: 'getTimerState' });
        if (response.timerStateLoadedFromStorage) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return response;
}

// noinspection DuplicatedCode
function formatTime(timeInSeconds) {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

startBtn.addEventListener('click', async () => {
    const goalTimeHoursValue = parseInt(goalTimeHours.value) || 0;
    const goalTimeMinutesValue = parseInt(goalTimeMinutes.value) || 0;
    const goalTime = goalTimeHoursValue * 3600 + goalTimeMinutesValue * 60;
    if (goalTime === 0) {
        alert('Goal time must be greater than zero');
        return;
    }

    const dangerZoneThresholdHoursValue = parseInt(dangerZoneThresholdHours.value) || 0;
    const dangerZoneThresholdMinutesValue = parseInt(dangerZoneThresholdMinutes.value) || 0;
    const dangerZoneThreshold = dangerZoneThresholdHoursValue * 3600 + dangerZoneThresholdMinutesValue * 60;
    if (goalTime > dangerZoneThreshold) {
        alert('The danger zone threshold must be greater than the goal time');
        return;
    }

    chrome.runtime.sendMessage({
        action: 'startTimer',
        goalTime,
        dangerZoneThreshold,
    }).then(() => {
        void updateHomeUI();
    });
});

stopBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'stopTimer' }).then(() => {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }

        void updateHomeUI();
    });
});
