// Copies the design kit (design/kit = the ONE source of the look) into the app.
// kit.css = tokens + every component; setup.css = setup wizard shell. Run after the kit changes: npm run kit:sync.
// Drops the Google Fonts @import (the app loads Inter with next/font).
import { readFileSync, writeFileSync } from "node:fs";
for (const f of ["kit.css", "setup.css"]) {
  const src = readFileSync(new URL(`../design/kit/${f}`, import.meta.url), "utf8");
  const out = src.replace(/^@import url\([^)]*fonts\.googleapis[^)]*\);\s*\n/m, "");
  writeFileSync(
    new URL(`../src/styles/${f}`, import.meta.url),
    `/* GENERATED from design/kit/${f} by \`npm run kit:sync\`. Do not edit here: edit the kit, then sync. */\n` + out,
  );
}
console.log("kit.css + setup.css synced");
