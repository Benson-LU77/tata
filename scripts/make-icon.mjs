/**
 * The app icon, drawn the way the city draws itself: the amber figure
 * (top hat, the classic) in the foreground, grey towers behind, black
 * sky above. Everything sits on one coarse pixel grid so the icon reads
 * as a single piece of pixel art at every size.
 *
 * Output: ios/.../AppIcon-512@2x.png (1024×1024, opaque — App Store
 * icons must carry no alpha).
 *
 *   node scripts/make-icon.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/* ---------- the figure: you_S_i wearing hat.tophat, from parts.ts ---- */

const FIGURE = [
  ".....oooooooooo.....",
  "....occcccccccco....",
  "....occcccccccco....",
  "....occcccccccco....",
  "...oooooooooooooo...",
  "..occcccccccccccco..",
  "..oooooooooooooooo..",
  "...offffffffffffo...",
  "...offffffffffffo...",
  "...offeeffffeeffo...",
  "...offeeffffeeffo...",
  "...offffffffffffo...",
  "...offffffffffffo...",
  "....offffffffffo....",
  "...occcccccccccco...",
  "..occcccccccccccco..",
  ".occcccccccccccccco.",
  "occcccccccccccccccco",
  "cccccccccccccccccccc",
];

/* the Mirror's amber reading of the sprite charset */
const FIGURE_COLORS = {
  o: "#231a10", // warm-dark outline — night-black would dissolve it
  c: "#b8894a", // the hat
  f: "#e0a84f", // the face, plain amber
  e: "#06070a", // the eyes keep true black
};

/* ---------- palette for the rest of the night ------------------------ */

const SKY = "#06070a";
const STAR_DIM = "#4a4f59";
const STAR_BRIGHT = "#8b9099";
const TOWER_DARK = "#171a20";
const TOWER_MID = "#2a2e36";
const TOWER_LIGHT = "#4a4f59";
const WINDOW_LIT = "#c9ccd2";
const GROUND = "#0d0f13";

/* ---------- compose on a 40×40 grid ---------------------------------- */

const G = 48;
const grid = Array.from({ length: G }, () => Array(G).fill(SKY));

/* three dim stars — company, not a constellation */
for (const [x, y] of [[7, 4], [38, 6], [24, 2], [14, 8]]) grid[y][x] = STAR_DIM;

/* towers — silhouettes behind the figure, feet on the ground row */
function tower(x0, w, top, tone, windows) {
  for (let y = top; y < 44; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) grid[y][x] = tone;
  }
  for (const [wx, wy] of windows) grid[top + wy][x0 + wx] = WINDOW_LIT;
}
// the bust keeps to the middle 5/6 — towers hold both margins
tower(0, 4, 12, TOWER_LIGHT, [[1, 4], [2, 11], [1, 18], [2, 26]]);
tower(2, 3, 22, TOWER_DARK, [[1, 5], [1, 14]]);
tower(44, 4, 10, TOWER_MID, [[1, 3], [2, 12], [1, 20], [2, 28]]);
tower(41, 3, 24, TOWER_DARK, [[1, 6], [1, 15]]);

/* ground — a thin street under everything */
for (let y = 44; y < G; y += 1) for (let x = 0; x < G; x += 1) grid[y][x] = GROUND;

/* the portrait — 20×19 at ×2 = 40×38: the bust bleeds to the bottom
   edge and the shoulders run off into both lower corners */
const SCALE = 2;
const FX = Math.floor((G - 20 * SCALE) / 2);
const FY = G - 19 * SCALE;
FIGURE.forEach((row, sy) => {
  [...row].forEach((ch, sx) => {
    if (ch === ".") return;
    const color = FIGURE_COLORS[ch];
    for (let dy = 0; dy < SCALE; dy += 1) {
      for (let dx = 0; dx < SCALE; dx += 1) {
        grid[FY + sy * SCALE + dy][FX + sx * SCALE + dx] = color;
      }
    }
  });
});

/* ---------- rasterise to 1024 and write a PNG ------------------------ */

const SIZE = 1024;
const CELL = SIZE / G; // 25.6 — accumulate in float, floor per pixel

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y += 1) {
  const rowStart = y * (SIZE * 3 + 1);
  raw[rowStart] = 0; // filter: none
  const gy = Math.min(G - 1, Math.floor(y / CELL));
  for (let x = 0; x < SIZE; x += 1) {
    const gx = Math.min(G - 1, Math.floor(x / CELL));
    const [r, g, b] = hex(grid[gy][gx]);
    const o = rowStart + 1 + x * 3;
    raw[o] = r;
    raw[o + 1] = g;
    raw[o + 2] = b;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour, no alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
writeFileSync(out, png);
console.log(`icon written: ${out} (${png.length} bytes)`);
