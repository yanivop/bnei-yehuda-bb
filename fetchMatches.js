#!/usr/bin/env node
/**
 * Bnei Yehuda Basketball - Match Fetcher
 * Fetches upcoming matches from ibasketball.co.il (SportsPress API)
 */

const CONFIG = {
  baseUrl: "https://ibasketball.co.il/wp-json/sportspress/v2",
  seasonId: "119472",
  clubId: "715472",
  perPage: 100,
};

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${CONFIG.baseUrl}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

// Decode HTML entities from API strings (e.g. &quot; → ")
function decodeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

// Simple in-memory cache for venue names
const venueCache = new Map();

async function getVenueName(venueId) {
  if (!venueId) return "—";
  if (venueCache.has(venueId)) return venueCache.get(venueId);

  try {
    const venue = await apiFetch(`venues/${venueId}`);
    const name = venue.name || `venue-${venueId}`;
    venueCache.set(venueId, name);
    return name;
  } catch {
    venueCache.set(venueId, `venue-${venueId}`);
    return `venue-${venueId}`;
  }
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

/**
 * Fetch matches within a date range.
 * @param {Date} from  Start date (default: now)
 * @param {Date} to    End date   (default: +14 days)
 */
async function fetchMatches(from = new Date(), to = null) {
  if (!to) {
    to = new Date(from);
    to.setDate(to.getDate() + 14);
  }

  const events = await apiFetch("events", {
    order: "asc",
    seasons: CONFIG.seasonId,
    clubs: CONFIG.clubId,
    per_page: CONFIG.perPage,
    after: from.toISOString(),
    before: to.toISOString(),
  });

  // Resolve venue names in parallel
  const venueIds = [...new Set(events.flatMap((e) => e.venues || []))];
  await Promise.all(venueIds.map(getVenueName));

  return events.map(normalizeEvent);
}

function normalizeEvent(raw) {
  const homePoints = raw.home?.points;
  const awayPoints = raw.away?.points;
  const hasScore = homePoints !== null && awayPoints !== null;

  return {
    id: raw.id,
    date: raw.date,                               // "2026-04-15T19:00:00"
    status: raw.status,                           // "future" | "publish" | "results"
    home: decodeHtml(raw.home?.team) || "—",
    away: decodeHtml(raw.away?.team) || "—",
    homeLink: raw.home?.link || null,
    awayLink: raw.away?.link || null,
    score: hasScore ? `${homePoints}–${awayPoints}` : null,
    homePoints: hasScore ? homePoints : null,
    awayPoints: hasScore ? awayPoints : null,
    winner: raw.winner || null,
    league: raw.league?.name || "—",
    leagueLink: raw.league?.link || null,
    gender: raw.league?.gender || null,           // "F" | "M" | null
    venueIds: raw.venues || [],
    venueNames: (raw.venues || []).map((id) => venueCache.get(id) || `venue-${id}`),
    matchUrl: raw.link || null,
    day: raw.day || null,
  };
}

// ─── Display ──────────────────────────────────────────────────────────────────

function formatDate(isoString) {
  const d = new Date(isoString);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]} ${dd}/${mm} ${hh}:${min}`;
}

function printMatches(matches) {
  if (matches.length === 0) {
    console.log("No matches found in this date range.");
    return;
  }

  console.log(`\n${"─".repeat(100)}`);
  console.log(
    `  ${"#".padEnd(4)} ${"Date".padEnd(16)} ${"Home".padEnd(28)} ${"Score".padEnd(8)} ${"Away".padEnd(28)} ${"League".padEnd(26)} Venue`
  );
  console.log(`${"─".repeat(100)}`);

  matches.forEach((m, i) => {
    const score = m.score ?? (m.status === "future" ? "vs" : "?–?");
    const venue = m.venueNames[0] || "—";
    // Trim long strings for display
    const trim = (s, n) => s.length > n ? s.slice(0, n - 1) + "…" : s;

    console.log(
      `  ${String(i + 1).padEnd(4)} ${formatDate(m.date).padEnd(16)} ${trim(m.home, 28).padEnd(28)} ${score.padEnd(8)} ${trim(m.away, 28).padEnd(28)} ${trim(m.league, 26).padEnd(26)} ${trim(venue, 35)}`
    );
  });

  console.log(`${"─".repeat(100)}`);
  console.log(`  Total: ${matches.length} matches\n`);
}

function groupByDate(matches) {
  const groups = new Map();
  for (const m of matches) {
    const day = m.date.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(m);
  }
  return groups;
}

function printGrouped(matches) {
  const groups = groupByDate(matches);
  console.log(`\n===== Bnei Yehuda – Next ${matches.length} matches =====\n`);

  for (const [day, dayMatches] of groups) {
    const d = new Date(day);
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    console.log(
      `\n📅  ${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} — ${dayMatches.length} match(es)`
    );
    console.log("    " + "─".repeat(80));

    for (const m of dayMatches) {
      const time = m.date.slice(11, 16);
      const score = m.score ?? "vs";
      const venue = m.venueNames[0] || "—";
      console.log(`    ${time}  ${m.home}  ${score}  ${m.away}`);
      console.log(`         🏆 ${m.league}   📍 ${venue}`);
    }
  }
  console.log();
}

// ─── Analysis helpers (to be expanded) ───────────────────────────────────────

function analyzeMatches(matches) {
  const results = {
    total: matches.length,
    future: matches.filter((m) => m.status === "future").length,
    played: matches.filter((m) => m.score !== null).length,
    byLeague: {},
    byGender: { M: 0, F: 0, unknown: 0 },
    homeGames: 0,
    awayGames: 0,
  };

  const CLUB_KEYWORDS = ["בני יהודה"];
  const isOurTeam = (name) => CLUB_KEYWORDS.some((kw) => name.includes(kw));

  for (const m of matches) {
    // By league
    results.byLeague[m.league] = (results.byLeague[m.league] || 0) + 1;

    // By gender
    const g = m.gender === "F" ? "F" : m.gender === "M" ? "M" : "unknown";
    results.byGender[g]++;

    // Home/Away
    if (isOurTeam(m.home)) results.homeGames++;
    if (isOurTeam(m.away)) results.awayGames++;
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse optional CLI args: --days=N  --from=YYYY-MM-DD  --json
  let days = 14;
  let fromDate = new Date();
  let outputJson = false;

  for (const arg of args) {
    if (arg.startsWith("--days=")) days = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--from=")) fromDate = new Date(arg.split("=")[1]);
    if (arg === "--json") outputJson = true;
  }

  const toDate = new Date(fromDate);
  toDate.setDate(toDate.getDate() + days);

  console.log(`Fetching matches from ${fromDate.toDateString()} → ${toDate.toDateString()} …`);

  const matches = await fetchMatches(fromDate, toDate);

  if (outputJson) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  printGrouped(matches);
  printMatches(matches);

  const stats = analyzeMatches(matches);
  console.log("── Stats ──────────────────────────────────────────────────────");
  console.log(`  Total: ${stats.total}  |  Upcoming: ${stats.future}  |  Played: ${stats.played}`);
  console.log(`  Home: ${stats.homeGames}  |  Away: ${stats.awayGames}`);
  console.log(`  Gender breakdown:  Female (F): ${stats.byGender.F}  Male (M): ${stats.byGender.M}  Unknown: ${stats.byGender.unknown}`);
  console.log("  By league:");
  for (const [league, count] of Object.entries(stats.byLeague).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count}x  ${league}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
