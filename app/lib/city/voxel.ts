/**
 * Building massing — pure. Eight archetypes chosen by seed give the skyline
 * variety: setback towers, slabs, twins, stepped profiles, spires, corner
 * L-towers, colonnade podiums and terraced pairs. Most carry a street-level
 * podium lip and a cornice line; taller roofs grow tanks, bulkheads, vents
 * and antennas. Still just boxes — the shader does the rest.
 */

import type { Lot } from "./plan";
import { ARCH_BRIDGE, ARCH_CHAPEL, ARCH_LIGHTHOUSE, FLOOR_H } from "./plan";
import { rng } from "./layout";

export type VoxBox = {
  x: number;
  y: number; // bottom
  z: number;
  w: number;
  h: number;
  d: number;
};

export function massing(lot: Lot): VoxBox[] {
  const rand = rng(lot.seed ^ 0x9e3779b9);
  const boxes: VoxBox[] = [];
  const full = lot.half * 2 * (0.88 + rand() * 0.12);
  const totalH = lot.floors * FLOOR_H;
  const arch = lot.arch ?? (lot.floors <= 3 ? (lot.seed % 2 === 0 ? 1 : 7) : lot.seed % 8);

  const jx = () => (rand() - 0.5) * 0.08;

  if (arch === ARCH_LIGHTHOUSE) {
    // the return after absence — a thin tower with a wide bright lantern
    const h = Math.max(totalH, 3);
    boxes.push({ x: lot.x, y: 0, z: lot.z, w: full * 0.36, h: h * 0.82, d: full * 0.36 });
    boxes.push({ x: lot.x, y: h * 0.82, z: lot.z, w: full * 0.6, h: h * 0.13, d: full * 0.6 });
    boxes.push({ x: lot.x, y: h * 0.95, z: lot.z, w: full * 0.3, h: h * 0.08, d: full * 0.3 });
    return boxes;
  }
  if (arch === ARCH_BRIDGE) {
    // written for a past empty day — an arch spanning the lot
    const h = Math.max(totalH * 0.8, 1.5);
    const legW = full * 0.26;
    boxes.push({ x: lot.x - full * 0.36, y: 0, z: lot.z, w: legW, h, d: full * 0.5 });
    boxes.push({ x: lot.x + full * 0.36, y: 0, z: lot.z, w: legW, h, d: full * 0.5 });
    boxes.push({ x: lot.x, y: h, z: lot.z, w: full * 1.05, h: FLOOR_H * 0.8, d: full * 0.55 });
    return boxes;
  }
  if (arch === ARCH_CHAPEL) {
    // the smallest hours — a low nave and a steep bell tower
    const h = Math.max(totalH * 0.5, 1);
    boxes.push({ x: lot.x + full * 0.12, y: 0, z: lot.z, w: full * 0.72, h, d: full * 0.6 });
    boxes.push({ x: lot.x - full * 0.3, y: 0, z: lot.z, w: full * 0.26, h: totalH * 1.05, d: full * 0.26 });
    boxes.push({ x: lot.x - full * 0.3, y: totalH * 1.05, z: lot.z, w: full * 0.12, h: 0.35, d: full * 0.12 });
    return boxes;
  }

  if (arch === 1) {
    // slab — wide and calm
    boxes.push({ x: lot.x + jx(), y: 0, z: lot.z + jx(), w: full, h: totalH, d: full * (0.72 + rand() * 0.2) });
  } else if (arch === 2 && lot.floors >= 5) {
    // twins — two thin towers sharing the lot
    const gap = full * 0.16;
    const w = full * 0.4;
    const hA = totalH;
    const hB = totalH * (0.6 + rand() * 0.3);
    boxes.push({ x: lot.x - gap - w / 2, y: 0, z: lot.z + jx(), w, h: hA, d: full * 0.55 });
    boxes.push({ x: lot.x + gap + w / 2, y: 0, z: lot.z + jx(), w, h: hB, d: full * 0.55 });
  } else if (arch === 3 && lot.floors >= 5) {
    // stepped — a staircase profile
    const steps = 3;
    for (let s = 0; s < steps; s += 1) {
      const w = full * (1 - s * 0.16);
      boxes.push({
        x: lot.x + (s - 1) * full * 0.18,
        y: 0,
        z: lot.z + jx(),
        w: w * 0.5,
        h: totalH * ((s + 1) / steps),
        d: full * (0.8 - s * 0.1),
      });
    }
  } else if (arch === 4 && lot.floors >= 6) {
    // spire — thin tower with a crown and antenna
    boxes.push({ x: lot.x + jx(), y: 0, z: lot.z + jx(), w: full * 0.62, h: totalH * 0.86, d: full * 0.62 });
    boxes.push({ x: lot.x, y: totalH * 0.86, z: lot.z, w: full * 0.4, h: totalH * 0.14, d: full * 0.4 });
    boxes.push({ x: lot.x, y: totalH, z: lot.z, w: 0.06, h: 0.5 + rand() * 0.4, d: 0.06 });
  } else if (arch === 5 && lot.floors >= 4) {
    // corner L — two wings meeting, one taller, a real street presence
    const hA = totalH;
    const hB = totalH * (0.55 + rand() * 0.25);
    boxes.push({ x: lot.x - full * 0.2, y: 0, z: lot.z - full * 0.08, w: full * 0.55, h: hA, d: full * 0.55 });
    boxes.push({ x: lot.x + full * 0.24, y: 0, z: lot.z + full * 0.22, w: full * 0.5, h: hB, d: full * 0.42 });
  } else if (arch === 6 && lot.floors >= 4) {
    // colonnade podium — columns under a floating slab
    const podH = FLOOR_H * 1.4;
    const colW = full * 0.12;
    for (const cx of [-0.36, 0, 0.36]) {
      boxes.push({ x: lot.x + full * cx, y: 0, z: lot.z, w: colW, h: podH, d: full * 0.5 });
    }
    boxes.push({ x: lot.x, y: podH, z: lot.z, w: full, h: FLOOR_H * 0.5, d: full * 0.72 });
    boxes.push({ x: lot.x + jx(), y: podH + FLOOR_H * 0.5, z: lot.z, w: full * 0.82, h: Math.max(FLOOR_H, totalH - podH - FLOOR_H * 0.5), d: full * 0.62 });
  } else if (arch === 7) {
    // terrace pair — a house and its lower annex, garden wall in front
    const hA = Math.max(totalH * 0.9, FLOOR_H * 1.6);
    boxes.push({ x: lot.x - full * 0.18, y: 0, z: lot.z - full * 0.05, w: full * 0.58, h: hA, d: full * 0.6 });
    boxes.push({ x: lot.x + full * 0.3, y: 0, z: lot.z + full * 0.08, w: full * 0.38, h: hA * 0.55, d: full * 0.5 });
    boxes.push({ x: lot.x + full * 0.1, y: 0, z: lot.z + full * 0.42, w: full * 0.8, h: 0.22, d: 0.08 });
  } else {
    // setback tower (the classic)
    const tiers = lot.floors <= 6 ? 1 : lot.floors <= 14 ? 2 : 3;
    let y = 0;
    let size = full;
    let remaining = totalH;
    for (let t = 0; t < tiers; t += 1) {
      const isLast = t === tiers - 1;
      const h = isLast ? remaining : remaining * (0.45 + rand() * 0.2);
      boxes.push({
        x: lot.x + jx(),
        y,
        z: lot.z + jx(),
        w: size,
        h,
        d: size * (0.9 + rand() * 0.2),
      });
      y += h;
      remaining -= h;
      size *= 0.66 + rand() * 0.12;
    }
  }

  // street-level podium lip: buildings meet the ground with a doorway band
  if (arch !== 6 && lot.floors >= 2 && boxes.length > 0) {
    const base = boxes[0];
    boxes.push({ x: base.x, y: 0, z: base.z, w: base.w * 1.08, h: 0.32, d: base.d * 1.08 });
  }
  // cornice: a thin lip where the main mass meets the sky
  if (lot.floors >= 4 && boxes.length > 0) {
    const main = boxes.reduce((a, b) => (a.h > b.h ? a : b));
    boxes.push({
      x: main.x,
      y: main.y + main.h - 0.1,
      z: main.z,
      w: main.w * 1.07,
      h: 0.12,
      d: main.d * 1.07,
    });
  }

  // roof furniture: tanks on legs, stair bulkheads, vent rows, antennas
  if (lot.floors >= 5 && arch !== 4) {
    const r = rand();
    const topY = totalH;
    if (r < 0.28) {
      // water tank on stilts
      boxes.push({ x: lot.x + full * 0.2, y: topY + 0.12, z: lot.z - full * 0.15, w: 0.24, h: 0.3, d: 0.24 });
      boxes.push({ x: lot.x + full * 0.2, y: topY, z: lot.z - full * 0.15, w: 0.14, h: 0.12, d: 0.14 });
    } else if (r < 0.5) {
      // stair bulkhead — the little rooftop shed
      boxes.push({ x: lot.x - full * 0.18, y: topY, z: lot.z + full * 0.12, w: 0.34, h: 0.34, d: 0.28 });
    } else if (r < 0.68) {
      // antenna with a cross-arm
      boxes.push({ x: lot.x - full * 0.22, y: topY, z: lot.z + full * 0.1, w: 0.05, h: 0.55, d: 0.05 });
      boxes.push({ x: lot.x - full * 0.22, y: topY + 0.38, z: lot.z + full * 0.1, w: 0.22, h: 0.04, d: 0.04 });
    } else if (r < 0.82) {
      // vent row
      for (let v = 0; v < 3; v += 1) {
        boxes.push({ x: lot.x - full * 0.2 + v * full * 0.2, y: topY, z: lot.z - full * 0.2, w: 0.1, h: 0.12 + (v % 2) * 0.05, d: 0.1 });
      }
    }
  }
  return boxes;
}
