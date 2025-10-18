let timerState = {
    isRunning: false,
    startTime: null,
    goalSeconds: 0,
    goalReached: false,
    goalTimeFormatted: "", // Store formatted time when goal is reached
    lastNotificationTabId: null // Track which tab has the notification
};

let alarmName = "workaholicTimer";

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getElapsedSeconds() {
    if (!timerState.isRunning || !timerState.startTime) return 0;
    return Math.floor((Date.now() - timerState.startTime) / 1000);
}

async function showNotificationBox() {
    console.log("showNotificationBox called");

    // Format the time HERE before passing it
    const goalTimeFormatted = formatTime(timerState.goalSeconds);
    timerState.goalTimeFormatted = goalTimeFormatted; // Store it
    console.log("Goal time formatted:", goalTimeFormatted);

    await injectNotificationIntoTab(goalTimeFormatted);
}

async function removeNotificationFromTab(tabId) {
    if (!tabId) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: "MAIN",
            func: () => {
                const ID = "__workaholic_floating_box_v1__";
                const existing = document.getElementById(ID);
                if (existing) {
                    existing.remove();
                    console.log("=== BOX REMOVED ===");
                }
            }
        });
        console.log(`Removed notification from tab ${tabId}`);
    } catch (err) {
        console.log(`Could not remove notification from tab ${tabId}:`, err.message);
    }
}

async function injectNotificationIntoTab(goalTimeFormatted) {
    try {
        // Remove from previous tab first
        if (timerState.lastNotificationTabId) {
            await removeNotificationFromTab(timerState.lastNotificationTabId);
        }

        // Get only the active tab in the current window
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log(`Found ${tabs.length} active tab(s)`);

        if (tabs.length === 0) {
            console.log("No active tab found");
            return;
        }

        const tab = tabs[0];
        console.log(`Active tab ${tab.id}: ${tab.url}`);

        // Skip chrome:// and other restricted URLs
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
            console.log(`Cannot inject into restricted tab ${tab.id}`);
            timerState.lastNotificationTabId = null;
            return;
        }

        try {
            console.log(`Attempting to inject into active tab ${tab.id}`);

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: (goalTime) => {
                    console.log("=== SCRIPT EXECUTING ===", goalTime);
                    const ID = "__workaholic_floating_box_v1__";

                    // Remove existing if present
                    const existing = document.getElementById(ID);
                    if (existing) {
                        existing.remove();
                    }

                    // Create the box
                    const box = document.createElement("div");
                    box.id = ID;

                    // Message span
                    const span = document.createElement("span");
                    span.textContent = `⏱ Goal of ${goalTime} reached at ${new Date().toLocaleTimeString()}`;

                    // Close button
                    const closeBtn = document.createElement("button");
                    closeBtn.textContent = "×";
                    closeBtn.style.cssText = `
                        background: transparent;
                        border: none;
                        color: white;
                        font-size: 24px;
                        margin-left: 12px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    `;
                    closeBtn.addEventListener("click", () => {
                        box.remove();
                    });

                    box.appendChild(span);
                    box.appendChild(closeBtn);

                    // Styling
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
                    console.log("=== BOX ADDED ===");
                },
                args: [goalTimeFormatted]
            });

            // Store the current tab ID
            timerState.lastNotificationTabId = tab.id;
            console.log(`Successfully injected into active tab ${tab.id}`);

        } catch (err) {
            console.log(`Could not inject into tab ${tab.id}:`, err.message);
            timerState.lastNotificationTabId = null;
        }

    } catch (err) {
        console.error("Error in injectNotificationIntoTab:", err);
    }
}

// Check timer every second
console.log("Background script loaded. Setting up alarm...");
chrome.alarms.create(alarmName, { periodInMinutes: 1/60 }); // Every second

chrome.alarms.onAlarm.addListener((alarm) => {
    console.log("Alarm fired:", alarm.name);

    if (alarm.name === alarmName && timerState.isRunning) {
        const elapsed = getElapsedSeconds();

        console.log(`Timer check - Elapsed: ${elapsed}s, Goal: ${timerState.goalSeconds}s, Reached: ${timerState.goalReached}`);

        // Check if goal is reached
        if (!timerState.goalReached && elapsed >= timerState.goalSeconds) {
            console.log("Goal reached! Showing notification...");
            timerState.goalReached = true;
            showNotificationBox();
        }
    }
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log("Tab activated:", activeInfo.tabId);

    // If goal was reached and timer is still running, show notification on new active tab
    if (timerState.goalReached && timerState.isRunning && timerState.goalTimeFormatted) {
        console.log("Goal already reached, injecting into newly activated tab");
        await injectNotificationIntoTab(timerState.goalTimeFormatted);
    }
});

// Listen for window focus changes (when user switches between browser windows)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    console.log("Window focus changed:", windowId);

    // windowId will be -1 if no window has focus
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        console.log("No window has focus");
        return;
    }

    // If goal was reached and timer is still running, show notification on active tab of focused window
    if (timerState.goalReached && timerState.isRunning && timerState.goalTimeFormatted) {
        console.log("Goal already reached, injecting into newly focused window");
        await injectNotificationIntoTab(timerState.goalTimeFormatted);
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received:", request.action);

    if (request.action === "startTimer") {
        timerState.isRunning = true;
        timerState.startTime = Date.now();
        timerState.goalSeconds = request.goalSeconds;
        timerState.goalReached = false;

        console.log("Timer started! Goal:", timerState.goalSeconds, "seconds");

        sendResponse({ success: true });
    }
    else if (request.action === "stopTimer") {
        timerState.isRunning = false;
        timerState.startTime = null;
        timerState.goalReached = false;

        console.log("Timer stopped!");

        sendResponse({ success: true });
    }
    else if (request.action === "getTimerState") {
        sendResponse({
            isRunning: timerState.isRunning,
            elapsedSeconds: getElapsedSeconds(),
            goalSeconds: timerState.goalSeconds,
            goalReached: timerState.goalReached
        });
    }

    return true;
});
