import { state } from "./app.js";
import * as store from "./data.js";

export function renderSettingsView(container) {
  container.innerHTML = "";
  container.appendChild(renderBracketsSection("boys", "שכבות גיל – בנים"));
  container.appendChild(renderBracketsSection("girls", "שכבות גיל – בנות"));
  container.appendChild(renderTeamsSection());
}

function makeHeaderRow(labels) {
  const row = document.createElement("tr");
  for (const label of labels) {
    const th = document.createElement("th");
    th.textContent = label;
    row.appendChild(th);
  }
  return row;
}

function renderBracketsSection(genderKey, title) {
  const section = document.createElement("section");
  section.className = "bracket-section";

  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  const table = document.createElement("table");
  table.appendChild(makeHeaderRow(["מזהה", "שם", "שנת לידה מרכזית", "מכסת חריגים", ""]));

  const brackets = state.eligibilityConfig[genderKey].brackets;

  brackets.forEach((bracket, index) => {
    const row = document.createElement("tr");

    const makeInputCell = (field, value, type) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.dataset.field = field;
      input.type = type;
      input.value = value;
      input.addEventListener("change", () => {
        const isNumeric = field === "referenceBirthYear" || field === "exceptionQuota";
        if (isNumeric) {
          const parsed = Number(input.value);
          brackets[index][field] = Number.isNaN(parsed) ? 0 : parsed;
        } else {
          brackets[index][field] = input.value;
        }
      });
      td.appendChild(input);
      return td;
    };

    row.appendChild(makeInputCell("id", bracket.id, "text"));
    row.appendChild(makeInputCell("label", bracket.label, "text"));
    row.appendChild(makeInputCell("referenceBirthYear", bracket.referenceBirthYear, "number"));
    row.appendChild(makeInputCell("exceptionQuota", bracket.exceptionQuota, "number"));

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "הסר";
    removeBtn.addEventListener("click", () => {
      brackets.splice(index, 1);
      renderSettingsView(section.parentElement);
    });
    actionTd.appendChild(removeBtn);
    row.appendChild(actionTd);

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
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      await store.saveEligibilityConfig(state.eligibilityConfig);
      saveBtn.textContent = "נשמר ✓";
    } catch (err) {
      console.error(err);
      saveBtn.textContent = "שגיאה בשמירה";
    } finally {
      setTimeout(() => {
        saveBtn.textContent = "שמור שכבות";
        saveBtn.disabled = false;
      }, 1500);
    }
  });
  section.appendChild(saveBtn);

  return section;
}

function renderTeamsSection() {
  const section = document.createElement("section");
  section.className = "bracket-section";

  const heading = document.createElement("h3");
  heading.textContent = "קבוצות המועדון לעונה הבאה";
  section.appendChild(heading);

  const allBrackets = [...state.eligibilityConfig.boys.brackets, ...state.eligibilityConfig.girls.brackets];

  const table = document.createElement("table");
  table.appendChild(makeHeaderRow(["מזהה", "שם קבוצה", "שכבה", ""]));

  state.teamsConfig.forEach((team, index) => {
    const row = document.createElement("tr");

    const idTd = document.createElement("td");
    const idInput = document.createElement("input");
    idInput.dataset.field = "id";
    idInput.value = team.id;
    idInput.addEventListener("change", () => {
      state.teamsConfig[index].id = idInput.value;
    });
    idTd.appendChild(idInput);
    row.appendChild(idTd);

    const labelTd = document.createElement("td");
    const labelInput = document.createElement("input");
    labelInput.dataset.field = "label";
    labelInput.value = team.label;
    labelInput.addEventListener("change", () => {
      state.teamsConfig[index].label = labelInput.value;
    });
    labelTd.appendChild(labelInput);
    row.appendChild(labelTd);

    const bracketTd = document.createElement("td");
    const select = document.createElement("select");
    select.dataset.field = "bracketId";
    for (const b of allBrackets) {
      const option = document.createElement("option");
      option.value = b.id;
      option.textContent = b.label;
      option.selected = b.id === team.bracketId;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      state.teamsConfig[index].bracketId = select.value;
    });
    bracketTd.appendChild(select);
    row.appendChild(bracketTd);

    const actionTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "הסר";
    removeBtn.addEventListener("click", () => {
      state.teamsConfig.splice(index, 1);
      renderSettingsView(section.parentElement);
    });
    actionTd.appendChild(removeBtn);
    row.appendChild(actionTd);

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
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      await store.saveTeamsConfig(state.teamsConfig);
      saveBtn.textContent = "נשמר ✓";
    } catch (err) {
      console.error(err);
      saveBtn.textContent = "שגיאה בשמירה";
    } finally {
      setTimeout(() => {
        saveBtn.textContent = "שמור קבוצות";
        saveBtn.disabled = false;
      }, 1500);
    }
  });
  section.appendChild(saveBtn);

  return section;
}
