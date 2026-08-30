/**
 * Which pages are the record, and which are still the draft.
 *
 * The rule had a hole exactly because it lived inline as a regex nobody
 * could put a test against: it required a space after the date, so pages
 * written on the day sealed and pages backfilled later never did. Two
 * kinds of past under two different rules, for no reason but a filename.
 */

import { describe, it, expect } from "vitest";
import { isSealed } from "../doc-store";

const TODAY = "2026-08-30";

describe("sealed pages", () => {
  it("seals a past day that was written on the day", () => {
    expect(isSealed("2026-08-25 Today.md", TODAY)).toBe(true);
    expect(isSealed("2026-08-25 Tonight.md", TODAY)).toBe(true);
  });

  it("seals a past day that was backfilled later", () => {
    // the shape that used to slip through and stay editable forever
    expect(isSealed("2026-08-25.md", TODAY)).toBe(true);
  });

  it("leaves today open, in both shapes", () => {
    expect(isSealed("2026-08-30 Today.md", TODAY)).toBe(false);
    expect(isSealed("2026-08-30.md", TODAY)).toBe(false);
  });

  it("leaves a page with no date in its name alone", () => {
    expect(isSealed("Some thought.md", TODAY)).toBe(false);
    expect(isSealed("Templates/daily.md", TODAY)).toBe(false);
  });

  it("does not seal a nothing", () => {
    expect(isSealed(null, TODAY)).toBe(false);
    expect(isSealed("", TODAY)).toBe(false);
  });

  it("does not mistake a date-like prefix for a date", () => {
    expect(isSealed("2026-08-25x.md", TODAY)).toBe(false);
    expect(isSealed("20260825.md", TODAY)).toBe(false);
  });

  it("keeps timed pages from earlier today open", () => {
    // "2026-08-30 17.43.md" is still today, however it is named
    expect(isSealed("2026-08-30 17.43.md", TODAY)).toBe(false);
  });
});
