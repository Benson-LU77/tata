import { describe, expect, it } from "vitest";
import { errandId, errandSaid, errandMark, markSaid, EMPTY_TALK } from "../bonds";

const today = "2026-09-04";
const yesterday = "2026-09-03";
const quest = { key: "person:3", orderId: "write", done: false };

describe("the errand is an event, not a script", () => {
  it("the mark shows until the ask has been heard", () => {
    expect(errandMark(quest, EMPTY_TALK, today)).toEqual({ key: "person:3", done: false });
  });

  it("hearing the ask takes the mark down for the day", () => {
    const talk = markSaid(EMPTY_TALK, errandId("write", "ask"), today);
    expect(errandSaid(talk, "write", "ask", today)).toBe(true);
    expect(errandMark(quest, talk, today)).toEqual({ key: "person:3", done: true });
  });

  it("yesterday's ask does not silence today's", () => {
    const talk = markSaid(EMPTY_TALK, errandId("write", "ask"), yesterday);
    expect(errandSaid(talk, "write", "ask", today)).toBe(false);
    expect(errandMark(quest, talk, today)?.done).toBe(false);
  });

  it("the ask and the thanks are separate events", () => {
    const talk = markSaid(EMPTY_TALK, errandId("write", "ask"), today);
    expect(errandSaid(talk, "write", "thanks", today)).toBe(false);
  });

  it("a finished errand keeps the mark down regardless", () => {
    expect(errandMark({ ...quest, done: true }, EMPTY_TALK, today)?.done).toBe(true);
  });

  it("no errand, no mark", () => {
    expect(errandMark(null, EMPTY_TALK, today)).toBeNull();
  });

  it("the line and the mark read the same ledger key", () => {
    // the bug this guards: two places building the key by hand and drifting
    expect(errandId("write", "ask")).toBe("q:write:ask");
    expect(errandId("write", "thanks")).toBe("q:write:thanks");
  });
});
