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
