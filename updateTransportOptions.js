#!/usr/bin/env node
/**
 * updateTransportOptions.js
 * Fetches the current dropdown options from the Google Form and updates
 * TRANSPORT_FORM_OPTIONS in generateReport.js.
 *
 * Run manually (or via cron) whenever the form is updated:
 *   node updateTransportOptions.js
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSevfSSIgFn3X82Ggj0qOZXNj-LnCUvuUu0RG0EgO6UwYga2Qw/viewform";
const ENTRY_ID = 387102172;
const REPORT_FILE = join(dirname(fileURLToPath(import.meta.url)), "generateReport.js");

// ─── Fetch & parse ────────────────────────────────────────────────────────────

async function fetchOptions() {
  const res = await fetch(FORM_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching form`);
  const html = await res.text();

  const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = ([\s\S]*?);\s*<\/script>/);
  if (!match) throw new Error("FB_PUBLIC_LOAD_DATA_ not found in form HTML");

  const data = JSON.parse(match[1]);
  const options = findChoices(data, ENTRY_ID);
  if (!options?.length) throw new Error(`No choices found for entry ${ENTRY_ID}`);
  return options;
}

function findChoices(node, targetId) {
  if (!Array.isArray(node)) return null;
  if (node.includes(targetId)) {
    for (const sibling of node) {
      if (
        Array.isArray(sibling) &&
        sibling.length > 0 &&
        Array.isArray(sibling[0]) &&
        typeof sibling[0][0] === "string" &&
        sibling[0][0].length > 3
      ) {
        return sibling.map((c) => c[0]).filter(Boolean);
      }
    }
  }
  for (const child of node) {
    if (Array.isArray(child)) {
      const result = findChoices(child, targetId);
      if (result) return result;
    }
  }
  return null;
}

// ─── Update generateReport.js ─────────────────────────────────────────────────

function updateFile(options) {
  const src = readFileSync(REPORT_FILE, "utf8");

  const newBlock =
    `const TRANSPORT_FORM_OPTIONS = new Set([\n` +
    options.map((o) => `  ${JSON.stringify(o)},`).join("\n") +
    `\n]);`;

  const updated = src.replace(
    /const TRANSPORT_FORM_OPTIONS = new Set\(\[[\s\S]*?\]\);/,
    newBlock
  );

  if (updated === src) throw new Error("Pattern not found — could not update TRANSPORT_FORM_OPTIONS");

  writeFileSync(REPORT_FILE, updated, "utf8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const options = await fetchOptions();
console.log(`Fetched ${options.length} options:`);
options.forEach((o) => console.log(`  • ${o}`));

updateFile(options);
console.log("✓ generateReport.js updated");
