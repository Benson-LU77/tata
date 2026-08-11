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

/* ---------------- lines — a hand-written pool, tone over volume ------- */

export type LineCtx = {
  kind: CreatureKind;
  tier: Tier;
  hour: number; // 0..23
  weather: "base" | "rain" | "snow" | "fog";
  firstMeet: boolean;
};

const FIRST_MEET = [
  "Oh — hello. I don't think we've met.",
  "New face. Well, newer than mine.",
  "Hm? Oh. Hello there.",
];

const T1 = [
  "Evening.",
  "Nice night for it.",
  "The towers grew again, did you see?",
  "Mind the kerb.",
  "You're the amber one, aren't you.",
  "Quiet tonight.",
];

const T2 = [
  "You again! Good.",
  "I saved you a spot on the bench. There is no bench. Still.",
  "The lights were pretty last night.",
  "I counted the streetlamps today. Lost count.",
  "Heard a new building settle. Sounded like yours.",
  "The dog chased Mochi again. Nobody won.",
];

const T3 = [
  "There you are. I was starting to wonder.",
  "I told the neighbours about you. Only good things.",
  "Some nights I just watch the galaxy band turn.",
  "Your tower's window was lit late. Write something good?",
  "If you ever stop walking this street, it'll feel wrong.",
  "I like the city best right before you arrive.",
];

const T4 = [
  "Welcome home.",
  "You don't have to say anything. It's fine.",
  "I remember when this block was two buildings tall.",
  "Whatever you wrote tonight — I'm glad.",
  "The city keeps your light on. So do I.",
];

const LATE = [
  "Still up? Me too. Obviously.",
  "The small hours are the honest ones.",
];
const RAIN = [
  "The rain sounds different up here. Thinner.",
  "Don't rust.",
];
const SNOW = [
  "Snow in space. Don't ask me how. Enjoy it.",
  "Every footprint tonight is yours.",
];

const CAT_LINES = ["...", "mrr.", "(slow blink)", "(watches you, approves)"];
const DOG_LINES = ["(tail thumps)", "woof.", "(spins once)", "(presents nothing, proudly)"];

export function lineFor(ctx: LineCtx, roll: number): string {
  const pick = (pool: string[]) => pool[Math.floor(Math.abs(roll) * 7919) % pool.length];
  if (ctx.kind === "cat") return pick(CAT_LINES);
  if (ctx.kind === "dog") return pick(DOG_LINES);
  if (ctx.firstMeet) return pick(FIRST_MEET);
  // a slice of the pool leans situational
  const r = Math.abs(roll * 31) % 1;
  if (ctx.weather === "rain" && r < 0.3) return pick(RAIN);
  if (ctx.weather === "snow" && r < 0.3) return pick(SNOW);
  if ((ctx.hour >= 1 && ctx.hour < 5) && r < 0.45) return pick(LATE);
  const base = ctx.tier >= 4 ? T4 : ctx.tier === 3 ? T3 : ctx.tier === 2 ? T2 : T1;
  return pick(base);
}
