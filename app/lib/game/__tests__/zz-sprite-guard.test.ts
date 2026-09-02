import { describe, expect, it } from "vitest";
import { SPRITES } from "../../city/sprites/data";

/* a bad pixel in any sprite is a BLANK SCREEN at startup — never again */
describe("sprite sheet integrity", () => {
  it("every sprite uses only legal pixels and uniform row widths", () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      const width = rows[0]?.length ?? 0;
      for (const row of rows) {
        expect(row.length, name).toBe(width);
        for (const ch of row) {
          expect(".01234567".includes(ch), `${name}: '${ch}'`).toBe(true);
        }
      }
    }
  });
});
