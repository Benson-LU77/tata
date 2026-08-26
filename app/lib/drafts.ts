/**
 * DraftJournal — the reliability layer for notes.
 * Every keystroke lands here first (IndexedDB, one record per file), so a
 * draft can never overwrite another and nothing is lost while offline.
 * Pushing to Obsidian is a separate, slower concern (see notes.tsx).
 */

// "yeyufm" is the app's original storage namespace. It stays for
// compatibility — renaming it would orphan every user's drafts,
// purchases and settings. It's an internal key, never shown anywhere.
const DB_NAME = "yeyufm";
const DB_VERSION = 2;
const LEGACY_DRAFT_KEY = "yeyufm.draft";

import { logDebug } from "./debuglog";

export type Draft = {
  file: string;
  content: string;
  seed: string;
  /** Obsidian mtime our edit is based on; null = file never read from vault. */
  baseMtime: number | null;
  updatedAt: number;
};

export type CachedMeta = {
  file: string;
  excerpt: string;
  mtime: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

/** The one connection to the app's IndexedDB. Everything shares it: a
 *  second, version-less connection (shop.ts used to open one per save
 *  and never close it) silently blocks the next schema upgrade — and a
 *  blocked open never rejects, so the drafts journal would hang forever
 *  and the notes panel with it. */
export function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    // Ask the browser to exempt our storage from eviction — Safari deletes
    // script-writeable storage after 7 days of inactivity otherwise.
    try {
      void navigator.storage?.persist?.();
    } catch {}
    dbPromise = new Promise((resolve, reject) => {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains("drafts")) {
          database.createObjectStore("drafts", { keyPath: "file" });
        }
        if (!database.objectStoreNames.contains("meta")) {
          database.createObjectStore("meta", { keyPath: "file" });
        }
        if (!database.objectStoreNames.contains("city")) {
          database.createObjectStore("city", { keyPath: "file" });
        }
      };
      req.onsuccess = () => {
        const database = req.result;
        // step aside for a newer schema instead of blocking it
        database.onversionchange = () => {
          database.close();
          dbPromise = null;
        };
        resolve(database);
      };
      req.onerror = () => reject(req.error);
      // a blocked open must fail loudly, never hang the callers
      req.onblocked = () => reject(new Error("indexeddb blocked"));
    });
    dbPromise = dbPromise.catch((error) => {
      dbPromise = null; // let the next caller try again
      throw error;
    });
  }
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = run(database.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export const drafts = {
  get: (file: string) =>
    tx<Draft | undefined>("drafts", "readonly", (s) => s.get(file)).catch(() => undefined),
  /** resolves FALSE when the journal could not keep the words — callers
   *  that would delete another copy must check, not assume */
  put: (draft: Draft) =>
    tx("drafts", "readwrite", (s) => s.put(draft)).then(
      () => true,
      (err) => {
        logDebug("draft", `put ${draft.file}: ${String(err).slice(0, 60)}`);
        return false;
      },
    ),
  remove: (file: string) =>
    tx("drafts", "readwrite", (s) => s.delete(file)).then(
      () => undefined,
      (err) => {
        logDebug("draft", `remove ${file}: ${String(err).slice(0, 60)}`);
        return undefined;
      },
    ),
  all: () => tx<Draft[]>("drafts", "readonly", (s) => s.getAll()).catch(() => [] as Draft[]),
};

export type CityRecord = {
  file: string;
  date: string;
  words: number;
  mtime: number;
};

export const cityCache = {
  all: () => tx<CityRecord[]>("city", "readonly", (s) => s.getAll()).catch(() => [] as CityRecord[]),
  put: (record: CityRecord) =>
    tx("city", "readwrite", (s) => s.put(record)).then(
      () => undefined,
      () => undefined,
    ),
  replaceAll: async (records: CityRecord[]) => {
    try {
      const database = await db();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("city", "readwrite");
        const store = transaction.objectStore("city");
        store.clear();
        for (const record of records) store.put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {}
  },
};

export const metaCache = {
  put: (meta: CachedMeta) =>
    tx("meta", "readwrite", (s) => s.put(meta)).then(
      () => undefined,
      () => undefined,
    ),
  all: () => tx<CachedMeta[]>("meta", "readonly", (s) => s.getAll()).catch(() => [] as CachedMeta[]),
};

/** One-time import of the old single-slot localStorage draft. */
export async function migrateLegacyDraft(fallbackName: () => string): Promise<void> {
  try {
    const raw = window.localStorage.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return;
    const old = JSON.parse(raw) as { file: string | null; content?: string; seed?: string };
    if (old.content && old.content.trim() !== (old.seed ?? "").trim()) {
      const kept = await drafts.put({
        file: old.file ?? fallbackName(),
        content: old.content,
        seed: old.seed ?? "",
        baseMtime: null,
        updatedAt: Date.now(),
      });
    }
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {}
}
