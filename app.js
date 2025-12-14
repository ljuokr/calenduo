const monthLabelEl = document.getElementById("month-label");
const calendarGridEl = document.getElementById("calendar-grid");
const weekdayRowEl = document.getElementById("weekday-row");
const prevBtn = document.getElementById("prev-month");
const nextBtn = document.getElementById("next-month");
const todayBtn = document.getElementById("today-btn");
const syncBtn = document.getElementById("sync-btn");
const syncStatusEl = document.getElementById("sync-status");
const selectedDateEl = document.getElementById("selected-date");
const eventCountEl = document.getElementById("event-count");
const eventListEl = document.getElementById("event-list");
const upcomingListEl = document.getElementById("upcoming-list");
const upcomingCountEl = document.getElementById("upcoming-count");
const formEl = document.getElementById("event-form");
const titleInput = document.getElementById("title-input");
const timeInput = document.getElementById("time-input");
const notesInput = document.getElementById("notes-input");

const STORAGE_KEY = "calenduo-events-v1";
const RESOURCE_ID = 8270866;
const REMOTE_ENDPOINT = "https://chat-pearl-iota.vercel.app/api/phbern";
const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const months = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

const state = {
  monthRef: startOfMonth(new Date()),
  selected: startOfDay(new Date()),
  events: loadEvents()
};

let syncing = false;
let lastSyncDate = null;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
  } catch {
    /* ignore storage errors */
  }
}

function fmtDateLong(date) {
  return date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(time) {
  return time ? time : "Ganztägig";
}

function renderWeekdays() {
  weekdayRowEl.innerHTML = "";
  weekdays.forEach(day => {
    const el = document.createElement("div");
    el.className = "weekday";
    el.textContent = day;
    weekdayRowEl.appendChild(el);
  });
}

function renderCalendar() {
  const month = state.monthRef.getMonth();
  const year = state.monthRef.getFullYear();
  if (monthLabelEl) monthLabelEl.textContent = `${months[month]} ${year}`;

  calendarGridEl.innerHTML = "";
  const firstOfMonth = new Date(year, month, 1);
  const weekdayOffset = (firstOfMonth.getDay() + 6) % 7; // Montag als Start
  const gridStart = new Date(year, month, 1 - weekdayOffset);

  for (let i = 0; i < 42; i++) {
    const dayDate = new Date(gridStart);
    dayDate.setDate(gridStart.getDate() + i);
    const key = toKey(dayDate);
    const isCurrentMonth = dayDate.getMonth() === month;
    const isToday = toKey(dayDate) === toKey(new Date());
    const isSelected = toKey(dayDate) === toKey(state.selected);
    const events = state.events[key] || [];

    const cell = document.createElement("div");
    cell.className = "day";
    if (!isCurrentMonth) cell.classList.add("muted");
    if (isToday) cell.classList.add("today");
    if (isSelected) cell.classList.add("selected");
    cell.setAttribute("data-date", key);

    const dateRow = document.createElement("div");
    dateRow.className = "date";
    const dateLabel = document.createElement("span");
    dateLabel.textContent = dayDate.getDate();
    if (!isCurrentMonth) dateLabel.classList.add("muted");

    dateRow.appendChild(dateLabel);
    if (isToday) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dateRow.appendChild(dot);
    }
    cell.appendChild(dateRow);

    if (events.length) {
      const badge = document.createElement("div");
      badge.className = "events-badge";
      badge.textContent = events.length === 1 ? "1 Termin" : `${events.length} Termine`;
      cell.appendChild(badge);
    }

    cell.addEventListener("click", () => {
      state.selected = startOfDay(dayDate);
      renderAll();
    });

    calendarGridEl.appendChild(cell);
  }
}

function renderSelectedDay() {
  const key = toKey(state.selected);
  const events = state.events[key] || [];
  if (selectedDateEl) selectedDateEl.textContent = fmtDateLong(state.selected);
  if (eventCountEl) eventCountEl.textContent = events.length === 1 ? "1 Termin" : `${events.length} Termine`;

  eventListEl.innerHTML = "";
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Noch keine Termine für diesen Tag.";
    eventListEl.appendChild(empty);
    return;
  }

  events
    .slice()
    .sort(compareEvents)
    .forEach(ev => {
      const item = document.createElement("div");
      item.className = "event-item";

      const head = document.createElement("div");
      head.className = "event-head";
      const title = document.createElement("strong");
      title.textContent = ev.title;
      const time = document.createElement("span");
      time.className = "pill";
      time.textContent = fmtTime(ev.time);
      head.appendChild(title);
      head.appendChild(time);
      item.appendChild(head);

      if (ev.notes) {
        const notes = document.createElement("div");
        notes.className = "tiny";
        notes.textContent = ev.notes;
        item.appendChild(notes);
      }

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      const delBtn = document.createElement("button");
      delBtn.className = "ghost";
      delBtn.textContent = "Löschen";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeEvent(key, ev.id);
      });
      actions.appendChild(delBtn);
      item.appendChild(actions);

      eventListEl.appendChild(item);
    });
}

function compareEvents(a, b) {
  const ta = a.time || "24:00";
  const tb = b.time || "24:00";
  if (ta === tb) return (a.title || "").localeCompare(b.title || "");
  return ta.localeCompare(tb);
}

function removeEvent(dayKey, id) {
  const list = state.events[dayKey] || [];
  const next = list.filter(ev => ev.id !== id);
  if (next.length) {
    state.events[dayKey] = next;
  } else {
    delete state.events[dayKey];
  }
  saveEvents();
  renderAll();
}

function renderUpcoming() {
  const today = startOfDay(new Date());
  const todayKey = toKey(today);
  const upcoming = [];

  Object.entries(state.events).forEach(([key, list]) => {
    const [y, m, d] = key.split("-").map(n => parseInt(n, 10));
    const dateObj = new Date(y, m - 1, d);
    list.forEach(ev => upcoming.push({ ...ev, date: dateObj, key }));
  });

  const filtered = upcoming
    .filter(ev => toKey(ev.date) >= todayKey)
    .sort((a, b) => {
      const da = toKey(a.date);
      const db = toKey(b.date);
      if (da === db) return compareEvents(a, b);
      return da.localeCompare(db);
    })
    .slice(0, 6);

  upcomingListEl.innerHTML = "";
  if (upcomingCountEl) upcomingCountEl.textContent = filtered.length ? `${filtered.length} bald` : "Keine Einträge";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Keine bevorstehenden Termine.";
    upcomingListEl.appendChild(empty);
    return;
  }

  filtered.forEach(ev => {
    const item = document.createElement("div");
    item.className = "event-item";
    const head = document.createElement("div");
    head.className = "event-head";
    const title = document.createElement("strong");
    title.textContent = ev.title;
    const when = document.createElement("span");
    when.className = "tiny";
    when.textContent = `${fmtDateShort(ev.date)} · ${fmtTime(ev.time)}`;
    head.appendChild(title);
    head.appendChild(when);
    item.appendChild(head);
    if (ev.notes) {
      const notes = document.createElement("div");
      notes.className = "tiny";
      notes.textContent = ev.notes;
      item.appendChild(notes);
    }
    upcomingListEl.appendChild(item);
  });
}

function fmtDateShort(date) {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function renderAll() {
  renderCalendar();
  renderSelectedDay();
  renderUpcoming();
}

function addEvent(e) {
  e.preventDefault();
  const title = titleInput.value.trim();
  const time = timeInput.value.trim();
  const notes = notesInput.value.trim();
  if (!title) return;

  const key = toKey(state.selected);
  const list = state.events[key] ? state.events[key].slice() : [];
  list.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    time: time || "",
    notes
  });
  list.sort(compareEvents);
  state.events[key] = list;
  saveEvents();
  formEl.reset();
  renderAll();
}

function formatDatepicker(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function setSyncStatus(text, variant = "muted") {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = text;
  syncStatusEl.dataset.variant = variant;
}

async function syncFromRemote(targetDate = state.selected) {
  if (syncing || !targetDate) return;
  syncing = true;
  setSyncStatus("Lade Live-Daten ...", "loading");
  const dateLabel = formatDatepicker(targetDate);
  try {
    const url = `${REMOTE_ENDPOINT}?resource=${RESOURCE_ID}&date=${encodeURIComponent(dateLabel)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      setSyncStatus(`Fehler (${res.status}): ${txt.slice(0, 120)}`, "error");
      syncing = false;
      return;
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.events)) {
      setSyncStatus("Antwort unbrauchbar", "error");
      syncing = false;
      return;
    }
    mergeRemoteEvents(data.events);
    lastSyncDate = new Date();
    const stamp = lastSyncDate.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    setSyncStatus(`Live-Daten ${dateLabel} geladen (${data.events.length} Termine) · ${stamp}`, "success");
    renderAll();
  } catch (err) {
    setSyncStatus(`Netzwerkfehler: ${err.message}`, "error");
  } finally {
    syncing = false;
  }
}

function mergeRemoteEvents(events) {
  if (!Array.isArray(events)) return;
  const grouped = {};
  events.forEach(ev => {
    if (!ev || typeof ev !== "object") return;
    const start = typeof ev.start === "number" ? ev.start * 1000 : null;
    if (!start) return;
    const date = new Date(start);
    const key = toKey(date);
    const timeLabel = new Date(start).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    const end = typeof ev.stop === "number" ? new Date(ev.stop * 1000) : null;
    const endLabel = end ? end.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" }) : "";
    const slot = endLabel ? `${timeLabel} - ${endLabel}` : timeLabel;
    const item = {
      id: `remote-${ev.id || `${key}-${slot}`}`,
      title: ev.title || ev.resourceTitle || "Termin",
      time: slot,
      notes: `${ev.location || ""}${ev.persons ? ` · ${ev.persons}` : ""}`.trim(),
      remote: true
    };
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  Object.entries(grouped).forEach(([key, list]) => {
    const existing = state.events[key] || [];
    const localOnly = existing.filter(ev => !ev.remote);
    const dedupedRemote = [];
    const seen = new Set();
    list.forEach(ev => {
      if (seen.has(ev.id)) return;
      seen.add(ev.id);
      dedupedRemote.push(ev);
    });
    state.events[key] = [...localOnly, ...dedupedRemote].sort(compareEvents);
  });
  saveEvents();
}

prevBtn?.addEventListener("click", () => {
  state.monthRef = new Date(state.monthRef.getFullYear(), state.monthRef.getMonth() - 1, 1);
  renderAll();
  syncFromRemote(state.monthRef);
});

nextBtn?.addEventListener("click", () => {
  state.monthRef = new Date(state.monthRef.getFullYear(), state.monthRef.getMonth() + 1, 1);
  renderAll();
  syncFromRemote(state.monthRef);
});

todayBtn?.addEventListener("click", () => {
  const today = new Date();
  state.monthRef = startOfMonth(today);
  state.selected = startOfDay(today);
  renderAll();
  syncFromRemote(today);
});

formEl?.addEventListener("submit", addEvent);
syncBtn?.addEventListener("click", () => syncFromRemote(state.selected));

renderWeekdays();
renderAll();
syncFromRemote(state.selected);
