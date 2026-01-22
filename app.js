import { startShaderBackground } from "./shader-bg.js";

const PROMPTS_URL = "./data/prompts.json";

const els = {
  title: document.getElementById("promptTitle"),
  text: document.getElementById("promptText"),
  pillTime: document.getElementById("pillTime"),
  pillDifficulty: document.getElementById("pillDifficulty"),
  pillId: document.getElementById("pillId"),
  tagRow: document.getElementById("tagRow"),
  btnNew: document.getElementById("btnNew"),
  btnBack: document.getElementById("btnBack"),
  btnReset: document.getElementById("btnReset"),
  btnFullscreen: document.getElementById("btnFullscreen"),
  btnFontUp: document.getElementById("btnFontUp"),
  btnFontDown: document.getElementById("btnFontDown"),
  btnStopTimer: document.getElementById("btnStopTimer"),
  timerButtons: Array.from(document.querySelectorAll(".timer")),
  timeChips: document.getElementById("timeChips"),
  tagChips: document.getElementById("tagChips"),
  modeChips: document.getElementById("modeChips"),
  btnClearFilters: document.getElementById("btnClearFilters"),
  countNote: document.getElementById("countNote"),
  timerStatus: document.getElementById("timerStatus"),
  progressFill: document.getElementById("progressFill"),
};

const LS = {
  FILTERS: "dw_filters_v1",
  DECK: "dw_deck_v1",
  HISTORY: "dw_history_v1",
  FONT: "dw_font_v1",
};

let allPrompts = [];
let filteredPrompts = [];
let timerInterval = null;
let timerEnd = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getFilters() {
  return loadJSON(LS.FILTERS, { times: [], tags: [], modes: [] });
}

function setFilters(next) {
  saveJSON(LS.FILTERS, next);
  applyFiltersAndRenderCounts();
  rebuildDeck(); // change deck when filters change
}

function getFontScale() {
  return Number(localStorage.getItem(LS.FONT) || "1");
}

function setFontScale(scale) {
  const clamped = Math.max(0.85, Math.min(1.25, scale));
  localStorage.setItem(LS.FONT, String(clamped));
  document.documentElement.style.setProperty("--promptScale", clamped);
}

function buildAvailableTagList(prompts) {
  const set = new Set();
  for (const p of prompts) {
    for (const t of (p.tags || [])) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function matchesFilters(prompt, filters) {
  const timeOk = filters.times.length === 0 || filters.times.includes(String(prompt.time));
  const modeOk = filters.modes.length === 0 || filters.modes.includes(prompt.mode);
  const tags = prompt.tags || [];
  const tagOk = filters.tags.length === 0 || filters.tags.every(t => tags.includes(t));
  return timeOk && modeOk && tagOk;
}

function applyFiltersAndRenderCounts() {
  const filters = getFilters();
  filteredPrompts = allPrompts.filter(p => matchesFilters(p, filters));
  els.countNote.textContent = `${filteredPrompts.length} prompts match your filters (out of ${allPrompts.length}).`;
}

function renderFilterChips() {
  // tags list depends on all prompts, not filtered prompts
  const tags = buildAvailableTagList(allPrompts);

  els.tagChips.innerHTML = "";
  for (const tag of tags) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = tag;
    btn.dataset.tag = tag;
    els.tagChips.appendChild(btn);
  }

  syncChipStates();
}

function syncChipStates() {
  const filters = getFilters();

  // Time chips
  Array.from(els.timeChips.querySelectorAll(".chip")).forEach(chip => {
    chip.classList.toggle("active", filters.times.includes(chip.dataset.time));
  });

  // Tag chips
  Array.from(els.tagChips.querySelectorAll(".chip")).forEach(chip => {
    chip.classList.toggle("active", filters.tags.includes(chip.dataset.tag));
  });

  // Mode chips
  Array.from(els.modeChips.querySelectorAll(".chip")).forEach(chip => {
    chip.classList.toggle("active", filters.modes.includes(chip.dataset.mode));
  });
}

function rebuildDeck() {
  // Build a no-repeat deck for the *filtered* set
  const ids = filteredPrompts.map(p => p.id);
  const deck = shuffle(ids);
  saveJSON(LS.DECK, deck);
  saveJSON(LS.HISTORY, []); // reset history on deck rebuild
  els.btnBack.disabled = true;
}

function getDeck() {
  return loadJSON(LS.DECK, null);
}

function setDeck(deck) {
  saveJSON(LS.DECK, deck);
}

function getHistory() {
  return loadJSON(LS.HISTORY, []);
}

function setHistory(h) {
  saveJSON(LS.HISTORY, h);
  els.btnBack.disabled = h.length < 2; // need at least 2 to go back meaningfully
}

function findPromptById(id) {
  return allPrompts.find(p => p.id === id) || null;
}

function renderPrompt(prompt) {
  if (!prompt) return;

  els.pillTime.textContent = `${prompt.time} min`;
  els.pillDifficulty.textContent = `Level ${prompt.difficulty ?? 2}`;
  els.pillId.textContent = prompt.id;

  els.title.textContent = prompt.title;
  els.text.textContent = prompt.prompt;

  els.tagRow.innerHTML = "";
  for (const t of (prompt.tags || [])) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    els.tagRow.appendChild(span);
  }
}

function nextPrompt() {
  // If filtered is empty, show message
  if (filteredPrompts.length === 0) {
    els.title.textContent = "No prompts match these filters";
    els.text.textContent = "Clear filters or pick fewer tags/time options.";
    els.pillTime.textContent = "— min";
    els.pillDifficulty.textContent = "Level —";
    els.pillId.textContent = "—";
    els.tagRow.innerHTML = "";
    return;
  }

  let deck = getDeck();
  if (!Array.isArray(deck) || deck.length === 0) {
    // Build new deck when empty/missing
    rebuildDeck();
    deck = getDeck();
  }

  // Pop next id from deck
  const id = deck.shift();
  setDeck(deck);

  const prompt = findPromptById(id);
  if (!prompt) {
    // If prompt id not found (data changed), try again safely
    nextPrompt();
    return;
  }

  // Update history
  const history = getHistory();
  history.push(id);
  setHistory(history);

  renderPrompt(prompt);
}

function backPrompt() {
  const history = getHistory();
  if (history.length < 2) return;

  // Remove current prompt
  history.pop();
  const prevId = history[history.length - 1];
  setHistory(history);

  const prompt = findPromptById(prevId);
  if (prompt) renderPrompt(prompt);
}

function resetEverything() {
  // Keep filters + font, but reset deck/history
  rebuildDeck();
  els.title.textContent = "Deck reset";
  els.text.textContent = "Click “New Prompt” to continue.";
  els.pillTime.textContent = "— min";
  els.pillDifficulty.textContent = "Level —";
  els.pillId.textContent = "—";
  els.tagRow.innerHTML = "";
  stopTimer();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerEnd = null;
  els.timerStatus.textContent = "Timer: off";
  els.progressFill.style.width = "0%";
}

function startTimer(minutes) {
  stopTimer();
  const ms = minutes * 60 * 1000;
  const start = Date.now();
  timerEnd = start + ms;

  els.timerStatus.textContent = `Timer: ${minutes} min running`;
  els.progressFill.style.width = "0%";

  timerInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = now - start;
    const pct = Math.min(100, (elapsed / ms) * 100);
    els.progressFill.style.width = `${pct}%`;

    if (now >= timerEnd) {
      stopTimer();
      els.timerStatus.textContent = "Timer: done ✓";
      // quick flash
      document.body.animate(
        [{ opacity: 1 }, { opacity: 0.85 }, { opacity: 1 }],
        { duration: 450, iterations: 2 }
      );
    }
  }, 200);
}

function wireChips() {
  els.timeChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const f = getFilters();
    const t = btn.dataset.time;
    f.times = f.times.includes(t) ? f.times.filter(x => x !== t) : [...f.times, t];
    setFilters(f);
    syncChipStates();
  });

  els.tagChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const f = getFilters();
    const tag = btn.dataset.tag;
    f.tags = f.tags.includes(tag) ? f.tags.filter(x => x !== tag) : [...f.tags, tag];
    setFilters(f);
    syncChipStates();
  });

  els.modeChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    const f = getFilters();
    const mode = btn.dataset.mode;
    f.modes = f.modes.includes(mode) ? f.modes.filter(x => x !== mode) : [...f.modes, mode];
    setFilters(f);
    syncChipStates();
  });

  els.btnClearFilters.addEventListener("click", () => {
    setFilters({ times: [], tags: [], modes: [] });
    syncChipStates();
  });
}

function wireButtons() {
  els.btnNew.addEventListener("click", nextPrompt);
  els.btnBack.addEventListener("click", backPrompt);
  els.btnReset.addEventListener("click", resetEverything);
  els.btnFullscreen.addEventListener("click", toggleFullscreen);

  els.btnFontUp.addEventListener("click", () => setFontScale(getFontScale() + 0.05));
  els.btnFontDown.addEventListener("click", () => setFontScale(getFontScale() - 0.05));

  els.timerButtons.forEach(b => {
    b.addEventListener("click", () => startTimer(Number(b.dataset.min)));
  });
  els.btnStopTimer.addEventListener("click", stopTimer);

  window.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "n") nextPrompt();
    if (k === "b") backPrompt();
    if (k === "f") toggleFullscreen();
    if (k === "escape") stopTimer();
  });
}

async function init() {
  setFontScale(getFontScale());
  const canvas = document.getElementById("bgShader");
  startShaderBackground(canvas);

  const res = await fetch(PROMPTS_URL, { cache: "no-store" });
  allPrompts = await res.json();

  renderFilterChips();
  applyFiltersAndRenderCounts();

  // If deck doesn't exist or doesn't match current filtered set, rebuild
  const deck = getDeck();
  const deckOk = Array.isArray(deck) && deck.length > 0;
  if (!deckOk) rebuildDeck();

  // Sync UI chips to stored filters
  syncChipStates();

  // Enable back if history exists
  setHistory(getHistory());

  wireChips();
  wireButtons();

  els.countNote.textContent = `${filteredPrompts.length} prompts match your filters (out of ${allPrompts.length}).`;
}

init().catch(err => {
  console.error(err);
  els.title.textContent = "Error loading prompts";
  els.text.textContent = "Check that data/prompts.json exists and GitHub Pages is serving it.";
});
