const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const timerDisplay = document.getElementById('timerDisplay');
const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');

let updateInterval = null;

// Initialize home ui
void updateUI();

async function updateUI() {
    const response = await chrome.runtime.sendMessage({ action: 'getTimerState' });
    if (!response.isRunning) {
        timerDisplay.textContent = '00:00:00';
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        hoursInput.disabled = false;
        minutesInput.disabled = false;
        secondsInput.disabled = false;

        return;
    }

    let currentWorkTime = response.elapsedSeconds;
    timerDisplay.textContent = formatTime(currentWorkTime);
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    hoursInput.disabled = true;
    minutesInput.disabled = true;
    secondsInput.disabled = true;

    updateInterval = setInterval(() => {
        currentWorkTime++;
        timerDisplay.textContent = formatTime(currentWorkTime);
    }, 1000);
}

// noinspection DuplicatedCode
function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

startBtn.addEventListener('click', async () => {
    const hours = parseInt(hoursInput.value) || 0;
    const minutes = parseInt(minutesInput.value) || 0;
    const seconds = parseInt(secondsInput.value) || 0;
    const goalSeconds = hours * 3600 + minutes * 60 + seconds;

    if (goalSeconds === 0) {
        alert('Please set a goal time greater than 0');
        return;
    }

    chrome.runtime.sendMessage({
        action: 'startTimer',
        goalSeconds: goalSeconds,
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
