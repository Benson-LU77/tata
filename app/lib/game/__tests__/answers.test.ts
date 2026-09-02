import { describe, expect, it } from "vitest";
import { ANSWERS } from "../bonds-answers";
import { LINES, FIRST_MEET_LINES, TRADE_LINES, MEMORY_LINES, VOICE_LINES, CALLBACK_LINES, ECHO_LINES, BENCH_LINES } from "../bonds-lines";

const POOLS = { FIRST_MEET_LINES, LINES, TRADE_LINES, MEMORY_LINES, VOICE_LINES, CALLBACK_LINES, ECHO_LINES, BENCH_LINES };
const ALL = Object.values(POOLS).flat();

describe("bespoke answers", () => {
  it("every key matches a real opener (typos die here)", () => {
    const ens = new Set(ALL.map((l) => l.en));
    const orphans = Object.keys(ANSWERS).filter((k) => !ens.has(k));
    expect(orphans).toStrictEqual([]);
  });

  it("every entry offers at least two replies with closers", () => {
    for (const [k, answers] of Object.entries(ANSWERS)) {
      expect(answers.length, k).toBeGreaterThanOrEqual(2);
      for (const a of answers) {
        expect(a.reply.zh.length, k).toBeGreaterThan(0);
        expect(a.reply.en.length, k).toBeGreaterThan(0);
        expect(a.closers.length, k).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("every opener is fully covered — no line falls back to the topic pool", () => {
    for (const pool of Object.values(POOLS)) {
      const missing = pool.filter((l) => !ANSWERS[l.en]).map((l) => l.en);
      expect(missing).toStrictEqual([]);
    }
  });

  it("reports overall coverage", () => {
    const covered = ALL.filter((l) => ANSWERS[l.en]).length;
    console.log(`answers coverage: ${covered}/${ALL.length}`);
    expect(covered).toBe(ALL.length);
  });
});
