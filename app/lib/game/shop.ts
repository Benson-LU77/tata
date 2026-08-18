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

import type { YouLook } from "../city/sprites/compose";
import { DEFAULT_LOOK } from "../city/sprites/compose";
import type { Bonds } from "./bonds";
import { mergeBonds } from "./bonds";
import type { Commission, Letter } from "./commissions";
import { mergeCommissions, mergeLetters } from "./commissions";

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

/** minimal client surface so this module never imports the network layer */
type VaultClient = {
  read(name: string): Promise<string>;
  write(name: string, content: string): Promise<void>;
};

const VAULT_FILE = "tata.json";

function mergeStates(a: GameState, b: GameState): GameState {
  const newer = a.updatedAt >= b.updatedAt ? a : b;
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
    stashed: newer.stashed ?? [], // arrangement is one decision, like the outfit
    placedAt: newer.placedAt ?? {},
    billboard: newer.billboard ?? null,
    name: newer.name ?? "",
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

const KEY = "__game__";
const DB_NAME = "yeyufm";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
    const remote = JSON.parse(await client.read(VAULT_FILE)) as Partial<GameState>;
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
      updatedAt: remote.updatedAt ?? 0,
    });
    void saveGameState(merged); // heal the local copy
    return merged;
  } catch {
    return local;
  }
}

export async function saveGameState(state: GameState, client?: VaultClient | null): Promise<void> {
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
  } catch {}
  if (client) {
    try {
      await client.write(VAULT_FILE, JSON.stringify(state));
    } catch {}
  }
}
