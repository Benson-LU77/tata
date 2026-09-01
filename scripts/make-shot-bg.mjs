/**
 * One backdrop for the App Store screenshots: the city's night sky and
 * nothing else. Flat near-black, a scattering of pixel stars on the same
 * coarse grid the city draws on. It is a stage, not a picture — the
 * phone and the headline are the subject.
 *
 * Output: ~/Claude/Tata-appstore/backgrounds/bg-night.png (1320×2868, opaque)
 *
 *   node scripts/make-shot-bg.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const W = 1320;
const H = 2868;
const CELL = 6; // chunky enough to survive the store's thumbnail scaling
const GW = W / CELL; // 220
const GH = H / CELL; // 478

/* the quantise ramp, v0..v7 — the same hexes the city shades with */
const P = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];

/* deterministic: the same seed draws the same night twice */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- the sky --------------------------------------------------- */

const grid = Array.from({ length: GH }, () => new Array(GW).fill(P[0]));

function put(x, y, c) {
  if (x < 0 || y < 0 || x >= GW || y >= GH) return;
  grid[y][x] = c;
}

const r = rng(7411);
const STARS = 240; // a scattering, not a galaxy

for (let i = 0; i < STARS; i += 1) {
  const x = Math.floor(r() * GW);
  const y = Math.floor(r() * GH);
  const k = r();
  if (k < 0.08) {
    // the few that carry a little weight
    put(x, y, P[7]);
    put(x + 1, y, P[5]);
    put(x, y + 1, P[5]);
  } else if (k < 0.32) {
    put(x, y, P[6]);
  } else if (k < 0.7) {
    put(x, y, P[5]);
  } else {
    put(x, y, P[3]); // barely there — depth, not decoration
  }
}

/* ---------- write ----------------------------------------------------- */

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
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

const raw = Buffer.alloc(H * (W * 3 + 1));
const cache = new Map();
for (let y = 0; y < H; y += 1) {
  const rowStart = y * (W * 3 + 1);
  raw[rowStart] = 0; // filter: none
  const row = grid[Math.min(GH - 1, Math.floor(y / CELL))];
  for (let x = 0; x < W; x += 1) {
    const c = row[Math.min(GW - 1, Math.floor(x / CELL))];
    let rgb = cache.get(c);
    if (!rgb) {
      rgb = hex(c);
      cache.set(c, rgb);
    }
    const o = rowStart + 1 + x * 3;
    raw[o] = rgb[0];
    raw[o + 1] = rgb[1];
    raw[o + 2] = rgb[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // truecolour, no alpha — the store rejects alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const dir = join(homedir(), "Claude", "Tata-appstore", "backgrounds");
mkdirSync(dir, { recursive: true });
const out = join(dir, "bg-night.png");
writeFileSync(out, png);
console.log(`bg-night.png  ${W}×${H}  ${(png.length / 1024).toFixed(0)} KB\n→ ${out}`);
