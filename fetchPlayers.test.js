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
