let timerState = {
    timerStateLoadedFromStorage: false,
    isRunning: false,
    startTime: null,
    goalTime: 0,
    goalTimeFormatted: "",
    goalReached: false,
    lastNotificationTabId: null
};
let alarmName = "workaholicTimer";

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
        if (timerState.lastNotificationTabId) {
            await removeNotificationFromTab(timerState.lastNotificationTabId);
            timerState.lastNotificationTabId = null;
        }

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return;

        const tab = tabs[0];
        // TODO co to zmienia?
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
            return;
        }
        timerState.lastNotificationTabId = tab.id;

        void saveTimerState();

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (goalTimeFormatted, workTimeAtInject, dangerZoneThreshold) => {
                const ID = "__workTime_floating_box_v1__";

                // TODO raczej to jest obsługiwanie sytuacji która nie powinna zajść
                const existing = document.getElementById(ID);
                if (existing) {
                    if (existing.dataset.overTimerInterval) clearInterval(Number(existing.dataset.overTimerInterval));
                    existing.remove();
                }

                const box = document.createElement("div");
                box.id = ID;
                const span = document.createElement("span");
                span.innerHTML = `⏱ Goal time: ${goalTimeFormatted} | Current time: <span id="__current_workTime__">${formatTime(workTimeAtInject)}</span>`;
                box.appendChild(span);

                const inDangerZone = workTimeAtInject >= dangerZoneThreshold;
                box.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${inDangerZone ? "#dc3545" : "#28a745"};
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
                    const currentTimeEl = span.querySelector("#__current_workTime__");
                    currentTimeEl.style.fontSize = "22px";
                    currentTimeEl.style.fontWeight = "bold";
                }
                document.body.appendChild(box);

                const currentTimeEl = document.getElementById("__current_workTime__");
                let currentWorkTime = workTimeAtInject;
                currentTimeEl.textContent = formatTime(currentWorkTime);

                const interval = setInterval(() => {
                    currentWorkTime++;
                    currentTimeEl.textContent = formatTime(currentWorkTime);

                    if (currentWorkTime >= dangerZoneThreshold) {
                        //TODO wystarczy, że wydarzy się tylko raz
                        box.style.background = "#dc3545";
                        currentTimeEl.style.fontSize = "22px";
                        currentTimeEl.style.fontWeight = "bold";
                    }
                }, 1000);
                box.dataset.overTimerInterval = String(interval);

                // noinspection DuplicatedCode
                function formatTime(totalSeconds) {
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    const s = totalSeconds % 60;
                    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                }
            },
            args: [goalTimeFormatted, workTimeAtInject, dangerZoneThreshold]
        });
    } catch (err) {
        // TODO co musi się stać by to wywołać?
        timerState.lastNotificationTabId = null;
        void saveTimerState();

        alert(`Error in injectNotificationIntoTab: ${err.message}`);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === alarmName && timerState.isRunning) {
        const currentWorkTime = getCurrentWorkTime();
        if (!timerState.goalReached && currentWorkTime >= timerState.goalTime) {
            timerState.goalTimeFormatted = formatTime(timerState.goalTime)
            timerState.goalReached = true;

            void chrome.alarms.clear(alarmName);
            void createWorkTimeFloatingBox();
        }
    }
});

async function createWorkTimeFloatingBox() {
    await injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
}

chrome.tabs.onActivated.addListener(async (_) => {
    if (timerState.goalReached && timerState.isRunning) {
        await injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    if (timerState.goalReached && timerState.isRunning) {
        await injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, getCurrentWorkTime(), timerState.dangerZoneThreshold);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startTimer") {
        timerState.isRunning = true;
        timerState.startTime = Date.now();
        timerState.goalTime = request.goalTime;
        timerState.goalReached = false;
        timerState.dangerZoneThreshold = request.dangerZoneThreshold
        void saveTimerState();

        void chrome.alarms.create(alarmName, { periodInMinutes: 1 / 60 });
        sendResponse({ success: true });
    } else if (request.action === "stopTimer") {
        timerState.isRunning = false;
        timerState.startTime = null;
        timerState.goalReached = false;

        void chrome.alarms.clear(alarmName);
        if (timerState.lastNotificationTabId) {
            void removeNotificationFromTab(timerState.lastNotificationTabId);
            timerState.lastNotificationTabId = null;
        }
        void saveTimerState();

        sendResponse({ success: true });
    } else if (request.action === "getTimerState") {
        sendResponse({
            isRunning: timerState.isRunning,
            elapsedSeconds: getCurrentWorkTime(),
            goalReached: timerState.goalReached,
            goalTime: timerState.goalTime,
            timerStateLoadedFromStorage: timerState.timerStateLoadedFromStorage
        });
    }
    return true;
});

function getCurrentWorkTime() {
    if (!timerState.isRunning || !timerState.startTime) return 0;
    return Math.round((Date.now() - timerState.startTime) / 1000);
}

// noinspection DuplicatedCode
function formatTime(workTime) {
    const hours = Math.floor(workTime / 3600);
    const minutes = Math.floor((workTime % 3600) / 60);
    const seconds = workTime % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function removeNotificationFromTab(tabId) {
    if (!tabId) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: "MAIN",
            func: () => {
                const ID = "__workTime_floating_box_v1__";
                const existing = document.getElementById(ID);
                if (existing) {
                    if (existing.dataset.overTimerInterval) clearInterval(Number(existing.dataset.overTimerInterval));
                    existing.remove();
                }
            }
        });
    } catch (err) {
        // TODO co musi się stać by to wywołać?
        alert(`Could not remove notification from tab ${tabId}: ${err.message}`);
    }
}

// Save state whenever it changes
async function saveTimerState() {
    await chrome.storage.local.set({ timerState });
}
