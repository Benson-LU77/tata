/**
 * An iPhone body with the screen cut clean out — drop it over a
 * screenshot in Figma and the picture shows through the hole.
 *
 * The aperture is exactly 1320×2868, the size the store screenshots
 * already are, so a shot placed behind it at 1:1 lines up with no
 * scaling. No Dynamic Island is drawn: the simulator screenshots carry
 * their own status bar, and a second island would sit on top of it.
 *
 * Output: ~/Claude/Tata-appstore/backgrounds/device-frame.png (RGBA)
 *
 *   node scripts/make-device-frame.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/* ---------- geometry (device pixels, @3x) ---------------------------- */

const SCREEN_W = 1320;
const SCREEN_H = 2868;
const SCREEN_R = 186; // the display's own corner radius
const BEZEL = 30; // black rim around the glass
const BODY = 24; // the titanium band outside that
const PAD = BEZEL + BODY;

const W = SCREEN_W + PAD * 2; // 1428
const H = SCREEN_H + PAD * 2; // 2976
const SS = 4; // supersamples per axis — clean curves, no jaggies

/* ---------- rounded-rect coverage ------------------------------------ */

/** signed distance to a rounded rect centred on the canvas */
function sdf(px, py, halfW, halfH, r) {
  const qx = Math.abs(px - W / 2) - (halfW - r);
  const qy = Math.abs(py - H / 2) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** how much of this pixel falls inside the shape, 0..1 */
function coverage(x, y, halfW, halfH, r) {
  let hit = 0;
  for (let sy = 0; sy < SS; sy += 1) {
    for (let sx = 0; sx < SS; sx += 1) {
      const px = x + (sx + 0.5) / SS;
      const py = y + (sy + 0.5) / SS;
      if (sdf(px, py, halfW, halfH, r) < 0) hit += 1;
    }
  }
  return hit / (SS * SS);
}

/* ---------- palette --------------------------------------------------- */

const RIM = [214, 217, 221]; // the bright outer edge catching light
const BODY_TOP = [168, 172, 178];
const BODY_BOT = [126, 130, 137];
const INNER = [10, 10, 12]; // the black bezel

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/* ---------- compose --------------------------------------------------- */

const px = new Uint8Array(W * H * 4); // RGBA, starts fully transparent

/** the side buttons — small nubs riding the body's edge */
const BUTTONS = [
  { side: "l", y0: 620, y1: 800 }, // action
  { side: "l", y0: 900, y1: 1160 }, // volume up
  { side: "l", y0: 1210, y1: 1470 }, // volume down
  { side: "r", y0: 980, y1: 1360 }, // power
];

function buttonCoverage(x, y) {
  for (const b of BUTTONS) {
    if (y < b.y0 || y > b.y1) continue;
    const out = b.side === "l" ? x >= 0 && x < 10 : x >= W - 10 && x < W;
    if (out) return 1;
  }
  return 0;
}

for (let y = 0; y < H; y += 1) {
  const t = y / H;
  const bodyCol = lerp(BODY_TOP, BODY_BOT, t);
  for (let x = 0; x < W; x += 1) {
    const o = (y * W + x) * 4;

    const inBody = coverage(x, y, W / 2, H / 2, SCREEN_R + PAD);
    const inInner = coverage(x, y, W / 2 - BODY, H / 2 - BODY, SCREEN_R + BEZEL);
    const inScreen = coverage(x, y, SCREEN_W / 2, SCREEN_H / 2, SCREEN_R);
    const btn = buttonCoverage(x, y);

    // the glass is a hole: whatever sits behind shows through
    const alpha = Math.max(0, Math.max(inBody, btn) - inScreen);
    if (alpha <= 0) continue;

    // outer 3px of the body reads as a lit edge
    const edge = Math.max(0, inBody - coverage(x, y, W / 2 - 3, H / 2 - 3, SCREEN_R + PAD - 3));
    let col = lerp(bodyCol, RIM, Math.min(1, edge));
    // inside the band, the black bezel takes over
    col = lerp(col, INNER, Math.min(1, inInner));

    px[o] = col[0];
    px[o + 1] = col[1];
    px[o + 2] = col[2];
    px[o + 3] = Math.round(Math.min(1, alpha) * 255);
  }
}

/* ---------- write ----------------------------------------------------- */

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

const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y += 1) {
  const rowStart = y * (W * 4 + 1);
  raw[rowStart] = 0; // filter: none
  px.subarray(y * W * 4, (y + 1) * W * 4).forEach((v, i) => {
    raw[rowStart + 1 + i] = v;
  });
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6; // truecolour WITH alpha — the screen must be a hole
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const dir = join(homedir(), "Claude", "Tata-appstore", "backgrounds");
mkdirSync(dir, { recursive: true });
const out = join(dir, "device-frame.png");
writeFileSync(out, png);
console.log(
  `device-frame.png  ${W}×${H}  aperture ${SCREEN_W}×${SCREEN_H}  ${(png.length / 1024).toFixed(0)} KB\n→ ${out}`,
);
