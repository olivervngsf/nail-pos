// Copies the design kit (design/kit/kit.css = the ONE source of the look) into the app.
// Run after the kit changes: npm run kit:sync. Drops the Google Fonts @import (the app loads Inter with next/font).
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("../design/kit/kit.css", import.meta.url), "utf8");
const out = src.replace(/^@import url\([^)]*fonts\.googleapis[^)]*\);\s*\n/m, "");
writeFileSync(
  new URL("../src/styles/kit.css", import.meta.url),
  "/* GENERATED from design/kit/kit.css by `npm run kit:sync`. Do not edit here: edit the kit, then sync. */\n" + out,
);
console.log("kit.css synced");
