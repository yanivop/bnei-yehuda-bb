import { state, getAllPlayers, classify } from "./app.js";
import * as store from "./data.js";

export function renderPlanningView(container) {
  container.innerHTML = "";
  const allPlayers = getAllPlayers();

  // Compute each player's classification once per render and reuse it
  // everywhere below, instead of calling classify(p) repeatedly.
  const classifications = new Map();
  for (const p of allPlayers) {
    classifications.set(p.id, classify(p));
  }

  for (const gender of ["M", "F"]) {
    const config = gender === "M" ? state.eligibilityConfig.boys : state.eligibilityConfig.girls;
    const genderPlayers = allPlayers.filter((p) => p.gender === gender);

    for (const bracket of config.brackets) {
      const inBracket = genderPlayers.filter((p) => {
        const result = classifications.get(p.id);
        return (result.natural && result.natural.id === bracket.id) || (result.bridge && result.bridge.id === bracket.id);
      });
      if (inBracket.length === 0) continue;

      const exceptionsUsed = inBracket.filter((p) => {
        const result = classifications.get(p.id);
        return result.bridge?.id === bracket.id && result.bridgeType === "exception";
      }).length;

      const section = document.createElement("section");
      section.className = "bracket-section";
      const heading = document.createElement("h3");
      heading.textContent = `${bracket.label} (חריגים: ${exceptionsUsed}/${bracket.exceptionQuota})`;
      section.appendChild(heading);

      const teamOptions = state.teamsConfig.filter((t) => t.bracketId === bracket.id);

      for (const player of inBracket) {
        const result = classifications.get(player.id);
        const isBridge = result.bridge?.id === bracket.id;
        const row = document.createElement("div");
        row.className = "player-row";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = player.fullName;
        row.appendChild(nameSpan);

        if (isBridge) {
          const badge = document.createElement("span");
          badge.className = `badge ${result.bridgeType}`;
          badge.textContent = result.bridgeType === "exception" ? "חריג" : "גישור";
          row.appendChild(badge);
        }

        const currentAssignment = state.assignments[player.id]?.teamIds || [];
        // Two independent selects so a player can be assigned to up to 2 teams
        // at once (dual registration — happens occasionally, per the spec).
        const buildTeamOptions = (select, teamOptions, selectedId) => {
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "— לא משובץ —";
          select.appendChild(placeholder);

          for (const t of teamOptions) {
            const option = document.createElement("option");
            option.value = t.id;
            option.textContent = t.label;
            option.selected = t.id === selectedId;
            select.appendChild(option);
          }
        };

        const select1 = document.createElement("select");
        buildTeamOptions(select1, teamOptions, currentAssignment[0] || "");
        const select2 = document.createElement("select");
        buildTeamOptions(select2, teamOptions, currentAssignment[1] || "");

        const persistAssignment = async () => {
          const teamIds = [select1.value, select2.value].filter((v) => v && v.length > 0);
          const uniqueTeamIds = [...new Set(teamIds)];
          const assignmentData = {
            teamIds: uniqueTeamIds,
            exceptionApproved: isBridge && result.bridgeType === "exception",
            note: state.assignments[player.id]?.note || "",
          };
          try {
            await store.saveAssignment(player.id, assignmentData);
            state.assignments[player.id] = assignmentData;
          } catch (err) {
            console.error(`Failed to save assignment for player ${player.id}`, err);
          }
        };
        select1.addEventListener("change", persistAssignment);
        select2.addEventListener("change", persistAssignment);

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
