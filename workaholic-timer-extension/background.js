let timerState = {
    isRunning: false,
    startTime: null,
    goalSeconds: 0,
    goalReached: false,
    goalTimeFormatted: "",
    lastNotificationTabId: null
};
let alarmName = "workaholicTimer";

async function injectNotificationIntoTab(goalTimeFormatted, elapsedAtInject) {
    try {
        if (timerState.lastNotificationTabId) {
            await removeNotificationFromTab(timerState.lastNotificationTabId);
        }

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) return;

        const tab = tabs[0];
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
            timerState.lastNotificationTabId = null;
            return;
        }

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (goalTime, initialElapsed) => {
                const ID = "__workTime_floating_box_v1__";
                const existing = document.getElementById(ID);
                if (existing) {
                    if (existing.dataset.overTimerInterval) clearInterval(existing.dataset.overTimerInterval);
                    existing.remove();
                }

                const box = document.createElement("div");
                box.id = ID;

                const span = document.createElement("span");
                span.innerHTML = `⏱ Goal time: ${goalTime} | Current time: <span id="__current_workTime__">00:00:00</span>`;
                box.appendChild(span);
                box.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #28a745;
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
                document.body.appendChild(box);

                const currentTimeEl = document.getElementById("__current_workTime__");
                let currentWorkTime = initialElapsed;
                currentTimeEl.textContent = formatTime(currentWorkTime);
                const interval = setInterval(() => {
                    currentWorkTime++;
                    currentTimeEl.textContent = formatTime(currentWorkTime);

                    if (checkIfDangerZoneIsReached(currentWorkTime, goalTime)) {
                        setStyleForWorkTimeFloatingBoxInDangerZone(box, currentTimeEl)
                    }
                }, 1000);

                box.dataset.overTimerInterval = interval;

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

                function setStyleForWorkTimeFloatingBoxInDangerZone(box, currentTimeEl) {
                    box.style.background = "#dc3545";
                    currentTimeEl.style.fontSize = "22px";
                    currentTimeEl.style.fontWeight = "bold";
                }
            },
            args: [goalTimeFormatted, elapsedAtInject]
        });

        timerState.lastNotificationTabId = tab.id;
    } catch (err) {
        console.error("Error in injectNotificationIntoTab:", err);
        timerState.lastNotificationTabId = null;
    }
}

chrome.alarms.create(alarmName, { periodInMinutes: 1 / 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === alarmName && timerState.isRunning) {
        const elapsed = getElapsedSeconds();
        if (!timerState.goalReached && elapsed >= timerState.goalSeconds) {
            timerState.goalReached = true;
            showNotificationBox();
        }
    }
});

async function showNotificationBox() {
    const goalTimeFormatted = formatTime(timerState.goalSeconds);
    timerState.goalTimeFormatted = goalTimeFormatted;
    const elapsed = getElapsedSeconds(); // Get real elapsed time
    await injectNotificationIntoTab(goalTimeFormatted, elapsed);
}

chrome.tabs.onActivated.addListener(async (_) => {
    if (timerState.goalReached && timerState.isRunning && timerState.goalTimeFormatted) {
        const elapsed = getElapsedSeconds();
        await injectNotificationIntoTab(timerState.goalTimeFormatted, elapsed);
    }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    if (timerState.goalReached && timerState.isRunning && timerState.goalTimeFormatted) {
        const elapsed = getElapsedSeconds();
        await injectNotificationIntoTab(timerState.goalTimeFormatted, elapsed);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startTimer") {
        timerState.isRunning = true;
        timerState.startTime = Date.now();
        timerState.goalSeconds = request.goalSeconds;
        timerState.goalReached = false;
        sendResponse({ success: true });
    } else if (request.action === "stopTimer") {
        timerState.isRunning = false;
        timerState.startTime = null;
        timerState.goalReached = false;
        if (timerState.lastNotificationTabId) {
            removeNotificationFromTab(timerState.lastNotificationTabId);
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
    return Math.floor((Date.now() - timerState.startTime) / 1000);
}

// noinspection DuplicatedCode
function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
                    if (existing.dataset.overTimerInterval) clearInterval(existing.dataset.overTimerInterval);
                    existing.remove();
                }
            }
        });
    } catch (err) {
        console.log(`Could not remove notification from tab ${tabId}:`, err.message);
    }
}
