/**
 * Watts — the city's currency, earned by writing, derived purely from the
 * vault. Nothing here is stored: reconnect the same vault anywhere and the
 * same balance re-derives. "Wrote that night" outweighs word count, word
 * watts are log-compressed with a daily cap — padding earns nothing.
 */

import type { NoteMetric } from "../city/layout";

// rebalanced when work orders became historical (kept roughly neutral
// for existing vaults: 300-word night ≈ 110 W before and after)
const NIGHT_BONUS = 28;
const DAILY_WORD_CAP = 105;

export function wordWatts(words: number): number {
  return 24 * Math.log2(words / 60 + 1);
}

export function earnedWatts(metrics: NoteMetric[]): number {
  const byDay = new Map<string, number>();
  for (const m of metrics) {
    byDay.set(m.date, (byDay.get(m.date) ?? 0) + wordWatts(m.words));
  }
  let total = 0;
  for (const dayWords of byDay.values()) {
    total += NIGHT_BONUS + Math.min(DAILY_WORD_CAP, dayWords);
  }
  return Math.floor(total);
}

/** consecutive nights finally pay: each day of a run beyond the first
 *  earns a little extra, capped at a week's momentum — the streetlights
 *  stop being pure advertising */
export function streakBonus(metrics: NoteMetric[]): number {
  const days = [...new Set(metrics.map((m) => m.date))];
  const set = new Set(days);
  let total = 0;
  for (const d of days) {
    let run = 0;
    let cur = d;
    while (set.has(cur) && run <= 7) {
      run += 1;
      cur = prevDate(cur);
    }
    total += Math.min(run - 1, 6) * 3;
  }
  return total;
}

/** cost to go from level n to n+1 — early levels come fast, later ones slow */
export function levelCost(n: number): number {
  return Math.round(70 * n ** 1.6);
}

export function levelFromWatts(watts: number): number {
  let level = 1;
  let remaining = watts;
  while (level < 99) {
    const cost = levelCost(level);
    if (remaining < cost) break;
    remaining -= cost;
    level += 1;
  }
  return level;
}

/** the skyline height limit — levelling up lets the whole city grow */
export function skylineCap(level: number): number {
  return 7 + level * 2;
}

/* ---------- work orders — derived for any date, never stored ---------- */

export type WorkOrder = { id: string; name: string; bonus: number; done: boolean };

function hashDate(date: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < date.length; i += 1) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const DAY = 86400000;

function prevDate(date: string): string {
  const t = new Date(date + "T00:00:00Z").getTime() - DAY;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

type OrderDef = {
  id: string;
  name: string;
  bonus: number;
  done: (day: NoteMetric[], all: NoteMetric[], date: string) => boolean;
};

const ORDER_POOL: OrderDef[] = [
  { id: "w300", name: "Reach 300 words", bonus: 12, done: (d) => d.reduce((s, m) => s + m.words, 0) >= 300 },
  { id: "second", name: "A second page", bonus: 12, done: (d) => d.length >= 2 },
  { id: "small", name: "A page in the smallest hours", bonus: 12,
    done: (d) => d.some((m) => { const h = new Date(m.mtime).getHours(); return h >= 2 && h < 4; }) },
  { id: "brief", name: "A brief page, under 100 words", bonus: 8, done: (d) => d.some((m) => m.words > 0 && m.words < 100) },
  { id: "twonights", name: "Two nights in a row", bonus: 8,
    done: (d, all, date) => d.length >= 1 && all.some((m) => m.date === prevDate(date)) },
  { id: "backfill", name: "Fill a past empty day", bonus: 12,
    done: (d) => d.some((m) => Math.floor(m.mtime / DAY) * DAY - new Date(m.date + "T00:00:00Z").getTime() > 2 * DAY) },
  { id: "settle", name: "Reach 150 words", bonus: 8, done: (d) => d.reduce((s, m) => s + m.words, 0) >= 150 },
  { id: "third", name: "A third page", bonus: 12, done: (d) => d.length >= 3 },
];

/** three orders per night, rotated deterministically; "write" is always first */
export function workOrders(metrics: NoteMetric[], date: string): WorkOrder[] {
  const day = metrics.filter((m) => m.date === date);
  const h = hashDate(date);
  const a = h % ORDER_POOL.length;
  const b = (a + 1 + ((h >>> 8) % (ORDER_POOL.length - 1))) % ORDER_POOL.length;
  const picks = [ORDER_POOL[a], ORDER_POOL[b]];
  const orders: WorkOrder[] = [
    { id: "write", name: "Write tonight", bonus: 8, done: day.length >= 1 },
  ];
  for (const p of picks) {
    orders.push({ id: p.id, name: p.name, bonus: p.bonus, done: p.done(day, metrics, date) });
  }
  return orders;
}

/**
 * Bonus over ALL history — earned can only ever grow, so the city never
 * shrinks overnight, and the same vault re-derives the same balance.
 */
export function orderBonus(metrics: NoteMetric[]): number {
  const dates = [...new Set(metrics.map((m) => m.date))];
  let total = 0;
  for (const date of dates) {
    for (const o of workOrders(metrics, date)) if (o.done) total += o.bonus;
  }
  return total;
}

/** the longest run of consecutive days ever written — lamps never go out */
export function bestStreakOf(metrics: NoteMetric[]): number {
  const days = [...new Set(metrics.map((m) => m.date))].sort();
  const DAY = 86400000;
  let best = 0;
  let run = 0;
  let prev = 0;
  for (const d of days) {
    const t = new Date(d + "T00:00:00Z").getTime();
    run = t - prev === DAY ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  return best;
}

/** consecutive days written, ending today or yesterday — never punished */
export function streakOf(metrics: NoteMetric[], today: string): number {
  const days = new Set(metrics.map((m) => m.date));
  const DAY = 86400000;
  let t = new Date(today + "T00:00:00Z").getTime();
  if (!days.has(today)) t -= DAY; // last night still counts
  let streak = 0;
  while (streak < 3650) {
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (!days.has(key)) break;
    streak += 1;
    t -= DAY;
  }
  return streak;
}
