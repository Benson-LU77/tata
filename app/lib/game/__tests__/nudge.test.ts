import { describe, expect, it } from "vitest";
import {
  NUDGE_HORIZON,
  NUDGE_LINES,
  addDays,
  nudgeLine,
  openNights,
  parseNudgeTime,
} from "../nudge";

const today = "2026-09-22";

/** a page on each of the given days — nothing else about them matters here */
const pages = (...dates: string[]) =>
  dates.map((date, i) => ({ file: `${date} Today.md`, date, words: 120, mtime: i }));

describe("the nudge only speaks on nights that are still open", () => {
  it("an empty vault leaves every night in the horizon open", () => {
    const nights = openNights([], today);
    expect(nights).toHaveLength(NUDGE_HORIZON);
    expect(nights[0]).toBe(today);
    expect(nights.at(-1)).toBe("2026-10-05");
  });

  it("writing tonight takes tonight off the list and leaves the rest", () => {
    const nights = openNights(pages(today), today);
    expect(nights).not.toContain(today);
    expect(nights[0]).toBe("2026-09-23");
    expect(nights).toHaveLength(NUDGE_HORIZON - 1);
  });

  it("nights already written inside the window are skipped wherever they fall", () => {
    const nights = openNights(pages("2026-09-25", "2026-09-28"), today);
    expect(nights).not.toContain("2026-09-25");
    expect(nights).not.toContain("2026-09-28");
    expect(nights).toHaveLength(NUDGE_HORIZON - 2);
  });

  it("yesterday's page is history and changes nothing about tonight", () => {
    expect(openNights(pages("2026-09-21"), today)).toEqual(openNights([], today));
  });

  it("the window never reaches past the horizon, however long the silence", () => {
    // a year of nothing written is still fourteen nights of reminders
    const nights = openNights([], today);
    expect(nights.every((d) => d >= today && d <= "2026-10-05")).toBe(true);
  });

  it("a shorter horizon is honoured, and a senseless one asks for nothing", () => {
    expect(openNights([], today, 3)).toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
    expect(openNights([], today, 0)).toEqual([]);
    expect(openNights([], today, -5)).toEqual([]);
    expect(openNights([], today, NaN)).toEqual([]);
  });

  it("two pages on one night still only silence that night once", () => {
    const twice = [
      { file: "2026-09-22 Today.md", date: today, words: 90, mtime: 1 },
      { file: "2026-09-22 Tonight.md", date: today, words: 40, mtime: 2 },
    ];
    expect(openNights(twice, today)).toHaveLength(NUDGE_HORIZON - 1);
  });
});

describe("the city says one thing per night, and says it in both languages", () => {
  it("the same night gets the same line every time it is asked", () => {
    expect(nudgeLine(today, "zh")).toBe(nudgeLine(today, "zh"));
    expect(nudgeLine(today, "en")).toBe(nudgeLine(today, "en"));
  });

  it("tomorrow is a different line", () => {
    expect(nudgeLine("2026-09-23", "zh")).not.toBe(nudgeLine(today, "zh"));
  });

  it("nine lines drift against a seven-day week, so no weekday is typecast", () => {
    const thisWeek = nudgeLine(today, "en");
    const nextWeek = nudgeLine(addDays(today, 7), "en");
    expect(nextWeek).not.toBe(thisWeek);
  });

  it("every line comes round, and none comes round twice in a cycle", () => {
    const cycle = Array.from({ length: NUDGE_LINES.length }, (_, i) =>
      nudgeLine(addDays(today, i), "en"),
    );
    expect(new Set(cycle).size).toBe(NUDGE_LINES.length);
  });

  it("dates before the epoch still land on a real line", () => {
    expect(NUDGE_LINES.map((l) => l.zh)).toContain(nudgeLine("1965-03-07", "zh"));
  });

  it("no line tells the writer they forgot, or counts anything at all", () => {
    const forbidden = /forgot|don't forget|remember to|streak|still haven't|missed|還沒|忘記|別忘|連續|中斷/i;
    for (const line of NUDGE_LINES) {
      expect(forbidden.test(line.en), line.en).toBe(false);
      expect(forbidden.test(line.zh), line.zh).toBe(false);
    }
  });

  it("every line is written in both languages and ends in a full stop", () => {
    for (const line of NUDGE_LINES) {
      expect(line.en.trim().length, line.en).toBeGreaterThan(0);
      expect(line.zh.trim().length, line.zh).toBeGreaterThan(0);
      expect(line.en.endsWith("."), line.en).toBe(true);
      expect(line.zh.endsWith("。"), line.zh).toBe(true);
      expect(line.en.includes("!"), line.en).toBe(false);
    }
  });

  it("every line reports something that happened, not the weather of the soul", () => {
    // a line with no actor and no event is atmosphere, and atmosphere is
    // no reason to open anything — each one names a thing in the city
    const inhabited =
      /cat|registry|ship|weathervane|bench|greenhouse|baker|oven|postbox|door/i;
    const zhInhabited = /貓|名冊|信使船|風向雞|長椅|溫室|麵包師|烤爐|郵筒|門口/;
    for (const line of NUDGE_LINES) {
      expect(inhabited.test(line.en), line.en).toBe(true);
      expect(zhInhabited.test(line.zh), line.zh).toBe(true);
    }
  });
});

describe("dates and times survive the edges", () => {
  it("adding days crosses months and years", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // a leap year
  });

  it("a horizon starting in late December runs into the new year", () => {
    const nights = openNights([], "2026-12-24");
    expect(nights).toContain("2027-01-01");
    expect(nights.at(-1)).toBe("2027-01-06");
  });

  it("a time is read only when it is a time", () => {
    expect(parseNudgeTime("21:00")).toEqual({ hour: 21, minute: 0 });
    expect(parseNudgeTime("7:05")).toEqual({ hour: 7, minute: 5 });
    expect(parseNudgeTime(" 09:30 ")).toEqual({ hour: 9, minute: 30 });
    expect(parseNudgeTime("00:00")).toEqual({ hour: 0, minute: 0 });
    expect(parseNudgeTime("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("nonsense is refused here rather than puzzled over later", () => {
    for (const bad of ["25:00", "21:60", "21", "21:0", "", "九點", "-1:00", "21:00:00"]) {
      expect(parseNudgeTime(bad), bad).toBeNull();
    }
  });
});
