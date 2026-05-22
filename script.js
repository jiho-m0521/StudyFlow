const STORAGE_KEY = "studyflow-web-state";
const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const NAV_SECTIONS = ["today", "timer", "records", "schedule", "settings"];

const defaultTimerSettings = {
  studyMinutes: 25,
  breakMinutes: 5,
  autoStartNext: false,
  selectedSubject: ""
};

const defaultState = {
  tasks: [],
  sessions: [],
  subjects: [],
  schedules: [],
  timetable: [],
  googleCalendar: {
    clientId: "",
    accessToken: "",
    tokenExpiresAt: 0,
    calendarId: "primary",
    profileName: ""
  },
  goalMinutes: 0,
  exams: [],
  memoByDate: {},
  theme: "light",
  timerSettings: { ...defaultTimerSettings },
  lastGoalCelebratedDate: ""
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
let editingSubjectId = null;
let editingScheduleId = null;
let editingTimetableId = null;
let calendarCursor = new Date();
let selectedCalendarDate = getTodayKey();

const elements = {};

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  cacheElements();
  handleGoogleAuthRedirect();
  applyTheme();
  showToday();
  showRandomQuote();
  bindEvents();
  setDefaultDates();
  renderAll();
}

function cacheElements() {
  document.querySelectorAll("[id]").forEach((element) => {
    elements[element.id] = element;
  });
}

function bindEvents() {
  elements.sectionNav.addEventListener("click", handleNavClick);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.newQuoteButton.addEventListener("click", showRandomQuote);
  elements.taskForm.addEventListener("submit", addTask);
  elements.goalForm.addEventListener("submit", saveGoal);
  elements.memoInput.addEventListener("input", saveMemo);
  elements.briefingMemoInput.addEventListener("input", saveBriefingMemo);
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
  elements.subjectForm.addEventListener("submit", saveSubject);
  elements.recordForm.addEventListener("submit", saveManualRecord);
  elements.recordCancelButton.addEventListener("click", resetRecordForm);
  elements.scheduleForm.addEventListener("submit", saveSchedule);
  elements.scheduleCancelButton.addEventListener("click", resetScheduleForm);
  elements.prevMonthButton.addEventListener("click", () => changeMonth(-1));
  elements.nextMonthButton.addEventListener("click", () => changeMonth(1));
  elements.examForm.addEventListener("submit", saveExam);
  elements.timetableForm.addEventListener("submit", saveTimetable);
  elements.timetableCancelButton.addEventListener("click", resetTimetableForm);
  elements.googleSettingsForm.addEventListener("submit", saveGoogleCalendarSettings);
  elements.googleConnectButton.addEventListener("click", connectGoogleCalendar);
  elements.googleDisconnectButton.addEventListener("click", disconnectGoogleCalendar);
  elements.googleImportButton.addEventListener("click", importGoogleCalendarEvents);
  elements.googleExportButton.addEventListener("click", exportSchedulesToGoogleCalendar);
  elements.exportDataButton.addEventListener("click", exportData);
  elements.importDataInput.addEventListener("change", importData);
}

function handleNavClick(event) {
  const button = event.target.closest(".nav-button");
  if (!button) return;
  showSection(button.dataset.section);
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (error) {
    return normalizeState(null);
  }
}

function normalizeState(savedState) {
  const merged = { ...defaultState, ...(savedState || {}) };
  merged.tasks = Array.isArray(merged.tasks) ? merged.tasks : [];
  merged.tasks = merged.tasks.filter((task) => !task.done);
  merged.sessions = Array.isArray(merged.sessions) ? merged.sessions : [];
  merged.subjects = Array.isArray(merged.subjects) ? merged.subjects : [];
  merged.schedules = Array.isArray(merged.schedules) ? merged.schedules : [];
  merged.timetable = Array.isArray(merged.timetable) ? merged.timetable : [];
  merged.exams = Array.isArray(merged.exams) ? merged.exams : [];
  merged.memoByDate = merged.memoByDate && typeof merged.memoByDate === "object" ? merged.memoByDate : {};
  merged.googleCalendar = {
    ...defaultState.googleCalendar,
    ...(merged.googleCalendar || {})
  };
  merged.timerSettings = { ...defaultTimerSettings, ...(merged.timerSettings || {}) };
  merged.timerSettings.studyMinutes = clampNumber(merged.timerSettings.studyMinutes, 1, 120, 25);
  merged.timerSettings.breakMinutes = clampNumber(merged.timerSettings.breakMinutes, 1, 60, 5);
  merged.timerSettings.autoStartNext = Boolean(merged.timerSettings.autoStartNext);
  merged.timerSettings.selectedSubject = merged.timerSettings.selectedSubject || "";
  merged.subjects = mergeSubjectsFromUsage(merged);
  return merged;
}

function mergeSubjectsFromUsage(data) {
  const subjectMap = new Map();
  data.subjects.forEach((subject) => {
    if (subject.name) {
      subjectMap.set(subject.name, {
        id: subject.id || Date.now() + Math.random(),
        name: subject.name,
        color: subject.color || "#5b8def",
        dailyGoalMinutes: Number(subject.dailyGoalMinutes) || 0
      });
    }
  });
  [...data.tasks, ...data.sessions].forEach((item) => {
    if (item.subject && !subjectMap.has(item.subject)) {
      subjectMap.set(item.subject, {
        id: Date.now() + Math.random(),
        name: item.subject,
        color: item.color || "#5b8def",
        dailyGoalMinutes: 0
      });
    }
  });
  return Array.from(subjectMap.values());
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showSection(sectionName) {
  if (!NAV_SECTIONS.includes(sectionName)) return;
  document.querySelectorAll(".app-section").forEach((section) => {
    const isActive = section.id === `section-${sectionName}`;
    section.classList.toggle("active", isActive);
    section.hidden = !isActive;
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    const isActive = button.dataset.section === sectionName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function setDefaultDates() {
  const today = getTodayKey();
  elements.recordDateInput.value = today;
  elements.scheduleDateInput.value = today;
  elements.examDateInput.value = today;
}

function getTodayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function showToday() {
  const todayText = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
  elements.todayLabel.textContent = todayText;
  elements.mobileTodayLabel.textContent = todayText;
}

function showRandomQuote() {
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  elements.quoteText.textContent = quote;
  elements.mobileQuoteText.textContent = quote;
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
  showToast("테마가 저장되었습니다.");
}

function applyTheme() {
  document.body.classList.toggle("dark", state.theme === "dark");
  elements.themeToggle.textContent = state.theme === "dark" ? "☾" : "☀";
}

function addTask(event) {
  event.preventDefault();
  const subject = elements.subjectInput.value;
  const title = elements.taskInput.value.trim();
  if (!subject || !title) return;
  const subjectInfo = getSubjectInfo(subject);
  state.tasks.push({
    id: Date.now(),
    date: getTodayKey(),
    subject,
    title,
    color: subjectInfo.color,
    done: false
  });
  state.timerSettings.selectedSubject = state.timerSettings.selectedSubject || subject;
  elements.taskInput.value = "";
  saveState();
  renderAll();
  showToast("오늘 할 일을 추가했습니다.");
}

function completeTask(taskId, checkboxElement) {
  const item = checkboxElement.closest(".list-item");
  createTaskBurst(checkboxElement);
  if (item) item.classList.add("completing");
  setTimeout(() => {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    ensureSelectedSubjectExists();
    saveState();
    renderAll();
    showToast("할 일을 완료하고 정리했습니다.");
  }, 620);
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  ensureSelectedSubjectExists();
  saveState();
  renderAll();
  showToast("할 일을 삭제했습니다.");
}

function createTaskBurst(anchorElement) {
  const rect = anchorElement.getBoundingClientRect();
  const burst = document.createElement("span");
  burst.className = "task-burst";
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  for (let index = 0; index < 10; index += 1) {
    const dot = document.createElement("span");
    dot.style.setProperty("--angle", `${index * 36}deg`);
    dot.style.setProperty("--distance", `${18 + (index % 3) * 7}px`);
    dot.style.setProperty("--burst-color", ["#4f7ee8", "#54c6a4", "#f0b84d", "#e85f5f"][index % 4]);
    burst.appendChild(dot);
  }
  document.body.appendChild(burst);
  setTimeout(() => burst.remove(), 700);
}

function renderTasks() {
  const todayTasks = getTodayTasks().sort((a, b) => Number(a.done) - Number(b.done));
  elements.taskList.innerHTML = "";
  const doneCount = todayTasks.filter((task) => task.done).length;
  elements.taskCountBadge.textContent = `${doneCount} / ${todayTasks.length}`;
  elements.emptyTaskMessage.style.display = todayTasks.length ? "none" : "block";
  todayTasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = `list-item ${task.done ? "done" : ""}`;
    item.innerHTML = `
      <div class="list-main">
        <input class="task-check" type="checkbox" ${task.done ? "checked" : ""} aria-label="완료">
        <span class="subject-dot" style="background:${task.color}"></span>
        <div>
          <strong>${escapeHtml(task.subject)}</strong>
          <span>${escapeHtml(task.title)}</span>
        </div>
      </div>
    `;
    item.querySelector("input").addEventListener("change", (event) => completeTask(task.id, event.currentTarget));
    elements.taskList.appendChild(item);
  });
}

function saveSubject(event) {
  event.preventDefault();
  const name = elements.subjectNameInput.value.trim();
  if (!name) return;
  const dailyGoalMinutes = Math.max(0, Math.round(Number(elements.subjectGoalInput.value || 0) * 60));
  const color = elements.subjectColorInput.value;
  const duplicate = state.subjects.find((subject) => subject.name === name && subject.id !== editingSubjectId);
  if (duplicate) {
    showToast("이미 등록된 과목입니다.");
    return;
  }
  if (editingSubjectId) {
    state.subjects = state.subjects.map((subject) => subject.id === editingSubjectId ? { ...subject, name, color, dailyGoalMinutes } : subject);
    editingSubjectId = null;
    elements.subjectSubmitButton.textContent = "과목 저장";
  } else {
    state.subjects.push({ id: Date.now(), name, color, dailyGoalMinutes });
  }
  elements.subjectForm.reset();
  elements.subjectColorInput.value = "#5b8def";
  saveState();
  renderAll();
  showToast("과목 정보가 저장되었습니다.");
}

function editSubject(subjectId) {
  const subject = state.subjects.find((item) => item.id === subjectId);
  if (!subject) return;
  editingSubjectId = subject.id;
  elements.subjectNameInput.value = subject.name;
  elements.subjectGoalInput.value = subject.dailyGoalMinutes ? subject.dailyGoalMinutes / 60 : "";
  elements.subjectColorInput.value = subject.color;
  elements.subjectSubmitButton.textContent = "과목 수정";
  showSection("timer");
}

function deleteSubject(subjectId) {
  const subject = state.subjects.find((item) => item.id === subjectId);
  if (!subject) return;
  const inUse = state.tasks.some((task) => task.subject === subject.name) || state.sessions.some((session) => session.subject === subject.name);
  if (inUse) {
    showToast("기록에 사용된 과목은 삭제하지 않았습니다.");
    return;
  }
  state.subjects = state.subjects.filter((item) => item.id !== subjectId);
  ensureSelectedSubjectExists();
  saveState();
  renderAll();
  showToast("과목을 삭제했습니다.");
}

function renderSubjects() {
  const allSubjects = state.subjects;
  renderSubjectOptions(elements.subjectInput, true);
  renderSubjectOptions(elements.timerSubjectSelect, false);
  renderSubjectOptions(elements.recordSubjectInput, false);
  renderSubjectOptions(elements.timetableSubjectInput, false);
  elements.subjectList.innerHTML = "";
  elements.emptySubjectManageMessage.style.display = allSubjects.length ? "none" : "block";
  allSubjects.forEach((subject) => {
    const item = document.createElement("li");
    item.className = "compact-item";
    item.innerHTML = `
      <div>
        <strong><span class="subject-dot" style="background:${subject.color}"></span> ${escapeHtml(subject.name)}</strong>
        <span>일일 목표 ${formatMinutes(subject.dailyGoalMinutes)}</span>
      </div>
      <div class="item-actions">
        <button class="small-button edit" type="button">수정</button>
        <button class="danger-button delete" type="button">삭제</button>
      </div>
    `;
    item.querySelector(".edit").addEventListener("click", () => editSubject(subject.id));
    item.querySelector(".delete").addEventListener("click", () => deleteSubject(subject.id));
    elements.subjectList.appendChild(item);
  });
  renderSelectedSubjectLabels();
}

function renderSubjectOptions(selectElement, requireSubject) {
  const currentValue = selectElement.value || state.timerSettings.selectedSubject;
  selectElement.innerHTML = "";
  if (!requireSubject || !state.subjects.length) {
    selectElement.appendChild(new Option("기타", requireSubject ? "기타" : ""));
  }
  state.subjects.forEach((subject) => {
    selectElement.appendChild(new Option(subject.name, subject.name));
  });
  if (currentValue && Array.from(selectElement.options).some((option) => option.value === currentValue)) {
    selectElement.value = currentValue;
  }
}

function ensureSelectedSubjectExists() {
  if (!state.timerSettings.selectedSubject) return;
  if (!state.subjects.some((subject) => subject.name === state.timerSettings.selectedSubject)) {
    state.timerSettings.selectedSubject = "";
  }
}

function getSubjectInfo(subjectName) {
  return state.subjects.find((subject) => subject.name === subjectName) || { name: subjectName || "기타", color: "#54c6a4" };
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  clearNotice();
  timerId = setInterval(() => {
    timerSeconds -= 1;
    if (timerMode === "study") currentStudySessionSeconds += 1;
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
  if (state.timerSettings.autoStartNext) startTimer();
}

function saveStudySession(seconds) {
  if (seconds <= 0) return;
  const subject = state.timerSettings.selectedSubject || "기타";
  const subjectInfo = getSubjectInfo(subject);
  state.sessions.push({
    id: Date.now(),
    date: getTodayKey(),
    subject,
    color: subjectInfo.color,
    minutes: Math.max(1, Math.round(seconds / 60))
  });
  saveState();
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
    const canResetDisplay = (timerMode === "study" && timerSeconds === previousStudySeconds) || (timerMode === "break" && timerSeconds === previousBreakSeconds);
    if (canResetDisplay) timerSeconds = getTimerSecondsForMode(timerMode);
  }
  saveState();
  renderAll();
  showToast("타이머 설정이 저장되었습니다.");
}

function saveSelectedSubject() {
  state.timerSettings.selectedSubject = elements.timerSubjectSelect.value;
  saveState();
  renderSelectedSubjectLabels();
  showToast("현재 과목을 변경했습니다.");
}

function getTimerSecondsForMode(mode) {
  return (mode === "study" ? state.timerSettings.studyMinutes : state.timerSettings.breakMinutes) * 60;
}

function renderTimerSettings() {
  elements.studyMinutesInput.value = state.timerSettings.studyMinutes;
  elements.breakMinutesInput.value = state.timerSettings.breakMinutes;
  elements.autoStartToggle.checked = state.timerSettings.autoStartNext;
  elements.timerSubjectSelect.value = state.timerSettings.selectedSubject;
}

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
  state.goalMinutes = Math.max(0, Math.round(Number(elements.goalHoursInput.value) * 60));
  saveState();
  renderStats();
  showToast("오늘 목표 시간이 저장되었습니다.");
}

function saveMemo() {
  saveMemoValue(elements.memoInput.value, true);
}

function saveBriefingMemo() {
  saveMemoValue(elements.briefingMemoInput.value, false);
}

function saveMemoValue(value, showSavedText) {
  state.memoByDate[getTodayKey()] = value;
  if (elements.memoInput.value !== value) elements.memoInput.value = value;
  if (elements.briefingMemoInput.value !== value) elements.briefingMemoInput.value = value;
  saveState();
  if (showSavedText) {
    elements.memoSaveText.textContent = "저장됨";
    clearTimeout(saveMemoValue.timerId);
    saveMemoValue.timerId = setTimeout(() => {
      elements.memoSaveText.textContent = "자동 저장";
    }, 900);
  }
}

function saveManualRecord(event) {
  event.preventDefault();
  const id = Number(elements.recordIdInput.value);
  const subject = elements.recordSubjectInput.value || "기타";
  const subjectInfo = getSubjectInfo(subject);
  const record = {
    id: id || Date.now(),
    date: elements.recordDateInput.value,
    subject,
    color: subjectInfo.color,
    minutes: clampNumber(elements.recordMinutesInput.value, 1, 1440, 1)
  };
  if (id) {
    state.sessions = state.sessions.map((session) => session.id === id ? record : session);
  } else {
    state.sessions.push(record);
  }
  resetRecordForm();
  saveState();
  renderAll();
  showToast("공부 기록이 저장되었습니다.");
}

function editSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  elements.recordIdInput.value = session.id;
  elements.recordDateInput.value = session.date;
  elements.recordSubjectInput.value = session.subject === "기타" ? "" : session.subject;
  elements.recordMinutesInput.value = session.minutes;
  elements.recordSubmitButton.textContent = "기록 수정";
  showSection("records");
}

function deleteSession(sessionId) {
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  saveState();
  renderAll();
  showToast("공부 기록을 삭제했습니다.");
}

function resetRecordForm() {
  elements.recordIdInput.value = "";
  elements.recordDateInput.value = getTodayKey();
  elements.recordSubjectInput.value = "";
  elements.recordMinutesInput.value = "";
  elements.recordSubmitButton.textContent = "기록 저장";
}

function renderSessions() {
  const sessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 12);
  elements.sessionList.innerHTML = "";
  elements.emptySessionMessage.style.display = sessions.length ? "none" : "block";
  sessions.forEach((session) => {
    const item = document.createElement("li");
    item.className = "compact-item";
    item.innerHTML = `
      <div>
        <strong><span class="subject-dot" style="background:${session.color}"></span> ${escapeHtml(session.subject)}</strong>
        <span>${session.date} · ${formatMinutes(session.minutes)}</span>
      </div>
      <div class="item-actions">
        <button class="small-button edit" type="button">수정</button>
        <button class="danger-button delete" type="button">삭제</button>
      </div>
    `;
    item.querySelector(".edit").addEventListener("click", () => editSession(session.id));
    item.querySelector(".delete").addEventListener("click", () => deleteSession(session.id));
    elements.sessionList.appendChild(item);
  });
}

function saveSchedule(event) {
  event.preventDefault();
  const id = Number(elements.scheduleIdInput.value);
  const schedule = {
    id: id || Date.now(),
    title: elements.scheduleTitleInput.value.trim(),
    date: elements.scheduleDateInput.value,
    type: elements.scheduleTypeInput.value,
    googleEventId: id ? state.schedules.find((item) => item.id === id)?.googleEventId || "" : ""
  };
  if (!schedule.title || !schedule.date) return;
  if (id) {
    state.schedules = state.schedules.map((item) => item.id === id ? schedule : item);
  } else {
    state.schedules.push(schedule);
  }
  selectedCalendarDate = schedule.date;
  resetScheduleForm();
  saveState();
  renderAll();
  showToast("캘린더 일정이 저장되었습니다.");
}

function editSchedule(scheduleId) {
  const schedule = state.schedules.find((item) => item.id === scheduleId);
  if (!schedule) return;
  editingScheduleId = schedule.id;
  elements.scheduleIdInput.value = schedule.id;
  elements.scheduleTitleInput.value = schedule.title;
  elements.scheduleDateInput.value = schedule.date;
  elements.scheduleTypeInput.value = schedule.type;
  elements.scheduleSubmitButton.textContent = "일정 수정";
}

function deleteSchedule(scheduleId) {
  state.schedules = state.schedules.filter((schedule) => schedule.id !== scheduleId);
  saveState();
  renderCalendar();
  showToast("일정을 삭제했습니다.");
}

function resetScheduleForm() {
  editingScheduleId = null;
  elements.scheduleForm.reset();
  elements.scheduleIdInput.value = "";
  elements.scheduleDateInput.value = getTodayKey();
  elements.scheduleSubmitButton.textContent = "일정 저장";
}

function saveGoogleCalendarSettings(event) {
  event.preventDefault();
  state.googleCalendar.clientId = elements.googleClientIdInput.value.trim();
  if (!state.googleCalendar.clientId) {
    state.googleCalendar.accessToken = "";
    state.googleCalendar.tokenExpiresAt = 0;
    state.googleCalendar.profileName = "";
  }
  saveState();
  renderGoogleCalendarSettings();
  showToast("Google Calendar 설정을 저장했습니다.");
}

function connectGoogleCalendar() {
  const clientId = state.googleCalendar.clientId || elements.googleClientIdInput.value.trim();
  if (!clientId) {
    showToast("먼저 Google OAuth Client ID를 입력해 주세요.");
    return;
  }
  state.googleCalendar.clientId = clientId;
  saveState();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "token",
    scope: "https://www.googleapis.com/auth/calendar.events",
    include_granted_scopes: "true",
    prompt: "consent",
    state: "studyflow-google-calendar"
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const popup = window.open(authUrl, "studyflow-google-login", "width=520,height=720");
  if (!popup) {
    window.location.href = authUrl;
    return;
  }
  const timer = setInterval(() => {
    try {
      if (popup.closed) {
        clearInterval(timer);
        renderGoogleCalendarSettings();
        return;
      }
      const hash = popup.location.hash;
      if (!hash || !hash.includes("access_token")) return;
      saveGoogleTokenFromHash(hash);
      popup.close();
      clearInterval(timer);
      renderGoogleCalendarSettings();
      showToast("Google Calendar에 연결했습니다.");
    } catch (error) {
      // Google 로그인 화면은 다른 도메인이므로 리디렉션 전까지 접근할 수 없습니다.
    }
  }, 500);
}

function handleGoogleAuthRedirect() {
  if (!window.location.hash.includes("access_token")) return;
  saveGoogleTokenFromHash(window.location.hash);
  history.replaceState(null, document.title, `${location.pathname}${location.search}`);
}

function saveGoogleTokenFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("access_token");
  const expiresIn = Number(params.get("expires_in") || 3600);
  if (!token) return;
  state.googleCalendar.accessToken = token;
  state.googleCalendar.tokenExpiresAt = Date.now() + Math.max(60, expiresIn - 60) * 1000;
  saveState();
}

function disconnectGoogleCalendar() {
  state.googleCalendar.accessToken = "";
  state.googleCalendar.tokenExpiresAt = 0;
  state.googleCalendar.profileName = "";
  saveState();
  renderGoogleCalendarSettings();
  showToast("Google Calendar 연결을 해제했습니다.");
}

async function importGoogleCalendarEvents() {
  if (!hasValidGoogleToken()) {
    showToast("Google 로그인이 필요합니다.");
    return;
  }
  const start = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
  const end = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "80"
  });
  try {
    const data = await fetchGoogleCalendar(`/events?${params.toString()}`);
    const existingIds = new Set(state.schedules.map((schedule) => schedule.googleEventId).filter(Boolean));
    let addedCount = 0;
    (data.items || []).forEach((eventItem) => {
      if (!eventItem.id || existingIds.has(eventItem.id)) return;
      const date = getDateFromGoogleEvent(eventItem);
      if (!date) return;
      state.schedules.push({
        id: Date.now() + Math.random(),
        title: eventItem.summary || "Google 일정",
        date,
        type: "etc",
        googleEventId: eventItem.id
      });
      addedCount += 1;
    });
    saveState();
    renderAll();
    showToast(`${addedCount}개의 Google 일정을 가져왔습니다.`);
  } catch (error) {
    showToast("Google 일정 가져오기에 실패했습니다.");
  }
}

async function exportSchedulesToGoogleCalendar() {
  if (!hasValidGoogleToken()) {
    showToast("Google 로그인이 필요합니다.");
    return;
  }
  const exportItems = [
    ...state.schedules.map((item) => ({ ...item, source: "schedule" })),
    ...state.exams.map((item) => ({
      id: item.id,
      title: item.name,
      date: item.date,
      type: "exam",
      googleEventId: item.googleEventId || "",
      source: "exam"
    }))
  ];
  let exportedCount = 0;
  try {
    for (const item of exportItems) {
      if (item.googleEventId) continue;
      const nextDate = new Date(item.date);
      nextDate.setDate(nextDate.getDate() + 1);
      const eventBody = {
        summary: item.source === "exam" ? `[시험] ${item.title}` : item.title,
        description: `StudyFlow Web에서 만든 ${getScheduleTypeLabel(item.type)} 일정입니다.`,
        start: { date: item.date },
        end: { date: toDateKey(nextDate) }
      };
      const created = await fetchGoogleCalendar("/events", {
        method: "POST",
        body: JSON.stringify(eventBody)
      });
      if (item.source === "schedule") {
        state.schedules = state.schedules.map((schedule) => schedule.id === item.id ? { ...schedule, googleEventId: created.id } : schedule);
      } else {
        state.exams = state.exams.map((exam) => exam.id === item.id ? { ...exam, googleEventId: created.id } : exam);
      }
      exportedCount += 1;
    }
    saveState();
    renderAll();
    showToast(`${exportedCount}개의 일정을 Google Calendar로 보냈습니다.`);
  } catch (error) {
    showToast("Google Calendar 내보내기에 실패했습니다.");
  }
}

function renderGoogleCalendarSettings() {
  const google = state.googleCalendar;
  elements.googleClientIdInput.value = google.clientId || "";
  const connected = hasValidGoogleToken();
  elements.googleStatusBadge.textContent = connected ? "연결됨" : "미연결";
  elements.googleStatusBadge.classList.toggle("connected", connected);
  elements.googleStatusText.textContent = connected
    ? "앱의 일정 페이지와 Google Calendar를 가져오기/내보내기로 동기화할 수 있습니다."
    : `Google Cloud OAuth Client ID가 필요합니다. 승인된 리디렉션 URI: ${getGoogleRedirectUri()}`;
}

function hasValidGoogleToken() {
  return Boolean(state.googleCalendar.accessToken && state.googleCalendar.tokenExpiresAt > Date.now());
}

function getGoogleRedirectUri() {
  return `${location.origin}${location.pathname}`;
}

async function fetchGoogleCalendar(path, options = {}) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(state.googleCalendar.calendarId || "primary")}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.googleCalendar.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    disconnectGoogleCalendar();
    throw new Error("Google token expired");
  }
  if (!response.ok) throw new Error("Google Calendar request failed");
  return response.json();
}

function getDateFromGoogleEvent(eventItem) {
  if (eventItem.start?.date) return eventItem.start.date;
  if (eventItem.start?.dateTime) return eventItem.start.dateTime.slice(0, 10);
  return "";
}

function saveExam(event) {
  event.preventDefault();
  const name = elements.examNameInput.value.trim();
  const date = elements.examDateInput.value;
  if (!name || !date) return;
  if (editingExamId) {
    state.exams = state.exams.map((exam) => exam.id === editingExamId ? { ...exam, name, date } : exam);
    editingExamId = null;
    elements.examSubmitButton.textContent = "추가";
  } else {
    state.exams.push({ id: Date.now(), name, date });
  }
  elements.examForm.reset();
  elements.examDateInput.value = getTodayKey();
  saveState();
  renderAll();
  showToast("시험 일정이 저장되었습니다.");
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
  saveState();
  renderAll();
  showToast("시험 일정을 삭제했습니다.");
}

function renderExams() {
  const sortedExams = [...state.exams].sort((a, b) => new Date(a.date) - new Date(b.date));
  elements.examList.innerHTML = "";
  elements.emptyExamMessage.style.display = sortedExams.length ? "none" : "block";
  sortedExams.forEach((exam) => {
    const diff = getDayDiff(exam.date);
    const item = document.createElement("li");
    item.className = `compact-item ${diff >= 0 && diff <= 7 ? "urgent" : ""}`;
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(exam.name)} · ${getDdayText(exam.date)}</strong>
        <span>${exam.date}</span>
      </div>
      <div class="item-actions">
        <button class="small-button edit" type="button">수정</button>
        <button class="danger-button delete" type="button">삭제</button>
      </div>
    `;
    item.querySelector(".edit").addEventListener("click", () => editExam(exam.id));
    item.querySelector(".delete").addEventListener("click", () => deleteExam(exam.id));
    elements.examList.appendChild(item);
  });
}

function changeMonth(offset) {
  calendarCursor.setMonth(calendarCursor.getMonth() + offset);
  renderCalendar();
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  elements.calendarTitle.textContent = `${year}년 ${month + 1}월`;
  elements.calendarGrid.innerHTML = "";
  WEEK_DAYS.forEach((day) => {
    const header = document.createElement("div");
    header.className = "calendar-header-cell";
    header.textContent = day;
    elements.calendarGrid.appendChild(header);
  });
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i += 1) {
    elements.calendarGrid.appendChild(document.createElement("div"));
  }
  for (let date = 1; date <= lastDate; date += 1) {
    const dateKey = toDateKey(new Date(year, month, date));
    const events = getEventsForDate(dateKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day ${dateKey === getTodayKey() ? "today" : ""} ${dateKey === selectedCalendarDate ? "selected" : ""}`;
    button.innerHTML = `<strong>${date}</strong>${events.length ? `<span>${events.length}</span>` : ""}`;
    button.addEventListener("click", () => {
      selectedCalendarDate = dateKey;
      renderCalendar();
    });
    elements.calendarGrid.appendChild(button);
  }
  renderSelectedDateEvents();
}

function renderSelectedDateEvents() {
  elements.selectedDateTitle.textContent = `${selectedCalendarDate} 일정`;
  const events = getEventsForDate(selectedCalendarDate);
  elements.selectedDateEventList.innerHTML = "";
  if (!events.length) {
    elements.selectedDateEventList.innerHTML = `<li class="empty-message">선택한 날짜에 등록된 일정이 없습니다.</li>`;
    return;
  }
  events.forEach((eventItem) => {
    const item = document.createElement("li");
    item.className = "compact-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(eventItem.title)}</strong>
        <span>${eventItem.kind}</span>
      </div>
      ${eventItem.source === "schedule" ? `<div class="item-actions"><button class="small-button edit" type="button">수정</button><button class="danger-button delete" type="button">삭제</button></div>` : ""}
    `;
    if (eventItem.source === "schedule") {
      item.querySelector(".edit").addEventListener("click", () => editSchedule(eventItem.id));
      item.querySelector(".delete").addEventListener("click", () => deleteSchedule(eventItem.id));
    }
    elements.selectedDateEventList.appendChild(item);
  });
}

function getEventsForDate(dateKey) {
  const schedules = state.schedules.filter((schedule) => schedule.date === dateKey).map((schedule) => ({
    id: schedule.id,
    title: schedule.title,
    kind: getScheduleTypeLabel(schedule.type),
    source: "schedule"
  }));
  const exams = state.exams.filter((exam) => exam.date === dateKey).map((exam) => ({
    id: exam.id,
    title: exam.name,
    kind: "시험 D-day",
    source: "exam"
  }));
  return [...schedules, ...exams];
}

function getScheduleTypeLabel(type) {
  return { study: "공부", assignment: "과제", exam: "시험", etc: "기타" }[type] || "기타";
}

function saveTimetable(event) {
  event.preventDefault();
  const id = Number(elements.timetableIdInput.value);
  const subject = elements.timetableSubjectInput.value || "기타";
  const item = {
    id: id || Date.now(),
    day: Number(elements.timetableDayInput.value),
    start: elements.timetableStartInput.value,
    end: elements.timetableEndInput.value,
    subject,
    memo: elements.timetableMemoInput.value.trim(),
    color: getSubjectInfo(subject).color
  };
  if (!item.start || !item.end || item.start >= item.end) {
    showToast("시간표 시간을 확인해주세요.");
    return;
  }
  if (id) {
    state.timetable = state.timetable.map((entry) => entry.id === id ? item : entry);
  } else {
    state.timetable.push(item);
  }
  resetTimetableForm();
  saveState();
  renderTimetable();
  showToast("시간표가 저장되었습니다.");
}

function editTimetable(itemId) {
  const item = state.timetable.find((entry) => entry.id === itemId);
  if (!item) return;
  editingTimetableId = item.id;
  elements.timetableIdInput.value = item.id;
  elements.timetableDayInput.value = item.day;
  elements.timetableStartInput.value = item.start;
  elements.timetableEndInput.value = item.end;
  elements.timetableSubjectInput.value = item.subject === "기타" ? "" : item.subject;
  elements.timetableMemoInput.value = item.memo;
  elements.timetableSubmitButton.textContent = "시간표 수정";
}

function deleteTimetable(itemId) {
  state.timetable = state.timetable.filter((entry) => entry.id !== itemId);
  saveState();
  renderTimetable();
  showToast("시간표를 삭제했습니다.");
}

function resetTimetableForm() {
  editingTimetableId = null;
  elements.timetableForm.reset();
  elements.timetableIdInput.value = "";
  elements.timetableSubmitButton.textContent = "시간표 저장";
}

function renderTimetable() {
  elements.timetableGrid.innerHTML = "";
  const board = document.createElement("div");
  board.className = "timetable-board";
  const weekStart = getWeekStart(new Date());
  board.appendChild(createTimetableCorner());
  [0, 1, 2, 3, 4, 5, 6].forEach((day, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const header = document.createElement("div");
    header.className = `timetable-header ${toDateKey(date) === getTodayKey() ? "today" : ""}`;
    header.style.gridColumn = `${index + 2}`;
    header.style.gridRow = "1";
    header.innerHTML = `<span>${WEEK_DAYS[day]}</span><strong>${date.getDate()}</strong>`;
    board.appendChild(header);
  });
  for (let hour = 7; hour <= 21; hour += 1) {
    const label = document.createElement("div");
    label.className = "timetable-time";
    label.style.gridColumn = "1";
    label.style.gridRow = `${(hour - 7) * 2 + 2} / span 2`;
    label.innerHTML = `<strong>${hour}</strong><span>${hour < 12 ? "am" : "pm"}</span>`;
    board.appendChild(label);
  }
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    for (let slot = 0; slot < 30; slot += 1) {
      const cell = document.createElement("div");
      cell.className = `timetable-cell ${slot % 2 === 0 ? "hour-line" : ""}`;
      cell.style.gridColumn = `${dayIndex + 2}`;
      cell.style.gridRow = `${slot + 2}`;
      board.appendChild(cell);
    }
  }
  const dayOrder = [0, 1, 2, 3, 4, 5, 6];
  state.timetable.forEach((entry) => {
    const dayIndex = dayOrder.indexOf(entry.day);
    const startSlot = timeToTimetableSlot(entry.start);
    const endSlot = timeToTimetableSlot(entry.end);
    if (dayIndex === -1 || startSlot === null || endSlot === null || endSlot <= startSlot) return;
    const block = document.createElement("div");
    block.className = "timetable-entry";
    block.style.gridColumn = `${dayIndex + 2}`;
    block.style.gridRow = `${startSlot + 2} / span ${Math.max(1, endSlot - startSlot)}`;
    block.style.background = entry.color;
    block.innerHTML = `
      <strong>${escapeHtml(entry.subject)}</strong>
      <span>${entry.start} - ${entry.end}</span>
      ${entry.memo ? `<em>${escapeHtml(entry.memo)}</em>` : ""}
      <div class="timetable-actions">
        <button class="small-button edit" type="button">수정</button>
        <button class="danger-button delete" type="button">삭제</button>
      </div>
    `;
    block.querySelector(".edit").addEventListener("click", () => editTimetable(entry.id));
    block.querySelector(".delete").addEventListener("click", () => deleteTimetable(entry.id));
    board.appendChild(block);
  });
  elements.timetableGrid.appendChild(board);
}

function createTimetableCorner() {
  const corner = document.createElement("div");
  corner.className = "timetable-corner";
  corner.style.gridColumn = "1";
  corner.style.gridRow = "1";
  corner.textContent = "이번 주";
  return corner;
}

function timeToTimetableSlot(time) {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const totalMinutes = hours * 60 + minutes;
  const slot = Math.floor((totalMinutes - 7 * 60) / 30);
  return Math.max(0, Math.min(30, slot));
}

function renderStats() {
  const todayMinutes = getStudyMinutesForDate(getTodayKey());
  const weekMinutes = getWeekStudyMinutes();
  const progress = state.goalMinutes ? Math.min(100, Math.round((todayMinutes / state.goalMinutes) * 100)) : 0;
  const remainingTasks = getTodayTasks().filter((task) => !task.done).length;
  elements.goalHoursInput.value = state.goalMinutes ? state.goalMinutes / 60 : "";
  elements.goalText.textContent = `목표 ${formatMinutes(state.goalMinutes)}`;
  elements.goalPercent.textContent = `${progress}%`;
  elements.goalProgress.style.width = `${progress}%`;
  elements.goalMessage.textContent = state.goalMinutes ? `오늘 ${formatMinutes(Math.max(0, state.goalMinutes - todayMinutes))} 더 공부하면 목표 달성입니다.` : "오늘의 목표를 정하면 진행률이 표시됩니다.";
  elements.todayStudyTime.textContent = formatMinutes(todayMinutes);
  elements.timerTodayStudyTime.textContent = formatMinutes(todayMinutes);
  elements.weekStudyTime.textContent = formatMinutes(weekMinutes);
  elements.weekAverageStudyTime.textContent = formatMinutes(Math.round(weekMinutes / 7));
  elements.timerGoalPercent.textContent = `${progress}%`;
  elements.summaryTodayStudy.textContent = formatMinutes(todayMinutes);
  elements.summaryGoalPercent.textContent = `${progress}%`;
  elements.summaryRemainingTasks.textContent = `${remainingTasks}개`;
  elements.streakCount.textContent = `${calculateStreak()}일 연속`;
  elements.summaryNextDday.textContent = getNextDdaySummary();
  elements.briefingTodayStudy.textContent = formatMinutes(todayMinutes);
  elements.briefingGoalPercent.textContent = `${progress}%`;
  elements.briefingRemainingTasks.textContent = `${remainingTasks}개`;
  elements.briefingNextDday.textContent = getNextDdaySummary();
  if (state.goalMinutes && todayMinutes >= state.goalMinutes && state.lastGoalCelebratedDate !== getTodayKey()) {
    state.lastGoalCelebratedDate = getTodayKey();
    saveState();
    showToast("오늘 목표를 달성했습니다!");
  }
  renderWeeklyBars();
  renderSubjectTimes();
}

function getMemoPreview() {
  const memo = (state.memoByDate[getTodayKey()] || "").trim();
  if (!memo) return "아직 메모가 없습니다.";
  const firstLine = memo.split(/\r?\n/)[0];
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}...` : firstLine;
}

function renderWeeklyBars() {
  const days = getWeekDateKeys();
  const maxMinutes = Math.max(1, ...days.map((dateKey) => getStudyMinutesForDate(dateKey)));
  elements.weeklyBars.innerHTML = "";
  days.forEach((dateKey) => {
    const minutes = getStudyMinutesForDate(dateKey);
    const date = new Date(dateKey);
    const item = document.createElement("div");
    item.className = "bar-item";
    item.innerHTML = `
      <div class="bar-track"><span style="height:${Math.max(4, Math.round((minutes / maxMinutes) * 100))}%"></span></div>
      <strong>${WEEK_DAYS[date.getDay()]}</strong>
      <small>${formatMinutes(minutes)}</small>
    `;
    elements.weeklyBars.appendChild(item);
  });
}

function renderSubjectTimes() {
  const subjectMap = {};
  state.sessions.filter((session) => session.date === getTodayKey()).forEach((session) => {
    if (!subjectMap[session.subject]) subjectMap[session.subject] = { minutes: 0, color: session.color };
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

function renderMemo() {
  const memo = state.memoByDate[getTodayKey()] || "";
  elements.memoInput.value = memo;
  elements.briefingMemoInput.value = memo;
}

function renderAll() {
  renderSubjects();
  renderTimerSettings();
  renderTimer();
  renderTasks();
  renderStats();
  renderSessions();
  renderExams();
  renderCalendar();
  renderTimetable();
  renderMemo();
  renderGoogleCalendarSettings();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `studyflow-backup-${getTodayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("백업 파일을 만들었습니다.");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      saveState();
      timerMode = "study";
      timerSeconds = getTimerSecondsForMode(timerMode);
      renderAll();
      showToast("데이터를 복원했습니다.");
    } catch (error) {
      showToast("복원 파일을 읽지 못했습니다.");
    }
    elements.importDataInput.value = "";
  };
  reader.readAsText(file);
}

function getTodayTasks() {
  return state.tasks.filter((task) => task.date === getTodayKey());
}

function getStudyMinutesForDate(dateKey) {
  return state.sessions.filter((session) => session.date === dateKey).reduce((total, session) => total + session.minutes, 0);
}

function getWeekDateKeys() {
  const today = new Date(getTodayKey());
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toDateKey(date);
  });
}

function getWeekStart(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function getWeekStudyMinutes() {
  return getWeekDateKeys().reduce((total, dateKey) => total + getStudyMinutesForDate(dateKey), 0);
}

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

function getDdayText(dateText) {
  const diffDays = getDayDiff(dateText);
  if (diffDays === 0) return "D-day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)}`;
}

function getDayDiff(dateText) {
  return Math.ceil((new Date(dateText) - new Date(getTodayKey())) / (1000 * 60 * 60 * 24));
}

function getNextDdaySummary() {
  const upcoming = state.exams
    .map((exam) => ({ ...exam, diff: getDayDiff(exam.date) }))
    .filter((exam) => exam.diff >= 0)
    .sort((a, b) => a.diff - b.diff)[0];
  return upcoming ? `${upcoming.name} ${getDdayText(upcoming.date)}` : "없음";
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function formatMinutes(minutes) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}시간 ${rest}분`;
  if (hours) return `${hours}시간`;
  return `${rest}분`;
}

function showTimerNotice(message) {
  elements.timerNotice.textContent = message;
  elements.focusNotice.textContent = message;
}

function clearNotice() {
  showTimerNotice("");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timerId);
  showToast.timerId = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 1800);
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
