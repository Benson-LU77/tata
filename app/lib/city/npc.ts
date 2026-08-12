/**
 * Citizens — every resident is composed from the same wardrobe the Mirror
 * uses: a base figure (pants or dress, both on the canonical 13-row
 * canvas), a hair silhouette, profession headgear, and a grey tone.
 * Twelve curated citizens cover the city; a resident's seed picks one for
 * life, and the look IS the profession. Pure composition, baked once.
 */

import { PARTS, YOU_BASE, type Dir, type Patch } from "./sprites/parts";

/** dress variant of the canonical figure — same head, skirt below */
const DRESS_BASE: Record<string, string[]> = {
  S_i: ["........", "........", "........", "..0000..", ".066660.", "06166160", "06666660", ".066660.", ".00cc00.", ".0cccc0.", "0ccccct0", "0ccccct0", ".00..00."],
  S_a: ["........", "........", "........", "..0000..", ".066660.", "06166160", "06666660", ".066660.", ".00cc00.", ".0cccc0.", "0ccccct0", "0ccccct0", ".01..00."],
  S_b: ["........", "........", "........", "..0000..", ".066660.", "06166160", "06666660", ".066660.", ".00cc00.", ".0cccc0.", "0ccccct0", "0ccccct0", ".00..10."],
  E_i: ["........", "........", "........", "..0000..", ".066660.", ".066160.", ".066660.", "..06600.", "..0cc0..", ".0cccc0.", ".0ccct0.", ".0ccct0.", "..0000.."],
  E_a: ["........", "........", "........", "..0000..", ".066660.", ".066160.", ".066660.", "..06600.", "..0cc0..", ".0cccc0.", ".0ccct0.", ".0ccct0.", ".00.10.."],
  E_b: ["........", "........", "........", "..0000..", ".066660.", ".066160.", ".066660.", "..06600.", "..0cc0..", ".0cccc0.", ".0ccct0.", ".0ccct0.", ".01.00.."],
  N_i: ["........", "........", "........", "..0000..", ".011110.", "01111110", "01111110", ".011110.", ".00cc00.", ".0cccc0.", "0ccccct0", "0ccccct0", ".00..00."],
  N_a: ["........", "........", "........", "..0000..", ".011110.", "01111110", "01111110", ".011110.", ".00cc00.", ".0cccc0.", "0ccccct0", "0ccccct0", ".01..00."],
  N_b: ["........", "........", "........", "..0000..", ".011110.", "01111110", "01111110", ".011110.", ".00cc00.", ".0cccc0.", "0ccccct0", "0ccccct0", ".00..10."],
};

/** pants = the canonical bare walker (shared with the Mirror's base) */
const PANTS_BASE: Record<string, string[]> = Object.fromEntries(
  Object.entries(YOU_BASE).map(([k, rows]) => [k.replace("you_", ""), rows]),
);

export type Citizen = {
  profession: string;
  base: "pants" | "dress";
  hair: string;
  hat: string;
  acc: string;
  tone: number; // 2..5 — coat grey
};

/** twelve citizens; a resident's look IS their profession, for life */
export const CITIZENS: Citizen[] = [
  { profession: "stationmaster", base: "pants", hair: "hair.short", hat: "hat.cap", acc: "acc.none", tone: 3 },
  { profession: "gardener", base: "dress", hair: "hair.bun", hat: "hat.strawhat", acc: "acc.apron", tone: 4 },
  { profession: "courier", base: "pants", hair: "hair.short", hat: "hat.none", acc: "acc.satchel", tone: 5 },
  { profession: "astronomer", base: "pants", hair: "hair.long", hat: "hat.hood", acc: "acc.none", tone: 2 },
  { profession: "baker", base: "dress", hair: "hair.short", hat: "hat.toque", acc: "acc.none", tone: 4 },
  { profession: "shipwright", base: "pants", hair: "hair.ponytail", hat: "hat.goggles", acc: "acc.none", tone: 3 },
  { profession: "lampkeeper", base: "dress", hair: "hair.long", hat: "hat.none", acc: "acc.scarf", tone: 2 },
  { profession: "poet", base: "pants", hair: "hair.fringe", hat: "hat.none", acc: "acc.none", tone: 2 },
  { profession: "tailor", base: "dress", hair: "hair.twintails", hat: "hat.none", acc: "acc.none", tone: 5 },
  { profession: "archivist", base: "pants", hair: "hair.bob", hat: "hat.none", acc: "acc.none", tone: 4 },
  { profession: "stargazer", base: "dress", hair: "hair.ponytail", hat: "hat.none", acc: "acc.none", tone: 3 },
  { profession: "neighbour", base: "pants", hair: "hair.bun", hat: "hat.beanie", acc: "acc.none", tone: 5 },
];

export function professionOf(seed: number): string {
  return CITIZENS[seed % CITIZENS.length].profession;
}

function applyPatch(grid: string[][], patch: Patch | undefined) {
  if (!patch) return;
  patch.rows.forEach((prow, i) => {
    const y = patch.top + i;
    if (y < 0 || y >= grid.length) return;
    for (let x = 0; x < grid[y].length; x += 1) {
      const ch = prow[x];
      if (ch === undefined || ch === ".") continue;
      grid[y][x] = ch === "_" ? "." : ch;
    }
  });
}

/** bake all twelve citizens into atlas-ready frames: npc<i>_<dir>_<frame> */
export function composeCitizens(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  CITIZENS.forEach((c, i) => {
    const toneC = String(c.tone);
    const trimC = String(Math.min(7, c.tone + 1));
    const base = c.base === "pants" ? PANTS_BASE : DRESS_BASE;
    for (const [key, rows] of Object.entries(base)) {
      const dir = key.split("_")[0] as Dir;
      const grid = rows.map((r) => r.split(""));
      for (const pid of [c.hair, c.hat, c.acc]) {
        applyPatch(grid, PARTS.find((p) => p.id === pid)?.art[dir]);
      }
      out[`npc${i}_${key}`] = grid.map((r) =>
        r.map((ch) => (ch === "c" ? toneC : ch === "t" ? trimC : ch)).join(""),
      );
    }
  });
  return out;
}
