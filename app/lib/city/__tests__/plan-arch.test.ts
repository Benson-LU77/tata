/**
 * Earned archetypes must read the circumstances, not the clock alone.
 * mtime once decided "bridge" by itself, so one bulk edit of old pages
 * turned a whole city into a bridge forest. The backfill signature is
 * the filename: the app names same-day pages with a suffix; only a
 * bare "YYYY-MM-DD.md" was born after its day.
 */

import { describe, it, expect } from "vitest";
import { planCity, ARCH_BRIDGE } from "../plan";
import type { NoteMetric } from "../layout";

const DAY = 86400000;
const T0 = new Date("2026-08-10T21:00:00Z").getTime();

function metric(file: string, date: string, mtime: number): NoteMetric {
  return { file, date, words: 120, mtime, links: [], tags: [] };
}

function archOf(plan: ReturnType<typeof planCity>, file: string) {
  return plan.lots.find((l) => l.file === file)?.arch;
}

describe("bridge verdicts", () => {
  it("a same-day-named page edited much later never becomes a bridge", () => {
    const plan = planCity(
      [metric("2026-08-10 Today.md", "2026-08-10", T0 + 20 * DAY)],
      T0 + 21 * DAY,
    );
    expect(archOf(plan, "2026-08-10 Today.md")).not.toBe(ARCH_BRIDGE);
  });

  it("a bare date file written days later is a bridge", () => {
    const plan = planCity(
      [metric("2026-08-10.md", "2026-08-10", T0 + 20 * DAY)],
      T0 + 21 * DAY,
    );
    expect(archOf(plan, "2026-08-10.md")).toBe(ARCH_BRIDGE);
  });

  it("amnesty: a stale bridge pin on a same-day-named page is ignored", () => {
    const plan = planCity(
      [metric("2026-08-10 Today.md", "2026-08-10", T0 + 20 * DAY)],
      T0 + 21 * DAY,
      { "2026-08-10 Today.md": ARCH_BRIDGE },
    );
    expect(archOf(plan, "2026-08-10 Today.md")).toBeUndefined();
  });

  it("a legitimate bridge pin on a bare date file still holds", () => {
    const plan = planCity(
      [metric("2026-08-10.md", "2026-08-10", T0)],
      T0 + 21 * DAY,
      { "2026-08-10.md": ARCH_BRIDGE },
    );
    expect(archOf(plan, "2026-08-10.md")).toBe(ARCH_BRIDGE);
  });
});
