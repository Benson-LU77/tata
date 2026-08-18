/**
 * Bonds — knowing the neighbours. A bond is a count of days you greeted
 * someone, keyed by their stable creature key. Time-gated, never decays,
 * never punishes absence, never pays Watts: the reward is that the city
 * slowly stops being strangers.
 *
 * Pure module: no storage, no network, no Date.now() — callers pass
 * today's date string. Merging is commutative and monotone so devices
 * can never regress a friendship or double-count a day.
 */

import type { CreatureKind } from "../city/residents";
import { LINES, FIRST_MEET_LINES, CAT_LINE_DEFS, DOG_LINE_DEFS, TRADE_LINES, MEMORY_LINES } from "./bonds-lines";

export type Bond = {
  /** days greeted (one per calendar day at most) */
  n: number;
  /** first-met day, YYYY-MM-DD */
  met: string;
  /** last greeted day — gates the once-per-day increment */
  last: string;
};

export type Bonds = Record<string, Bond>;

export type Tier = 0 | 1 | 2 | 3 | 4;

/** stranger / familiar / acquainted / friend / family */
const TIER_AT = [1, 4, 10, 20];

export function tierOf(b: Bond | undefined): Tier {
  if (!b || b.n <= 0) return 0;
  let t: Tier = 0;
  for (let i = 0; i < TIER_AT.length; i += 1) {
    if (b.n >= TIER_AT[i]) t = (i + 1) as Tier;
  }
  return t;
}

export const TIER_NAMES = ["someone", "familiar", "acquainted", "friend", "family"] as const;
const TIER_NAMES_ZH = ["陌生人", "面熟", "相識", "朋友", "家人"] as const;

/** tier label in the given UI language — English keeps the legacy TIER_NAMES export */
export function tierName(tier: Tier, lang: "en" | "zh" = "en"): string {
  return lang === "zh" ? TIER_NAMES_ZH[tier] : TIER_NAMES[tier];
}

/** greet once; same-day repeats change nothing but the conversation */
export function greet(bonds: Bonds, key: string, today: string): Bonds {
  const prev = bonds[key];
  if (prev && prev.last === today) return bonds;
  const next: Bond = prev
    ? { n: prev.n + 1, met: prev.met, last: today }
    : { n: 1, met: today, last: today };
  return { ...bonds, [key]: next };
}

export function mergeBonds(a: Bonds | undefined, b: Bonds | undefined): Bonds {
  const out: Bonds = { ...(a ?? {}) };
  for (const [key, bb] of Object.entries(b ?? {})) {
    const aa = out[key];
    if (!aa) {
      out[key] = bb;
      continue;
    }
    out[key] = {
      // max, not sum — the same day greeted on two devices is one day
      n: Math.max(aa.n, bb.n),
      met: aa.met && bb.met ? (aa.met < bb.met ? aa.met : bb.met) : aa.met || bb.met,
      last: aa.last > bb.last ? aa.last : bb.last,
    };
  }
  return out;
}

/* ---------------- names — seeded, revealed on first meeting ----------- */

const PERSON_NAMES = [
  "Aris", "Bell", "Cato", "Dara", "Ebba", "Finn", "Gale", "Hollis",
  "Ines", "Juno", "Kip", "Lior", "Mabel", "Nils", "Oren", "Pia",
  "Quill", "Rue", "Soren", "Tova", "Ulla", "Vero", "Wren", "Xeno",
  "Yuri", "Zora", "Ash", "Birch", "Coral", "Dune", "Ember", "Fjord",
  "Grove", "Haven", "Iris", "Jasper", "Kestrel", "Lark", "Moss", "North",
  "Onyx", "Pine", "Quartz", "Reed", "Sage", "Thorn", "Umber", "Vale",
  "Willow", "Yarrow", "Aster", "Blythe", "Cedar", "Dove", "Eider", "Flax",
  "Gull", "Heath", "Ivy", "Juniper", "Koa", "Linden", "Merle", "Nettle",
];
const CAT_NAMES = [
  "Mochi", "Soot", "Pixel", "Comet", "Biscuit", "Nimbus", "Static", "Umbra",
  "Waffle", "Orbit", "Tofu", "Vesper", "Clover", "Dusty", "Echo", "Flint",
  "Ginger", "Halo", "Inko", "Jinx", "Kettle", "Luna", "Miso", "Noodle",
];
const DOG_NAMES = [
  "Radar", "Biscuit", "Rocket", "Pepper", "Scout", "Tango", "Waffles", "Zippy",
  "Astro", "Bolt", "Chip", "Duke", "Fable", "Gizmo", "Hopper", "Indy",
];

export function nameOf(kind: CreatureKind, seed: number): string {
  if (kind === "cat") return CAT_NAMES[seed % CAT_NAMES.length];
  if (kind === "dog") return DOG_NAMES[seed % DOG_NAMES.length];
  if (kind === "you") return "you";
  return PERSON_NAMES[seed % PERSON_NAMES.length];
}

/* ---------------- lines — data-driven, context-aware ----------------- */

export type LineCtx = {
  kind: CreatureKind;
  tier: Tier;
  hour: number; // 0..23
  weather: "base" | "rain" | "snow" | "fog";
  firstMeet: boolean;
  /** did you write anything today (city time)? */
  wroteTonight: boolean;
  /** current consecutive days written */
  streak: number;
  /** total pages in the vault */
  totalNotes: number;
  /** days since you last greeted this resident (0 = today already) */
  daysSinceGreet: number;
  /** what the residents call you — empty means they don't know yet */
  name?: string;
  /** the resident's trade — colours their small talk */
  profession?: string;
};

export type LineDef = {
  /** minimum tier (default 1); firstMeet lines use tier 0 */
  tier?: Tier;
  /** situational guard — omit for always-eligible */
  when?: (ctx: LineCtx) => boolean;
  /** situational lines are preferred over plain tier lines */
  weight?: number;
  en: string;
  zh: string;
};

/** fill {streak} {total} {days} {name} with tonight's real numbers */
function fill(line: string, ctx: LineCtx): string {
  return line
    .replace(/\{streak\}/g, String(ctx.streak))
    .replace(/\{total\}/g, String(ctx.totalNotes))
    .replace(/\{days\}/g, String(ctx.daysSinceGreet))
    .replace(/\{name\}/g, ctx.name ?? "");
}

export function lineFor(ctx: LineCtx, roll: number, lang: "en" | "zh" = "en"): string {
  const table =
    ctx.kind === "cat"
      ? CAT_LINE_DEFS
      : ctx.kind === "dog"
        ? DOG_LINE_DEFS
        : ctx.firstMeet
          ? FIRST_MEET_LINES
          : [...LINES, ...TRADE_LINES, ...MEMORY_LINES];
  const eligible = table.filter(
    (l) => (l.tier ?? 0) <= ctx.tier && (!l.when || l.when(ctx)),
  );
  if (eligible.length === 0) return lang === "zh" ? "……" : "...";
  // weighted pick: situational lines carry more weight so they surface
  const total = eligible.reduce((s2, l) => s2 + (l.weight ?? (l.when ? 3 : 1)), 0);
  let at = (Math.abs(roll * 7919) % 1) * total;
  for (const l of eligible) {
    at -= l.weight ?? (l.when ? 3 : 1);
    if (at <= 0) return fill(lang === "zh" ? l.zh : l.en, ctx);
  }
  const last = eligible[eligible.length - 1];
  return fill(lang === "zh" ? last.zh : last.en, ctx);
}
