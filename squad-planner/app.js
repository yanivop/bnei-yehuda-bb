import { onAuthChange, login, logout } from "./auth.js";
import * as store from "./data.js";
import { classifyPlayer } from "./eligibility.js";
import { renderPlanningView } from "./view-planning.js";
import { renderTeamsView } from "./view-teams.js";
import { renderSettingsView } from "./view-settings.js";

export const state = {
  players: [],
  manualPlayers: [],
  overrides: {},
  assignments: {},
  eligibilityConfig: { boys: { brackets: [] }, girls: { brackets: [] } },
  teamsConfig: [],
};

const els = {
  loginView: document.getElementById("view-login"),
  appView: document.getElementById("view-app"),
  loginForm: document.getElementById("login-form"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  logoutBtn: document.getElementById("logout-btn"),
  navButtons: document.querySelectorAll(".nav-btn"),
  views: {
    planning: document.getElementById("view-planning"),
    teams: document.getElementById("view-teams"),
    settings: document.getElementById("view-settings"),
  },
};

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.loginError.textContent = "";
  try {
    await login(els.loginPassword.value);
  } catch (err) {
    console.error(err);
    els.loginError.textContent = "סיסמה שגויה";
  }
});

els.logoutBtn.addEventListener("click", () => logout());

for (const btn of els.navButtons) {
  btn.addEventListener("click", () => showView(btn.dataset.view));
}

function showView(name) {
  for (const [key, section] of Object.entries(els.views)) {
    section.hidden = key !== name;
  }
  for (const btn of els.navButtons) {
    btn.classList.toggle("active", btn.dataset.view === name);
  }
  renderCurrentView();
}

function getActiveViewName() {
  return [...els.navButtons].find((b) => b.classList.contains("active"))?.dataset.view ?? "planning";
}

export function getAllPlayers() {
  const scraped = state.players.map((p) => ({ ...p, ...(state.overrides[p.id] || {}) }));
  return [...scraped, ...state.manualPlayers].filter((p) => !p.hidden);
}

export function classify(player) {
  const config = player.gender === "M" ? state.eligibilityConfig.boys : state.eligibilityConfig.girls;
  return classifyPlayer(player, config);
}

export function renderCurrentView() {
  const name = getActiveViewName();
  if (name === "planning") renderPlanningView(els.views.planning);
  if (name === "teams") renderTeamsView(els.views.teams);
  if (name === "settings") renderSettingsView(els.views.settings);
}

async function loadAllData() {
  const [players, manualPlayers, overrides, assignments, eligibilityConfig, teamsConfig] = await Promise.all([
    fetch("../players.json").then((r) => r.json()),
    store.getManualPlayers(),
    store.getPlayerOverrides(),
    store.getAssignments(),
    store.getEligibilityConfig(),
    store.getTeamsConfig(),
  ]);
  Object.assign(state, { players, manualPlayers, overrides, assignments, eligibilityConfig, teamsConfig });
}

onAuthChange(async (user) => {
  if (user) {
    els.loginView.hidden = true;
    els.appView.hidden = false;
    await loadAllData();
    renderCurrentView();
  } else {
    els.loginView.hidden = false;
    els.appView.hidden = true;
  }
});
