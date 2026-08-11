/**
 * composeYou — folds the wardrobe onto the bare figure and resolves the
 * part character set into plain palette sprites the atlas accepts.
 * Pure and total: bad part ids just skip; the atlas builder still throws
 * on any illegal character, which keeps the whole pipeline honest.
 */

import { YOU_BASE, PARTS, type Dir } from "./parts";

export type YouLook = {
  hat: string;
  hair: string;
  acc: string;
  /** coat step on the amber ramp (0 dim .. 3 bright) — always free */
  tone: 0 | 1 | 2 | 3;
};

export const DEFAULT_LOOK: YouLook = {
  hat: "hat.tophat",
  hair: "hair.short",
  acc: "acc.none",
  tone: 1,
};

/** coat greys per tone — the sprite shader lifts 2..7 onto the amber ramp */
const TONES = ["3", "4", "5", "6"] as const;

export function composeYou(look: YouLook): Record<string, string[]> {
  const toneC = TONES[look.tone] ?? "4";
  const trimC = String(Math.min(7, Number(toneC) + 1));
  const out: Record<string, string[]> = {};
  for (const [name, rows] of Object.entries(YOU_BASE)) {
    const dir = name.split("_")[1] as Dir;
    const grid = rows.map((r) => r.split(""));
    // layering order: hair under hat, accessories on top
    for (const pid of [look.hair, look.hat, look.acc]) {
      const patch = PARTS.find((p) => p.id === pid)?.art[dir];
      if (!patch) continue;
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
    out[name] = grid.map((r) =>
      r.map((ch) => (ch === "c" ? toneC : ch === "t" ? trimC : ch)).join(""),
    );
  }
  return out;
}
