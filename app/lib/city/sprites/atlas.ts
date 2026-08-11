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

export function buildAtlas(extra?: Record<string, string[]>): SpriteAtlas {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // all transparent
  const frames: Record<string, SpriteFrame> = {};
  let cx = 1;
  let cy = 1;
  let shelf = 0;
  for (const [name, rows] of Object.entries({ ...SPRITES, ...(extra ?? {}) })) {
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
