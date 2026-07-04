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

    const heading = document.createElement("h3");
    heading.textContent = `${team.label} (${memberIds.length})`;
    section.appendChild(heading);

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
