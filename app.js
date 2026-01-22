import { startShaderBackground } from "./shader-bg.js";

const LS = {
  HISTORY: "dw_history_v1",
  FAVORITES: "dw_favorites_v1",
  PRESENTATION: "dw_presentation_v1",
  PROMPT_SCALE: "dw_prompt_scale_v1",
  FILTER_TAG: "dw_filter_tag_v1"
};

let allPrompts = [];
let filtered = [];
let history = [];
let currentPromptId = null;
let timerInterval = null;

function loadJSON(key, fallback){
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function getFavorites(){ return new Set(loadJSON(LS.FAVORITES, [])); }
function toggleFavorite(id){
  const favs = getFavorites();
  favs.has(id) ? favs.delete(id) : favs.add(id);
  saveJSON(LS.FAVORITES, [...favs]);
}
function isFavorite(id){ return getFavorites().has(id); }

function applyFilter(tag){
  if (!tag || tag === "all"){
    filtered = [...allPrompts];
    localStorage.setItem(LS.FILTER_TAG, "all");
    return;
  }
  filtered = allPrompts.filter(p => (p.tags || []).includes(tag));
  localStorage.setItem(LS.FILTER_TAG, tag);
}

function renderPrompt(p){
  if (!p) return;

  currentPromptId = p.id;

  // Title + main prompt
  document.getElementById("promptTitle").textContent = p.title || "Untitled";
  document.getElementById("promptText").textContent = p.prompt || "";

  // NEW: goal + how-to (visible to students)
  document.getElementById("promptGoal").textContent = p.goal || "—";
  document.getElementById("promptHowTo").textContent = p.howTo || "—";

  // Time pill uses new schema: timeMin/timeMax
  const tMin = p.timeMin ?? 3;
  const tMax = p.timeMax ?? tMin;
  document.getElementById("pillTime").textContent = `${tMin}–${tMax} min`;
  document.getElementById("pillId").textContent = p.id || "—";

  // Tags
  const tagRow = document.getElementById("tagRow");
  tagRow.innerHTML = "";
  (p.tags || []).forEach(t => {
    const el = document.createElement("div");
    el.className = "tag";
    el.textContent = t;
    tagRow.appendChild(el);
  });

  // Favorite star
  const favBtn = document.getElementById("btnFavorite");
  const active = isFavorite(p.id);
  favBtn.classList.toggle("active", active);
  favBtn.textContent = active ? "★" : "☆";

  // History
  history.push(p.id);
  saveJSON(LS.HISTORY, history);
  document.getElementById("btnBack").disabled = history.length < 2;
}

function nextPrompt(){
  if (!filtered.length) filtered = [...allPrompts];
  const used = new Set(history);
  const available = filtered.filter(p => !used.has(p.id));
  const pool = available.length ? available : filtered;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  renderPrompt(pick);
}

function prevPrompt(){
  if (history.length < 2) return;
  history.pop();
  const prevId = history.pop();
  const p = allPrompts.find(x => x.id === prevId);
  if (p) renderPrompt(p);
}

/* Timer */
function startTimer(min){
  clearInterval(timerInterval);
  const total = min * 60;
  let remaining = total;

  const fill = document.getElementById("progressFill");
  const status = document.getElementById("timerStatus");

  fill.style.width = "0%";
  status.textContent = `Timer: ${min} min`;

  timerInterval = setInterval(() => {
    remaining--;
    fill.style.width = `${100 * (1 - remaining / total)}%`;
    if (remaining <= 0){
      clearInterval(timerInterval);
      status.textContent = "Time’s up";
    }
  }, 1000);
}
function stopTimer(){
  clearInterval(timerInterval);
  document.getElementById("progressFill").style.width = "0%";
  document.getElementById("timerStatus").textContent = "Timer: off";
}

/* Presentation */
function togglePresentation(){
  const on = document.body.classList.toggle("presentation");
  localStorage.setItem(LS.PRESENTATION, on ? "1" : "0");
}

function wireUI(){
  document.getElementById("btnNew").onclick = nextPrompt;
  document.getElementById("btnBack").onclick = prevPrompt;
  document.getElementById("btnReset").onclick = () => {
    history = [];
    saveJSON(LS.HISTORY, []);
    nextPrompt();
  };

  document.getElementById("btnFavorite").onclick = () => {
    if (!currentPromptId) return;
    toggleFavorite(currentPromptId);
    const p = allPrompts.find(x => x.id === currentPromptId);
    if (p) renderPrompt(p);
  };

  document.getElementById("btnPresent").onclick = togglePresentation;

  document.getElementById("btnFullscreen").onclick = () => {
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
  };

  // Palette toggle (from shader-bg.js)
  document.getElementById("btnPalette").onclick = () => {
    if (window.togglePalette) window.togglePalette();
  };

  // Timer buttons
  document.querySelectorAll(".timer").forEach(btn => {
    btn.onclick = () => startTimer(Number(btn.dataset.min));
  });
  document.getElementById("btnStopTimer").onclick = stopTimer;

  // Font scale
  document.getElementById("btnFontUp").onclick = () => {
    const v = Math.min(1.6, (Number(localStorage.getItem(LS.PROMPT_SCALE)) || 1) + 0.1);
    document.documentElement.style.setProperty("--promptScale", v);
    localStorage.setItem(LS.PROMPT_SCALE, v);
  };
  document.getElementById("btnFontDown").onclick = () => {
    const v = Math.max(0.8, (Number(localStorage.getItem(LS.PROMPT_SCALE)) || 1) - 0.1);
    document.documentElement.style.setProperty("--promptScale", v);
    localStorage.setItem(LS.PROMPT_SCALE, v);
  };

  // Filter chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.onclick = () => {
      const tag = chip.dataset.tag;
      applyFilter(tag);
      history = [];
      saveJSON(LS.HISTORY, []);
      nextPrompt();
    };
  });

  // Keyboard
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (k === "n") nextPrompt();
    if (k === "b") prevPrompt();
    if (k === "p") togglePresentation();
    if (k === "f") document.documentElement.requestFullscreen();
    if (k === "c") window.togglePalette && window.togglePalette();
  });
}

async function init(){
  startShaderBackground(document.getElementById("bgShader"));

  const res = await fetch("./data/prompts.json");
  allPrompts = await res.json();

  // Restore state
  history = loadJSON(LS.HISTORY, []);
  const scale = Number(localStorage.getItem(LS.PROMPT_SCALE)) || 1;
  document.documentElement.style.setProperty("--promptScale", scale);

  if (localStorage.getItem(LS.PRESENTATION) === "1") {
    document.body.classList.add("presentation");
  }

  const savedTag = localStorage.getItem(LS.FILTER_TAG) || "all";
  applyFilter(savedTag);

  wireUI();
  nextPrompt();
}

init();
