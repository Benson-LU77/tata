import { describe, expect, it } from "vitest";
import { STAMPS, STAMP_ALIAS, stampRows } from "../../city/sprites/stamps";

/*
 * A stamp is read on paper, not against the night sky. The city palette runs
 * dark to light because light pixels are what carry a sprite over a black
 * background; on the notebook page that is inside out, and a stamp drawn in
 * the top steps is simply not there. Eight of fourteen stamps shipped that
 * way — this pins the fix.
 */

const PAL = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];
const PAPER = "#f2f3f5";

/** WCAG relative luminance */
function luminance(hex: string): number {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** the steps a stamp may ink with: everything that clears 3:1 on the page */
const LEGIBLE = PAL.map((c) => contrast(c, PAPER) >= 3);

describe("stamps are inked for paper", () => {
  it("every stamp has a stroke that clears 3:1 against the page", () => {
    for (const [id, rows] of Object.entries(STAMPS)) {
      const steps = [...new Set(rows.join("").match(/[0-7]/g) ?? [])];
      expect(steps.length, `${id} draws nothing`).toBeGreaterThan(0);
      const strongest = Math.max(...steps.map((d) => contrast(PAL[Number(d)], PAPER)));
      expect(strongest, `${id} is invisible on paper`).toBeGreaterThanOrEqual(3);
    }
  });

  it("no stamp is drawn entirely in the steps that vanish", () => {
    // steps 5 and up sit below 3:1 — they may shade, never carry the drawing
    expect(LEGIBLE).toEqual([true, true, true, true, true, false, false, false]);
    for (const [id, rows] of Object.entries(STAMPS)) {
      const inked = (rows.join("").match(/[0-7]/g) ?? []).filter((d) => LEGIBLE[Number(d)]);
      expect(inked.length, `${id} has no legible pixels`).toBeGreaterThan(0);
    }
  });

  it("rows stay rectangular and use only legal pixels", () => {
    for (const [id, rows] of Object.entries(STAMPS)) {
      const width = rows[0]?.length ?? 0;
      for (const row of rows) {
        expect(row.length, id).toBe(width);
        for (const ch of row) expect(".01234567".includes(ch), `${id}: '${ch}'`).toBe(true);
      }
    }
  });

  it("every alias lands on a drawing", () => {
    for (const [alias, id] of Object.entries(STAMP_ALIAS)) {
      expect(STAMPS[id], `${alias} → ${id}`).toBeDefined();
      expect(stampRows(alias), alias).toBe(STAMPS[id]);
    }
  });
});
