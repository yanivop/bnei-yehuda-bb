# Youth Squad Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tool that scrapes Bnei Yehuda's youth players (name, current team/league, birthdate) from ibasketball.co.il, computes each player's next-season age-bracket eligibility (including December auto-bridge and Sept-Nov exception rules), and gives the club manager a password-protected web app to assign players to next season's teams, with decisions persisted in Firestore.

**Architecture:** A one-time/manual Node scraping script (`fetchPlayers.js`) writes a static `players.json`, mirroring the existing `fetchMatches.js` pattern. A new static page (`squad-planner/index.html`) reads that file and talks to a small Firebase project (Auth + Firestore) for everything editable: eligibility config, team lists, manual player additions/corrections, and assignments. A single shared Firebase Auth account gates all read/write access.

**Tech Stack:** Plain Node.js (native `fetch`, no npm dependencies), Node's built-in `node:test` runner, plain HTML/CSS/JS (ES modules, no build step), Firebase Auth + Firestore (loaded via CDN ESM imports).

**Reference spec:** `docs/superpowers/specs/2026-07-04-youth-squad-planner-design.md`

---

## Task 0: Repo setup for ES modules and tests

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bnei-yehuda-bb",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Verify existing scripts still run unaffected**

Run: `node fetchMatches.js --days=1 --json | head -c 200`
Expected: JSON output starts with `[` (or `[]`), no `SyntaxError`/`ReferenceError` about `require`/`module`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add package.json for ES modules and node:test"
```

---

## Task 1: Firebase project setup (manual, by you — not automatable)

This task has no code. It must be done once in the Firebase Console by a human with a Google account, before Task 9 onward can work end-to-end. Record the resulting values — they're needed in Task 9.

- [ ] **Step 1: Create the Firebase project**

Go to https://console.firebase.google.com/ → "Add project" → name it e.g. `bnei-yehuda-squad-planner` → disable Google Analytics (not needed) → Create.

- [ ] **Step 2: Register a Web app**

In the project, click the `</>` (Web) icon → nickname `squad-planner` → **do not** check "Firebase Hosting" (we're using GitHub Pages) → Register app. Copy the `firebaseConfig` object shown (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId) — you'll paste this into `squad-planner/firebase-config.js` in Task 9.

- [ ] **Step 3: Enable Email/Password auth**

Build → Authentication → Get started → Sign-in method → enable "Email/Password" (first option, not passwordless) → Save.

- [ ] **Step 4: Create the shared login account**

Authentication → Users tab → Add user. Email: `club@bnei-yehuda-squad-planner.internal` (any fixed value works, doesn't need to be a real inbox). Password: choose a real, non-trivial shared password — this is the only thing that gates access, so avoid short numeric PINs. Save it somewhere you and the manager can both retrieve it.

- [ ] **Step 5: Create Firestore database**

Build → Firestore Database → Create database → **Production mode** (we'll set explicit rules next) → pick a region (e.g. `eur3` or `europe-west1`) → Enable.

- [ ] **Step 6: Deploy the security rules**

Firestore Database → Rules tab. Once Task 8 produces `firestore.rules`, paste its contents here and click Publish. (You can leave the default deny-all rules in place until then.)

- [ ] **Step 7: Record the values needed later**

Write down: the `firebaseConfig` object from Step 2, the login email from Step 4, and the password from Step 4 (share the password with the manager separately, e.g. in person or via a messaging app — not in this repo).

---

## Task 2: Eligibility engine (pure logic, TDD)

**Files:**
- Create: `squad-planner/eligibility.js`
- Test: `squad-planner/eligibility.test.js`

Implements the rule from the spec: natural bracket = player's birth year; a player born in December is auto-eligible (no quota) for the bracket whose `referenceBirthYear` is birthYear+1 (the next **younger** bracket); a player born September–November is an **exception candidate** for that same younger bracket, counted against that bracket's `exceptionQuota`.

- [ ] **Step 1: Write the failing tests**

```javascript
// squad-planner/eligibility.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPlayer } from "./eligibility.js";

const config = {
  brackets: [
    { id: "neurim-a", label: "נערים א'", referenceBirthYear: 2011, exceptionQuota: 3 },
    { id: "neurim-b", label: "נערים ב'", referenceBirthYear: 2012, exceptionQuota: 3 },
    { id: "yeladim-a", label: "ילדים א'", referenceBirthYear: 2013, exceptionQuota: 2 },
  ],
};

test("player born mid-year gets only their natural bracket", () => {
  const result = classifyPlayer({ birthDate: "2012-05-15" }, config);
  assert.equal(result.natural.id, "neurim-b");
  assert.equal(result.bridge, null);
  assert.equal(result.bridgeType, null);
});

test("player born in December auto-bridges to the next younger bracket", () => {
  const result = classifyPlayer({ birthDate: "2012-12-20" }, config);
  assert.equal(result.natural.id, "neurim-b");
  assert.equal(result.bridge.id, "yeladim-a");
  assert.equal(result.bridgeType, "auto");
});

test("player born Sept-Nov is an exception candidate for the next younger bracket", () => {
  const result = classifyPlayer({ birthDate: "2012-09-01" }, config);
  assert.equal(result.natural.id, "neurim-b");
  assert.equal(result.bridge.id, "yeladim-a");
  assert.equal(result.bridgeType, "exception");

  const resultNov = classifyPlayer({ birthDate: "2012-11-30" }, config);
  assert.equal(resultNov.bridge.id, "yeladim-a");
  assert.equal(resultNov.bridgeType, "exception");
});

test("player born in other months (not Sep-Dec) has no bridge", () => {
  const result = classifyPlayer({ birthDate: "2012-08-31" }, config);
  assert.equal(result.bridge, null);
  assert.equal(result.bridgeType, null);
});

test("no younger bracket configured means no bridge even if born in December", () => {
  const smallConfig = { brackets: [{ id: "only", label: "Only", referenceBirthYear: 2012, exceptionQuota: 1 }] };
  const result = classifyPlayer({ birthDate: "2012-12-15" }, smallConfig);
  assert.equal(result.natural.id, "only");
  assert.equal(result.bridge, null);
});

test("player with no matching natural bracket returns null natural", () => {
  const result = classifyPlayer({ birthDate: "2005-06-01" }, config);
  assert.equal(result.natural, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test squad-planner/eligibility.test.js`
Expected: FAIL — `Cannot find module './eligibility.js'` (file doesn't exist yet).

- [ ] **Step 3: Implement `eligibility.js`**

```javascript
// squad-planner/eligibility.js

/**
 * @param {{birthDate: string}} player  birthDate as "YYYY-MM-DD"
 * @param {{brackets: Array<{id: string, referenceBirthYear: number, exceptionQuota: number}>}} config
 *        brackets for a single gender
 * @returns {{natural: object|null, bridge: object|null, bridgeType: "auto"|"exception"|null}}
 */
export function classifyPlayer(player, config) {
  const [yearStr, monthStr] = player.birthDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const natural = config.brackets.find((b) => b.referenceBirthYear === year) || null;
  const youngerBracket = config.brackets.find((b) => b.referenceBirthYear === year + 1) || null;

  let bridge = null;
  let bridgeType = null;
  if (youngerBracket) {
    if (month === 12) {
      bridge = youngerBracket;
      bridgeType = "auto";
    } else if (month >= 9 && month <= 11) {
      bridge = youngerBracket;
      bridgeType = "exception";
    }
  }

  return { natural, bridge, bridgeType };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test squad-planner/eligibility.test.js`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add squad-planner/eligibility.js squad-planner/eligibility.test.js
git commit -m "feat: add age-bracket eligibility engine with December/exception bridging"
```

---

## Task 3: Player-page and club-page parsing helpers (TDD)

**Files:**
- Create: `fetchPlayers.js`
- Test: `fetchPlayers.test.js`

These are the pure, network-free parsing functions. Fixtures below are trimmed real HTML captured from `https://ibasketball.co.il/club/297-2/` and a player profile page (verified manually during design — see spec).

- [ ] **Step 1: Write the failing tests**

```javascript
// fetchPlayers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeHtml,
  splitName,
  normalizeBirthDate,
  extractPlayerId,
  isYouthAgeCode,
  parseClubPlayerGallery,
  findLeagueTag,
  parsePlayerPage,
} from "./fetchPlayers.js";

test("decodeHtml decodes common HTML entities", () => {
  assert.equal(decodeHtml("בית&quot;ר &amp; כפר"), 'בית"ר & כפר');
});

test("splitName splits on first whitespace", () => {
  assert.deepEqual(splitName("אב ירימישין"), { firstName: "אב", lastName: "ירימישין" });
  assert.deepEqual(splitName("עומר שימריז כהן"), { firstName: "עומר", lastName: "שימריז כהן" });
});

test("normalizeBirthDate converts DD-MM-YYYY to ISO", () => {
  assert.equal(normalizeBirthDate("26-10-1986"), "1986-10-26");
});

test("extractPlayerId takes the last URL path segment", () => {
  assert.equal(
    extractPlayerId("https://ibasketball.co.il/player/3669c682cead9b25-45521412/"),
    "3669c682cead9b25-45521412"
  );
});

test("isYouthAgeCode accepts U11-U18, rejects adult/null", () => {
  assert.equal(isYouthAgeCode("U13"), true);
  assert.equal(isYouthAgeCode("U18"), true);
  assert.equal(isYouthAgeCode("adult"), false);
  assert.equal(isYouthAgeCode(null), false);
});

const CLUB_GALLERY_FIXTURE = `
<div class="player-gallery" data-ibba-template="players">
<a class="player data-item male" href="https://ibasketball.co.il/player/3669c682cead9b25-45521412/" data-team="596526"><img data-lazyloaded="1" src="x.jpg" />אב ירימישין<br /><span>בני יהודה באהבה</span></a>
<a class="player data-item female" href="https://ibasketball.co.il/player/another-hash/" data-team="991139"><img src="y.jpg" />שם דוגמה<br /><span>בני יהודה תל אביב</span></a>
</div>`;

test("parseClubPlayerGallery extracts profile url, gender and current team name", () => {
  const entries = parseClubPlayerGallery(CLUB_GALLERY_FIXTURE);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    gender: "M",
    profileUrl: "https://ibasketball.co.il/player/3669c682cead9b25-45521412/",
    currentTeamName: "בני יהודה באהבה",
  });
  assert.equal(entries[1].gender, "F");
  assert.equal(entries[1].currentTeamName, "בני יהודה תל אביב");
});

const LEAGUE_WIDGET_FIXTURE = `
<div class="ibba-tabs ibba-leagues" data-gender="male" data-age="adult">
<a id="league-119497" class="league data-item adult female" href="https://ibasketball.co.il/league/2025-56/">ארצית נשים מרכז</a>
<a id="league-119537" class="league data-item U16 male" href="https://ibasketball.co.il/league/2025-168/">נערים א מחוזית ת"א</a>
</div>`;

test("findLeagueTag matches by href and returns ageCode + gender", () => {
  assert.deepEqual(findLeagueTag(LEAGUE_WIDGET_FIXTURE, "https://ibasketball.co.il/league/2025-56/"), {
    ageCode: "adult",
    gender: "F",
  });
  assert.deepEqual(findLeagueTag(LEAGUE_WIDGET_FIXTURE, "https://ibasketball.co.il/league/2025-168/"), {
    ageCode: "U16",
    gender: "M",
  });
  assert.deepEqual(findLeagueTag(LEAGUE_WIDGET_FIXTURE, "https://ibasketball.co.il/league/no-match/"), {
    ageCode: null,
    gender: null,
  });
});

const PLAYER_PAGE_FIXTURE = `
<h1>אב ירימישין</h1>
<li><span class="label">קבוצה נוכחית</span><span class="data data-team">
<a href="https://ibasketball.co.il/team/5010-x/">בני יהודה באהבה</a></span></li>
<li><span class="label">ליגה</span><span class="data data-league">
<a href="https://ibasketball.co.il/league/2025-168/">נערים א מחוזית ת"א</a></span></li>
<div class="data-birthdate"><span>תאריך לידה:</span>
26-10-2011</div><div class="data-age"><span>גיל:</span>
14</div>
${LEAGUE_WIDGET_FIXTURE}
`;

test("parsePlayerPage extracts full profile including derived age/gender", () => {
  const player = parsePlayerPage(PLAYER_PAGE_FIXTURE, "https://ibasketball.co.il/player/3669c682cead9b25-45521412/");
  assert.equal(player.fullName, "אב ירימישין");
  assert.equal(player.firstName, "אב");
  assert.equal(player.lastName, "ירימישין");
  assert.equal(player.birthDate, "2011-10-26");
  assert.deepEqual(player.currentTeams, ["בני יהודה באהבה"]);
  assert.equal(player.currentLeague, 'נערים א מחוזית ת"א');
  assert.equal(player.ageCode, "U16");
  assert.equal(player.gender, "M");
  assert.equal(player.profileUrl, "https://ibasketball.co.il/player/3669c682cead9b25-45521412/");
});

test("parsePlayerPage returns null when required fields are missing", () => {
  assert.equal(parsePlayerPage("<h1>No birthdate here</h1>", "https://example.com/"), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test fetchPlayers.test.js`
Expected: FAIL — `Cannot find module './fetchPlayers.js'`.

- [ ] **Step 3: Implement the parsing functions in `fetchPlayers.js`**

```javascript
#!/usr/bin/env node
/**
 * Bnei Yehuda Basketball - Youth Player Fetcher
 * Scrapes the club roster (name, current team/league, birthdate) from
 * ibasketball.co.il. Run manually / on demand — see README note below.
 */
import fs from "node:fs";

const CLUB_URL = "https://ibasketball.co.il/club/297-2/";
const YOUTH_AGE_CODES = new Set(["U11", "U12", "U13", "U14", "U15", "U16", "U18"]);

export function decodeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

export function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") || "" };
}

export function normalizeBirthDate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

export function extractPlayerId(profileUrl) {
  const parts = profileUrl.replace(/\/$/, "").split("/");
  return parts[parts.length - 1];
}

export function isYouthAgeCode(ageCode) {
  return YOUTH_AGE_CODES.has(ageCode);
}

export function parseClubPlayerGallery(html) {
  const entries = [];
  const re = /<a class="player data-item (male|female)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, genderClass, href, inner] = m;
    const withoutImg = inner.replace(/<img[\s\S]*?>/, "");
    const nameMatch = withoutImg.match(/^([^<]*)<br/);
    const teamMatch = withoutImg.match(/<span>([^<]*)<\/span>/);
    entries.push({
      gender: genderClass === "male" ? "M" : "F",
      profileUrl: href,
      currentTeamName: teamMatch ? decodeHtml(teamMatch[1].trim()) : null,
    });
  }
  return entries;
}

export function findLeagueTag(html, leagueHref) {
  const escaped = leagueHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`class="league data-item (\\w+) (male|female)" href="${escaped}"`);
  const m = html.match(re);
  if (!m) return { ageCode: null, gender: null };
  return { ageCode: m[1], gender: m[2] === "male" ? "M" : "F" };
}

export function parsePlayerPage(html, profileUrl) {
  const nameMatch = html.match(/<h1[^>]*>([^<]*)<\/h1>/);
  const teamMatch = html.match(/data-team">\s*<a href="([^"]+)">([^<]*)<\/a>/);
  const leagueMatch = html.match(/data-league">\s*<a href="([^"]+)">([^<]*)<\/a>/);
  const birthMatch = html.match(/data-birthdate"><span>[^<]*<\/span>\s*(\d{2}-\d{2}-\d{4})/);

  if (!nameMatch || !birthMatch) return null;

  const fullName = decodeHtml(nameMatch[1].trim());
  const leagueHref = leagueMatch ? leagueMatch[1] : null;
  const { ageCode, gender } = leagueHref ? findLeagueTag(html, leagueHref) : { ageCode: null, gender: null };

  return {
    fullName,
    ...splitName(fullName),
    currentTeams: teamMatch ? [decodeHtml(teamMatch[2].trim())] : [],
    currentLeague: leagueMatch ? decodeHtml(leagueMatch[2].trim()) : null,
    birthDate: normalizeBirthDate(birthMatch[1]),
    ageCode,
    gender,
    profileUrl,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test fetchPlayers.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add fetchPlayers.js fetchPlayers.test.js
git commit -m "feat: add HTML parsing helpers for youth roster scraping"
```

---

## Task 4: fetchPlayers.js orchestration (network I/O, manually verified)

**Files:**
- Modify: `fetchPlayers.js`

This wires the pure parsers from Task 3 into an actual scrape. Like `fetchMatches.js`, this network layer is not unit-tested (no dependency-injection/mocking framework in this repo) — verify by running it for real and inspecting `players.json`.

- [ ] **Step 1: Append the orchestration code to `fetchPlayers.js`**

```javascript
async function fetchHtml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  console.log(`Fetching club roster from ${CLUB_URL} ...`);
  const clubHtml = await fetchHtml(CLUB_URL);
  const galleryEntries = parseClubPlayerGallery(clubHtml);
  console.log(`Found ${galleryEntries.length} player-gallery entries.`);

  const byProfileUrl = new Map();
  for (const entry of galleryEntries) {
    if (!byProfileUrl.has(entry.profileUrl)) {
      byProfileUrl.set(entry.profileUrl, new Set());
    }
    if (entry.currentTeamName) byProfileUrl.get(entry.profileUrl).add(entry.currentTeamName);
  }
  const uniqueProfileUrls = [...byProfileUrl.keys()];
  console.log(`${uniqueProfileUrls.length} unique player profiles. Fetching details (concurrency 5) ...`);

  const details = await mapWithConcurrency(uniqueProfileUrls, 5, async (profileUrl) => {
    try {
      const html = await fetchHtml(profileUrl);
      return parsePlayerPage(html, profileUrl);
    } catch (err) {
      console.error(`Failed to fetch ${profileUrl}: ${err.message}`);
      return null;
    }
  });

  const players = details
    .filter((p) => p && isYouthAgeCode(p.ageCode))
    .map((p) => ({ id: extractPlayerId(p.profileUrl), ...p }));

  fs.writeFileSync("players.json", JSON.stringify(players, null, 2));
  console.log(`Wrote ${players.length} youth players to players.json (filtered from ${details.filter(Boolean).length} total profiles).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run it for real and inspect the output**

Run: `node fetchPlayers.js`
Expected: log lines showing gallery entry count, unique profile count, and a final "Wrote N youth players to players.json" — `N` should be a plausible roster size (dozens, not 0 and not many hundreds).

- [ ] **Step 3: Spot-check the output**

Run: `node -e "const p = JSON.parse(require('fs').readFileSync('players.json')); console.log(p.length); console.log(p[0]); console.log(p.filter(x => x.gender === 'F').length, p.filter(x => x.gender === 'M').length)"`
Expected: no `adult`-league entries present (check by eye that `ageCode` values are all U11-U18), birthDate values look like real ISO dates, both genders represented.

- [ ] **Step 4: Commit**

```bash
git add fetchPlayers.js players.json
git commit -m "feat: scrape and generate youth players.json"
```

---

## Task 5: Manual-run GitHub Action for re-fetching the roster

**Files:**
- Create: `.github/workflows/update-players.yml`

Mirrors `update-report.yml` but with no `schedule:` — the roster is pulled once and only re-pulled on demand (per the spec, this is not a recurring cron job).

- [ ] **Step 1: Create the workflow file**

```yaml
name: Update Youth Players Roster

on:
  workflow_dispatch: # manual trigger only — no schedule

jobs:
  build:
    runs-on: ubuntu-latest

    permissions:
      contents: write

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Fetch players
        run: node fetchPlayers.js

      - name: Commit and push if changed
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add players.json
          if git diff --cached --quiet; then
            echo "No changes to players.json — skipping commit"
          else
            git commit -m "chore: refresh youth players roster $(date -u +'%Y-%m-%d')"
            git push
          fi
```

- [ ] **Step 2: Verify the workflow is picked up**

Run: `gh workflow list`
Expected: "Update Youth Players Roster" appears in the list (may take a minute after push).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-players.yml
git commit -m "ci: add manual-dispatch workflow to refresh players.json"
```

---

## Task 6: Firestore security rules

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Create the rules file**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Every collection used by the squad planner (config, assignments,
    // manualPlayers, playerOverrides) requires the shared login.
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

- [ ] **Step 2: Deploy manually via Firebase Console**

Go to Firestore Database → Rules (in the project created in Task 1) → paste the contents of `firestore.rules` → Publish. Confirm the console shows "Rules published successfully".

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore rules requiring shared auth for all access"
```

---

## Task 7: Firebase config and shared-password auth

**Files:**
- Create: `squad-planner/firebase-config.js`
- Create: `squad-planner/auth.js`

- [ ] **Step 1: Create `firebase-config.js` with placeholders**

```javascript
// Values from Task 1 (Firebase Console → Project settings → Your apps → Web app).
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};

// The fixed identity behind the shared "password" login screen.
// This is public (visible in this file) by design — see the design spec's
// security section. It is not a secret; the password is.
export const SHARED_LOGIN_EMAIL = "club@bnei-yehuda-squad-planner.internal";
```

- [ ] **Step 2: Fill in the real values**

Replace the `REPLACE_WITH_*` placeholders with the actual values recorded in Task 1, Step 2. If `SHARED_LOGIN_EMAIL` differs from what you used in Task 1 Step 4, make them match exactly.

- [ ] **Step 3: Create `auth.js`**

```javascript
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { firebaseConfig, SHARED_LOGIN_EMAIL } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export function login(password) {
  return signInWithEmailAndPassword(auth, SHARED_LOGIN_EMAIL, password);
}

export function logout() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
```

- [ ] **Step 4: Commit**

```bash
git add squad-planner/firebase-config.js squad-planner/auth.js
git commit -m "feat: add Firebase init and shared-password auth wiring"
```

(Manual browser verification of login happens in Task 9, once there's a login form to test against.)

---

## Task 8: Firestore data access layer

**Files:**
- Create: `squad-planner/data.js`

- [ ] **Step 1: Create `data.js`**

```javascript
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const EMPTY_ELIGIBILITY_CONFIG = { boys: { brackets: [] }, girls: { brackets: [] } };

export async function getEligibilityConfig() {
  const snap = await getDoc(doc(db, "config", "eligibility"));
  return snap.exists() ? snap.data() : EMPTY_ELIGIBILITY_CONFIG;
}

export function saveEligibilityConfig(config) {
  return setDoc(doc(db, "config", "eligibility"), config);
}

export async function getTeamsConfig() {
  const snap = await getDoc(doc(db, "config", "teams"));
  return snap.exists() ? snap.data().teams : [];
}

export function saveTeamsConfig(teams) {
  return setDoc(doc(db, "config", "teams"), { teams });
}

export async function getAssignments() {
  const snap = await getDocs(collection(db, "assignments"));
  const result = {};
  snap.forEach((d) => {
    result[d.id] = d.data();
  });
  return result;
}

export function saveAssignment(playerId, assignment) {
  return setDoc(doc(db, "assignments", playerId), assignment);
}

export async function getManualPlayers() {
  const snap = await getDocs(collection(db, "manualPlayers"));
  const result = [];
  snap.forEach((d) => result.push({ id: d.id, manual: true, ...d.data() }));
  return result;
}

export function saveManualPlayer(id, player) {
  return setDoc(doc(db, "manualPlayers", id), player);
}

export async function getPlayerOverrides() {
  const snap = await getDocs(collection(db, "playerOverrides"));
  const result = {};
  snap.forEach((d) => {
    result[d.id] = d.data();
  });
  return result;
}

export function savePlayerOverride(playerId, override) {
  return setDoc(doc(db, "playerOverrides", playerId), override, { merge: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add squad-planner/data.js
git commit -m "feat: add Firestore CRUD helpers for config, assignments and overrides"
```

---

## Task 9: App shell, login screen, data loading

**Files:**
- Create: `squad-planner/index.html`
- Create: `squad-planner/styles.css`
- Create: `squad-planner/app.js`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>שיבוץ שחקני נוער – בני יהודה כדורסל</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>

<section id="view-login">
  <form id="login-form">
    <h1>שיבוץ שחקני נוער – בני יהודה</h1>
    <label for="login-password">סיסמה</label>
    <input type="password" id="login-password" required>
    <button type="submit">כניסה</button>
    <p id="login-error" class="error"></p>
  </form>
</section>

<div id="view-app" hidden>
  <nav id="nav">
    <button data-view="planning" class="nav-btn active">תכנון</button>
    <button data-view="teams" class="nav-btn">לפי קבוצות</button>
    <button data-view="settings" class="nav-btn">הגדרות</button>
    <button id="logout-btn">יציאה</button>
  </nav>
  <main>
    <section id="view-planning" class="view"></section>
    <section id="view-teams" class="view" hidden></section>
    <section id="view-settings" class="view" hidden></section>
  </main>
</div>

<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #f5f0e8; color: #1a1a1a; }
#view-login { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
#login-form { background: white; padding: 32px; border-radius: 8px; display: flex; flex-direction: column; gap: 12px; min-width: 280px; }
#login-form input { padding: 8px; font-size: 16px; }
#login-form button { padding: 10px; font-size: 16px; cursor: pointer; }
.error { color: #c0392b; min-height: 1.2em; }
#nav { display: flex; gap: 8px; padding: 12px 16px; background: #0d0d0d; }
.nav-btn { background: none; border: none; color: #ccc; padding: 8px 12px; cursor: pointer; font-size: 15px; }
.nav-btn.active { color: white; font-weight: bold; border-bottom: 2px solid #e85d04; }
#logout-btn { margin-inline-start: auto; background: none; border: none; color: #ccc; cursor: pointer; }
main { padding: 16px; max-width: 1100px; margin: 0 auto; }
.bracket-section { background: white; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
.bracket-section h3 { margin-top: 0; }
.player-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #eee; }
.badge { font-size: 12px; padding: 2px 6px; border-radius: 10px; background: #f48c06; color: white; }
.badge.auto { background: #6b6560; }
</style>
```

- [ ] **Step 3: Create `app.js` with login wiring and data loading**

```javascript
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
```

- [ ] **Step 4: Create placeholder view modules so the app loads**

```javascript
// squad-planner/view-planning.js
export function renderPlanningView(container) {
  container.textContent = "טוען תכנון...";
}
```

```javascript
// squad-planner/view-teams.js
export function renderTeamsView(container) {
  container.textContent = "טוען קבוצות...";
}
```

```javascript
// squad-planner/view-settings.js
export function renderSettingsView(container) {
  container.textContent = "טוען הגדרות...";
}
```

- [ ] **Step 5: Manually verify the login flow in a browser**

Run: `npx serve squad-planner` (or any static file server) and open the printed local URL.
Expected: password screen appears; entering the wrong password shows "סיסמה שגויה"; entering the real shared password (from Task 1 Step 4) hides the login screen and shows the nav bar with three tabs, each showing its placeholder "טוען..." text. Check the browser console for errors (there should be none).

- [ ] **Step 6: Commit**

```bash
git add squad-planner/index.html squad-planner/styles.css squad-planner/app.js squad-planner/view-planning.js squad-planner/view-teams.js squad-planner/view-settings.js
git commit -m "feat: add app shell, shared-password login, and view routing"
```

---

## Task 10: Planning view (grouped by eligible bracket, with assignment controls)

**Files:**
- Modify: `squad-planner/view-planning.js`

- [ ] **Step 1: Implement grouped rendering with assignment dropdown**

```javascript
// squad-planner/view-planning.js
import { state, getAllPlayers, classify } from "./app.js";
import * as store from "./data.js";

export function renderPlanningView(container) {
  container.innerHTML = "";
  const allPlayers = getAllPlayers();

  for (const gender of ["M", "F"]) {
    const config = gender === "M" ? state.eligibilityConfig.boys : state.eligibilityConfig.girls;
    const genderPlayers = allPlayers.filter((p) => p.gender === gender);

    for (const bracket of config.brackets) {
      const inBracket = genderPlayers.filter((p) => {
        const result = classify(p);
        return (result.natural && result.natural.id === bracket.id) || (result.bridge && result.bridge.id === bracket.id);
      });
      if (inBracket.length === 0) continue;

      const exceptionsUsed = inBracket.filter((p) => {
        const result = classify(p);
        return result.bridge?.id === bracket.id && result.bridgeType === "exception";
      }).length;

      const section = document.createElement("section");
      section.className = "bracket-section";
      section.innerHTML = `<h3>${bracket.label} (חריגים: ${exceptionsUsed}/${bracket.exceptionQuota})</h3>`;

      const teamOptions = state.teamsConfig.filter((t) => t.bracketId === bracket.id);

      for (const player of inBracket) {
        const result = classify(player);
        const isBridge = result.bridge?.id === bracket.id;
        const row = document.createElement("div");
        row.className = "player-row";

        const badge = isBridge
          ? `<span class="badge ${result.bridgeType}">${result.bridgeType === "exception" ? "חריג" : "גישור"}</span>`
          : "";

        const currentAssignment = state.assignments[player.id]?.teamIds || [];
        // Two independent selects so a player can be assigned to up to 2 teams
        // at once (dual registration — happens occasionally, per the spec).
        const optionsHtml = (selected) =>
          `<option value="">— לא משובץ —</option>` +
          teamOptions.map((t) => `<option value="${t.id}" ${t.id === selected ? "selected" : ""}>${t.label}</option>`).join("");

        const select1 = document.createElement("select");
        select1.innerHTML = optionsHtml(currentAssignment[0] || "");
        const select2 = document.createElement("select");
        select2.innerHTML = optionsHtml(currentAssignment[1] || "");

        const persistAssignment = async () => {
          const teamIds = [select1.value, select2.value].filter((v) => v && v.length > 0);
          const uniqueTeamIds = [...new Set(teamIds)];
          await store.saveAssignment(player.id, {
            teamIds: uniqueTeamIds,
            exceptionApproved: isBridge && result.bridgeType === "exception",
            note: state.assignments[player.id]?.note || "",
          });
          state.assignments[player.id] = { teamIds: uniqueTeamIds, exceptionApproved: isBridge, note: "" };
        };
        select1.addEventListener("change", persistAssignment);
        select2.addEventListener("change", persistAssignment);

        row.innerHTML = `<span>${player.fullName}</span>${badge}`;
        row.appendChild(select1);
        row.appendChild(select2);
        section.appendChild(row);
      }

      container.appendChild(section);
    }
  }

  if (container.children.length === 0) {
    container.textContent = "אין שחקנים להצגה — ודא שהוגדרו שכבות גיל במסך ההגדרות.";
  }
}
```

- [ ] **Step 2: Manually verify in the browser**

Refresh the app, log in, go to the "תכנון" tab.
Expected (before Task 12 settings exist, `eligibilityConfig`/`teamsConfig` are empty, so): the message "אין שחקנים להצגה — ודא שהוגדרו שכבות גיל במסך ההגדרות." appears. This confirms the view renders without errors even with empty config — full behavior is verified again at the end of Task 12 once brackets/teams are configured.

- [ ] **Step 3: Commit**

```bash
git add squad-planner/view-planning.js
git commit -m "feat: render planning view grouped by eligible bracket with assignment dropdown"
```

---

## Task 11: Teams view (next season's rosters)

**Files:**
- Modify: `squad-planner/view-teams.js`

- [ ] **Step 1: Implement rendering by team**

```javascript
// squad-planner/view-teams.js
import { state, getAllPlayers } from "./app.js";

export function renderTeamsView(container) {
  container.innerHTML = "";
  const allPlayers = getAllPlayers();
  const byId = new Map(allPlayers.map((p) => [p.id, p]));

  if (state.teamsConfig.length === 0) {
    container.textContent = "אין קבוצות מוגדרות — הגדר קבוצות במסך ההגדרות.";
    return;
  }

  for (const team of state.teamsConfig) {
    const memberIds = Object.entries(state.assignments)
      .filter(([, a]) => (a.teamIds || []).includes(team.id))
      .map(([playerId]) => playerId);

    const section = document.createElement("section");
    section.className = "bracket-section";
    section.innerHTML = `<h3>${team.label} (${memberIds.length})</h3>`;

    const list = document.createElement("ul");
    for (const playerId of memberIds) {
      const player = byId.get(playerId);
      const li = document.createElement("li");
      li.textContent = player ? player.fullName : `(שחקן לא ידוע: ${playerId})`;
      list.appendChild(li);
    }
    section.appendChild(list);
    container.appendChild(section);
  }
}
```

- [ ] **Step 2: Manually verify in the browser**

Go to the "לפי קבוצות" tab.
Expected: "אין קבוצות מוגדרות" message (teams aren't configured until Task 12). Full round-trip (assign a player in Planning, see them appear here) is verified at the end of Task 12.

- [ ] **Step 3: Commit**

```bash
git add squad-planner/view-teams.js
git commit -m "feat: render teams view showing next-season rosters"
```

---

## Task 12: Settings view (eligibility brackets + teams config)

**Files:**
- Modify: `squad-planner/view-settings.js`

- [ ] **Step 1: Implement editable tables for brackets (per gender) and teams**

```javascript
// squad-planner/view-settings.js
import { state } from "./app.js";
import * as store from "./data.js";

export function renderSettingsView(container) {
  container.innerHTML = "";
  container.appendChild(renderBracketsSection("boys", "שכבות גיל – בנים"));
  container.appendChild(renderBracketsSection("girls", "שכבות גיל – בנות"));
  container.appendChild(renderTeamsSection());
}

function renderBracketsSection(genderKey, title) {
  const section = document.createElement("section");
  section.className = "bracket-section";
  section.innerHTML = `<h3>${title}</h3>`;

  const table = document.createElement("table");
  table.innerHTML = `<tr><th>מזהה</th><th>שם</th><th>שנת לידה מרכזית</th><th>מכסת חריגים</th><th></th></tr>`;
  const brackets = state.eligibilityConfig[genderKey].brackets;

  brackets.forEach((bracket, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input data-field="id" value="${bracket.id}"></td>
      <td><input data-field="label" value="${bracket.label}"></td>
      <td><input data-field="referenceBirthYear" type="number" value="${bracket.referenceBirthYear}"></td>
      <td><input data-field="exceptionQuota" type="number" value="${bracket.exceptionQuota}"></td>
      <td><button data-action="remove">הסר</button></td>
    `;
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        brackets[index][field] = field.includes("Year") || field.includes("Quota") ? Number(input.value) : input.value;
      });
    });
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
      brackets.splice(index, 1);
      renderSettingsView(section.parentElement);
    });
    table.appendChild(row);
  });

  section.appendChild(table);

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ הוסף שכבה";
  addBtn.addEventListener("click", () => {
    brackets.push({ id: `bracket-${Date.now()}`, label: "", referenceBirthYear: new Date().getFullYear(), exceptionQuota: 0 });
    renderSettingsView(section.parentElement);
  });
  section.appendChild(addBtn);

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "שמור שכבות";
  saveBtn.addEventListener("click", async () => {
    await store.saveEligibilityConfig(state.eligibilityConfig);
    saveBtn.textContent = "נשמר ✓";
    setTimeout(() => (saveBtn.textContent = "שמור שכבות"), 1500);
  });
  section.appendChild(saveBtn);

  return section;
}

function renderTeamsSection() {
  const section = document.createElement("section");
  section.className = "bracket-section";
  section.innerHTML = `<h3>קבוצות המועדון לעונה הבאה</h3>`;

  const allBrackets = [...state.eligibilityConfig.boys.brackets, ...state.eligibilityConfig.girls.brackets];

  const table = document.createElement("table");
  table.innerHTML = `<tr><th>מזהה</th><th>שם קבוצה</th><th>שכבה</th><th></th></tr>`;
  state.teamsConfig.forEach((team, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input data-field="id" value="${team.id}"></td>
      <td><input data-field="label" value="${team.label}"></td>
      <td>
        <select data-field="bracketId">
          ${allBrackets.map((b) => `<option value="${b.id}" ${b.id === team.bracketId ? "selected" : ""}>${b.label}</option>`).join("")}
        </select>
      </td>
      <td><button data-action="remove">הסר</button></td>
    `;
    row.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("change", () => {
        state.teamsConfig[index][input.dataset.field] = input.value;
      });
    });
    row.querySelector('[data-action="remove"]').addEventListener("click", () => {
      state.teamsConfig.splice(index, 1);
      renderSettingsView(section.parentElement);
    });
    table.appendChild(row);
  });
  section.appendChild(table);

  const addBtn = document.createElement("button");
  addBtn.textContent = "+ הוסף קבוצה";
  addBtn.addEventListener("click", () => {
    state.teamsConfig.push({ id: `team-${Date.now()}`, label: "", bracketId: allBrackets[0]?.id || "" });
    renderSettingsView(section.parentElement);
  });
  section.appendChild(addBtn);

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "שמור קבוצות";
  saveBtn.addEventListener("click", async () => {
    await store.saveTeamsConfig(state.teamsConfig);
    saveBtn.textContent = "נשמר ✓";
    setTimeout(() => (saveBtn.textContent = "שמור קבוצות"), 1500);
  });
  section.appendChild(saveBtn);

  return section;
}
```

- [ ] **Step 2: Manually verify the full round-trip in the browser**

In "הגדרות": add at least 2 boys brackets (e.g. `neurim-b` / referenceBirthYear 2012, `yeladim-a` / referenceBirthYear 2013) and one team per bracket, click "שמור שכבות" and "שמור קבוצות". Refresh the page, log in again.
Expected: settings screen still shows the brackets/teams you entered (proves Firestore persistence). Go to "תכנון" — a player born in 2012 should now appear under the נערים ב' section with two team dropdowns; picking a team in the first dropdown and refreshing should show that player under that team in "לפי קבוצות". Picking a *second*, different team in the second dropdown for the same player and refreshing should show them under **both** teams in "לפי קבוצות" (dual registration).

- [ ] **Step 3: Commit**

```bash
git add squad-planner/view-settings.js
git commit -m "feat: add settings view for editing eligibility brackets and teams"
```

---

## Task 13: Manual player add/edit (overrides and additions)

**Files:**
- Modify: `squad-planner/view-settings.js`

- [ ] **Step 1: Add a "player corrections" section to the settings view**

```javascript
// Add to squad-planner/view-settings.js

import { getAllPlayers } from "./app.js"; // add to existing import line from ./app.js

// Add this call inside renderSettingsView(), after the teams section:
//   container.appendChild(renderPlayerCorrectionsSection());

function renderPlayerCorrectionsSection() {
  const section = document.createElement("section");
  section.className = "bracket-section";
  section.innerHTML = `<h3>הוספת/תיקון שחקן</h3>`;

  const form = document.createElement("form");
  form.innerHTML = `
    <input name="fullName" placeholder="שם מלא" required>
    <input name="birthDate" type="date" required>
    <select name="gender"><option value="M">בן</option><option value="F">בת</option></select>
    <input name="currentTeam" placeholder="קבוצה נוכחית (לא חובה)">
    <button type="submit">הוסף שחקן</button>
  `;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const fullName = data.get("fullName").trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const id = `manual-${Date.now()}`;
    const player = {
      fullName,
      firstName,
      lastName: rest.join(" "),
      birthDate: data.get("birthDate"),
      gender: data.get("gender"),
      currentTeams: data.get("currentTeam") ? [data.get("currentTeam")] : [],
      manual: true,
    };
    const { saveManualPlayer } = await import("./data.js");
    await saveManualPlayer(id, player);
    form.reset();
    alert("השחקן נוסף. רענן את הדף כדי לראות אותו במסך התכנון.");
  });
  section.appendChild(form);

  const existingList = document.createElement("ul");
  for (const player of getAllPlayers().filter((p) => p.manual)) {
    const li = document.createElement("li");
    li.textContent = `${player.fullName} (${player.birthDate}, ${player.gender === "M" ? "בן" : "בת"})`;
    existingList.appendChild(li);
  }
  section.appendChild(existingList);

  return section;
}
```

- [ ] **Step 2: Wire the section into `renderSettingsView`**

Edit the top of `renderSettingsView` in `squad-planner/view-settings.js` so it reads:

```javascript
export function renderSettingsView(container) {
  container.innerHTML = "";
  container.appendChild(renderBracketsSection("boys", "שכבות גיל – בנים"));
  container.appendChild(renderBracketsSection("girls", "שכבות גיל – בנות"));
  container.appendChild(renderTeamsSection());
  container.appendChild(renderPlayerCorrectionsSection());
}
```

- [ ] **Step 3: Manually verify in the browser**

In "הגדרות", fill the "הוספת/תיקון שחקן" form with a test name, a birth date, and gender, submit.
Expected: alert confirms addition; after refreshing and re-logging-in, the new name appears in the list under the form, and also shows up correctly grouped in "תכנון" under its computed bracket.

- [ ] **Step 4: Commit**

```bash
git add squad-planner/view-settings.js
git commit -m "feat: allow manually adding players missing from the scraped roster"
```

---

## Task 14: Hiding/correcting scraped players (playerOverrides)

**Files:**
- Modify: `squad-planner/view-planning.js`

- [ ] **Step 1: Add a "hide" action per scraped player row in the planning view**

Edit `squad-planner/view-planning.js`: import `savePlayerOverride` and add a hide button next to each non-manual player's row.

```javascript
// Add to the import line at the top:
import { saveAssignment, savePlayerOverride } from "./data.js";
// (remove the old `import * as store from "./data.js";` and use these named imports,
// updating the one existing `store.saveAssignment(...)` call below to `saveAssignment(...)`)
```

Inside the player row loop in `renderPlanningView`, after `row.appendChild(select);`, add:

```javascript
        if (!player.manual) {
          const hideBtn = document.createElement("button");
          hideBtn.textContent = "הסתר (עזב/טעות)";
          hideBtn.addEventListener("click", async () => {
            await savePlayerOverride(player.id, { hidden: true });
            state.overrides[player.id] = { ...(state.overrides[player.id] || {}), hidden: true };
            renderPlanningView(container);
          });
          row.appendChild(hideBtn);
        }
```

- [ ] **Step 2: Manually verify in the browser**

In "תכנון", click "הסתר (עזב/טעות)" next to any scraped player.
Expected: the player disappears from the list immediately; after refreshing and logging in again, they remain hidden (confirms the override persisted to Firestore, not just local state).

- [ ] **Step 3: Commit**

```bash
git add squad-planner/view-planning.js
git commit -m "feat: allow hiding a scraped player via playerOverrides"
```

---

## Task 15: Wire the app into the repo and hand off

**Files:**
- Modify: `README.md` (create if it doesn't exist)

- [ ] **Step 1: Check whether a README exists**

Run: `ls /Users/yaniv/MyProjects/bnei-yehuda/README.md 2>&1`

- [ ] **Step 2: Add a short section documenting the new tool**

Add (creating the file with just this section if none exists):

```markdown
## Youth Squad Planner

Internal, password-protected tool for planning next season's youth team rosters.

- Roster data: run `node fetchPlayers.js` manually whenever the scraped list needs
  refreshing (or trigger the "Update Youth Players Roster" GitHub Action from the
  Actions tab). This is **not** automatic.
- The app itself lives in `squad-planner/` and is *not* linked from the public
  site — access it directly via its GitHub Pages URL, shared only with the club
  manager. It requires a shared password (see whoever set up the Firebase project
  for the credential).
- One-time setup (Firebase project, Auth account, Firestore rules) is documented
  in `docs/superpowers/plans/2026-07-04-youth-squad-planner.md`, Task 1.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the youth squad planner tool"
```

---

## Self-Review Notes

- **Spec coverage:** scraping (Tasks 3-4), manual-only refresh (Task 5), Firestore data model incl. `manualPlayers`/`playerOverrides`/`config`/`assignments` (Task 8), shared-password auth (Tasks 1, 7), eligibility engine with verified bridge direction (Task 2), planning/teams/settings views (Tasks 9-12), manual player add (Task 13), hide/correct scraped player (Task 14), dual-team assignment support via two independent selects per player row (Task 10).
- **Type consistency check:** `classifyPlayer(player, config)` signature (Task 2) matches all call sites in `app.js`/`view-planning.js` (Task 9-10). Firestore document shapes in `data.js` (Task 8) match what `view-planning.js`, `view-teams.js`, and `view-settings.js` read/write (`teamIds`, `exceptionApproved`, `note`, bracket fields `id`/`label`/`referenceBirthYear`/`exceptionQuota`, team fields `id`/`label`/`bracketId`).
