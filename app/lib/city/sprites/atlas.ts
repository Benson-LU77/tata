/**
 * Packs the ASCII sprites into one RGBA atlas for a DataTexture.
 * Encoding contract with the quantise pass (city3d QUANT_FRAG):
 *   alpha = 255            → transparent (the sprite shader discards)
 *   alpha = i*16 + 8       → palette index i ((i+0.5)/16), bypasses the
 *                            whole tone pipeline — hand-drawn pixels land
 *                            on exact palette entries, never dithered.
 * RGB is left black; only alpha carries meaning. Pure and testable.
 */

import { SPRITES } from "./data";

export type SpriteFrame = { x: number; y: number; w: number; h: number };

export type SpriteAtlas = {
  size: number;
  data: Uint8Array;
  frames: Record<string, SpriteFrame>;
};

/** creatures whose sprites get the automatic finishing passes */
const WALKER_RE = /^(person\d?|you|cat|dog)_/;

/** a '1' pixel with face ('6') on both sides is an eye */
function blinkOf(rows: string[]): string[] | null {
  let found = false;
  const out = rows.map((row) => {
    const chars = row.split("");
    for (let x = 1; x < chars.length - 1; x += 1) {
      if (chars[x] === "1" && chars[x - 1] === "6" && chars[x + 1] === "6") {
        chars[x] = "6";
        found = true;
      }
    }
    return chars.join("");
  });
  return found ? out : null;
}

/** fill the gap between the feet on the last row with a contact shadow */
function groundShadow(rows: string[]): string[] {
  const last = rows[rows.length - 1];
  let lo = -1;
  let hi = -1;
  for (let x = 0; x < last.length; x += 1) {
    if (last[x] !== ".") {
      if (lo < 0) lo = x;
      hi = x;
    }
  }
  if (lo < 0 || hi - lo < 2) return rows;
  const chars = last.split("");
  for (let x = lo; x <= hi; x += 1) if (chars[x] === ".") chars[x] = "1";
  return [...rows.slice(0, -1), chars.join("")];
}

export function buildAtlas(extra?: Record<string, string[]>): SpriteAtlas {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // all transparent
  const frames: Record<string, SpriteFrame> = {};
  let cx = 1;
  let cy = 1;
  let shelf = 0;
  const sheet: Record<string, string[]> = { ...SPRITES, ...(extra ?? {}) };
  for (const [name, rows] of Object.entries(sheet)) {
    if (!WALKER_RE.test(name)) continue;
    sheet[name] = groundShadow(rows);
    if (/_S_i$/.test(name)) {
      const blink = blinkOf(sheet[name]);
      if (blink) sheet[`${name}_blink`] = blink;
    }
  }
  for (const [name, rows] of Object.entries(sheet)) {
    const w = rows[0].length;
    const h = rows.length;
    for (const r of rows) {
      if (r.length !== w) throw new Error(`ragged sprite: ${name}`);
    }
    if (cx + w + 1 > size) {
      cx = 1;
      cy += shelf + 1;
      shelf = 0;
    }
    if (cy + h + 1 > size) throw new Error("sprite atlas overflow — grow size");
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const ch = rows[y][x];
        if (ch === ".") continue;
        const idx = ch.charCodeAt(0) - 48;
        if (idx < 0 || idx > 7) throw new Error(`bad pixel '${ch}' in ${name}`);
        data[((cy + y) * size + cx + x) * 4 + 3] = idx * 16 + 8;
      }
    }
    frames[name] = { x: cx, y: cy, w, h };
    cx += w + 1;
    shelf = Math.max(shelf, h);
  }
  return { size, data, frames };
}
