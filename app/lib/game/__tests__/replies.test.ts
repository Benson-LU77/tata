/**
 * A conversation is two people on the same subject. These tests hold the
 * three promises the reply picker makes: it answers what was said, it
 * never offers warmth the friendship has not earned, and it always
 * offers something.
 */

import { describe, it, expect } from "vitest";
import { REPLIES, repliesFor, closerFor } from "../replies";
import type { Topic, Tier } from "../bonds";

const TOPICS: Topic[] = ["night", "city", "writing", "weather", "you", "them"];
const ROLLS = Array.from({ length: 40 }, (_, i) => (i + 1) / 41);

describe("replies", () => {
  it("always offers exactly two, on every topic and every tier", () => {
    for (const topic of TOPICS) {
      for (let tier = 0 as Tier; tier <= 4; tier = (tier + 1) as Tier) {
        for (const roll of ROLLS) {
          expect(repliesFor(topic, tier, roll)).toHaveLength(2);
        }
      }
    }
  });

  it("answers the topic that was raised", () => {
    for (const topic of TOPICS) {
      for (const roll of ROLLS) {
        const picked = repliesFor(topic, 4, roll);
        expect(picked.some((r) => r.topics?.includes(topic))).toBe(true);
      }
    }
  });

  it("never offers warmth the bond has not earned", () => {
    for (const topic of TOPICS) {
      for (let tier = 0 as Tier; tier <= 4; tier = (tier + 1) as Tier) {
        for (const roll of ROLLS) {
          for (const r of repliesFor(topic, tier, roll)) {
            expect(r.tier ?? 0).toBeLessThanOrEqual(tier);
          }
        }
      }
    }
  });

  it("still answers when the line carries no topic (quest lines)", () => {
    for (const roll of ROLLS) {
      const picked = repliesFor(undefined, 0, roll);
      expect(picked).toHaveLength(2);
      expect(picked.every((r) => !r.topics)).toBe(true);
    }
  });

  it("never offers the same reply twice in one meeting", () => {
    for (const topic of TOPICS) {
      for (const roll of ROLLS) {
        const [a, b] = repliesFor(topic, 4, roll);
        expect(a).not.toBe(b);
      }
    }
  });

  it("does not hand back the same pair for every roll", () => {
    for (const topic of TOPICS) {
      const seen = new Set(
        ROLLS.map((roll) =>
          repliesFor(topic, 4, roll)
            .map((r) => r.reply.en)
            .join("|"),
        ),
      );
      // a picker that resonates with evenly spaced rolls collapses to one
      expect(seen.size).toBeGreaterThan(3);
    }
  });

  it("varies the closer too", () => {
    for (const r of REPLIES.filter((x) => x.closers.length > 1)) {
      const seen = new Set(ROLLS.map((roll) => closerFor(r, roll, "en")));
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  it("is deterministic for a given roll", () => {
    for (const roll of ROLLS) {
      expect(repliesFor("city", 2, roll)).toEqual(repliesFor("city", 2, roll));
    }
  });

  it("every reply can be answered, in both languages", () => {
    for (const r of REPLIES) {
      expect(r.closers.length).toBeGreaterThan(0);
      for (const roll of ROLLS) {
        expect(closerFor(r, roll, "zh").length).toBeGreaterThan(0);
        expect(closerFor(r, roll, "en").length).toBeGreaterThan(0);
      }
    }
  });

  it("every topic has something to say at the lowest tier", () => {
    for (const topic of TOPICS) {
      const open = REPLIES.filter((r) => r.topics?.includes(topic) && (r.tier ?? 0) === 0);
      expect(open.length).toBeGreaterThan(0);
    }
  });

  it("carries both languages everywhere", () => {
    for (const r of REPLIES) {
      expect(r.reply.zh).not.toBe("");
      expect(r.reply.en).not.toBe("");
      for (const c of r.closers) {
        expect(c.zh).not.toBe("");
        expect(c.en).not.toBe("");
      }
    }
  });

  it("a second round never repeats the first, and always has words", () => {
    for (const topic of TOPICS) {
      for (let tier = 0 as Tier; tier <= 4; tier = (tier + 1) as Tier) {
        for (const roll of ROLLS) {
          const first = repliesFor(topic, tier, roll);
          const second = repliesFor(topic, tier, 1 - roll, first);
          // the follow-up round must never leave the meeting speechless
          expect(second.length).toBeGreaterThan(0);
          for (const r of second) expect(first).not.toContain(r);
        }
      }
    }
  });
});
