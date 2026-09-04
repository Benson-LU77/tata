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
import { hash32 } from "../city/layout";
import { LINES, FIRST_MEET_LINES, CAT_LINE_DEFS, DOG_LINE_DEFS, TRADE_LINES, MEMORY_LINES, VOICE_LINES, CALLBACK_LINES, ECHO_LINES, BENCH_LINES } from "./bonds-lines";
import { ANSWERS } from "./bonds-answers";

export type Bond = {
  /** days greeted (one per calendar day at most) */
  n: number;
  /** first-met day, YYYY-MM-DD */
  met: string;
  /** last greeted day — gates the once-per-day increment */
  last: string;
  /** what you two talked about last time — they bring it up again */
  t?: Topic;
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
    ? {
        n: prev.n + 1,
        met: prev.met,
        last: today,
        ...(prev.t !== undefined && { t: prev.t }),
      }
    : { n: 1, met: today, last: today };
  return { ...bonds, [key]: next };
}

/** note what tonight's talk was about — next meeting starts from here */
export function remember(bonds: Bonds, key: string, topic: Topic): Bonds {
  const prev = bonds[key];
  if (!prev || prev.t === topic) return bonds;
  return { ...bonds, [key]: { ...prev, t: topic } };
}

export function mergeBonds(a: Bonds | undefined, b: Bonds | undefined): Bonds {
  const out: Bonds = { ...(a ?? {}) };
  for (const [key, bb] of Object.entries(b ?? {})) {
    const aa = out[key];
    if (!aa) {
      out[key] = bb;
      continue;
    }
    const merged: Bond = {
      // max, not sum — the same day greeted on two devices is one day
      n: Math.max(aa.n, bb.n),
      met: aa.met && bb.met ? (aa.met < bb.met ? aa.met : bb.met) : aa.met || bb.met,
      last: aa.last > bb.last ? aa.last : bb.last,
    };
    // the memory follows the most recent conversation; a same-day tie
    // breaks deterministically (lexicographic) so merging commutes
    const t =
      aa.last > bb.last
        ? (aa.t ?? bb.t)
        : bb.last > aa.last
          ? (bb.t ?? aa.t)
          : aa.t !== undefined && bb.t !== undefined
            ? (aa.t < bb.t ? aa.t : bb.t)
            : (aa.t ?? bb.t);
    if (t !== undefined) merged.t = t;
    out[key] = merged;
  }
  return out;
}

/* ------------- talk — short-term conversation state ------------------ */

/**
 * What was said and what you answered. Separate from Bonds on purpose:
 * a Bond is the non-decaying friendship ledger; Talk is the week's
 * conversational surface. Merging is commutative and monotone — `said`
 * unions with the newer date winning, `replies` keeps the newer event
 * (same-moment ties break on the id, deterministically).
 */
export type Talk = {
  /** line id → the date it was last spoken, by anyone */
  said: Record<string, string>;
  /** per-resident: the last reply you actually chose */
  replies: Record<string, { id: string; topic: Topic; at: string }>;
};

export const EMPTY_TALK: Talk = { said: {}, replies: {} };

/** a line's stable id — the hash of its EN text. Editing a line resets
 *  its cooldown, which is harmless; nobody hand-maintains 328 ids. */
export function lineId(en: string): string {
  return (hash32(en) >>> 0).toString(36);
}

export function mergeTalk(a?: Talk, b?: Talk): Talk {
  const said: Record<string, string> = { ...(a?.said ?? {}) };
  for (const [k, d] of Object.entries(b?.said ?? {})) {
    said[k] = said[k] !== undefined && said[k] > d ? said[k] : d;
  }
  const replies: Talk["replies"] = { ...(a?.replies ?? {}) };
  for (const [k, r] of Object.entries(b?.replies ?? {})) {
    const cur = replies[k];
    replies[k] = !cur
      ? r
      : r.at !== cur.at
        ? (r.at > cur.at ? r : cur)
        : r.id < cur.id
          ? r
          : cur;
  }
  return { said, replies };
}

/** note tonight's line was spoken; entries older than 30 days retire.
 *  (Pruned copies may resurrect via merge — harmless, it only cools.) */
export function markSaid(talk: Talk | undefined, id: string, today: string): Talk {
  const cutoff = (() => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const said: Record<string, string> = {};
  for (const [k, v] of Object.entries(talk?.said ?? {})) if (v >= cutoff) said[k] = v;
  said[id] = today;
  return { said, replies: { ...(talk?.replies ?? {}) } };
}

/* ---------------- the errand: an event, not a script ---------------- */

/** the ledger key for tonight's ask / thanks. ONE place — so the spoken
 *  line and the question mark can never disagree about what was said */
export function errandId(orderId: string, phase: "ask" | "thanks"): string {
  return `q:${orderId}:${phase}`;
}

/** has this phase of the errand already been spoken today? */
export function errandSaid(
  talk: Talk | undefined,
  orderId: string,
  phase: "ask" | "thanks",
  today: string,
): boolean {
  return talk?.said?.[errandId(orderId, phase)] === today;
}

/** the mark over the giver's head is an invitation, spent once accepted:
 *  down when the errand is done, and down once the ask has been heard.
 *  It is not a progress bar — the board in the depot is. */
export function errandMark(
  quest: { key: string; orderId: string; done: boolean } | null,
  talk: Talk | undefined,
  today: string,
): { key: string; done: boolean } | null {
  if (!quest) return null;
  return { key: quest.key, done: quest.done || errandSaid(talk, quest.orderId, "ask", today) };
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
  /** what THIS resident talked about with you last time */
  lastTopic?: Topic;
  /** a short line quoted from one of this week's pages */
  echo?: string;
  /** the bench exists now — the city's oldest joke came true */
  bench?: boolean;
  /** line id → date last spoken (cooldowns and milestones) */
  said?: Record<string, string>;
  /** today, YYYY-MM-DD — anchors the cooldown window */
  today?: string;
  /** your last actually-chosen reply to THIS resident */
  lastReply?: { id: string; topic: Topic; daysAgo: number };
};

/**
 * What a line is *about*. The reply you are offered answers the topic
 * that was just raised — a conversation, not two monologues.
 *   night   · the hour, the quiet, the stars (the default small talk)
 *   city    · the streets, the towers, the lamps, the growing
 *   writing · your pages, your streak, the lit windows
 *   weather · rain, snow, fog
 *   you     · you personally — your colour, your name, being noticed
 *   them    · themselves: their trade, their memory, their life
 */
export type Topic = "night" | "city" | "writing" | "weather" | "you" | "them" | "quest";

export type LineDef = {
  /** minimum tier (default 1); firstMeet lines use tier 0 */
  tier?: Tier;
  /** retire above this tier — family stops hearing stranger warnings */
  maxTier?: Tier;
  /** a milestone: said once, ever, by anyone */
  once?: boolean;
  /** EN text of the reply this line calls back to — only offered if the
   *  player actually chose that reply last time */
  afterReply?: string;
  /** what this line is about — steers which replies you are offered */
  topic?: Topic;
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
    .replace(/\{name\}/g, ctx.name ?? "")
    .replace(/\{echo\}/g, ctx.echo ?? "");
}

/** a reply written for ONE opener, with closers answering that reply */
export type AnswerDef = {
  tier?: Tier;
  reply: { en: string; zh: string };
  closers: { en: string; zh: string; profession?: string }[];
};

/** the line they say, and what it was about — the reply answers the topic */
export type SpokenLine = {
  text: string;
  topic?: Topic;
  id?: string;
  callback?: boolean;
  /** bespoke replies for this exact line, when the script has them */
  answers?: AnswerDef[];
};

export function lineFor(ctx: LineCtx, roll: number, lang: "en" | "zh" = "en"): SpokenLine {
  const table =
    ctx.kind === "cat"
      ? CAT_LINE_DEFS
      : ctx.kind === "dog"
        ? DOG_LINE_DEFS
        : ctx.firstMeet
          ? FIRST_MEET_LINES
          : [...LINES, ...TRADE_LINES, ...MEMORY_LINES, ...VOICE_LINES, ...CALLBACK_LINES, ...ECHO_LINES, ...BENCH_LINES];
  const cool = (() => {
    if (!ctx.today) return "";
    const d = new Date(ctx.today + "T00:00:00");
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const eligible = table.filter((l) => {
    if ((l.tier ?? 0) > ctx.tier) return false;
    if (l.maxTier !== undefined && ctx.tier > l.maxTier) return false;
    if (l.once && ctx.said?.[lineId(l.en)] !== undefined) return false;
    if (l.afterReply !== undefined && ctx.lastReply?.id !== lineId(l.afterReply)) return false;
    if (l.when && !l.when(ctx)) return false;
    return true;
  });
  if (eligible.length === 0) return { text: lang === "zh" ? "……" : "..." };
  const speak = (l: LineDef): SpokenLine => ({
    text: fill(lang === "zh" ? l.zh : l.en, ctx),
    topic: l.topic,
    id: lineId(l.en),
    callback: l.afterReply !== undefined || CALLBACK_LINES.includes(l),
    answers: ANSWERS[l.en],
  });
  // a memory outranks everything: if they can call back to your last
  // real reply, they do — the callback is consumed after it's spoken
  const callbacks = eligible.filter((l) => l.afterReply !== undefined || CALLBACK_LINES.includes(l));
  const pool = callbacks.length > 0 ? callbacks : eligible;
  // weighted pick: situational lines outweigh small talk, and anything
  // said in the last 7 days cools to a whisper of its weight
  const w = (l: LineDef) => {
    const base = l.weight ?? (l.when ? 3 : 1);
    const saidOn = ctx.said?.[lineId(l.en)];
    return saidOn !== undefined && saidOn >= cool ? base * 0.15 : base;
  };
  const total = pool.reduce((s2, l) => s2 + w(l), 0);
  let at = (Math.abs(roll * 7919) % 1) * total;
  for (const l of pool) {
    at -= w(l);
    if (at <= 0) return speak(l);
  }
  return speak(pool[pool.length - 1]);
}
