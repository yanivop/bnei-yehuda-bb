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
