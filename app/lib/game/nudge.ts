/**
 * The nightly nudge — an optional reminder, off unless asked for, and
 * scheduled by the device itself: no server, no network, nothing leaves
 * the phone. This file is the whole of the thinking and none of the
 * plumbing. It answers two questions and holds no state:
 *
 *   which nights are still open?   → openNights()
 *   what does the city say?        → nudgeLine()
 *
 * The rule the lines are written to: nobody is ever told they forgot
 * something. A missed night is not a debt, so the city does not send a
 * bailiff — it mentions that the lamps are on, the way a neighbour would,
 * and gets on with its evening.
 */

import type { NoteMetric } from "../city/layout";

export type NudgeLine = { en: string; zh: string };

/**
 * Nine lines, not seven — a week has seven days, and a seven-line cycle
 * would hand every Monday the same sentence forever. Nine drifts against
 * the week and comes round evenly, so the rotation stays deterministic
 * without ever feeling like a timetable.
 *
 * Each one is a small thing that happened, not a mood: a cat at the
 * observatory, a ship in with no mail, a weathervane turning in still
 * air. Atmosphere alone ("the clouds are low tonight") is the easiest
 * sentence in the world to write and the least reason to open anything.
 * Every object named here exists in the city, so the line is an invitation
 * to go and look rather than a decoration.
 *
 * Two words are kept out of the Chinese on purpose — 連續 and 還沒 — not
 * because they are wrong, but because the guard in nudge.test.ts cannot
 * tell a cat's third night from a scolding about yours, and a blunt guard
 * that costs a rewrite is better than a clever one that lets a nag past.
 */
export const NUDGE_LINES: NudgeLine[] = [
  { en: "The cat is at the observatory pillars again. Three nights now.",
    zh: "貓又在抓天文台的柱子,這是第三個晚上。" },
  { en: "Someone was in the registry, looking your name up.",
    zh: "有人在名冊上翻你的名字。" },
  { en: "A messenger ship docked. Nothing aboard for you.",
    zh: "信使船靠港了,沒有你的信。" },
  { en: "The weathervane turned all night. There was no wind.",
    zh: "風向雞轉了一整晚,今晚沒有風。" },
  { en: "Somebody moved the bench half a metre and said nothing about it.",
    zh: "有人把長椅搬了半公尺,沒說為什麼。" },
  { en: "The greenhouse light is on. Nobody will admit to leaving it.",
    zh: "溫室的燈亮著,沒有人承認是自己開的。" },
  { en: "The baker shut the oven hours ago. The smell is still around.",
    zh: "麵包師早就關了烤爐,香味留到現在。" },
  { en: "The postbox is empty tonight. That is rare.",
    zh: "郵筒今晚是空的,這很少見。" },
  { en: "Someone stood outside your door a moment, then went home.",
    zh: "有人在你家門口站了一下,然後回去了。" },
];

/**
 * How many nights ahead the device is asked to remember us. It is also
 * the promise: stay away longer than this and the reminders run out on
 * their own. Leaving is allowed to be quiet.
 */
export const NUDGE_HORIZON = 14;

/** the hour the city keeps, until the writer says otherwise */
export const DEFAULT_NUDGE_TIME = "21:00";

const DAY = 86400000;

function startOf(date: string): number {
  return new Date(date + "T00:00:00Z").getTime();
}

function keyOf(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** n days after a YYYY-MM-DD, n may be negative */
export function addDays(date: string, n: number): string {
  return keyOf(startOf(date) + n * DAY);
}

/**
 * The nights inside the horizon that have no page yet — the only nights
 * worth a word. A day already written is skipped wherever it falls, so a
 * page dated ahead (a different timezone, a page written early) silences
 * its own night without any special case.
 */
export function openNights(
  metrics: NoteMetric[],
  today: string,
  horizon: number = NUDGE_HORIZON,
): string[] {
  if (!Number.isFinite(horizon) || horizon <= 0) return [];
  const written = new Set(metrics.map((m) => m.date));
  const out: string[] = [];
  for (let i = 0; i < horizon; i += 1) {
    const night = addDays(today, i);
    if (!written.has(night)) out.push(night);
  }
  return out;
}

/**
 * One line per night, the same line all night, a different line tomorrow.
 * Derived from the date alone: two devices looking at the same evening
 * say the same thing, and nothing has to be stored to keep them agreeing.
 */
export function nudgeLine(date: string, lang: "en" | "zh"): string {
  const day = Math.floor(startOf(date) / DAY);
  const n = NUDGE_LINES.length;
  return NUDGE_LINES[((day % n) + n) % n][lang];
}

/**
 * "HH:MM" as the settings field hands it over, or null if it is not a
 * time. Refusing the malformed here means the scheduler never has to
 * wonder what 25:70 means.
 */
export function parseNudgeTime(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
