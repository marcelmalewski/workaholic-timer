const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const timerDisplay = document.getElementById("timerDisplay");
const goalInfo = document.getElementById("goalInfo");
const hoursInput = document.getElementById("hours");
const minutesInput = document.getElementById("minutes");
const secondsInput = document.getElementById("seconds");

let updateInterval = null;

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function updateUI() {
    const response = await chrome.runtime.sendMessage({ action: "getTimerState" });

    if (response.isRunning) {
        const elapsed = response.elapsedSeconds;
        timerDisplay.textContent = formatTime(elapsed);
        goalInfo.textContent = `Goal: ${formatTime(response.goalSeconds)}`;

        startBtn.style.display = "none";
        stopBtn.style.display = "block";
        hoursInput.disabled = true;
        minutesInput.disabled = true;
        secondsInput.disabled = true;
    } else {
        timerDisplay.textContent = "00:00:00";
        goalInfo.textContent = "Goal: 00:00:03";

        startBtn.style.display = "block";
        stopBtn.style.display = "none";
        hoursInput.disabled = false;
        minutesInput.disabled = false;
        secondsInput.disabled = false;
    }
}

startBtn.addEventListener("click", async () => {
    const h = parseInt(hoursInput.value) || 0;
    const m = parseInt(minutesInput.value) || 0;
    const s = parseInt(secondsInput.value) || 0;
    const goalSeconds = h * 3600 + m * 60 + s;

    if (goalSeconds === 0) {
        alert("Please set a goal time greater than 0");
        return;
    }

    await chrome.runtime.sendMessage({
        action: "startTimer",
        goalSeconds: goalSeconds
    });

    updateUI();

    // Update UI every second
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateUI, 1000);
});

stopBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ action: "stopTimer" });

    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }

    updateUI();
});

// Initialize on popup open
updateUI();

// Update every second if timer is running
updateInterval = setInterval(updateUI, 1000);
