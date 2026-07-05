# Unified Filterable Players List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bracket-sectioned "תכנון" (planning) screen in the squad planner with a single filterable list per gender, where every player gets an editable assignment row regardless of whether they have a natural age bracket.

**Architecture:** Extract the filtering/quota-warning logic into a new dependency-free module (`planning-filters.js`) that is unit-testable with `node --test` (the existing project has no DOM test harness, so anything touching `document` must stay untested-by-design, matching the current codebase convention). Rewrite `view-planning.js` to consume that module and render one flat, sorted, filterable list instead of per-bracket sections.

**Tech Stack:** Vanilla ESM JavaScript, no build step, no new dependencies. Tests run via `node --test` (see `package.json`'s `"test"` script). Firebase Firestore for persistence (unchanged, via `data.js`).

## Global Constraints

- No new npm dependencies — the project has zero runtime dependencies today; keep it that way.
- ESM only (`type: module` in `package.json`); use `import`/`export`, not `require`.
- All user-facing strings are Hebrew, matching the existing tone in `view-planning.js`/`view-settings.js`/`view-teams.js`.
- `classifyPlayer` in `eligibility.js` must not change — it is already correct and tested; only how its output is used changes.
- Any new module that needs to be unit-tested must not import `app.js` or touch `document` — `app.js` calls `document.getElementById` at module load time, which throws in plain Node, so importing it (even transitively) breaks `node --test`.

---

## Task 1: Extract filtering and quota-warning logic into a testable module

**Files:**
- Create: `squad-planner/planning-filters.js`
- Create: `squad-planner/planning-filters.test.js`

**Interfaces:**
- Consumes: `classifyPlayer(player, config)` from `squad-planner/eligibility.js` (test fixtures only — `classifyPlayer(player: {birthDate: string}, config: {brackets: Array<{id, label, referenceBirthYear, exceptionQuota}>}) => {natural: object|null, bridge: object|null, bridgeType: "auto"|"exception"|null}`).
- Produces (used by Task 2):
  - `matchesFilters(player, assignedTeamIds, filters)` — `player: {fullName: string, birthDate: string}`, `assignedTeamIds: string[]`, `filters: {search: string, teamId: string, birthYear: string}` → `boolean`.
  - `getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications)` — `player: {id: string}`, `classification` = result of `classifyPlayer`, `teamsConfig: Array<{id, bracketId, label}>`, `bracketConfig: {brackets: Array<{id, exceptionQuota}>}`, `assignments: Record<string, {teamIds: string[]}>`, `playerClassifications: Map<string, classification>` (must cover every player who might be counted against a quota) → `string[]` (warning messages, empty if none).

- [ ] **Step 1: Write the failing test file**

Create `squad-planner/planning-filters.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPlayer } from "./eligibility.js";
import { matchesFilters, getAssignmentWarnings } from "./planning-filters.js";

const bracketConfig = {
  brackets: [
    { id: "neurim-a", label: "נערים א'", referenceBirthYear: 2011, exceptionQuota: 1 },
    { id: "neurim-b", label: "נערים ב'", referenceBirthYear: 2012, exceptionQuota: 1 },
  ],
};

const teamsConfig = [
  { id: "team-a1", bracketId: "neurim-a", label: "נערים א' 1" },
  { id: "team-b1", bracketId: "neurim-b", label: "נערים ב' 1" },
];

// --- matchesFilters ---

test("matchesFilters: no active filters matches any player", () => {
  const player = { fullName: "אב ירימישין", birthDate: "2011-05-01" };
  assert.equal(matchesFilters(player, [], { search: "", teamId: "", birthYear: "" }), true);
});

test("matchesFilters: search matches substring of fullName", () => {
  const player = { fullName: "אב ירימישין", birthDate: "2011-05-01" };
  assert.equal(matchesFilters(player, [], { search: "ירימי", teamId: "", birthYear: "" }), true);
  assert.equal(matchesFilters(player, [], { search: "קוהן", teamId: "", birthYear: "" }), false);
});

test("matchesFilters: teamId filters to players assigned to that team", () => {
  const player = { fullName: "שחקן", birthDate: "2011-05-01" };
  assert.equal(matchesFilters(player, ["team-a1"], { search: "", teamId: "team-a1", birthYear: "" }), true);
  assert.equal(matchesFilters(player, ["team-b1"], { search: "", teamId: "team-a1", birthYear: "" }), false);
});

test("matchesFilters: __unassigned__ matches only players with no assigned teams", () => {
  const player = { fullName: "שחקן", birthDate: "2011-05-01" };
  assert.equal(matchesFilters(player, [], { search: "", teamId: "__unassigned__", birthYear: "" }), true);
  assert.equal(matchesFilters(player, ["team-a1"], { search: "", teamId: "__unassigned__", birthYear: "" }), false);
});

test("matchesFilters: birthYear filters by birth year prefix", () => {
  const player2011 = { fullName: "שחקן", birthDate: "2011-05-01" };
  const player2012 = { fullName: "שחקן", birthDate: "2012-05-01" };
  assert.equal(matchesFilters(player2011, [], { search: "", teamId: "", birthYear: "2011" }), true);
  assert.equal(matchesFilters(player2012, [], { search: "", teamId: "", birthYear: "2011" }), false);
});

test("matchesFilters: combines search and birthYear with AND", () => {
  const player = { fullName: "אב ירימישין", birthDate: "2011-05-01" };
  assert.equal(matchesFilters(player, [], { search: "ירימי", teamId: "", birthYear: "2011" }), true);
  assert.equal(matchesFilters(player, [], { search: "ירימי", teamId: "", birthYear: "2012" }), false);
});

// --- getAssignmentWarnings ---

test("getAssignmentWarnings: no warning when assigned to natural bracket team", () => {
  const player = { id: "p1", birthDate: "2012-05-15" };
  const classification = classifyPlayer(player, bracketConfig);
  const assignments = { p1: { teamIds: ["team-b1"] } };
  const playerClassifications = new Map([["p1", classification]]);
  const warnings = getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications);
  assert.deepEqual(warnings, []);
});

test("getAssignmentWarnings: no warning for automatic December bridge", () => {
  const player = { id: "p1", birthDate: "2012-12-20" };
  const classification = classifyPlayer(player, bracketConfig);
  const assignments = { p1: { teamIds: ["team-a1"] } };
  const playerClassifications = new Map([["p1", classification]]);
  const warnings = getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications);
  assert.deepEqual(warnings, []);
});

test("getAssignmentWarnings: no warning for exception bridge within quota", () => {
  const player = { id: "p1", birthDate: "2012-09-01" };
  const classification = classifyPlayer(player, bracketConfig);
  const assignments = { p1: { teamIds: ["team-a1"] } };
  const playerClassifications = new Map([["p1", classification]]);
  const warnings = getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications);
  assert.deepEqual(warnings, []);
});

test("getAssignmentWarnings: warns every affected player when exception bridge exceeds quota", () => {
  const player1 = { id: "p1", birthDate: "2012-09-01" };
  const player2 = { id: "p2", birthDate: "2012-10-01" };
  const c1 = classifyPlayer(player1, bracketConfig);
  const c2 = classifyPlayer(player2, bracketConfig);
  const assignments = {
    p1: { teamIds: ["team-a1"] },
    p2: { teamIds: ["team-a1"] },
  };
  const playerClassifications = new Map([["p1", c1], ["p2", c2]]);
  assert.deepEqual(
    getAssignmentWarnings(player1, c1, teamsConfig, bracketConfig, assignments, playerClassifications),
    ["חריגה ממכסת החריגים"]
  );
  assert.deepEqual(
    getAssignmentWarnings(player2, c2, teamsConfig, bracketConfig, assignments, playerClassifications),
    ["חריגה ממכסת החריגים"]
  );
});

test("getAssignmentWarnings: warns when assigned outside natural and bridge brackets", () => {
  const player = { id: "p1", birthDate: "2012-05-15" };
  const classification = classifyPlayer(player, bracketConfig);
  const assignments = { p1: { teamIds: ["team-a1"] } };
  const playerClassifications = new Map([["p1", classification]]);
  const warnings = getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications);
  assert.deepEqual(warnings, ["מחוץ לשכבת הזכאות"]);
});

test("getAssignmentWarnings: no warning when player has no assignment", () => {
  const player = { id: "p1", birthDate: "2012-05-15" };
  const classification = classifyPlayer(player, bracketConfig);
  const warnings = getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, {}, new Map([["p1", classification]]));
  assert.deepEqual(warnings, []);
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `node --test squad-planner/planning-filters.test.js`
Expected: FAIL — `Cannot find module './planning-filters.js'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `squad-planner/planning-filters.js`:

```js
export function matchesFilters(player, assignedTeamIds, filters) {
  const search = filters.search.trim().toLowerCase();
  if (search && !player.fullName.toLowerCase().includes(search)) return false;

  if (filters.teamId === "__unassigned__") {
    if (assignedTeamIds.length > 0) return false;
  } else if (filters.teamId) {
    if (!assignedTeamIds.includes(filters.teamId)) return false;
  }

  if (filters.birthYear && player.birthDate.slice(0, 4) !== filters.birthYear) return false;

  return true;
}

function countActiveExceptionUsers(bracketId, assignments, playerClassifications, teamsConfig) {
  let count = 0;
  for (const [playerId, assignment] of Object.entries(assignments)) {
    const classification = playerClassifications.get(playerId);
    if (!classification || !classification.bridge) continue;
    if (classification.bridge.id !== bracketId || classification.bridgeType !== "exception") continue;

    const teamIds = assignment.teamIds || [];
    const usesThisBracket = teamIds.some((teamId) => {
      const team = teamsConfig.find((t) => t.id === teamId);
      return team && team.bracketId === bracketId;
    });
    if (usesThisBracket) count++;
  }
  return count;
}

export function getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications) {
  const assignedTeamIds = assignments[player.id]?.teamIds || [];
  const warnings = new Set();

  for (const teamId of assignedTeamIds) {
    const team = teamsConfig.find((t) => t.id === teamId);
    if (!team) continue;
    const bracketId = team.bracketId;

    if (classification.natural && classification.natural.id === bracketId) continue;

    if (classification.bridge && classification.bridge.id === bracketId) {
      if (classification.bridgeType === "auto") continue;
      const bracket = bracketConfig.brackets.find((b) => b.id === bracketId);
      const quota = bracket ? bracket.exceptionQuota : 0;
      const activeCount = countActiveExceptionUsers(bracketId, assignments, playerClassifications, teamsConfig);
      if (activeCount > quota) warnings.add("חריגה ממכסת החריגים");
      continue;
    }

    warnings.add("מחוץ לשכבת הזכאות");
  }

  return [...warnings];
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `node --test squad-planner/planning-filters.test.js`
Expected: PASS — all tests green, 0 failures.

- [ ] **Step 5: Run the full project test suite to confirm no regressions**

Run: `npm test`
Expected: PASS — includes `eligibility.test.js`, `fetchPlayers.test.js`, and the new `planning-filters.test.js`.

- [ ] **Step 6: Commit**

```bash
git add squad-planner/planning-filters.js squad-planner/planning-filters.test.js
git commit -m "$(cat <<'EOF'
feat: extract testable filter/quota-warning logic for the planning view

Pulled the pure matching and quota-warning logic into its own module so
it can be unit-tested without a DOM — app.js touches document at import
time, which breaks node --test if pulled in transitively.
EOF
)"
```

---

## Task 2: Rewrite the planning view as a single filterable list

**Files:**
- Modify: `squad-planner/view-planning.js` (full rewrite)
- Modify: `squad-planner/styles.css` (append new rules)

**Interfaces:**
- Consumes:
  - `state, getAllPlayers, classify` from `squad-planner/app.js` (unchanged: `state.players/manualPlayers/overrides/assignments/eligibilityConfig/teamsConfig`; `getAllPlayers()` → array of players with `.hidden` already filtered out; `classify(player)` → same classification shape as `classifyPlayer`).
  - `store.saveAssignment(playerId, assignmentData)` and `store.savePlayerOverride(playerId, override)` from `squad-planner/data.js` (unchanged).
  - `matchesFilters` and `getAssignmentWarnings` from `squad-planner/planning-filters.js` (Task 1).
- Produces: `renderPlanningView(container)` — same exported signature as today, called from `squad-planner/app.js:75`. No other file needs to change.

- [ ] **Step 1: Append the new CSS rules**

Add to the end of `squad-planner/styles.css`:

```css
.gender-tabs { display: flex; gap: 8px; padding: 12px 16px 0; }
.gender-tab { background: none; border: none; color: #666; padding: 8px 12px; cursor: pointer; font-size: 15px; border-bottom: 2px solid transparent; }
.gender-tab.active { color: #1a1a1a; font-weight: bold; border-bottom-color: #e85d04; }
.filters-bar { display: flex; gap: 10px; padding: 12px 16px; flex-wrap: wrap; }
.filters-bar input, .filters-bar select { padding: 6px 8px; font-size: 14px; }
.player-list { padding: 0 16px 16px; }
.assignment-warning { color: #c0392b; font-size: 13px; }
```

- [ ] **Step 2: Replace the contents of `view-planning.js`**

Replace the entire file with:

```js
import { state, getAllPlayers, classify } from "./app.js";
import * as store from "./data.js";
import { matchesFilters, getAssignmentWarnings } from "./planning-filters.js";

const UNASSIGNED_FILTER = "__unassigned__";

const uiState = {
  gender: "M",
  filters: { search: "", teamId: "", birthYear: "" },
};

export function renderPlanningView(container) {
  container.innerHTML = "";

  const tabs = document.createElement("div");
  tabs.className = "gender-tabs";
  for (const [genderValue, label] of [["M", "בנים"], ["F", "בנות"]]) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = "gender-tab" + (uiState.gender === genderValue ? " active" : "");
    btn.addEventListener("click", () => {
      uiState.gender = genderValue;
      uiState.filters = { search: "", teamId: "", birthYear: "" };
      renderPlanningView(container);
    });
    tabs.appendChild(btn);
  }
  container.appendChild(tabs);

  const genderPlayers = getAllPlayers().filter((p) => p.gender === uiState.gender);
  const genderConfig = uiState.gender === "M" ? state.eligibilityConfig.boys : state.eligibilityConfig.girls;
  const genderBracketIds = new Set(genderConfig.brackets.map((b) => b.id));
  const genderTeams = state.teamsConfig.filter((t) => genderBracketIds.has(t.bracketId));

  const filtersBar = document.createElement("div");
  filtersBar.className = "filters-bar";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "חיפוש שם";
  searchInput.value = uiState.filters.search;
  searchInput.addEventListener("input", () => {
    uiState.filters.search = searchInput.value;
    renderPlayerRows();
  });
  filtersBar.appendChild(searchInput);

  const teamSelect = document.createElement("select");
  const teamPlaceholder = document.createElement("option");
  teamPlaceholder.value = "";
  teamPlaceholder.textContent = "כל הקבוצות";
  teamSelect.appendChild(teamPlaceholder);
  const unassignedOption = document.createElement("option");
  unassignedOption.value = UNASSIGNED_FILTER;
  unassignedOption.textContent = "לא משובץ";
  teamSelect.appendChild(unassignedOption);
  for (const team of genderTeams) {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.label;
    teamSelect.appendChild(option);
  }
  teamSelect.value = uiState.filters.teamId;
  teamSelect.addEventListener("change", () => {
    uiState.filters.teamId = teamSelect.value;
    renderPlayerRows();
  });
  filtersBar.appendChild(teamSelect);

  const birthYears = [...new Set(genderPlayers.map((p) => p.birthDate.slice(0, 4)))].sort();
  const yearSelect = document.createElement("select");
  const yearPlaceholder = document.createElement("option");
  yearPlaceholder.value = "";
  yearPlaceholder.textContent = "כל שנות הלידה";
  yearSelect.appendChild(yearPlaceholder);
  for (const year of birthYears) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }
  yearSelect.value = uiState.filters.birthYear;
  yearSelect.addEventListener("change", () => {
    uiState.filters.birthYear = yearSelect.value;
    renderPlayerRows();
  });
  filtersBar.appendChild(yearSelect);

  container.appendChild(filtersBar);

  const listSection = document.createElement("div");
  listSection.className = "player-list";
  container.appendChild(listSection);

  function renderPlayerRows() {
    listSection.innerHTML = "";

    if (genderPlayers.length === 0) {
      listSection.textContent = "אין שחקנים בקטגוריה זו.";
      return;
    }

    const playerClassifications = new Map(genderPlayers.map((p) => [p.id, classify(p)]));
    const sorted = [...genderPlayers].sort((a, b) => a.birthDate.localeCompare(b.birthDate));
    const visiblePlayers = sorted.filter((p) => {
      const assignedTeamIds = state.assignments[p.id]?.teamIds || [];
      return matchesFilters(p, assignedTeamIds, uiState.filters);
    });

    if (visiblePlayers.length === 0) {
      listSection.textContent = "אין שחקנים התואמים את הסינון.";
      return;
    }

    for (const player of visiblePlayers) {
      listSection.appendChild(renderPlayerRow(player, playerClassifications));
    }
  }

  function renderPlayerRow(player, playerClassifications) {
    const classification = playerClassifications.get(player.id);
    const row = document.createElement("div");
    row.className = "player-row";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = player.fullName;
    row.appendChild(nameSpan);

    const birthSpan = document.createElement("span");
    birthSpan.textContent = player.birthDate;
    row.appendChild(birthSpan);

    const eligibilitySpan = document.createElement("span");
    eligibilitySpan.textContent = classification.natural ? classification.natural.label : "אין שכבה טבעית מוגדרת";
    row.appendChild(eligibilitySpan);

    if (classification.bridge) {
      const badge = document.createElement("span");
      badge.className = `badge ${classification.bridgeType}`;
      badge.textContent = `${classification.bridgeType === "exception" ? "חריג" : "גישור"}: ${classification.bridge.label}`;
      row.appendChild(badge);
    }

    const currentAssignment = state.assignments[player.id]?.teamIds || [];

    const buildTeamOptions = (select, selectedId) => {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— לא משובץ —";
      select.appendChild(placeholder);
      for (const t of genderTeams) {
        const option = document.createElement("option");
        option.value = t.id;
        option.textContent = t.label;
        option.selected = t.id === selectedId;
        select.appendChild(option);
      }
    };

    const select1 = document.createElement("select");
    buildTeamOptions(select1, currentAssignment[0] || "");
    const select2 = document.createElement("select");
    buildTeamOptions(select2, currentAssignment[1] || "");

    const persistAssignment = async () => {
      const teamIds = [select1.value, select2.value].filter((v) => v && v.length > 0);
      const uniqueTeamIds = [...new Set(teamIds)];
      const assignmentData = {
        teamIds: uniqueTeamIds,
        exceptionApproved: !!classification.bridge && classification.bridgeType === "exception",
        note: state.assignments[player.id]?.note || "",
      };
      try {
        await store.saveAssignment(player.id, assignmentData);
        state.assignments[player.id] = assignmentData;
        renderPlayerRows();
      } catch (err) {
        console.error(`Failed to save assignment for player ${player.id}`, err);
        alert("שגיאה בשמירת השיבוץ. נסה שוב.");
      }
    };
    select1.addEventListener("change", persistAssignment);
    select2.addEventListener("change", persistAssignment);
    row.appendChild(select1);
    row.appendChild(select2);

    const warnings = getAssignmentWarnings(player, classification, genderTeams, genderConfig, state.assignments, playerClassifications);
    for (const warning of warnings) {
      const warningSpan = document.createElement("span");
      warningSpan.className = "assignment-warning";
      warningSpan.textContent = `⚠ ${warning}`;
      row.appendChild(warningSpan);
    }

    if (!player.manual) {
      const hideBtn = document.createElement("button");
      hideBtn.textContent = "הסתר (עזב/טעות)";
      hideBtn.addEventListener("click", async () => {
        try {
          await store.savePlayerOverride(player.id, { hidden: true });
          state.overrides[player.id] = { ...(state.overrides[player.id] || {}), hidden: true };
          renderPlanningView(container);
        } catch (err) {
          console.error(`Failed to hide player ${player.id}:`, err);
          alert("שגיאה בהסתרת השחקן. נסה שוב.");
        }
      });
      row.appendChild(hideBtn);
    }

    return row;
  }

  renderPlayerRows();
}
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — `view-planning.js` isn't imported by any test (it touches `document`), so this only confirms `eligibility.test.js`, `fetchPlayers.test.js`, and `planning-filters.test.js` are unaffected. Real verification of this file happens in the browser (Step 4).

- [ ] **Step 4: Manually verify in the browser**

Start a static server from the **repo root** (not `squad-planner/` — see `docs/superpowers/specs/2026-07-04-youth-squad-planner-design.md` for why `players.json` needs to resolve one level up from `squad-planner/app.js`):

```bash
npx serve . -l 3000
```

Open `http://localhost:3000/squad-planner/`, log in, and open the browser console (check for import/runtime errors — a broken `import` in Step 2 would show up here, not in `npm test`). Then walk through:

1. Two tabs appear at the top of the planning screen: "בנים" and "בנות". Clicking one switches the visible players and resets the filters below.
2. Every row shows the player's name, birth date, and an eligibility label (their natural bracket's name, or "אין שכבה טבעית מוגדרת" if none is configured for their birth year).
3. Type into the search box: the list filters as you type, and — important — the input keeps keyboard focus the whole time (you should not need to click back into the box after each letter).
4. Pick a team from the "קבוצה" filter dropdown: only players currently assigned to that team remain. Pick "לא משובץ": only players with no assigned team remain.
5. Pick a birth year from the year dropdown: only players born in that year remain.
6. In Settings, set a bracket's `מכסת חריגים` to a small number (e.g. 1), then in the planning list assign more "חריג"-badged players into that bracket's team than the quota allows — confirm the newly-over-quota players show "⚠ חריגה ממכסת החריגים", and it disappears again if you unassign enough of them back under quota.
7. Assign a player to a team completely unrelated to their natural or bridge bracket — confirm "⚠ מחוץ לשכבת הזכאות" appears.
8. Click "הסתר (עזב/טעות)" on a non-manual player — confirm they disappear from the list.

If any of these fail, fix `view-planning.js` before committing.

- [ ] **Step 5: Commit**

```bash
git add squad-planner/view-planning.js squad-planner/styles.css
git commit -m "$(cat <<'EOF'
feat: replace bracket-sectioned planning view with a unified filterable list

The old view only gave editable assignment dropdowns to a player's
"natural" bracket row — players with no natural bracket configured for
their birth year (a real, hit gap) had no editable row anywhere.
The new view is one flat, sorted list per gender with search/team/birth-
year filters, showing every player's eligibility as a label, and
letting any player be assigned to any team, with soft (non-blocking)
warnings for out-of-bracket or over-quota assignments.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** gender toggle+reset ✓ (Task 2 Step 2, tab click handler), search/team/birthYear filters ✓ (Task 1 + Task 2), birth date column ✓, eligibility label + badge ✓, all-teams assignment dropdowns ✓, two soft warnings ✓, "הסתר" button retained ✓, no changes to `view-teams.js`/`view-settings.js`/Firestore model/`classify()` ✓ (none touched).
- **Search input focus bug avoided:** filter changes call `renderPlayerRows()` (rebuilds only `listSection`), not a full `renderPlanningView(container)` — the search `<input>` element itself is never destroyed while typing, so it keeps focus and cursor position. Only the gender tab and hide-button handlers do a full re-render, which is fine since those aren't free-text fields.
- **Type/signature consistency:** `matchesFilters(player, assignedTeamIds, filters)` and `getAssignmentWarnings(player, classification, teamsConfig, bracketConfig, assignments, playerClassifications)` are the same signatures in the Task 1 tests, the Task 1 implementation, and the Task 2 call sites.
