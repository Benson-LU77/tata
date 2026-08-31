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
  ".00000..",
  ".0ccc0..",
  "0ccccc0.",
  "..0000..",
  ".066660.",
  "06166160",
  "06666660",
  ".066660.",
  ".00cc00.",
  "05ccct50",
  "05ccct50",
  ".0ccct0.",
  ".00.00..",
];

/* the Mirror's amber reading of the sprite charset */
const FIGURE_COLORS = {
  // warm-dark outline: pure night-black would dissolve the silhouette
  // into the sky; the eyes get the true black instead
  0: "#231a10",
  1: "#06070a",
  5: "#be9050",
  6: "#e0a84f",
  c: "#b8894a",
  t: "#e0a84f",
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

const G = 40;
const grid = Array.from({ length: G }, () => Array(G).fill(SKY));

/* stars — fixed constellation, sparse, upper sky only */
for (const [x, y, bright] of [
  [4, 3, 1], [11, 6, 0], [19, 2, 0], [27, 5, 1], [34, 3, 0],
  [7, 9, 0], [31, 9, 0], [15, 4, 0], [37, 7, 0], [2, 7, 0],
]) {
  grid[y][x] = bright ? STAR_BRIGHT : STAR_DIM;
}

/* towers — silhouettes behind the figure, feet on the ground row */
function tower(x0, w, top, tone, windows) {
  for (let y = top; y < 36; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) grid[y][x] = tone;
  }
  for (const [wx, wy] of windows) grid[top + wy][x0 + wx] = WINDOW_LIT;
}
tower(1, 4, 14, TOWER_DARK, [[1, 2], [2, 6], [1, 10]]);
tower(5, 3, 20, TOWER_MID, [[1, 3], [1, 8]]);
tower(8, 4, 9, TOWER_LIGHT, [[1, 3], [2, 7], [1, 12], [2, 16]]);
tower(28, 4, 11, TOWER_MID, [[1, 2], [2, 8], [1, 14]]);
tower(32, 3, 17, TOWER_DARK, [[1, 4], [1, 11]]);
tower(35, 4, 13, TOWER_LIGHT, [[1, 3], [2, 9], [1, 16]]);

/* ground — a thin street under everything */
for (let y = 36; y < G; y += 1) for (let x = 0; x < G; x += 1) grid[y][x] = GROUND;

/* the figure — 8×13 sprite at ×3 = 24×39... too tall; ×2 = 16×26,
   feet on the street, centred */
const SCALE = 2;
const FX = Math.floor((G - 8 * SCALE) / 2);
const FY = 37 - 13 * SCALE; // feet at row 36 (one row into the street)
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
