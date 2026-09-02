import { describe, expect, it } from "vitest";
import { EMPTY_TALK, lineId, markSaid, mergeBonds, mergeTalk, type Talk } from "../bonds";

/* Talk must merge like Bonds: commutative and monotone, so two devices
 * can never disagree about what was said or regress a memory. */

describe("mergeTalk", () => {
  const a: Talk = {
    said: { x1: "2026-08-30", x2: "2026-08-20" },
    replies: { "person:1": { id: "r1", topic: "night", at: "2026-08-30" } },
  };
  const b: Talk = {
    said: { x1: "2026-08-28", x3: "2026-09-01" },
    replies: {
      "person:1": { id: "r2", topic: "city", at: "2026-08-31" },
      "person:2": { id: "r3", topic: "you", at: "2026-08-29" },
    },
  };

  it("commutes", () => {
    expect(mergeTalk(a, b)).toStrictEqual(mergeTalk(b, a));
  });

  it("unions said with the newer date winning", () => {
    const m = mergeTalk(a, b);
    expect(m.said).toStrictEqual({ x1: "2026-08-30", x2: "2026-08-20", x3: "2026-09-01" });
  });

  it("keeps the newer reply per resident", () => {
    const m = mergeTalk(a, b);
    expect(m.replies["person:1"].id).toBe("r2");
    expect(m.replies["person:2"].id).toBe("r3");
  });

  it("breaks same-day reply ties deterministically", () => {
    const t1: Talk = { said: {}, replies: { k: { id: "aa", topic: "night", at: "2026-09-01" } } };
    const t2: Talk = { said: {}, replies: { k: { id: "bb", topic: "city", at: "2026-09-01" } } };
    expect(mergeTalk(t1, t2)).toStrictEqual(mergeTalk(t2, t1));
    expect(mergeTalk(t1, t2).replies.k.id).toBe("aa");
  });

  it("treats undefined as empty", () => {
    expect(mergeTalk(undefined, a)).toStrictEqual(mergeTalk(a, undefined));
    expect(mergeTalk(undefined, undefined)).toStrictEqual(EMPTY_TALK);
  });
});

describe("markSaid", () => {
  it("records today and prunes entries older than 30 days", () => {
    const t: Talk = { said: { old: "2026-07-01", fresh: "2026-08-25" }, replies: {} };
    const m = markSaid(t, "tonight", "2026-09-01");
    expect(m.said.tonight).toBe("2026-09-01");
    expect(m.said.fresh).toBe("2026-08-25");
    expect(m.said.old).toBeUndefined();
  });
});

describe("lineId", () => {
  it("is stable and distinct", () => {
    expect(lineId("Mind the kerb.")).toBe(lineId("Mind the kerb."));
    expect(lineId("Mind the kerb.")).not.toBe(lineId("Evening."));
  });
});

describe("mergeBonds gift", () => {
  it("keeps the newer gift and commutes on same-day ties", () => {
    const a = { k: { n: 12, met: "2026-08-01", last: "2026-09-01", g: { id: "posy", at: "2026-08-30" } } };
    const b = { k: { n: 12, met: "2026-08-01", last: "2026-09-01", g: { id: "chime", at: "2026-09-01" } } };
    expect(mergeBonds(a, b).k.g?.id).toBe("chime");
    expect(mergeBonds(a, b)).toStrictEqual(mergeBonds(b, a));
    const c = { k: { n: 12, met: "2026-08-01", last: "2026-09-01", g: { id: "scarf", at: "2026-09-01" } } };
    expect(mergeBonds(b, c)).toStrictEqual(mergeBonds(c, b));
  });
});

describe("mergeBonds topic tie", () => {
  it("commutes when both devices talked the same day about different things", () => {
    const a = { k: { n: 3, met: "2026-08-01", last: "2026-09-01", t: "you" as const } };
    const b = { k: { n: 3, met: "2026-08-01", last: "2026-09-01", t: "city" as const } };
    expect(mergeBonds(a, b)).toStrictEqual(mergeBonds(b, a));
  });
});
