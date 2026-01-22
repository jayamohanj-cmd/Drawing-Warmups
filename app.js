import { startShaderBackground } from "./shader-bg.js";

/* ---------- Storage Keys ---------- */
const LS = {
  HISTORY: "dw_history_v1",
  FAVORITES: "dw_favorites_v1",
  PRESENTATION: "dw_presentation_v1",
  PROMPT_SCALE: "dw_prompt_scale_v1"
};

/* ---------- State ---------- */
let allPrompts = [];
let filtered = [];
let history = [];
let currentPromptId = null;
let timerInterval = null;

/* ---------- Utils ---------- */
function loadJSON(key, fallback){
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function shuffle(arr){
  return [...arr].sort(() => Math.random() - 0.5);
}

/* ---------- Favorites ---------- */
function getFavorites(){
  return new Set(loadJSON(LS.FAVORITES, []));
}

function toggleFavorite(id){
  const favs = getFavorites();
  favs.has(id) ? favs.delete(id) : favs.add(id);
  saveJSON(LS.FAVORITES, [...favs]);
}

function isFavorite(id){
  return getFavorites().has(id);
}

/* ---------- Rendering ---------- */
function renderPrompt(p){
  if (!p) return;

  currentPromptId = p.id;

  document.getElementById("promptTitle").textContent = p.title;
  document.getElementById("promptText").textContent = p.prompt;

  document.getElementById("pillTime").textContent = `${p.time} min`;
  document.getElementById("pillDifficulty").textContent = `Level ${p.difficulty}`;
  document.getElementById("pillId").textContent = p.id;

  const tagRow = document.getElementById("tagRow");
  tagRow.innerHTML = "";
  (p.tags || []).forEach(t => {
    const el = document.createElement("div");
    el.className = "tag";
    el.textContent = t;
    tagRow.appendChild(el);
  });

  const favBtn = document.getElementById("btnFavorite");
  const active = isFavorite(p.id);
  favBtn.classList.toggle("active", active);
  favBtn.textContent = active ? "★" : "☆";

  history.push(p.id);
  saveJSON(LS.HISTORY, history);

  document.getElementById("btnBack").disabled = history.length < 2;
}

/* ---------- Prompt Flow ---------- */
function nextPrompt(){
  const used = new Set(history);
  const available = filtered.filter(p => !used.has(p.id));

  const pick = available.length
    ? available[Math.floor(Math.random() * available.length)]
    : shuffle(filtered)[0];

  renderPrompt(pick);
}

function prevPrompt(){
  if (history.length < 2) return;
  history.pop();
  const prevId = history.pop();
  const p = allPrompts.find(x => x.id === prevId);
  if (p) renderPrompt(p);
}

/* ---------- Timer ---------- */
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

/* ---------- Presentation Mode ---------- */
function togglePresentation(){
  const on = document.body.classList.toggle("presentation");
  localStorage.setItem(LS.PRESENTATION, on ? "1" : "0");
}

/* ---------- UI Wiring ---------- */
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
    renderPrompt(allPrompts.find(p => p.id === currentPromptId));
  };

  document.getElementById("btnPresent").onclick = togglePresentation;
  document.getElementById("btnFullscreen").onclick = () => {
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
  };

  document.querySelectorAll(".timer").forEach(btn => {
    btn.onclick = () => startTimer(Number(btn.dataset.min));
  });

  document.getElementById("btnStopTimer").onclick = stopTimer;

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

  window.addEventListener("keydown", e => {
    if (e.key === "n") nextPrompt();
    if (e.key === "b") prevPrompt();
    if (e.key === "p") togglePresentation();
    if (e.key === "f") document.documentElement.requestFullscreen();
  });
}

/* ---------- Init ---------- */
async function init(){
  startShaderBackground(document.getElementById("bgShader"));

  const res = await fetch("./data/prompts.json");
  allPrompts = await res.json();
  filtered = [...allPrompts];

  history = loadJSON(LS.HISTORY, []);

  const scale = Number(localStorage.getItem(LS.PROMPT_SCALE)) || 1;
  document.documentElement.style.setProperty("--promptScale", scale);

  if (localStorage.getItem(LS.PRESENTATION) === "1") {
    document.body.classList.add("presentation");
  }

  wireUI();
  nextPrompt();
}

init();
