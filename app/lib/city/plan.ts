/**
 * City plan — the calendar is the map.
 * One month = one block; inside a block X = weekday (Mon..Sun), Z = week row.
 * Blocks snake (boustrophedon) four per row, separated by streets. Skipped
 * days stay empty lots. Pure and deterministic: positions derive from dates
 * alone, so editing a note never moves its building, and the city can grow
 * without bound.
 */

import type { NoteMetric } from "./layout";
import { hash32, heightOf, rng } from "./layout";

export type Lot = {
  file: string;
  date: string;
  /** world-space centre of this building's footprint */
  x: number;
  z: number;
  /** footprint half-size in world units */
  half: number;
  floors: number;
  seed: number;
  lit: number;
  /** special archetype earned by how the note was written (see ARCH_*) */
  arch?: number;
};

/** conditional archetypes — the city remembers how you wrote */
export const ARCH_LIGHTHOUSE = 10; // first page after 7+ days away
export const ARCH_BRIDGE = 11; // written for a past empty day
export const ARCH_CHAPEL = 12; // written in the smallest hours (02-04)

export type CityPlan = {
  lots: Lot[];
  blocks: { month: string; x: number; z: number }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

/** world units */
export const CELL = 3; // one calendar day
const BLOCK_COLS = 7; // Mon..Sun
const BLOCK_ROWS = 6; // max week rows
const STREET = 1; // cells of street around each block
const BLOCK_W = BLOCK_COLS + STREET; // pitch in cells
const BLOCK_H = BLOCK_ROWS + STREET;
const BLOCKS_PER_ROW = 4;

export const FLOOR_H = 0.5; // world units per storey

function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Monday-first weekday + week-of-month row for a YYYY-MM-DD date. */
function cellOf(date: string): { col: number; row: number } {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const firstWd = (first.getUTCDay() + 6) % 7; // Mon=0
  const col = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const row = Math.floor((firstWd + d - 1) / 7);
  return { col, row: Math.min(row, BLOCK_ROWS - 1) };
}

export function floorsOf(words: number): number {
  return Math.max(1, Math.round(heightOf(words) / 8));
}

export function planCity(
  metrics: NoteMetric[],
  now: number,
  /** file → frozen archetype (0 = plain); first sighting wins forever */
  archPins?: Record<string, number>,
): CityPlan {
  const months = [...new Set(metrics.map((m) => monthOf(m.date)))].sort();
  const blockAt = new Map<string, { x: number; z: number }>();
  const blocks: CityPlan["blocks"] = [];
  months.forEach((month, i) => {
    const row = Math.floor(i / BLOCKS_PER_ROW);
    let col = i % BLOCKS_PER_ROW;
    if (row % 2 === 1) col = BLOCKS_PER_ROW - 1 - col; // snake
    const origin = { x: col * BLOCK_W * CELL, z: row * BLOCK_H * CELL };
    blockAt.set(month, origin);
    blocks.push({ month, ...origin });
  });

  // group same-day notes for sub-lots
  const byDay = new Map<string, NoteMetric[]>();
  for (const m of metrics) {
    const list = byDay.get(m.date);
    if (list) list.push(m);
    else byDay.set(m.date, [m]);
  }

  const lots: Lot[] = [];
  const DAY_MS = 86400000;

  // chronology for the lighthouse condition (returning after absence)
  const sortedDays = [...byDay.keys()].sort();
  const dayGap = new Map<string, number>();
  for (let i = 1; i < sortedDays.length; i += 1) {
    const prev = new Date(sortedDays[i - 1] + "T00:00:00Z").getTime();
    const cur = new Date(sortedDays[i] + "T00:00:00Z").getTime();
    dayGap.set(sortedDays[i], Math.round((cur - prev) / DAY_MS));
  }

  for (const [date, notes] of byDay) {
    const origin = blockAt.get(monthOf(date));
    if (!origin) continue;
    const { col, row } = cellOf(date);
    const cx = origin.x + col * CELL + CELL / 2;
    const cz = origin.z + row * CELL + CELL / 2;
    const sorted = [...notes].sort((a, b) => a.file.localeCompare(b.file));
    const many = sorted.length > 1;
    sorted.slice(0, 4).forEach((note, i) => {
      const q = CELL / 4;
      const dx = many ? (i % 2 === 0 ? -q : q) : 0;
      const dz = many ? (i < 2 ? -q : q) : 0;
      const seed = hash32(note.file);
      const rand = rng(seed);
      const age = Math.max(0, now - note.mtime);

      // earned archetypes: the shape remembers the circumstances.
      // A verdict freezes the first time a lot is seen (archPins) — fixing
      // a typo in an old page must never turn its home into a bridge.
      let arch: number | undefined;
      const pinned = archPins?.[note.file];
      if (pinned !== undefined) {
        arch = pinned === 0 ? undefined : pinned;
      } else {
        const noteDay = new Date(date + "T00:00:00Z").getTime();
        const mtimeDay = Math.floor(note.mtime / DAY_MS) * DAY_MS;
        const hour = new Date(note.mtime).getHours();
        if (i === 0 && (dayGap.get(date) ?? 0) >= 7) arch = ARCH_LIGHTHOUSE;
        else if (mtimeDay - noteDay > 2 * DAY_MS) arch = ARCH_BRIDGE;
        else if (hour >= 2 && hour < 4) arch = ARCH_CHAPEL;
      }

      lots.push({
        arch,
        file: note.file,
        date,
        x: cx + dx,
        z: cz + dz,
        half: (many ? CELL / 4 : CELL / 2) * (0.62 + rand() * 0.16),
        floors: floorsOf(note.words),
        seed,
        lit: Math.max(0.08, 1 - age / (30 * DAY_MS)),
      });
    });
  }

  const xs = lots.map((l) => l.x);
  const zs = lots.map((l) => l.z);
  const bounds =
    lots.length > 0
      ? {
          minX: Math.min(...xs) - CELL,
          maxX: Math.max(...xs) + CELL,
          minZ: Math.min(...zs) - CELL,
          maxZ: Math.max(...zs) + CELL,
        }
      : { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  return { lots, blocks, bounds };
}
