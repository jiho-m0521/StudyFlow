// StudyFlow Web의 모든 데이터는 브라우저 localStorage에 저장됩니다.
const STORAGE_KEY = "studyflow-web-state";

const defaultTimerSettings = {
  studyMinutes: 25,
  breakMinutes: 5,
  autoStartNext: false,
  selectedSubject: ""
};

const defaultState = {
  tasks: [],
  sessions: [],
  goalMinutes: 0,
  exams: [],
  memoByDate: {},
  theme: "light",
  timerSettings: { ...defaultTimerSettings }
};

const quotes = [
  "작은 집중이 모이면 큰 성적이 됩니다.",
  "오늘의 25분이 내일의 자신감을 만듭니다.",
  "완벽하지 않아도 시작하면 흐름이 생깁니다.",
  "공부는 오래 앉아 있기보다 다시 돌아오는 힘입니다.",
  "지금 한 문제 더 푸는 내가 가장 강합니다.",
  "기록하면 흐름이 보이고, 흐름이 보이면 바꿀 수 있습니다."
];

let state = loadState();
let timerMode = "study";
let timerSeconds = getTimerSecondsForMode(timerMode);
let timerRunning = false;
let timerId = null;
let currentStudySessionSeconds = 0;
let editingExamId = null;

// HTML에서 자주 사용하는 요소를 한 곳에 모아 두면 이후 함수에서 찾기 쉽습니다.
const elements = {
  todayLabel: document.getElementById("todayLabel"),
  themeToggle: document.getElementById("themeToggle"),
  quoteText: document.getElementById("quoteText"),
  newQuoteButton: document.getElementById("newQuoteButton"),
  timerDisplay: document.getElementById("timerDisplay"),
  focusTimerDisplay: document.getElementById("focusTimerDisplay"),
  timerStatus: document.getElementById("timerStatus"),
  focusStatus: document.getElementById("focusStatus"),
  selectedSubjectLabel: document.getElementById("selectedSubjectLabel"),
  focusSubjectLabel: document.getElementById("focusSubjectLabel"),
  timerTodayStudyTime: document.getElementById("timerTodayStudyTime"),
  timerGoalPercent: document.getElementById("timerGoalPercent"),
  timerNotice: document.getElementById("timerNotice"),
  focusNotice: document.getElementById("focusNotice"),
  startTimerButton: document.getElementById("startTimerButton"),
  pauseTimerButton: document.getElementById("pauseTimerButton"),
  resetTimerButton: document.getElementById("resetTimerButton"),
  focusStartButton: document.getElementById("focusStartButton"),
  focusPauseButton: document.getElementById("focusPauseButton"),
  focusResetButton: document.getElementById("focusResetButton"),
  focusModeButton: document.getElementById("focusModeButton"),
  closeFocusButton: document.getElementById("closeFocusButton"),
  focusOverlay: document.getElementById("focusOverlay"),
  timerSettingsForm: document.getElementById("timerSettingsForm"),
  studyMinutesInput: document.getElementById("studyMinutesInput"),
  breakMinutesInput: document.getElementById("breakMinutesInput"),
  timerSubjectSelect: document.getElementById("timerSubjectSelect"),
  autoStartToggle: document.getElementById("autoStartToggle"),
  taskForm: document.getElementById("taskForm"),
  subjectInput: document.getElementById("subjectInput"),
  taskInput: document.getElementById("taskInput"),
  colorInput: document.getElementById("colorInput"),
  taskList: document.getElementById("taskList"),
  emptyTaskMessage: document.getElementById("emptyTaskMessage"),
  goalForm: document.getElementById("goalForm"),
  goalHoursInput: document.getElementById("goalHoursInput"),
  goalText: document.getElementById("goalText"),
  goalPercent: document.getElementById("goalPercent"),
  goalProgress: document.getElementById("goalProgress"),
  todayStudyTime: document.getElementById("todayStudyTime"),
  weekStudyTime: document.getElementById("weekStudyTime"),
  streakCount: document.getElementById("streakCount"),
  subjectTimeList: document.getElementById("subjectTimeList"),
  emptySubjectMessage: document.getElementById("emptySubjectMessage"),
  examForm: document.getElementById("examForm"),
  examNameInput: document.getElementById("examNameInput"),
  examDateInput: document.getElementById("examDateInput"),
  examSubmitButton: document.getElementById("examSubmitButton"),
  examList: document.getElementById("examList"),
  emptyExamMessage: document.getElementById("emptyExamMessage"),
  memoInput: document.getElementById("memoInput"),
  memoSaveText: document.getElementById("memoSaveText")
};

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  applyTheme();
  showToday();
  showRandomQuote();
  bindEvents();
  renderAll();
}

// 버튼, 입력 폼, 메모장 같은 화면 요소에 동작을 연결합니다.
function bindEvents() {
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.newQuoteButton.addEventListener("click", showRandomQuote);
  elements.taskForm.addEventListener("submit", addTask);
  elements.goalForm.addEventListener("submit", saveGoal);
  elements.examForm.addEventListener("submit", saveExam);
  elements.memoInput.addEventListener("input", saveMemo);
  elements.timerSettingsForm.addEventListener("submit", saveTimerSettings);
  elements.timerSubjectSelect.addEventListener("change", saveSelectedSubject);
  elements.autoStartToggle.addEventListener("change", saveTimerSettings);
  elements.startTimerButton.addEventListener("click", startTimer);
  elements.focusStartButton.addEventListener("click", startTimer);
  elements.pauseTimerButton.addEventListener("click", pauseTimer);
  elements.focusPauseButton.addEventListener("click", pauseTimer);
  elements.resetTimerButton.addEventListener("click", resetTimer);
  elements.focusResetButton.addEventListener("click", resetTimer);
  elements.focusModeButton.addEventListener("click", openFocusMode);
  elements.closeFocusButton.addEventListener("click", closeFocusMode);
}

// 저장된 데이터가 없거나 JSON이 깨졌을 때도 앱이 멈추지 않도록 기본값을 사용합니다.
function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(savedState);
  } catch (error) {
    return normalizeState(null);
  }
}

function normalizeState(savedState) {
  const mergedState = { ...defaultState, ...(savedState || {}) };
  mergedState.tasks = Array.isArray(mergedState.tasks) ? mergedState.tasks : [];
  mergedState.sessions = Array.isArray(mergedState.sessions) ? mergedState.sessions : [];
  mergedState.exams = Array.isArray(mergedState.exams) ? mergedState.exams : [];
  mergedState.memoByDate = mergedState.memoByDate && typeof mergedState.memoByDate === "object" ? mergedState.memoByDate : {};
  mergedState.timerSettings = {
    ...defaultTimerSettings,
    ...(savedState && savedState.timerSettings ? savedState.timerSettings : {})
  };
  mergedState.timerSettings.studyMinutes = clampNumber(mergedState.timerSettings.studyMinutes, 1, 120, 25);
  mergedState.timerSettings.breakMinutes = clampNumber(mergedState.timerSettings.breakMinutes, 1, 60, 5);
  mergedState.timerSettings.autoStartNext = Boolean(mergedState.timerSettings.autoStartNext);
  mergedState.timerSettings.selectedSubject = mergedState.timerSettings.selectedSubject || "";
  return mergedState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 날짜별 저장을 쉽게 하기 위해 YYYY-MM-DD 형식의 키를 만듭니다.
function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function showToday() {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
  elements.todayLabel.textContent = formatter.format(new Date());
}

function showRandomQuote() {
  const randomIndex = Math.floor(Math.random() * quotes.length);
  elements.quoteText.textContent = quotes[randomIndex];
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
}

function applyTheme() {
  document.body.classList.toggle("dark", state.theme === "dark");
  elements.themeToggle.textContent = state.theme === "dark" ? "☾" : "☀";
}

function addTask(event) {
  event.preventDefault();

  const subject = elements.subjectInput.value.trim();
  const title = elements.taskInput.value.trim();

  if (!subject || !title) return;

  state.tasks.push({
    id: Date.now(),
    date: getTodayKey(),
    subject,
    title,
    color: elements.colorInput.value,
    done: false
  });

  if (!state.timerSettings.selectedSubject) {
    state.timerSettings.selectedSubject = subject;
  }

  elements.taskForm.reset();
  elements.colorInput.value = "#5b8def";
  saveState();
  renderAll();
}

function toggleTask(taskId) {
  state.tasks = state.tasks.map((task) => {
    if (task.id === taskId) {
      return { ...task, done: !task.done };
    }
    return task;
  });
  saveState();
  renderTasks();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  ensureSelectedSubjectExists();
  saveState();
  renderAll();
}

function renderTasks() {
  const todayTasks = getTodayTasks();
  elements.taskList.innerHTML = "";
  elements.emptyTaskMessage.style.display = todayTasks.length ? "none" : "block";

  todayTasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item ${task.done ? "done" : ""}`;

    const main = document.createElement("div");
    main.className = "task-main";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => toggleTask(task.id));

    const dot = document.createElement("span");
    dot.className = "subject-dot";
    dot.style.background = task.color;

    const text = document.createElement("div");
    text.className = "task-text";
    text.innerHTML = `<strong>${escapeHtml(task.subject)}</strong><span>${escapeHtml(task.title)}</span>`;

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    main.append(checkbox, dot, text);
    item.append(main, deleteButton);
    elements.taskList.appendChild(item);
  });

  renderSubjectSelector();
}

function saveTimerSettings(event) {
  event.preventDefault();

  const previousStudySeconds = getTimerSecondsForMode("study");
  const previousBreakSeconds = getTimerSecondsForMode("break");
  state.timerSettings.studyMinutes = clampNumber(elements.studyMinutesInput.value, 1, 120, 25);
  state.timerSettings.breakMinutes = clampNumber(elements.breakMinutesInput.value, 1, 60, 5);
  state.timerSettings.autoStartNext = elements.autoStartToggle.checked;
  state.timerSettings.selectedSubject = elements.timerSubjectSelect.value;

  if (!timerRunning) {
    const wasAtStudyStart = timerMode === "study" && timerSeconds === previousStudySeconds;
    const wasAtBreakStart = timerMode === "break" && timerSeconds === previousBreakSeconds;
    if (wasAtStudyStart || wasAtBreakStart) {
      timerSeconds = getTimerSecondsForMode(timerMode);
    }
  }

  saveState();
  showTimerNotice(timerRunning ? "설정이 저장되었습니다. 다음 초기화 또는 다음 라운드부터 적용됩니다." : "타이머 설정이 저장되었습니다.");
  renderAll();
}

function saveSelectedSubject() {
  state.timerSettings.selectedSubject = elements.timerSubjectSelect.value;
  saveState();
  renderSelectedSubjectLabels();
}

function renderTimerSettings() {
  elements.studyMinutesInput.value = state.timerSettings.studyMinutes;
  elements.breakMinutesInput.value = state.timerSettings.breakMinutes;
  elements.autoStartToggle.checked = state.timerSettings.autoStartNext;
}

function renderSubjectSelector() {
  const subjects = getTodaySubjects();
  ensureSelectedSubjectExists();
  elements.timerSubjectSelect.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "기타";
  elements.timerSubjectSelect.appendChild(defaultOption);

  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.name;
    option.textContent = subject.name;
    elements.timerSubjectSelect.appendChild(option);
  });

  elements.timerSubjectSelect.value = state.timerSettings.selectedSubject;
  renderSelectedSubjectLabels();
}

function ensureSelectedSubjectExists() {
  if (!state.timerSettings.selectedSubject) return;
  const hasSubject = getTodaySubjects().some((subject) => subject.name === state.timerSettings.selectedSubject);
  if (!hasSubject) {
    state.timerSettings.selectedSubject = "";
  }
}

function getTodaySubjects() {
  const subjectMap = new Map();
  getTodayTasks().forEach((task) => {
    if (!subjectMap.has(task.subject)) {
      subjectMap.set(task.subject, { name: task.subject, color: task.color });
    }
  });
  return Array.from(subjectMap.values());
}

function getTodayTasks() {
  return state.tasks.filter((task) => task.date === getTodayKey());
}

// 뽀모도로는 공부 시간이 끝났을 때만 공부 세션을 기록합니다.
function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  clearNotice();

  timerId = setInterval(() => {
    timerSeconds -= 1;
    if (timerMode === "study") {
      currentStudySessionSeconds += 1;
    }

    if (timerSeconds <= 0) {
      finishTimerRound();
      return;
    }

    renderTimer();
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  pauseTimer();
  timerMode = "study";
  timerSeconds = getTimerSecondsForMode(timerMode);
  currentStudySessionSeconds = 0;
  clearNotice();
  renderTimer();
}

function finishTimerRound() {
  pauseTimer();

  if (timerMode === "study") {
    saveStudySession(currentStudySessionSeconds);
    currentStudySessionSeconds = 0;
    timerMode = "break";
    timerSeconds = getTimerSecondsForMode(timerMode);
    showTimerNotice(`공부 세션이 저장되었습니다. ${state.timerSettings.breakMinutes}분 휴식하세요.`);
  } else {
    timerMode = "study";
    timerSeconds = getTimerSecondsForMode(timerMode);
    showTimerNotice("휴식이 끝났습니다. 다시 공부를 시작해 보세요.");
  }

  renderAll();

  if (state.timerSettings.autoStartNext) {
    startTimer();
  }
}

function getTimerSecondsForMode(mode) {
  const minutes = mode === "study" ? state.timerSettings.studyMinutes : state.timerSettings.breakMinutes;
  return minutes * 60;
}

function saveStudySession(seconds) {
  if (seconds <= 0) return;

  const selectedSubject = state.timerSettings.selectedSubject;
  const subjectInfo = getTodaySubjects().find((subject) => subject.name === selectedSubject);
  const subject = selectedSubject || "기타";
  const color = subjectInfo ? subjectInfo.color : "#54c6a4";

  state.sessions.push({
    id: Date.now(),
    date: getTodayKey(),
    subject,
    color,
    minutes: Math.max(1, Math.round(seconds / 60))
  });

  saveState();
}

// 화면의 일반 타이머와 집중 모드 타이머를 항상 같은 값으로 맞춥니다.
function renderTimer() {
  const timeText = formatTimer(timerSeconds);
  const statusText = timerMode === "study" ? "공부 중" : "휴식 중";

  elements.timerDisplay.textContent = timeText;
  elements.focusTimerDisplay.textContent = timeText;
  elements.timerStatus.textContent = statusText;
  elements.focusStatus.textContent = statusText;
}

function renderSelectedSubjectLabels() {
  const subjectText = state.timerSettings.selectedSubject || "기타";
  elements.selectedSubjectLabel.textContent = `현재 과목: ${subjectText}`;
  elements.focusSubjectLabel.textContent = `현재 과목: ${subjectText}`;
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function showTimerNotice(message) {
  elements.timerNotice.textContent = message;
  elements.focusNotice.textContent = message;
}

function clearNotice() {
  showTimerNotice("");
}

function openFocusMode() {
  elements.focusOverlay.classList.add("open");
  elements.focusOverlay.setAttribute("aria-hidden", "false");
}

function closeFocusMode() {
  elements.focusOverlay.classList.remove("open");
  elements.focusOverlay.setAttribute("aria-hidden", "true");
}

function saveGoal(event) {
  event.preventDefault();
  const hours = Number(elements.goalHoursInput.value);
  state.goalMinutes = Math.max(0, Math.round(hours * 60));
  saveState();
  renderGoalAndStats();
}

function saveMemo() {
  state.memoByDate[getTodayKey()] = elements.memoInput.value;
  elements.memoSaveText.textContent = "저장됨";
  saveState();
  setTimeout(() => {
    elements.memoSaveText.textContent = "자동 저장";
  }, 900);
}

function saveExam(event) {
  event.preventDefault();

  const name = elements.examNameInput.value.trim();
  const date = elements.examDateInput.value;
  if (!name || !date) return;

  if (editingExamId) {
    state.exams = state.exams.map((exam) => {
      if (exam.id === editingExamId) {
        return { ...exam, name, date };
      }
      return exam;
    });
    editingExamId = null;
    elements.examSubmitButton.textContent = "추가";
  } else {
    state.exams.push({ id: Date.now(), name, date });
  }

  elements.examForm.reset();
  saveState();
  renderExams();
}

function editExam(examId) {
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam) return;

  editingExamId = exam.id;
  elements.examNameInput.value = exam.name;
  elements.examDateInput.value = exam.date;
  elements.examSubmitButton.textContent = "수정";
}

function deleteExam(examId) {
  state.exams = state.exams.filter((exam) => exam.id !== examId);
  if (editingExamId === examId) {
    editingExamId = null;
    elements.examForm.reset();
    elements.examSubmitButton.textContent = "추가";
  }
  saveState();
  renderExams();
}

function renderExams() {
  elements.examList.innerHTML = "";
  elements.emptyExamMessage.style.display = state.exams.length ? "none" : "block";

  const sortedExams = [...state.exams].sort((a, b) => new Date(a.date) - new Date(b.date));

  sortedExams.forEach((exam) => {
    const item = document.createElement("li");
    item.className = "exam-item";

    const text = document.createElement("div");
    text.className = "exam-text";
    text.innerHTML = `<strong>${escapeHtml(exam.name)} · ${getDdayText(exam.date)}</strong><span>${exam.date}</span>`;

    const actions = document.createElement("div");
    actions.className = "exam-actions";

    const editButton = document.createElement("button");
    editButton.className = "small-button";
    editButton.type = "button";
    editButton.textContent = "수정";
    editButton.addEventListener("click", () => editExam(exam.id));

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteExam(exam.id));

    actions.append(editButton, deleteButton);
    item.append(text, actions);
    elements.examList.appendChild(item);
  });
}

// 시험 날짜와 오늘 날짜를 비교해 D-day 문구를 계산합니다.
function getDdayText(dateText) {
  const today = new Date(getTodayKey());
  const examDate = new Date(dateText);
  const diffDays = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "D-day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

// 목표 시간, 오늘 공부 시간, 주간 공부 시간, streak를 한 번에 갱신합니다.
function renderGoalAndStats() {
  const todayMinutes = getTodayStudyMinutes();
  const weekMinutes = getWeekStudyMinutes();
  const progress = state.goalMinutes ? Math.min(100, Math.round((todayMinutes / state.goalMinutes) * 100)) : 0;

  elements.goalHoursInput.value = state.goalMinutes ? state.goalMinutes / 60 : "";
  elements.goalText.textContent = `목표 ${formatMinutes(state.goalMinutes)}`;
  elements.goalPercent.textContent = `${progress}%`;
  elements.goalProgress.style.width = `${progress}%`;
  elements.todayStudyTime.textContent = formatMinutes(todayMinutes);
  elements.timerTodayStudyTime.textContent = formatMinutes(todayMinutes);
  elements.weekStudyTime.textContent = formatMinutes(weekMinutes);
  elements.timerGoalPercent.textContent = `${progress}%`;
  elements.streakCount.textContent = `${calculateStreak()}일`;

  renderSubjectTimes();
}

function renderSubjectTimes() {
  const subjectMap = {};

  state.sessions
    .filter((session) => session.date === getTodayKey())
    .forEach((session) => {
      if (!subjectMap[session.subject]) {
        subjectMap[session.subject] = { minutes: 0, color: session.color };
      }
      subjectMap[session.subject].minutes += session.minutes;
    });

  const subjects = Object.entries(subjectMap);
  elements.subjectTimeList.innerHTML = "";
  elements.emptySubjectMessage.style.display = subjects.length ? "none" : "block";

  subjects.forEach(([subject, data]) => {
    const item = document.createElement("li");
    item.className = "subject-time-item";
    item.innerHTML = `<span><span class="subject-dot" style="background:${data.color}"></span> ${escapeHtml(subject)}</span><span>${formatMinutes(data.minutes)}</span>`;
    elements.subjectTimeList.appendChild(item);
  });
}

function getTodayStudyMinutes() {
  return state.sessions
    .filter((session) => session.date === getTodayKey())
    .reduce((total, session) => total + session.minutes, 0);
}

function getWeekStudyMinutes() {
  const today = new Date(getTodayKey());
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  return state.sessions
    .filter((session) => {
      const sessionDate = new Date(session.date);
      return sessionDate >= monday && sessionDate <= today;
    })
    .reduce((total, session) => total + session.minutes, 0);
}

// 오늘부터 하루씩 거꾸로 확인하면서 공부 기록이 끊기기 전까지 계산합니다.
function calculateStreak() {
  const studiedDates = new Set(state.sessions.filter((session) => session.minutes > 0).map((session) => session.date));
  let streak = 0;
  const cursor = new Date(getTodayKey());

  while (studiedDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMinutes(minutes) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}시간 ${rest}분`;
  if (hours) return `${hours}시간`;
  return `${rest}분`;
}

function renderMemo() {
  elements.memoInput.value = state.memoByDate[getTodayKey()] || "";
}

function renderAll() {
  renderTimerSettings();
  renderTimer();
  renderTasks();
  renderGoalAndStats();
  renderExams();
  renderMemo();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
