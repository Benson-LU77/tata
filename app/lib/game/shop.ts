/**
 * The night depot — everything is earned with Watts, nothing costs money.
 * Bought things only ever change how the city looks or who lives there,
 * never what it records. Amber is not for sale and never will be.
 */

export type ShopItem = {
  id: string;
  name: string;
  line: string;
  cost: number;
  kind: "creature" | "decor" | "skin" | "weather";
  /** hidden until the skyline reaches this level */
  minLevel?: number;
};

export const CATALOG: ShopItem[] = [
  { id: "cats", name: "Alley cats", line: "Four more cats take the kerbs.", cost: 80, kind: "creature" },
  { id: "birds", name: "Courier ships", line: "Six more ships take the sky lanes.", cost: 90, kind: "creature" },
  { id: "dog", name: "A dog", line: "One good dog. It patrols.", cost: 140, kind: "creature" },
  { id: "lamps", name: "Street lamps", line: "Cold light at every corner.", cost: 120, kind: "decor" },
  { id: "trees", name: "Pocket groves", line: "Grey trees between the towers.", cost: 100, kind: "decor" },
  { id: "fountain", name: "Old fountain", line: "A plaza in your first month.", cost: 200, kind: "decor" },
  { id: "chalk", name: "Chalk district", line: "The city, one shade lighter.", cost: 250, kind: "skin" },
  { id: "ink", name: "Ink district", line: "The city, one shade deeper.", cost: 250, kind: "skin" },
  { id: "harbor", name: "The harbor", line: "A dock on the island's edge.", cost: 350, kind: "decor", minLevel: 3 },
  { id: "viaduct", name: "The viaduct", line: "A high road between months.", cost: 650, kind: "decor", minLevel: 6 },
  { id: "observatory", name: "The observatory", line: "A dome watching the galaxy.", cost: 1000, kind: "decor", minLevel: 10 },
  { id: "sister", name: "Sister planet", line: "A pale neighbour, far out.", cost: 300, kind: "decor" },
  { id: "comet", name: "Periodic comet", line: "It keeps its appointments.", cost: 250, kind: "decor" },
  { id: "rain", name: "Night rain", line: "Thin rain over the rooftops.", cost: 150, kind: "weather" },
  { id: "snow", name: "First snow", line: "Slow flakes, soft streets.", cost: 150, kind: "weather" },
  { id: "fog", name: "Sea fog", line: "The far blocks half-dissolve.", cost: 120, kind: "weather" },
];

export type Weather = "none" | "rain" | "snow" | "fog";

import { logDebug } from "../debuglog";
import type { YouLook } from "../city/sprites/compose";
import { DEFAULT_LOOK } from "../city/sprites/compose";
import type { Bonds, Talk } from "./bonds";
import { mergeBonds, mergeTalk } from "./bonds";
import type { Commission, Letter } from "./commissions";
import { mergeCommissions, mergeLetters } from "./commissions";
import { db as sharedDb } from "../drafts";

export type GameState = {
  spent: number;
  owned: string[];
  skin: "base" | "chalk" | "ink";
  weather: Weather;
  /** your figure in the Mirror — one coherent choice, last write wins */
  look: YouLook;
  /** who you know, keyed by stable creature key */
  bonds: Bonds;
  /** highest Watts total ever derived — deleting notes never shrinks the city */
  earnedFloor: number;
  /** public works ordered with Watts, built on real time */
  commissions: Commission[];
  /** letters from caretakers — stored here, never written to the vault */
  letters: Letter[];
  /** owned decor put away in the pocket — not shown, never lost */
  stashed: string[];
  /** landmarks the owner re-homed: id → calendar cell of a month block */
  placedAt: Record<string, { month: string; col: number; row: number }>;
  /** the noticeboard: one sentence, pinned from a note, standing in the city */
  billboard: { text: string; date: string } | null;
  /** what the residents call you — empty means "the one who writes" */
  name: string;
  /** short-term conversation state: cooldowns and your last replies */
  talk?: Talk;
  updatedAt: number;
};

export const EMPTY_STATE: GameState = {
  spent: 0,
  owned: [],
  skin: "base",
  weather: "none",
  look: DEFAULT_LOOK,
  bonds: {},
  earnedFloor: 0,
  commissions: [],
  letters: [],
  stashed: [],
  placedAt: {},
  billboard: null,
  name: "",
  updatedAt: 0,
};

/**
 * The showcase save: a lived-in city for the demo — full registry,
 * furnished streets, one public work standing, a sentence on the board.
 * It exists in memory only and is NEVER persisted: the demo may spend,
 * greet and redecorate freely without touching a real save.
 */
export function demoGameState(now: number): GameState {
  const DAY = 86400000;
  const d = (n: number) => {
    const t = new Date(now - n * DAY);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const bonds: GameState["bonds"] = {};
  // twelve neighbours across every tier: family down to just-met
  [24, 18, 14, 11, 9, 7, 5, 4, 3, 2, 1, 1].forEach((n, i) => {
    bonds[`person:${i}`] = { n, met: d(n + 3), last: d(i % 3) };
  });
  bonds["cat:0"] = { n: 6, met: d(12), last: d(1) };
  bonds["dog:0"] = { n: 4, met: d(8), last: d(2) };
  return {
    ...EMPTY_STATE,
    owned: ["cats", "birds", "dog", "lamps", "trees", "fountain", "harbor", "viaduct", "observatory", "sister", "comet"],
    look: { hat: "hat.tophat", hair: "hair.short", acc: "acc.none", tone: 2 },
    bonds,
    commissions: ["library", "greenhouse", "teahouse", "belltower", "skybridge", "planetarium"].map(
      (id, i) => ({
        id,
        block: i % 2,
        placedAt: now - (30 - i * 2) * DAY,
        completedAt: now - (20 - i * 2) * DAY,
        rewardClaimed: true,
      }),
    ),
    billboard: { text: "今晚也有人在寫。", date: d(0) },
    updatedAt: now,
  };
}

/** minimal client surface so this module never imports the network layer */
type VaultClient = {
  read(name: string): Promise<string>;
  /** tata.json only — pages you wrote never travel this way */
  writeOwn(name: string, content: string): Promise<void>;
};

const VAULT_FILE = "tata.json";

/** Nothing beats something: an emptier value never wins a merge. The
 *  whole-record timestamp is too coarse for these — reading a letter on
 *  one device would otherwise erase a name typed on another. */
function keep<T>(newer: T, older: T, weight: (v: T) => number): T {
  return weight(newer) >= weight(older) ? newer : older;
}
const len = (v: string | null | undefined) => (v ?? "").length;
const count = (v: unknown[] | null | undefined) => (v ?? []).length;
const keys = (v: object | null | undefined) => Object.keys(v ?? {}).length;

function mergeStates(a: GameState, b: GameState): GameState {
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  const older = newer === a ? b : a;
  return {
    spent: Math.max(a.spent, b.spent),
    owned: [...new Set([...a.owned, ...b.owned])],
    skin: newer.skin,
    weather: newer.weather,
    look: newer.look, // an outfit is one decision, not a union of parts
    bonds: mergeBonds(a.bonds, b.bonds),
    earnedFloor: Math.max(a.earnedFloor ?? 0, b.earnedFloor ?? 0),
    commissions: mergeCommissions(a.commissions, b.commissions),
    letters: mergeLetters(a.letters, b.letters),
    stashed: keep(newer.stashed ?? [], older.stashed ?? [], count),
    placedAt: keep(newer.placedAt ?? {}, older.placedAt ?? {}, keys),
    billboard: keep(newer.billboard ?? null, older.billboard ?? null, (v) => len(v?.text)),
    name: keep(newer.name ?? "", older.name ?? "", len),
    talk: mergeTalk(a.talk, b.talk),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

/**
 * Should this state go to the vault, and as what? Pure so the rule is
 * testable: an unreadable or unparsable tata.json must never be
 * replaced — the save it holds is as irreplaceable as the notes.
 */
export type VaultDecision =
  | { action: "write"; state: GameState }
  | { action: "skip"; why: "unloaded" | "unreadable" | "corrupt" };

export function decideVaultWrite(
  state: GameState,
  remoteRaw: string | null,
  opts: { loaded: boolean; readFailed: boolean },
): VaultDecision {
  // we never loaded the vault copy: writing now would broadcast a blank
  // local state over a good save (cleared browser, Obsidian opened late)
  if (!opts.loaded) return { action: "skip", why: "unloaded" };
  if (opts.readFailed) return { action: "skip", why: "unreadable" };
  if (remoteRaw === null) return { action: "write", state }; // genuinely absent
  let remote: Partial<GameState>;
  try {
    remote = JSON.parse(remoteRaw) as Partial<GameState>;
  } catch {
    return { action: "skip", why: "corrupt" }; // half-written file: leave it
  }
  {
    // ALWAYS fold the remote copy in. Gating the merge on "remote newer"
    // meant it almost never ran — every local action bumps updatedAt, so
    // a second tab or device was silently overwritten wholesale.
    return {
      action: "write",
      state: mergeStates(state, {
        spent: remote.spent ?? 0,
        owned: remote.owned ?? [],
        skin: remote.skin ?? "base",
        weather: remote.weather ?? "none",
        look: remote.look ?? DEFAULT_LOOK,
        bonds: remote.bonds ?? {},
        earnedFloor: remote.earnedFloor ?? 0,
        commissions: remote.commissions ?? [],
        letters: remote.letters ?? [],
        stashed: remote.stashed ?? [],
        placedAt: remote.placedAt ?? {},
        billboard: remote.billboard ?? null,
        name: remote.name ?? "",
      talk: remote.talk,
        updatedAt: remote.updatedAt ?? 0,
      }),
    };
  }
}

/** the vault copy has been read (or confirmed absent) at least once */
let vaultLoaded = false;

const KEY = "__game__";

/** share the drafts journal's connection — see the note on db() */
const openDb = () => sharedDb();

async function loadLocalState(): Promise<GameState> {
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains("meta")) return EMPTY_STATE;
    return await new Promise((resolve) => {
      const req = db.transaction("meta", "readonly").objectStore("meta").get(KEY);
      req.onsuccess = () => {
        const raw = req.result as (Partial<GameState> & { file: string }) | undefined;
        resolve(
          raw
            ? {
                spent: raw.spent ?? 0,
                owned: raw.owned ?? [],
                skin: raw.skin ?? "base",
                weather: raw.weather ?? "none",
                look: raw.look ?? DEFAULT_LOOK,
                bonds: raw.bonds ?? {},
                earnedFloor: raw.earnedFloor ?? 0,
                commissions: raw.commissions ?? [],
                letters: raw.letters ?? [],
                stashed: raw.stashed ?? [],
                placedAt: raw.placedAt ?? {},
                billboard: raw.billboard ?? null,
                name: raw.name ?? "",
                talk: raw.talk,
                updatedAt: raw.updatedAt ?? 0,
              }
            : EMPTY_STATE,
        );
      };
      req.onerror = () => resolve(EMPTY_STATE);
    });
  } catch {
    return EMPTY_STATE;
  }
}

/**
 * Load, merging the vault copy when a client is given — so a cleared browser
 * (Safari evicts after 7 idle days) never loses what you own.
 */
export async function loadGameState(client?: VaultClient | null): Promise<GameState> {
  const local = await loadLocalState();
  if (!client) return local;
  try {
    const raw = await client.read(VAULT_FILE);
    vaultLoaded = true; // we have seen the vault's copy: writing is safe now
    const remote = JSON.parse(raw) as Partial<GameState>;
    const merged = mergeStates(local, {
      spent: remote.spent ?? 0,
      owned: remote.owned ?? [],
      skin: remote.skin ?? "base",
      weather: remote.weather ?? "none",
      look: remote.look ?? DEFAULT_LOOK,
      bonds: remote.bonds ?? {},
      earnedFloor: remote.earnedFloor ?? 0,
      commissions: remote.commissions ?? [],
      letters: remote.letters ?? [],
      stashed: remote.stashed ?? [],
      placedAt: remote.placedAt ?? {},
      billboard: remote.billboard ?? null,
      name: remote.name ?? "",
      talk: remote.talk,
      updatedAt: remote.updatedAt ?? 0,
    });
    void saveGameState(merged); // heal the local copy
    return merged;
  } catch (error) {
    // a real 404 means there is no save to lose; anything else leaves the
    // gate shut so a blank local state cannot broadcast over a good file
    if (error instanceof Error && error.message === "HTTP 404") vaultLoaded = true;
    return local;
  }
}

const BOOT_CACHE_KEY = "tata.game.cache";

/** the last saved state, synchronously — so the first frame already
 *  wears your outfit instead of flashing the default look while
 *  IndexedDB and the vault wake up */
export function cachedGameState(): GameState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = JSON.parse(window.localStorage.getItem(BOOT_CACHE_KEY) ?? "") as Partial<GameState>;
    return {
      spent: raw.spent ?? 0,
      owned: raw.owned ?? [],
      skin: raw.skin ?? "base",
      weather: raw.weather ?? "none",
      look: raw.look ?? DEFAULT_LOOK,
      bonds: raw.bonds ?? {},
      earnedFloor: raw.earnedFloor ?? 0,
      commissions: raw.commissions ?? [],
      letters: raw.letters ?? [],
      stashed: raw.stashed ?? [],
      placedAt: raw.placedAt ?? {},
      billboard: raw.billboard ?? null,
      name: raw.name ?? "",
      talk: raw.talk,
      updatedAt: raw.updatedAt ?? 0,
    };
  } catch {
    return EMPTY_STATE;
  }
}

export async function saveGameState(state: GameState, client?: VaultClient | null): Promise<void> {
  try {
    window.localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or full disk — the async stores still have it */
  }
  // demo cities are stage sets: they must never write over a real save —
  // demo skips LOADING state, so persisting would clobber it (and inflate
  // the monotonic earnedFloor beyond repair)
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("demo")) return;
  try {
    const db = await openDb();
    if (db.objectStoreNames.contains("meta")) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ file: KEY, ...state });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch (err) {
    logDebug("save", `local: ${String(err).slice(0, 60)}`);
  }
  if (client) {
    let raw: string | null = null;
    let readFailed = false;
    try {
      raw = await client.read(VAULT_FILE);
    } catch (error) {
      if (error instanceof Error && error.message === "HTTP 404") raw = null;
      else readFailed = true;
    }
    const decision = decideVaultWrite(state, raw, { loaded: vaultLoaded, readFailed });
    if (decision.action !== "write") return;
    try {
      await client.writeOwn(VAULT_FILE, JSON.stringify(decision.state));
    } catch (err) {
      logDebug("save", `tata.json: ${String(err).slice(0, 60)}`);
    }
  }
}
