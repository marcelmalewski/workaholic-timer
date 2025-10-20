let timerState = {
    isRunning: false,
    startTime: null,
    goalSeconds: 0,
    goalReached: false,
    goalTimeFormatted: "",
    lastNotificationTabId: null
};
let alarmName = "workaholicTimer";

async function injectWorkTimeFloatingBoxIntoTab(goalTimeFormatted, elapsedAtInject) {
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

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (goalTime, initialElapsed) => {
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
                span.innerHTML = `⏱ Goal time: ${goalTime} | Current time: <span id="__current_workTime__">${formatTime(initialElapsed)}</span>`;
                box.appendChild(span);

                const isDanger = checkIfDangerZoneIsReached(initialElapsed, goalTime);
                box.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${isDanger ? "#dc3545" : "#28a745"};
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
                if (isDanger) {
                    const currentTimeEl = span.querySelector("#__current_workTime__");
                    currentTimeEl.style.fontSize = "22px";
                    currentTimeEl.style.fontWeight = "bold";
                }
                document.body.appendChild(box);

                const currentTimeEl = document.getElementById("__current_workTime__");
                let currentWorkTime = initialElapsed;
                currentTimeEl.textContent = formatTime(currentWorkTime);

                const interval = setInterval(() => {
                    currentWorkTime++;
                    currentTimeEl.textContent = formatTime(currentWorkTime);

                    if (checkIfDangerZoneIsReached(currentWorkTime, goalTime)) {
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

                function checkIfDangerZoneIsReached(currentWorkTime, goalTime) {
                    return currentWorkTime - parseInt(goalTime.split(':')[0]) * 3600
                        - parseInt(goalTime.split(':')[1]) * 60
                        - parseInt(goalTime.split(':')[2]) >= 5
                }
            },
            args: [goalTimeFormatted, elapsedAtInject]
        });
    } catch (err) {
        // TODO co musi się stać by to wywołać?
        timerState.lastNotificationTabId = null;
        alert(`Error in injectNotificationIntoTab: ${err.message}`);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === alarmName && timerState.isRunning) {
        const elapsed = getElapsedSeconds();
        if (!timerState.goalReached && elapsed >= timerState.goalSeconds) {
            timerState.goalTimeFormatted = formatTime(timerState.goalSeconds)
            timerState.goalReached = true;

            void chrome.alarms.clear(alarmName);
            void createWorkTimeFloatingBox();
        }
    }
});

async function createWorkTimeFloatingBox() {
    const elapsed = getElapsedSeconds();
    await injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, elapsed);
}

chrome.tabs.onActivated.addListener(async (_) => {
    if (timerState.goalReached && timerState.isRunning) {
        const elapsed = getElapsedSeconds();
        await injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, elapsed);
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    if (timerState.goalReached && timerState.isRunning) {
        const elapsed = getElapsedSeconds();
        await injectWorkTimeFloatingBoxIntoTab(timerState.goalTimeFormatted, elapsed);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startTimer") {
        timerState.isRunning = true;
        timerState.startTime = Date.now();
        timerState.goalSeconds = request.goalSeconds;
        timerState.goalReached = false;

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
        sendResponse({ success: true });
    } else if (request.action === "getTimerState") {
        sendResponse({
            isRunning: timerState.isRunning,
            elapsedSeconds: getElapsedSeconds(),
            goalSeconds: timerState.goalSeconds,
            goalReached: timerState.goalReached
        });
    }
    return true;
});

function getElapsedSeconds() {
    if (!timerState.isRunning || !timerState.startTime) return 0;
    return Math.round((Date.now() - timerState.startTime) / 1000);
}

// noinspection DuplicatedCode
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
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
