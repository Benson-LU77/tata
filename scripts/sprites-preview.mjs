// Eyeball the ASCII sprites in the terminal with 24-bit ANSI colour.
// Run: node scripts/sprites-preview.mjs [nameFilter]
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "tata-sprites-"));
execSync(
  `npx esbuild app/lib/city/sprites/data.ts --bundle --format=esm --outfile=${join(out, "data.js")}`,
  { stdio: "pipe" },
);
const { SPRITES } = await import(join(out, "data.js"));

const PAL = {
  0: [6, 7, 10],
  1: [13, 15, 19],
  2: [23, 26, 32],
  3: [42, 46, 54],
  4: [74, 79, 89],
  5: [139, 144, 153],
  6: [201, 204, 210],
  7: [242, 243, 245],
};
const AMBER = { 8: [138, 108, 60], 9: [190, 144, 80], 10: [232, 180, 100], 11: [255, 205, 130] };

const filter = process.argv[2] ?? "";
for (const [name, rows] of Object.entries(SPRITES)) {
  if (filter && !name.includes(filter)) continue;
  const w = rows[0].length;
  const bad = rows.find((r) => r.length !== w);
  console.log(`\n${name}  ${w}x${rows.length}${bad ? "  !! ragged rows" : ""}`);
  for (const row of rows) {
    let line = "";
    for (const ch of row) {
      if (ch === ".") {
        line += "\x1b[48;2;20;24;40m  \x1b[0m"; // night-blue = transparent
      } else {
        const c = PAL[ch] ?? AMBER[ch] ?? [255, 0, 255];
        line += `\x1b[48;2;${c[0]};${c[1]};${c[2]}m  \x1b[0m`;
      }
    }
    console.log("  " + line);
  }
}
