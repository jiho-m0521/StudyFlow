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
  merged.sessions = Array.isArray(merged.sessions) ? merged.sessions : [];
  merged.subjects = Array.isArray(merged.subjects) ? merged.subjects : [];
  merged.schedules = Array.isArray(merged.schedules) ? merged.schedules : [];
  merged.timetable = Array.isArray(merged.timetable) ? merged.timetable : [];
  merged.exams = Array.isArray(merged.exams) ? merged.exams : [];
  merged.memoByDate = merged.memoByDate && typeof merged.memoByDate === "object" ? merged.memoByDate : {};
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
  elements.todayLabel.textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
}

function showRandomQuote() {
  elements.quoteText.textContent = quotes[Math.floor(Math.random() * quotes.length)];
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

function toggleTask(taskId) {
  state.tasks = state.tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
  saveState();
  renderAll();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  ensureSelectedSubjectExists();
  saveState();
  renderAll();
  showToast("할 일을 삭제했습니다.");
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
        <input type="checkbox" ${task.done ? "checked" : ""} aria-label="완료">
        <span class="subject-dot" style="background:${task.color}"></span>
        <div>
          <strong>${escapeHtml(task.subject)}</strong>
          <span>${escapeHtml(task.title)}</span>
        </div>
      </div>
      <button class="danger-button" type="button">삭제</button>
    `;
    item.querySelector("input").addEventListener("change", () => toggleTask(task.id));
    item.querySelector("button").addEventListener("click", () => deleteTask(task.id));
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
  state.memoByDate[getTodayKey()] = elements.memoInput.value;
  elements.memoSaveText.textContent = "저장됨";
  saveState();
  setTimeout(() => {
    elements.memoSaveText.textContent = "자동 저장";
  }, 900);
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
    type: elements.scheduleTypeInput.value
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
  [1, 2, 3, 4, 5, 6, 0].forEach((day) => {
    const column = document.createElement("div");
    column.className = "timetable-day";
    column.innerHTML = `<strong>${WEEK_DAYS[day]}</strong>`;
    const entries = state.timetable.filter((item) => item.day === day).sort((a, b) => a.start.localeCompare(b.start));
    if (!entries.length) {
      column.insertAdjacentHTML("beforeend", `<p class="empty-message">비어 있음</p>`);
    }
    entries.forEach((entry) => {
      const block = document.createElement("div");
      block.className = "timetable-block";
      block.style.borderLeftColor = entry.color;
      block.innerHTML = `
        <strong>${escapeHtml(entry.subject)}</strong>
        <span>${entry.start} - ${entry.end}</span>
        ${entry.memo ? `<span>${escapeHtml(entry.memo)}</span>` : ""}
        <div class="item-actions">
          <button class="small-button edit" type="button">수정</button>
          <button class="danger-button delete" type="button">삭제</button>
        </div>
      `;
      block.querySelector(".edit").addEventListener("click", () => editTimetable(entry.id));
      block.querySelector(".delete").addEventListener("click", () => deleteTimetable(entry.id));
      column.appendChild(block);
    });
    elements.timetableGrid.appendChild(column);
  });
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
  if (state.goalMinutes && todayMinutes >= state.goalMinutes && state.lastGoalCelebratedDate !== getTodayKey()) {
    state.lastGoalCelebratedDate = getTodayKey();
    saveState();
    showToast("오늘 목표를 달성했습니다!");
  }
  renderWeeklyBars();
  renderSubjectTimes();
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
  elements.memoInput.value = state.memoByDate[getTodayKey()] || "";
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
