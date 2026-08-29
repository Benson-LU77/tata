/**
 * Shadow copies — the backup nobody has to think about.
 *
 * Every guarded write that REPLACES existing words first parks the old
 * version here (last 3 per file, on this device). Detection has a gap
 * between read and write; a backup does not. This is what turns "it was
 * overwritten" from a loss into an undo.
 */

import { db } from "../drafts";
import { logDebug } from "../debuglog";

export type Shadow = {
  id?: number;
  file: string;
  content: string;
  mtime: number | null;
  at: number;
};

const KEEP = 3;

export async function saveShadow(file: string, content: string, mtime: number | null): Promise<void> {
  if (content.trim() === "") return; // an empty page is not worth a shadow
  try {
    const database = await db();
    if (!database.objectStoreNames.contains("shadows")) return; // pre-v3 db
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("shadows", "readwrite");
      const store = tx.objectStore("shadows");
      store.add({ file, content, mtime, at: Date.now() } satisfies Shadow);
      // prune: keep only the newest KEEP for this file
      const idx = store.index("file");
      const req = idx.getAll(file);
      req.onsuccess = () => {
        const rows = (req.result as Shadow[]).sort((a, b) => b.at - a.at);
        for (const old of rows.slice(KEEP)) {
          if (old.id !== undefined) store.delete(old.id);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    logDebug("shadow", `${file}: ${String(err).slice(0, 60)}`);
  }
}

/**
 * Every shadow we hold, newest first. The export uses this: a safety net
 * with no way out of it is not a safety net, and a zip of files is the
 * plainest exit there is.
 */
export async function allShadows(): Promise<Shadow[]> {
  try {
    const database = await db();
    if (!database.objectStoreNames.contains("shadows")) return [];
    return await new Promise((resolve, reject) => {
      const req = database.transaction("shadows", "readonly").objectStore("shadows").getAll();
      req.onsuccess = () => resolve((req.result as Shadow[]).sort((a, b) => b.at - a.at));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function shadowsFor(file: string): Promise<Shadow[]> {
  try {
    const database = await db();
    if (!database.objectStoreNames.contains("shadows")) return [];
    return await new Promise((resolve, reject) => {
      const tx = database.transaction("shadows", "readonly");
      const req = tx.objectStore("shadows").index("file").getAll(file);
      req.onsuccess = () => resolve((req.result as Shadow[]).sort((a, b) => b.at - a.at));
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
