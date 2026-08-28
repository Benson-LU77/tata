/**
 * One guarded-write brain for every filesystem-backed bridge.
 *
 * OPFS and the File System Access API differ only in how bytes are read
 * and written — the careful part (never replace words that moved, shadow
 * before overwrite, report unverified landings) is written ONCE here and
 * tested once, over a four-method FileStore.
 */

import type { NoteDoc, WriteResult } from "../obsidian";
import type { VaultBridge } from "./types";
import { saveShadow } from "./shadow";
import { logDebug } from "../debuglog";

/** the whole surface a storage medium must offer */
export type FileStore = {
  list(): Promise<string[]>;
  /**
   * `null` means PROVABLY ABSENT — nothing is stored under this name.
   *
   * Anything else that stops a read must THROW, never return null. The
   * difference is the whole ballgame: an absent file may be written
   * freely, while a file that merely could not be read this second (an
   * iCloud page still downloading, a folder whose permission just
   * lapsed, a transient I/O error) may hold words that would be
   * silently destroyed. writeGuarded turns a throw into a refusal and
   * keeps the draft; it turns null into a green light.
   */
  read(name: string): Promise<{ text: string; mtime: number } | null>;
  write(name: string, text: string): Promise<void>;
};

export function buildFsBridge(store: FileStore): VaultBridge {
  async function readDoc(name: string): Promise<NoteDoc> {
    const got = await store.read(name);
    if (got === null) throw new Error("HTTP 404"); // the app's one "absent" signal
    return { content: got.text, mtime: got.mtime, tags: [] };
  }

  return {
    list: () => store.list(),
    readDoc,

    async read(name: string): Promise<string> {
      const got = await store.read(name);
      if (got === null) throw new Error("HTTP 404");
      return got.text;
    },

    async writeGuarded(
      name: string,
      content: string,
      baseMtime: number | null,
      baseContent?: string | null,
    ): Promise<WriteResult> {
      let remote: { text: string; mtime: number } | null;
      try {
        remote = await store.read(name);
      } catch (err) {
        logDebug("fs", `${name}: ${String(err).slice(0, 60)}`);
        return { ok: false, reason: "offline" };
      }
      if (remote && remote.text !== content) {
        // filesystem mtimes always exist, so the guard is simple: the file
        // must not have moved since we loaded it — same rule as the REST
        // road, minus the missing-mtime contortions
        if (baseMtime === null) {
          // a page we believe is new but that already holds words is
          // never ours to replace
          if (remote.text.trim() !== "" && remote.text !== (baseContent ?? "")) {
            return {
              ok: false,
              reason: "conflict",
              remote: { content: remote.text, mtime: remote.mtime, tags: [] },
            };
          }
        } else if (remote.mtime !== baseMtime) {
          return {
            ok: false,
            reason: "conflict",
            remote: { content: remote.text, mtime: remote.mtime, tags: [] },
          };
        }
        // about to replace real words: the old version parks in the shadows
        void saveShadow(name, remote.text, remote.mtime);
      }
      try {
        await store.write(name, content);
      } catch (err) {
        logDebug("fs", `write ${name}: ${String(err).slice(0, 60)}`);
        return { ok: false, reason: "offline" };
      }
      try {
        const after = await store.read(name);
        if (after === null || after.text !== content) {
          logDebug("fs", `${name}: unverified landing`);
          return { ok: true, mtime: after?.mtime ?? null, verified: false };
        }
        return { ok: true, mtime: after.mtime, verified: true };
      } catch {
        return { ok: true, mtime: null, verified: false };
      }
    },

    async writeOwn(name: string, content: string): Promise<void> {
      await store.write(name, content);
    },
  };
}
