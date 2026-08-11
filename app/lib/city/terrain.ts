/**
 * Terrain — the island as data. A small R8 map (2 texels per world unit)
 * says what every patch of ground is: void (space), meadow, stone street,
 * or block plaza. The ground shader reads it to draw grass tone fields,
 * slab lines and an organic coastline; nothing here touches the network
 * and everything is deterministic (integer hashes, no Math.random).
 *
 * Size note: a decade of nightly writing is ~500×400 world units → a
 * 1000×800 R8 map = 0.8 MB. If a map would ever exceed 2048², switch to
 * sparse chunks — until then one texture is the simpler, faster answer.
 */

import type { CityPlan } from "./plan";
import { CELL } from "./plan";

export const TERRAIN_RES = 2; // texels per world unit

export const T_VOID = 0;
export const T_GRASS = 1;
export const T_PATH = 2;
export const T_PLAZA = 3;

export type TerrainMap = {
  /** world position of texel (0,0) */
  minX: number;
  minZ: number;
  /** texel dimensions */
  w: number;
  h: number;
  /** world-space bounds of the whole map */
  worldW: number;
  worldH: number;
  data: Uint8Array;
};

/** deterministic 2D hash → [0,1) */
function ihash(x: number, z: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** smooth value noise over integer lattice of the given cell size */
function vnoise(x: number, z: number, cell: number): number {
  const gx = x / cell;
  const gz = z / cell;
  const xi = Math.floor(gx);
  const zi = Math.floor(gz);
  const fx = gx - xi;
  const fz = gz - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = ihash(xi, zi);
  const b = ihash(xi + 1, zi);
  const c = ihash(xi, zi + 1);
  const d = ihash(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function terrainFor(plan: CityPlan): TerrainMap {
  const b = plan.bounds;
  let minX = b.minX;
  let maxX = b.maxX;
  let minZ = b.minZ;
  let maxZ = b.maxZ;
  for (const block of plan.blocks) {
    minX = Math.min(minX, block.x - CELL);
    maxX = Math.max(maxX, block.x + 8.5 * CELL);
    minZ = Math.min(minZ, block.z - CELL);
    maxZ = Math.max(maxZ, block.z + 7.5 * CELL);
  }
  const span = Math.max(maxX - minX, maxZ - minZ);
  const margin = Math.min(20, Math.max(6, span * 0.16));
  const pad = margin + 4; // room for the noisy coastline to breathe
  const w = Math.ceil((maxX - minX + pad * 2) * TERRAIN_RES);
  const h = Math.ceil((maxZ - minZ + pad * 2) * TERRAIN_RES);
  const originX = minX - pad;
  const originZ = minZ - pad;
  const data = new Uint8Array(w * h);

  for (let tz = 0; tz < h; tz += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      const x = originX + (tx + 0.5) / TERRAIN_RES;
      const z = originZ + (tz + 0.5) / TERRAIN_RES;
      // signed distance outside the core rect (0 inside)
      const dx = Math.max(minX - x, 0, x - maxX);
      const dz = Math.max(minZ - z, 0, z - maxZ);
      const d = Math.max(dx, dz) + Math.hypot(dx, dz) * 0.3;
      // the coastline wanders: local margin swings with low-freq noise
      const coast = margin * (0.35 + 0.75 * vnoise(x, z, 9));
      if (d >= coast) continue; // void
      data[tz * w + tx] = T_GRASS;
    }
  }

  // streets & plazas stamped over the meadow, block by block
  const stamp = (x0: number, z0: number, x1: number, z1: number, id: number) => {
    const ax = Math.max(0, Math.floor((x0 - originX) * TERRAIN_RES));
    const az = Math.max(0, Math.floor((z0 - originZ) * TERRAIN_RES));
    const bx = Math.min(w, Math.ceil((x1 - originX) * TERRAIN_RES));
    const bz = Math.min(h, Math.ceil((z1 - originZ) * TERRAIN_RES));
    for (let tz2 = az; tz2 < bz; tz2 += 1) {
      for (let tx2 = ax; tx2 < bx; tx2 += 1) {
        data[tz2 * w + tx2] = id;
      }
    }
  };
  for (const block of plan.blocks) {
    // the month plaza under the lots
    stamp(block.x - CELL * 0.25, block.z - CELL * 0.25, block.x + 7.25 * CELL, block.z + 6.25 * CELL, T_PLAZA);
    // south street and east avenue — same rects the old dark boxes used
    stamp(block.x - CELL * 0.5, block.z + 6.15 * CELL, block.x + 7.5 * CELL, block.z + 6.85 * CELL, T_PATH);
    stamp(block.x + 7.15 * CELL, block.z - CELL * 1.5, block.x + 7.85 * CELL, block.z + 6.5 * CELL, T_PATH);
  }

  return { minX: originX, minZ: originZ, w, h, worldW: w / TERRAIN_RES, worldH: h / TERRAIN_RES, data };
}
