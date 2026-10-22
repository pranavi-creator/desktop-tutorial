"use strict";

const STORAGE_KEYS = {
  tasks: "studyspace.tasks",
  theme: "studyspace.theme",
  sessions: "studyspace.sessions"
};

// Keep app state in memory while LocalStorage makes it persist between visits.
const TIMER_LENGTHS = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
const STUDY_TIPS = [
  "Try a 25-minute focus sprint, then step away for a short break.",
  "Before you begin, write down one clear goal for this study session.",
  "Recall what you learned without notes, then check what you missed.",
  "Put your phone out of reach to make focused study easier.",
  "Mix practice questions with reading to strengthen your understanding.",
  "Short, spaced revision sessions are easier to remember than cramming.",
  "After a study block, stretch and drink some water before the next one."
];
const views = ["dashboard", "tasks", "schedule", "timer", "progress"];
const viewTitles = {
  dashboard: "Dashboard",
  tasks: "My tasks",
  schedule: "Schedule",
  timer: "Focus timer",
  progress: "Progress"
};

let tasks = loadTasks();
let sessions = loadSessions();
let editingTaskId = null;
let toastTimeout = null;
let timerInterval = null;
let timerMode = "focus";
let timerSeconds = TIMER_LENGTHS.focus;
let timerRunning = false;
let todayTaskFilter = "all";

const elements = {
  todayDate: document.getElementById("todayDate"),
  taskDialog: document.getElementById("taskDialog"),
  taskForm: document.getElementById("taskForm"),
  formError: document.getElementById("formError"),
  taskList: document.getElementById("taskList"),
  scheduleList: document.getElementById("scheduleList"),
  toast: document.getElementById("toast"),
  timerDisplay: document.getElementById("timerDisplay"),
  timerMode: document.getElementById("timerMode"),
  timerCaption: document.getElementById("timerCaption")
};

function loadTasks() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEYS.tasks) || "[]");
    if (!Array.isArray(savedTasks)) {
      throw new Error("Saved study tasks are not in the expected format.");
    }
    return savedTasks.filter(isValidStoredTask);
  } catch (error) {
    console.error("Unable to load study tasks:", error);
    window.setTimeout(() => showToast("Saved tasks could not be loaded. Check browser storage.", true), 0);
    return [];
  }
}

// Ignore malformed or outdated entries so one bad record cannot break the app.
function isValidStoredTask(task) {
  return task && typeof task.id === "string" &&
    typeof task.subject === "string" && typeof task.topic === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(task.date) &&
    localDateString(dateFromString(task.date)) === task.date &&
    (task.time === "" || /^\d{2}:\d{2}$/.test(task.time)) &&
    Number.isInteger(Number(task.duration)) && Number(task.duration) >= 1 && Number(task.duration) <= 720 &&
    ["high", "medium", "low"].includes(task.priority) &&
    ["pending", "completed"].includes(task.status);
}

function loadSessions() {
  try {
    const savedSessions = JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || "[]");
    if (!Array.isArray(savedSessions)) {
      throw new Error("Saved focus sessions are not in the expected format.");
    }
    return savedSessions.filter(session =>
      session && typeof session.id === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(session.date) &&
      Number.isInteger(session.minutes) && session.minutes > 0
    );
  } catch (error) {
    console.error("Unable to load focus sessions:", error);
    window.setTimeout(() => showToast("Focus history could not be loaded from browser storage.", true), 0);
    return [];
  }
}

function saveSessions() {
  try {
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.error("Unable to save focus sessions:", error);
    showToast("Focus session history could not be saved.", true);
    return false;
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Unable to save study tasks:", error);
    showToast("Your changes could not be saved. Browser storage may be full or unavailable.", true);
    return false;
  }
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateString, options = { month: "short", day: "numeric" }) {
  return dateFromString(dateString).toLocaleDateString(undefined, options);
}

function taskDateTime(task) {
  const date = dateFromString(task.date);
  if (task.time) {
    const [hours, minutes] = task.time.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function compareTasks(first, second) {
  return taskDateTime(first) - taskDateTime(second);
}

function isOverdue(task) {
  return task.status === "pending" && taskDateTime(task) < new Date();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("show"), 3000);
}

function setActiveView(viewName) {
  if (!views.includes(viewName)) return;
  if (viewName !== "timer" && timerRunning) pauseTimer();
  views.forEach(view => {
    const section = document.getElementById(`${view}View`);
    const active = view === viewName;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.querySelectorAll(".nav-link").forEach(button => {
    const active = button.dataset.view === viewName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.getElementById("breadcrumbPage").textContent = viewTitles[viewName];
  if (window.matchMedia("(max-width: 520px)").matches) setMobileNavigation(false);
}

function setMobileNavigation(isOpen) {
  document.body.classList.toggle("mobile-nav-closed", !isOpen);
  document.getElementById("mobileNavBackdrop").hidden = !isOpen;
  document.getElementById("mobileNavToggle").setAttribute("aria-expanded", String(isOpen));
  document.getElementById("mobileNavToggle").setAttribute(
    "aria-label",
    `${isOpen ? "Close" : "Open"} navigation menu`
  );
  document.getElementById("mobileNavToggle").textContent = isOpen ? "☰" : "☷";
}

function renderAll() {
  // Refresh every screen that depends on tasks after each change.
  renderDashboard();
  renderSubjectFilter();
  renderTaskList();
  renderSchedule();
  renderTimerTaskOptions();
  renderProgress();
}

function renderDashboard() {
  const today = localDateString();
  const todayTasks = tasks.filter(task => task.date === today);
  const todayCompleted = todayTasks.filter(task => task.status === "completed").length;
  const completedTasks = tasks.filter(task => task.status === "completed").length;
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  document.getElementById("totalTasks").textContent = tasks.length;
  document.getElementById("completedTasks").textContent = completedTasks;
  document.getElementById("pendingTasks").textContent = tasks.filter(task => task.status === "pending").length;
  document.getElementById("overallPercent").textContent = `${completionRate}%`;
  document.getElementById("overallFraction").textContent = `${completedTasks} of ${tasks.length} done`;
  document.getElementById("todayFraction").textContent = `${todayCompleted} of ${todayTasks.length} done`;
  document.getElementById("overallProgressBar").style.width = `${completionRate}%`;
  document.getElementById("todayProgressBar").style.width =
    `${todayTasks.length ? Math.round((todayCompleted / todayTasks.length) * 100) : 0}%`;

  const upcoming = tasks.filter(task => task.date >= today).sort(compareTasks).slice(0, 4);
  const upcomingList = document.getElementById("upcomingList");
  upcomingList.innerHTML = upcoming.length ? upcoming.map(task => `
    <article class="upcoming-item">
      <div class="date-chip"><strong>${escapeHtml(formatDate(task.date))}</strong><span>${escapeHtml(dateFromString(task.date).toLocaleDateString(undefined, { weekday: "short" }))}</span></div>
      <span class="item-accent ${task.priority}" aria-hidden="true"></span>
      <div class="upcoming-details"><strong>${escapeHtml(task.subject)} · ${escapeHtml(task.topic)}</strong><span>${escapeHtml(task.duration)} min · ${escapeHtml(task.priority)} priority</span></div>
      <span class="upcoming-status status-badge ${task.status}">${escapeHtml(capitalize(task.status))}</span>
    </article>`).join("") : `${emptyState("Nothing scheduled yet", "Add a study task and it will show up here.")}<div class="empty-action"><button class="button button-primary" type="button" data-open-task>Add a task</button></div>`;

  const todayList = document.getElementById("dashboardTaskList");
  const todaySearch = document.getElementById("todaySearch").value.trim().toLocaleLowerCase();
  const todaySorted = todayTasks.filter(task =>
    (todayTaskFilter === "all" ||
      (todayTaskFilter === "high" ? task.priority === "high" : task.status === todayTaskFilter)) &&
    (!todaySearch || `${task.topic} ${task.subject} ${task.description || ""}`.toLocaleLowerCase().includes(todaySearch))
  ).sort(compareTasks);
  todayList.innerHTML = todaySorted.length
    ? todaySorted.slice(0, 5).map(compactTaskMarkup).join("")
    : todayTasks.length
      ? emptyState("No tasks in this view", "Choose another quick filter to see today's tasks.")
      : emptyState("A fresh page", "You don't have any tasks planned for today.");
  renderRecommendation(todayTasks);
  document.getElementById("tipCopy").textContent = STUDY_TIPS[new Date().getDay()];
}

function renderRecommendation(todayTasks) {
  const pending = tasks.filter(task => task.status === "pending").sort((first, second) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const overdueOrder = Number(isOverdue(second)) - Number(isOverdue(first));
    return overdueOrder || task.date.localeCompare(second.date) ||
      priorityOrder[first.priority] - priorityOrder[second.priority] ||
      taskDateTime(first) - taskDateTime(second);
  });
  const bestTask = pending[0];
  let mainContent;
  if (bestTask) {
    const dueDescription = isOverdue(bestTask)
      ? "This task is overdue, so it's a good one to tackle next."
      : `Scheduled for ${formatDate(bestTask.date, { month: "long", day: "numeric" })}${bestTask.time ? ` at ${formatTime(bestTask.time)}` : ""}.`;
    mainContent = `<div class="recommendation-main"><p class="recommendation-kicker">Suggested next</p><strong>${escapeHtml(bestTask.subject)} · ${escapeHtml(bestTask.topic)}</strong><p>${escapeHtml(dueDescription)} ${escapeHtml(capitalize(bestTask.priority))} priority.</p></div>`;
  } else {
    mainContent = `<div class="recommendation-main"><p class="recommendation-kicker">You're all caught up</p><strong>Great work showing up!</strong><p>Add a task whenever you're ready to plan your next study session.</p></div>`;
  }

  const busyDays = Object.entries(tasks.reduce((counts, task) => {
    if (task.status === "pending") counts[task.date] = (counts[task.date] || 0) + 1;
    return counts;
  }, {})).filter(([, count]) => count >= 4).sort(([first], [second]) => first.localeCompare(second));
  const notes = [];
  if (todayTasks.filter(task => task.status === "pending").length >= 4) {
    notes.push("A full day ahead? Try splitting it into shorter study blocks.");
  } else if (busyDays.length) {
    notes.push(`${formatDate(busyDays[0][0])} is a busy day with ${busyDays[0][1]} pending tasks. Consider spreading them out.`);
  }
  const adjacentSessions = tasks.filter(task =>
    task.status === "pending" && task.date === localDateString() && task.time
  ).sort(compareTasks);
  if (hasBackToBackSessions(adjacentSessions)) {
    notes.push("Your sessions are close together. Plan a 5–10 minute break between them.");
  } else if (bestTask) {
    notes.push("A short break between study sessions can help you stay refreshed.");
  }
  const doneToday = todayTasks.filter(task => task.status === "completed").length;
  const motivation = todayTasks.length === 0
    ? "Make a simple plan for today and start with one small task."
    : doneToday === todayTasks.length
      ? "You completed today's plan. Celebrate that progress!"
      : doneToday > 0
        ? "Nice momentum — you've already completed a task today."
        : "Start with one focused session. You can do this.";
  notes.push(motivation);
  document.getElementById("recommendationContent").innerHTML =
    mainContent + notes.map(note => `<p class="recommendation-note">✦ ${escapeHtml(note)}</p>`).join("");
}

function hasBackToBackSessions(dayTasks) {
  return dayTasks.some((task, index) => {
    const next = dayTasks[index + 1];
    if (!next) return false;
    const gapMinutes = (taskDateTime(next) - taskDateTime(task)) / 60000 - Number(task.duration);
    return gapMinutes >= 0 && gapMinutes < 10;
  });
}

function compactTaskMarkup(task) {
  return `<article class="compact-task ${task.status === "completed" ? "completed" : ""}">
    <button class="check-button ${task.status === "completed" ? "is-complete" : ""}" type="button" data-toggle-task="${escapeHtml(task.id)}" aria-label="${task.status === "completed" ? "Mark as pending" : "Mark as completed"}">${task.status === "completed" ? "✓" : ""}</button>
    <div class="compact-task-main"><strong>${escapeHtml(task.topic)}</strong><span>${escapeHtml(task.subject)} · ${escapeHtml(task.duration)} min · ${escapeHtml(capitalize(task.priority))} priority</span></div>
    <span class="compact-task-time">${task.time ? escapeHtml(formatTime(task.time)) : "Any time"}</span>
    <div class="task-actions compact-actions">
      <button class="icon-button" type="button" data-edit-task="${escapeHtml(task.id)}" aria-label="Edit ${escapeHtml(task.topic)}">✎</button>
      <button class="icon-button delete" type="button" data-delete-task="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.topic)}">×</button>
    </div>
  </article>`;
}

function emptyState(title, message) {
  return `<div class="empty-state"><span class="empty-illustration" aria-hidden="true">✦</span><strong>${escapeHtml(title)}</strong>${escapeHtml(message)}</div>`;
}

function renderTaskList() {
  const subject = document.getElementById("subjectFilter").value;
  const date = document.getElementById("dateFilter").value;
  const status = document.getElementById("statusFilter").value;
  const priority = document.getElementById("priorityFilter").value;
  const search = document.getElementById("taskSearch").value.trim().toLocaleLowerCase();
  const sortBy = document.getElementById("sortFilter").value;
  const filtered = tasks.filter(task =>
    (!subject || task.subject === subject) &&
    (!date || task.date === date) &&
    (!status || task.status === status) &&
    (!priority || task.priority === priority) &&
    (!search || `${task.topic} ${task.subject} ${task.description || ""}`.toLocaleLowerCase().includes(search))
  ).sort((first, second) => {
    if (sortBy === "priority") {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[first.priority] - rank[second.priority] || compareTasks(first, second);
    }
    if (sortBy === "created") {
      return String(second.createdAt || "").localeCompare(String(first.createdAt || "")) || compareTasks(first, second);
    }
    return compareTasks(first, second);
  });
  document.getElementById("taskListSummary").textContent =
    `${filtered.length} ${filtered.length === 1 ? "task" : "tasks"}${filtered.length !== tasks.length ? ` shown · ${tasks.length} total` : ""}`;
  elements.taskList.innerHTML = filtered.length
    ? filtered.map(taskCardMarkup).join("")
    : emptyState(tasks.length ? "No tasks match these filters" : "No study tasks yet", tasks.length ? "Try changing or clearing your filters." : "Add your first task to get your study plan started.");
}

function taskCardMarkup(task) {
  const overdue = isOverdue(task);
  return `<article class="task-card ${overdue ? "overdue" : ""} ${task.status === "completed" ? "completed" : ""}">
    <button class="check-button ${task.status === "completed" ? "is-complete" : ""}" type="button" data-toggle-task="${escapeHtml(task.id)}" aria-label="${task.status === "completed" ? "Mark as pending" : "Mark as completed"}">${task.status === "completed" ? "✓" : ""}</button>
    <div class="task-card-content">
      <div class="task-title-row"><strong>${escapeHtml(task.topic)}</strong>
        <span class="priority-badge ${task.priority}">${escapeHtml(capitalize(task.priority))}</span>
        <span class="status-badge ${task.status}">${escapeHtml(capitalize(task.status))}</span>
        ${overdue ? '<span class="overdue-label">Overdue</span>' : ""}
      </div>
      <p class="task-subtitle">${escapeHtml(task.subject)} · ${escapeHtml(formatDate(task.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}${task.time ? ` · ${escapeHtml(formatTime(task.time))}` : ""} · ${escapeHtml(task.duration)} min</p>
      ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
      ${task.completedAt ? `<div class="task-meta"><span>Completed ${escapeHtml(formatDate(task.completedAt, { month: "short", day: "numeric" }))}</span></div>` : ""}
    </div>
    <div class="task-actions">
      <button class="icon-button" type="button" data-edit-task="${escapeHtml(task.id)}" aria-label="Edit ${escapeHtml(task.topic)}">✎</button>
      <button class="icon-button delete" type="button" data-delete-task="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.topic)}">×</button>
    </div>
  </article>`;
}

function renderSchedule() {
  const filter = document.getElementById("scheduleFilter").value;
  const viewMode = document.getElementById("scheduleViewMode").value;
  const selectedDate = document.getElementById("scheduleDate").value || localDateString();
  let scheduled = tasks.filter(task => !filter || filter === "all" || task.status === filter);
  if (viewMode === "day") {
    scheduled = scheduled.filter(task => task.date === selectedDate);
  } else if (viewMode === "week") {
    const weekStart = dateFromString(selectedDate);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    scheduled = scheduled.filter(task => {
      const taskDate = dateFromString(task.date);
      return taskDate >= weekStart && taskDate < weekEnd;
    });
  }
  scheduled.sort(compareTasks);
  if (!scheduled.length) {
    const message = tasks.length ? "Choose another date or filter, or add a session for this day." : "Add a study task to create your schedule.";
    elements.scheduleList.innerHTML = `${emptyState(tasks.length ? "No sessions in this view" : "Your schedule is clear", message)}<div class="empty-action"><button class="button button-primary" type="button" data-open-task data-schedule-date>Add a task for this date</button></div>`;
    return;
  }
  let previousDate = "";
  elements.scheduleList.innerHTML = scheduled.map(task => {
    const heading = task.date !== previousDate
      ? `<h3 class="schedule-day">${escapeHtml(scheduleDateLabel(task.date))}</h3>`
      : "";
    previousDate = task.date;
    return `${heading}<article class="schedule-item ${isOverdue(task) ? "overdue" : ""} ${task.status === "completed" ? "completed" : ""}">
      <span class="schedule-item-time">${escapeHtml(formatTime(task.time))}</span>
      <span class="item-accent ${task.priority}" aria-hidden="true"></span>
      <div class="schedule-item-main"><strong>${escapeHtml(task.topic)}</strong><span>${escapeHtml(task.subject)} · ${escapeHtml(task.duration)} min · ${escapeHtml(capitalize(task.priority))} priority${isOverdue(task) ? " · Overdue" : ""}${task.description ? ` · ${escapeHtml(task.description)}` : ""}</span></div>
      <span class="status-badge ${task.status}">${escapeHtml(capitalize(task.status))}</span>
      <div class="task-actions schedule-actions">
        <button class="check-button ${task.status === "completed" ? "is-complete" : ""}" type="button" data-toggle-task="${escapeHtml(task.id)}" aria-label="${task.status === "completed" ? "Mark as pending" : "Mark as completed"}">${task.status === "completed" ? "✓" : ""}</button>
        <button class="icon-button" type="button" data-edit-task="${escapeHtml(task.id)}" aria-label="Edit ${escapeHtml(task.topic)}">✎</button>
        <button class="icon-button delete" type="button" data-delete-task="${escapeHtml(task.id)}" aria-label="Delete ${escapeHtml(task.topic)}">×</button>
      </div>
    </article>`;
  }).join("");
}

function scheduleDateLabel(date) {
  if (date === localDateString()) return "Today · " + formatDate(date, { month: "long", day: "numeric" });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === localDateString(tomorrow)) return "Tomorrow · " + formatDate(date, { month: "long", day: "numeric" });
  return formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function renderSubjectFilter() {
  const filter = document.getElementById("subjectFilter");
  const selected = filter.value;
  const subjects = [...new Set(tasks.map(task => task.subject))].sort((first, second) => first.localeCompare(second));
  filter.innerHTML = '<option value="">All subjects</option>' + subjects.map(subject =>
    `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("");
  filter.value = subjects.includes(selected) ? selected : "";
}

function renderProgress() {
  const completed = tasks.filter(task => task.status === "completed");
  const rate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
  const plannedMinutes = tasks.reduce((total, task) => total + Number(task.duration), 0);
  const trackedMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);
  document.getElementById("totalProgressTasks").textContent = tasks.length;
  document.getElementById("pendingProgressTasks").textContent = tasks.length - completed.length;
  document.getElementById("plannedTime").textContent = formatDuration(plannedMinutes);
  document.getElementById("trackedTime").textContent = formatDuration(trackedMinutes);
  document.getElementById("progressCompleted").textContent = completed.length;
  document.getElementById("completionRate").textContent = `${rate}%`;
  document.getElementById("progressSessions").textContent = sessions.length;
  document.getElementById("focusSessionCount").textContent = sessions.length;

  const today = dateFromString(localDateString());
  const dayStart = new Date(today);
  dayStart.setDate(dayStart.getDate() - 6);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartString = localDateString(weekStart);
  const weekCompleted = completed.filter(task => task.completedAt && task.completedAt >= weekStartString);
  const weekSessions = sessions.filter(session => session.date >= weekStartString);
  const weekMinutes = weekSessions.reduce((sum, session) => sum + session.minutes, 0);
  document.getElementById("weeklyCompleted").textContent = weekCompleted.length;
  document.getElementById("weeklyTime").textContent = formatDuration(weekMinutes);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndString = localDateString(weekEnd);
  document.getElementById("weeklyPending").textContent = tasks.filter(task =>
    task.status === "pending" && task.date >= weekStartString && task.date < weekEndString
  ).length;
  document.getElementById("weeklySessions").textContent = weekSessions.length;
  document.getElementById("weeklyMessage").textContent = weekCompleted.length
    ? "Keep this steady rhythm going — your effort is adding up."
    : "A small completed task is a great way to get this week started.";

  const achievements = [];
  if (sessions.length >= 1) achievements.push(`Completed your first focus session (${sessions.length} total).`);
  if (sessions.length >= 4) achievements.push(`Reached ${sessions.length} focus sessions — that's a solid study streak.`);
  if (completed.length >= 1) achievements.push(`Checked off ${completed.length} ${completed.length === 1 ? "study task" : "study tasks"}.`);
  document.getElementById("achievementContent").innerHTML = achievements.length
    ? `<ul class="achievement-list">${achievements.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : emptyState("Your first milestone is waiting", "Complete a task or finish a focus session to see a real achievement here.");

  const dailyCounts = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(dayStart);
    date.setDate(dayStart.getDate() + index);
    const key = localDateString(date);
    return { key, day: date.toLocaleDateString(undefined, { weekday: "short" }), count: sessions.filter(session => session.date === key).length };
  });
  const maximum = Math.max(1, ...dailyCounts.map(day => day.count));
  document.getElementById("activityChart").innerHTML = dailyCounts.map(day => `
    <div class="chart-column" aria-label="${escapeHtml(day.day)}: ${day.count} completed focus sessions">
      <div class="chart-bar-space"><div class="chart-bar" data-count="${day.count}" style="height:${Math.max(day.count ? 8 : 3, (day.count / maximum) * 100)}%"><span class="chart-count">${day.count}</span></div></div>
      <span class="chart-day">${escapeHtml(day.day)}</span>
    </div>`).join("");
  document.getElementById("activityEmptyState").hidden = sessions.length > 0;
  document.getElementById("activityChart").hidden = sessions.length === 0;
  document.getElementById("chartLegend").hidden = sessions.length === 0;
}

function renderTimerTaskOptions() {
  const select = document.getElementById("timerTaskSelect");
  const selected = select.value;
  const pending = tasks.filter(task => task.status === "pending").sort(compareTasks);
  select.innerHTML = '<option value="">Choose a pending task</option>' + pending.map(task =>
    `<option value="${escapeHtml(task.id)}">${escapeHtml(task.subject)} · ${escapeHtml(task.topic)}</option>`).join("");
  select.value = pending.some(task => task.id === selected) ? selected : "";
}

function formatTime(time) {
  if (!time) return "Any time";
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes} min`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function openTaskDialog(task = null, defaultDate = "") {
  editingTaskId = task ? task.id : null;
  elements.taskForm.reset();
  elements.formError.hidden = true;
  document.getElementById("taskDialogTitle").textContent = task ? "Edit study task" : "Add a study task";
  document.getElementById("saveTask").textContent = task ? "Save changes" : "Add task";
  document.getElementById("dateInput").value = task ? task.date : defaultDate || localDateString();
  document.getElementById("timeInput").value = task ? task.time : "";
  if (task) {
    document.getElementById("subjectInput").value = task.subject;
    document.getElementById("topicInput").value = task.topic;
    document.getElementById("descriptionInput").value = task.description || "";
    document.getElementById("durationInput").value = task.duration;
    document.getElementById("priorityInput").value = task.priority;
    document.getElementById("statusInput").value = task.status;
  } else {
    document.getElementById("durationInput").value = 25;
    document.getElementById("priorityInput").value = "medium";
    document.getElementById("statusInput").value = "pending";
  }
  elements.taskDialog.showModal();
  document.getElementById("subjectInput").focus();
}

function handleTaskSubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.taskForm);
  const subject = String(formData.get("subject") || "").trim();
  const topic = String(formData.get("topic") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const duration = Number(formData.get("duration"));
  const priority = String(formData.get("priority"));
  const status = String(formData.get("status"));
  const error = validateTask({ subject, topic, date, time, duration, priority, status });
  if (error) {
    elements.formError.textContent = error;
    elements.formError.hidden = false;
    return;
  }

  const previous = tasks.find(task => task.id === editingTaskId);
  // Keep the original completion date when editing a task that is already done.
  const task = {
    id: editingTaskId || createTaskId(),
    subject, topic, description, date, time, duration, priority, status,
    createdAt: previous ? previous.createdAt : new Date().toISOString(),
    completedAt: status === "completed"
      ? (previous && previous.status === "completed" ? previous.completedAt || localDateString() : localDateString())
      : ""
  };
  const previousTasks = tasks;
  if (editingTaskId) {
    tasks = tasks.map(existing => existing.id === editingTaskId ? task : existing);
  } else {
    tasks.push(task);
  }
  if (!saveTasks()) {
    tasks = previousTasks;
    return;
  }
  elements.taskDialog.close();
  renderAll();
  showToast(editingTaskId ? "Task updated." : "Task added to your study plan.");
  editingTaskId = null;
}

function validateTask(task) {
  if (!task.subject || !task.topic) return "Enter both a subject and a topic.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date) || localDateString(dateFromString(task.date)) !== task.date) {
    return "Choose a valid study date.";
  }
  if (task.time && (!/^\d{2}:\d{2}$/.test(task.time) ||
    Number(task.time.slice(0, 2)) > 23 || Number(task.time.slice(3, 5)) > 59)) {
    return "Choose a valid start time or leave it blank.";
  }
  if (!Number.isInteger(task.duration) || task.duration < 1 || task.duration > 720) return "Duration must be between 1 and 720 minutes.";
  if (!["high", "medium", "low"].includes(task.priority)) return "Choose a valid priority.";
  if (!["pending", "completed"].includes(task.status)) return "Choose a valid task status.";
  return "";
}

function createTaskId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toggleTask(taskId) {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;
  const wasCompleted = task.status === "completed";
  const previousTasks = tasks;
  tasks = tasks.map(item => item.id === taskId
    ? { ...item, status: wasCompleted ? "pending" : "completed", completedAt: wasCompleted ? "" : localDateString() }
    : item);
  if (!saveTasks()) {
    tasks = previousTasks;
    return;
  }
  renderAll();
  showToast(wasCompleted ? "Task marked as pending." : "Nice work — task completed!");
}

function deleteTask(taskId) {
  const task = tasks.find(item => item.id === taskId);
  if (!task || !window.confirm(`Delete "${task.subject} · ${task.topic}"? This cannot be undone.`)) return;
  const previousTasks = tasks;
  tasks = tasks.filter(item => item.id !== taskId);
  if (!saveTasks()) {
    tasks = previousTasks;
    return;
  }
  renderAll();
  showToast("Task deleted.");
}

function setTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  document.getElementById("themeLabel").textContent = isDark ? "Light mode" : "Dark mode";
  document.getElementById("themeIcon").textContent = isDark ? "☀" : "☾";
  const themeLabel = `Switch to ${isDark ? "light" : "dark"} mode`;
  document.getElementById("themeToggle").setAttribute("aria-label", themeLabel);
  document.getElementById("mobileThemeToggle").setAttribute("aria-label", themeLabel);
  document.getElementById("mobileThemeIcon").textContent = isDark ? "☀" : "☾";
  try {
    localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
  } catch (error) {
    console.error("Unable to save theme preference:", error);
    showToast("Theme changed, but the preference could not be saved.", true);
  }
}

function loadTheme() {
  try {
    setTheme(localStorage.getItem(STORAGE_KEYS.theme) === "dark");
  } catch (error) {
    console.error("Unable to load theme preference:", error);
    setTheme(false);
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  elements.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const labels = { focus: "FOCUS SESSION", short: "SHORT BREAK", long: "LONG BREAK" };
  const names = { focus: "focus", short: "short break", long: "long break" };
  elements.timerMode.textContent = labels[timerMode];
  elements.timerCaption.textContent = timerMode === "focus"
    ? (timerRunning ? "Stay with it. One focused minute at a time." : "Ready when you are. You’ve got this.")
    : (timerRunning ? "Step away from your screen and recharge." : "Take a well-earned break.");
  document.getElementById("timerStart").textContent = timerRunning
    ? "Running..."
    : timerSeconds < TIMER_LENGTHS[timerMode] ? "Resume" : `Start ${names[timerMode]}`;
  document.getElementById("timerStart").disabled = timerRunning;
  document.getElementById("timerPause").disabled = !timerRunning;
  document.querySelectorAll("[data-timer-mode]").forEach(button => {
    const active = button.dataset.timerMode === timerMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = timerRunning;
  });
  document.getElementById("timerNote").textContent = timerMode === "focus"
    ? `${sessions.length} focus ${sessions.length === 1 ? "session" : "sessions"} completed · ${formatDuration(sessions.reduce((total, session) => total + session.minutes, 0))} tracked`
    : "A short pause can help you return with fresh focus.";
}

function chooseTimerMode(mode) {
  if (!Object.hasOwn(TIMER_LENGTHS, mode)) return;
  if (timerRunning) {
    showToast("Pause the timer before changing its mode.", true);
    return;
  }
  timerMode = mode;
  timerSeconds = TIMER_LENGTHS[mode];
  updateTimerDisplay();
}

function startTimer() {
  if (timerRunning || timerSeconds <= 0) return;
  timerRunning = true;
  updateTimerDisplay();
  timerInterval = window.setInterval(() => {
    timerSeconds -= 1;
    if (timerSeconds <= 0) {
      timerSeconds = 0;
      window.clearInterval(timerInterval);
      timerInterval = null;
      timerRunning = false;
      if (timerMode === "focus") {
        const taskId = document.getElementById("timerTaskSelect").value;
        sessions.push({
          id: createTaskId(),
          date: localDateString(),
          completedAt: new Date().toISOString(),
          minutes: TIMER_LENGTHS.focus / 60,
          taskId
        });
        if (!saveSessions()) sessions.pop();
        timerMode = sessions.length > 0 && sessions.length % 4 === 0 ? "long" : "short";
        timerSeconds = TIMER_LENGTHS[timerMode];
        showToast("Focus session completed and recorded. Take a break!");
      } else {
        showToast("Break finished. Select focus when you're ready to begin again.");
        timerMode = "focus";
        timerSeconds = TIMER_LENGTHS.focus;
      }
      renderProgress();
    }
    updateTimerDisplay();
  }, 1000);
}

function pauseTimer() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  updateTimerDisplay();
}

function resetTimer() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
  timerMode = "focus";
  timerSeconds = TIMER_LENGTHS.focus;
  updateTimerDisplay();
}

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => setActiveView(button.dataset.view));
});
document.querySelectorAll("[data-navigate]").forEach(button => button.addEventListener("click", () => setActiveView(button.dataset.navigate)));
document.getElementById("themeToggle").addEventListener("click", () => setTheme(!document.body.classList.contains("dark")));
document.getElementById("mobileThemeToggle").addEventListener("click", () => setTheme(!document.body.classList.contains("dark")));
document.getElementById("mobileNavToggle").addEventListener("click", () => {
  const isOpen = document.getElementById("mobileNavToggle").getAttribute("aria-expanded") === "true";
  setMobileNavigation(!isOpen);
});
document.getElementById("mobileNavBackdrop").addEventListener("click", () => setMobileNavigation(false));
window.matchMedia("(max-width: 520px)").addEventListener("change", event => {
  setMobileNavigation(!event.matches);
});
document.getElementById("todaySearch").addEventListener("input", renderDashboard);
document.getElementById("closeTaskDialog").addEventListener("click", () => elements.taskDialog.close());
document.getElementById("cancelTask").addEventListener("click", () => elements.taskDialog.close());
elements.taskForm.addEventListener("submit", handleTaskSubmit);
document.getElementById("subjectFilter").addEventListener("change", renderTaskList);
document.getElementById("dateFilter").addEventListener("change", renderTaskList);
document.getElementById("statusFilter").addEventListener("change", renderTaskList);
document.getElementById("priorityFilter").addEventListener("change", renderTaskList);
document.getElementById("sortFilter").addEventListener("change", renderTaskList);
document.getElementById("taskSearch").addEventListener("input", renderTaskList);
document.getElementById("scheduleFilter").addEventListener("change", renderSchedule);
document.getElementById("scheduleViewMode").addEventListener("change", renderSchedule);
document.getElementById("scheduleDate").addEventListener("change", renderSchedule);
document.querySelectorAll("[data-today-filter]").forEach(button => button.addEventListener("click", () => {
  todayTaskFilter = button.dataset.todayFilter;
  document.querySelectorAll("[data-today-filter]").forEach(filterButton => {
    const active = filterButton === button;
    filterButton.classList.toggle("active", active);
    filterButton.setAttribute("aria-pressed", String(active));
  });
  renderDashboard();
}));
document.getElementById("clearFilters").addEventListener("click", () => {
  document.getElementById("subjectFilter").value = "";
  document.getElementById("dateFilter").value = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("priorityFilter").value = "";
  document.getElementById("taskSearch").value = "";
  document.getElementById("sortFilter").value = "date";
  renderTaskList();
});
document.addEventListener("click", event => {
  const target = event.target.closest("[data-open-task], [data-toggle-task], [data-edit-task], [data-delete-task]");
  if (!target) return;
  if (target.hasAttribute("data-open-task")) {
    const scheduleDate = target.hasAttribute("data-schedule-date")
      ? document.getElementById("scheduleDate").value
      : "";
    openTaskDialog(null, scheduleDate);
    return;
  }
  if (target.dataset.toggleTask) toggleTask(target.dataset.toggleTask);
  if (target.dataset.editTask) {
    const task = tasks.find(item => item.id === target.dataset.editTask);
    if (task) openTaskDialog(task);
  }
  if (target.dataset.deleteTask) deleteTask(target.dataset.deleteTask);
});
document.getElementById("timerStart").addEventListener("click", startTimer);
document.getElementById("timerPause").addEventListener("click", pauseTimer);
document.getElementById("timerReset").addEventListener("click", resetTimer);
document.querySelectorAll("[data-timer-mode]").forEach(button =>
  button.addEventListener("click", () => chooseTimerMode(button.dataset.timerMode)));

document.getElementById("profileButton").addEventListener("click", event => {
  const menu = document.getElementById("profileMenu");
  const isExpanded = event.currentTarget.getAttribute("aria-expanded") === "true";
  event.currentTarget.setAttribute("aria-expanded", String(!isExpanded));
  menu.hidden = isExpanded;
});
document.addEventListener("click", event => {
  const profile = document.querySelector(".profile-wrap");
  if (!profile.contains(event.target)) {
    document.getElementById("profileButton").setAttribute("aria-expanded", "false");
    document.getElementById("profileMenu").hidden = true;
  }
});
document.addEventListener("keydown", event => {
  const mobileNavigationOpen = document.getElementById("mobileNavToggle").getAttribute("aria-expanded") === "true";
  if (event.key === "Escape" && mobileNavigationOpen && window.matchMedia("(max-width: 520px)").matches) {
    setMobileNavigation(false);
    document.getElementById("mobileNavToggle").focus();
  }
  const menu = document.getElementById("profileMenu");
  if (event.key === "Escape" && !menu.hidden) {
    menu.hidden = true;
    document.getElementById("profileButton").setAttribute("aria-expanded", "false");
    document.getElementById("profileButton").focus();
  }
});
document.getElementById("exportTasks").addEventListener("click", () => {
  try {
    const file = new Blob([JSON.stringify({ tasks, sessions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const download = document.createElement("a");
    download.href = url;
    download.download = "studyspace-data.json";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Your study data has been exported.");
  } catch (error) {
    console.error("Unable to export study data:", error);
    showToast("Your study data could not be exported.", true);
  }
});

elements.todayDate.textContent = new Date().toLocaleDateString(undefined, {
  weekday: "long", month: "long", day: "numeric", year: "numeric"
});
document.getElementById("scheduleDate").value = localDateString();
if (window.matchMedia("(max-width: 520px)").matches) setMobileNavigation(false);
loadTheme();
renderAll();
updateTimerDisplay();
