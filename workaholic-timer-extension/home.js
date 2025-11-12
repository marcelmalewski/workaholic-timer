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
const settingsBtn = document.getElementById('settings-btn');
const settingsView = document.getElementById('settings-view');
const addConfigBtn = document.getElementById('add-config-btn');
const backBtn = document.getElementById('back-btn');
const configsList = document.getElementById('configs-list');

const editConfigView = document.getElementById('edit-config-view');
const editNameInput = document.getElementById('edit-name');
const editGoalInput = document.getElementById('edit-goal');
const editDangerZoneInput = document.getElementById('edit-danger-zone');
const saveEditBtn = document.getElementById('save-edit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

let updateInterval = null;
let configs = [];
let currentConfigIndex = 0;
let editingConfigIndex = null;

void initializeHomeUI();
async function initializeHomeUI() {
    await loadConfigsFromStorage();
    loadConfigsToSelector();
    void updateHomeUI();
}

async function loadConfigsFromStorage() {
    const result = await chrome.storage.local.get('configs');
    configs = result.configs || [];
    if (configs.length === 0) {
        configs = [{
            name: 'Default',
            goalTime: 1800,
            dangerZoneThreshold: 2100
        }];
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

settingsBtn.addEventListener('click', () => {
    mainView.style.display = 'none';
    settingsView.style.display = 'block';
    renderConfigsList();
});

saveEditBtn.addEventListener('click', async () => {
    const name = editNameInput.value.trim();
    const goal = Number(editGoalInput.value || 0) * 60;
    const danger = Number(editDangerZoneInput.value || 0) * 60;

    if (!name) {
        alert('Please enter a configuration name.');
        return;
    }
    if (goal <= 0) {
        alert('Goal time must be greater than zero.');
        return;
    }
    if (danger <= goal) {
        alert('Danger zone must be greater than the goal time.');
        return;
    }

    const newConfig = { name, goalTime: goal, dangerZoneThreshold: danger };
    if (editingConfigIndex === null) {
        configs.push(newConfig);
    } else {
        configs[editingConfigIndex] = newConfig;
    }

    await saveConfigs();
    loadConfigsToSelector();
    renderConfigsList();
    settingsView.style.display = 'block';
    editConfigView.style.display = 'none';
});

function renderConfigsList() {
    while (configsList.firstChild) {
        configsList.removeChild(configsList.firstChild);
    }

    configs.forEach((config, index) => {
        const configItemElement = document.createElement('div');
        configItemElement.className = 'config-item';

        const infoElement = document.createElement('div');
        infoElement.className = 'config-info';

        const nameElement = document.createElement('strong');
        nameElement.textContent = config.name;
        infoElement.appendChild(nameElement);

        const configValuesElement = document.createElement('span');
        const goalMinutes = Math.floor(config.goalTime / 60);
        const dangerMinutes = Math.floor(config.dangerZoneThreshold / 60);
        configValuesElement.textContent = `${goalMinutes} min / ${dangerMinutes} min`;
        infoElement.appendChild(configValuesElement);

        configItemElement.appendChild(infoElement);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'config-actions';

        const editButtonElement = document.createElement('button');
        editButtonElement.textContent = 'Edit';
        editButtonElement.className = 'edit-button';
        editButtonElement.addEventListener('click', () => {
            editingConfigIndex = index;
            const cfg = configs[index];
            editNameInput.value = cfg.name;
            editGoalInput.value = Math.floor(cfg.goalTime / 60);
            editDangerZoneInput.value = Math.floor(cfg.dangerZoneThreshold / 60);
            settingsView.style.display = 'none';
            editConfigView.style.display = 'block';
        });
        buttonContainer.appendChild(editButtonElement);

        if (index > 0) {
            const deleteButtonElement = document.createElement('button');
            deleteButtonElement.textContent = 'Delete';
            deleteButtonElement.className = 'delete-button';
            deleteButtonElement.addEventListener('click', async () => {
                if (!confirm('Delete this config?')) return;
                configs.splice(index, 1);
                await saveConfigs();
                loadConfigsToSelector();
                renderConfigsList();
            });
            buttonContainer.appendChild(deleteButtonElement);
        }

        configItemElement.appendChild(buttonContainer);
        configsList.appendChild(configItemElement);
    });
}


addConfigBtn.addEventListener('click', () => {
    if (configs.length >= 3) {
        alert('You can only have up to 3 configs.');
        return;
    }

    editingConfigIndex = null;
    editNameInput.value = '';
    editGoalInput.value = '';
    editDangerZoneInput.value = '';
    settingsView.style.display = 'none';
    editConfigView.style.display = 'block';
});

backBtn.addEventListener('click', () => {
    settingsView.style.display = 'none';
    mainView.style.display = 'block';
});

cancelEditBtn.addEventListener('click', () => {
    settingsView.style.display = 'block';
    editConfigView.style.display = 'none';
});

