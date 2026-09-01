/**
 * They remember what you two talked about. These tests hold the memory's
 * three promises: it survives the days between meetings, it merges across
 * devices toward the most recent conversation, and it only ever surfaces
 * on a later day — never parroted back within the same one.
 */

import { describe, it, expect } from "vitest";
import { greet, remember, mergeBonds, lineFor, type Bonds, type LineCtx, type Topic } from "../bonds";
import { CALLBACK_LINES } from "../bonds-lines";

const ROLLS = Array.from({ length: 60 }, (_, i) => (i + 1) / 61);

function ctxWith(over: Partial<LineCtx>): LineCtx {
  return {
    kind: "person",
    tier: 2,
    hour: 22,
    weather: "base",
    firstMeet: false,
    wroteTonight: false,
    streak: 0,
    totalNotes: 5,
    daysSinceGreet: 1,
    ...over,
  };
}

describe("conversation memory", () => {
  it("remember stores the topic; the next day's greet keeps it", () => {
    let bonds: Bonds = greet({}, "p:1", "2026-08-30");
    bonds = remember(bonds, "p:1", "writing");
    expect(bonds["p:1"].t).toBe("writing");
    bonds = greet(bonds, "p:1", "2026-08-31");
    expect(bonds["p:1"].t).toBe("writing");
    expect(bonds["p:1"].n).toBe(2);
  });

  it("remember on a stranger changes nothing", () => {
    const bonds: Bonds = {};
    expect(remember(bonds, "p:9", "night")).toBe(bonds);
  });

  it("merging keeps the memory of the most recent conversation", () => {
    const a: Bonds = { "p:1": { n: 3, met: "2026-08-01", last: "2026-08-29", t: "city" } };
    const b: Bonds = { "p:1": { n: 3, met: "2026-08-01", last: "2026-08-30", t: "them" } };
    expect(mergeBonds(a, b)["p:1"].t).toBe("them");
    expect(mergeBonds(b, a)["p:1"].t).toBe("them");
    // a device that never stored a memory must not erase the other's
    const c: Bonds = { "p:1": { n: 3, met: "2026-08-01", last: "2026-08-30" } };
    expect(mergeBonds(a, c)["p:1"].t).toBe("city");
  });

  it("a callback line surfaces on a later day, about the same topic", () => {
    const topics: Topic[] = ["night", "city", "writing", "weather", "you", "them"];
    for (const topic of topics) {
      const callbackTexts = new Set(
        CALLBACK_LINES.filter((l) => l.topic === topic).flatMap((l) => [l.zh, l.en]),
      );
      let hits = 0;
      for (const roll of ROLLS) {
        const spoken = lineFor(ctxWith({ lastReply: { id: "r0", topic, daysAgo: 1 } }), roll, "zh");
        if (!callbackTexts.has(spoken.text)) continue;
        hits += 1;
        // when it surfaces, its topic matches the memory
        expect(spoken.topic).toBe(topic);
      }
      expect(hits).toBeGreaterThan(0);
    }
  });

  it("never brings up 'last time' during the same day", () => {
    const callbackTexts = new Set(CALLBACK_LINES.flatMap((l) => [l.zh, l.en]));
    for (const roll of ROLLS) {
      const spoken = lineFor(ctxWith({ lastReply: { id: "r0", topic: "writing", daysAgo: 0 }, daysSinceGreet: 0 }), roll, "zh");
      expect(callbackTexts.has(spoken.text)).toBe(false);
    }
  });
});
