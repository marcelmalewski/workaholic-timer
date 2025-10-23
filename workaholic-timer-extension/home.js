const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const timerDisplay = document.getElementById('timerDisplay');
const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');
const loadingMessage = document.getElementById('loadingMessage');
const mainUI = document.getElementById('mainUI');

let updateInterval = null;

// TODO jakieś sprawdzanie czy napewno timerState wziął dane ze storage, bo czasem pierwsze wczytanie
// TODO jest za szybko
// Initialize home ui
void updateUI();

async function updateUI() {
    const response = await getTimerStateWhenIsLoaded();

    loadingMessage.style.display = 'none';
    mainUI.style.display = 'block';

    if(response.goalReached) {
        timerDisplay.textContent = 'Overtime';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        hoursInput.disabled = true;
        minutesInput.disabled = true;
        secondsInput.disabled = true;

        return;
    }

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
        if(currentWorkTime === response.goalSeconds) {
            timerDisplay.textContent = 'Overtime';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            hoursInput.disabled = true;
            minutesInput.disabled = true;
            secondsInput.disabled = true;

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
