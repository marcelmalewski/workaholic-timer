let timerState = {
    timerStateLoadedFromStorage: false,
    isRunning: false,
    startTime: null,
    goalTime: null,
    goalTimeFormatted: null,
    goalReached: false,
    dangerZoneThreshold: null,
    lastNotificationTabId: null, // TODO lepsza nazwa
};
let alarmName = 'workaholicTimer';

// Initialize timer state
void loadTimerState();

async function loadTimerState() {
    const result = await chrome.storage.local.get('timerState');
    if (result.timerState) {
        timerState = result.timerState;
    }
    timerState.timerStateLoadedFromStorage = true;
}

async function injectWorkTimeFloatingBoxIntoTab(goalTimeFormatted, workTimeAtInject, dangerZoneThreshold) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return;
        const tab = tabs[0];

        if (!tab.url || tab.url.startsWith('chrome://')) {
            return;
        }
        // TODO to blokuje refresh bo wtedy last tab jest ten sam co current
        if (timerState.lastNotificationTabId === tab.id) {
            return;
        }
        if (timerState.lastNotificationTabId) {
            await removeNotificationFromTab(timerState.lastNotificationTabId);
        }

        timerState.lastNotificationTabId = tab.id;
        void saveTimerState();

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (goalTimeFormatted, workTimeAtInject, dangerZoneThreshold) => {
                let dangerZoneThresholdReached = false;

                const box = document.createElement('div');
                box.id = '__workTime_floating_box_v1__';
                makeElementDraggable(box);

                const span = document.createElement('span');
                span.textContent = `⏱ Goal time: ${goalTimeFormatted} | Current time: `;

                const currentTimeSpan = document.createElement('span');
                currentTimeSpan.id = '__current_workTime__';
                currentTimeSpan.textContent = formatTime(workTimeAtInject);

                span.appendChild(currentTimeSpan);
                box.appendChild(span);

                const inDangerZone = workTimeAtInject >= dangerZoneThreshold;
                box.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${inDangerZone ? '#dc3545' : '#28a745'};
                    color: white;
                    padding: 15px 20px;
                    border-radius: 8px;
                    font-family: sans-serif;
                    font-size: 15px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    z-index: 2147483647;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                if (inDangerZone) {
                    currentTimeSpan.style.fontSize = '22px';
                    currentTimeSpan.style.fontWeight = 'bold';

                    dangerZoneThresholdReached = true;
                }
                document.body.appendChild(box);

                const currentTimeEl = document.getElementById('__current_workTime__');
                let currentWorkTime = workTimeAtInject;
                currentTimeEl.textContent = formatTime(currentWorkTime);

                const workTimeInterval = setInterval(() => {
                    currentWorkTime++;
                    currentTimeEl.textContent = formatTime(currentWorkTime);

                    if (currentWorkTime >= dangerZoneThreshold && !dangerZoneThresholdReached) {
                        box.style.background = '#dc3545';
                        currentTimeEl.style.fontSize = '22px';
                        currentTimeEl.style.fontWeight = 'bold';

                        dangerZoneThresholdReached = true;
                    }
                }, 1000);
                box.dataset.workTimeInterval = String(workTimeInterval);

                // noinspection DuplicatedCode
                function formatTime(totalSeconds) {
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    const s = totalSeconds % 60;
                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }

                function makeElementDraggable(element) {
                    let offsetX, offsetY, isDragging = false;

                    requestAnimationFrame(() => {
                        element.style.cursor = 'grab';
                    });

                    element.addEventListener('mousedown', (event) => {
                        if (event.button !== 0) return;

                        isDragging = true;
                        offsetX = event.clientX - element.getBoundingClientRect().left;
                        offsetY = event.clientY - element.getBoundingClientRect().top;
                        element.style.cursor = 'grabbing';
                        event.preventDefault();
                    });

                    document.addEventListener('mousemove', (event) => {
                        if (!isDragging) return;
                        element.style.top = `${event.clientY - offsetY}px`;
                        element.style.left = `${event.clientX - offsetX}px`;
                        element.style.right = 'auto';
                        element.style.bottom = 'auto';
                    });

                    document.addEventListener('mouseup', () => {
                        if (isDragging) {
                            isDragging = false;
                            element.style.cursor = 'grab';
                        }
                    });

                    element.style.cursor = 'grab';
                }
            },
            args: [goalTimeFormatted, workTimeAtInject, dangerZoneThreshold],
        });
    } catch (err) {
        timerState.lastNotificationTabId = null;
        void saveTimerState();
        console.error(`Error in injectNotificationIntoTab: ${err}`);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === alarmName) {
        const currentWorkTime = getCurrentWorkTime();
        if (currentWorkTime >= 2) { // TODO remove "2"
            timerState.goalTimeFormatted = formatTime(timerState.goalTime);
            timerState.goalReached = true;

            void chrome.alarms.clear(alarmName);
            void injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
        }
    }
});

// On change tab
chrome.tabs.onActivated.addListener((_) => {
    if (timerState.goalReached && timerState.isRunning) {
        void injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
    }
});

// On change window focus
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    if (timerState.goalReached && timerState.isRunning) {
        void injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
    }
});

// On window refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _) => {
    if (changeInfo.status === 'complete' && timerState.goalReached && timerState.isRunning) {
        chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            if (tabs.length > 0 && tabs[0].id === tabId) {
                void injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
            }
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startTimer') {
        timerState.isRunning = true;
        timerState.startTime = Date.now();
        timerState.goalTime = request.goalTime;
        timerState.goalReached = false;
        timerState.dangerZoneThreshold = request.dangerZoneThreshold;

        void saveTimerState();
        void chrome.alarms.create(alarmName, { periodInMinutes: 1 / 60 });

        sendResponse({ success: true });
    } else if (request.action === 'stopTimer') {
        timerState.isRunning = false;
        timerState.startTime = null;
        timerState.goalTime = null;
        timerState.goalReached = false;
        timerState.dangerZoneThreshold = null;

        void chrome.alarms.clear(alarmName);
        if (timerState.lastNotificationTabId) {
            void removeNotificationFromTab(timerState.lastNotificationTabId);
            timerState.lastNotificationTabId = null;
        }
        void saveTimerState();

        sendResponse({ success: true });
    } else if (request.action === 'getTimerState') {
        sendResponse({
            isRunning: timerState.isRunning,
            currentWorkTime: getCurrentWorkTime(),
            goalTime: timerState.goalTime,
            goalReached: timerState.goalReached,
            timerStateLoadedFromStorage: timerState.timerStateLoadedFromStorage,
        });
    }
    return true;
});

function getCurrentWorkTime() {
    if (!timerState.isRunning) return 0;
    return Math.round((Date.now() - timerState.startTime) / 1000);
}

// noinspection DuplicatedCode
function formatTime(timeInSeconds) {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function removeNotificationFromTab(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId }, world: 'MAIN', func: () => {
                const workTimeFloatingBoxId = '__workTime_floating_box_v1__';
                const workTimeFloatingBox = document.getElementById(workTimeFloatingBoxId);
                if (workTimeFloatingBox) {
                    if (workTimeFloatingBox.dataset.workTimeInterval) clearInterval(Number(workTimeFloatingBox.dataset.workTimeInterval));
                    workTimeFloatingBox.remove();
                }
            },
        });
    } catch (err) {
        // TODO czasem leci ten error
        console.error(`Could not remove notification from tab ${tabId}:`, err);
    }
}

async function saveTimerState() {
    await chrome.storage.local.set({ timerState });
}
