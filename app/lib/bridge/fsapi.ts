/**
 * The picked folder — File System Access API (Chromium desktop).
 *
 * The user points at a real directory (their Obsidian vault, if they
 * like) and pages read and write straight to disk: no plugin, no key,
 * no HTTP. The handle persists in IndexedDB; permission is re-asked
 * with one click when the browser forgets.
 */

import type { FileStore } from "./fs-bridge";

type DirEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

import { db } from "../drafts";
import { logDebug } from "../debuglog";

type DirPicker = (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?(d: { mode: string }): Promise<PermissionState>;
  requestPermission?(d: { mode: string }): Promise<PermissionState>;
};

const HANDLE_KEY = "__fsapi_dir__";

export function fsapiAvailable(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const database = await db();
  if (!database.objectStoreNames.contains("meta")) return;
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ file: HANDLE_KEY, handle });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const database = await db();
    if (!database.objectStoreNames.contains("meta")) return null;
    return await new Promise((resolve) => {
      const req = database.transaction("meta", "readonly").objectStore("meta").get(HANDLE_KEY);
      req.onsuccess = () =>
        resolve((req.result as { handle?: FileSystemDirectoryHandle } | undefined)?.handle ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function forgetHandle(): Promise<void> {
  try {
    const database = await db();
    await new Promise<void>((resolve) => {
      const tx = database.transaction("meta", "readwrite");
      tx.objectStore("meta").delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

/** ask the user to pick the folder; stores the handle for next time */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const picker = (window as unknown as { showDirectoryPicker: DirPicker }).showDirectoryPicker;
    const handle = await picker.call(window, { mode: "readwrite" });
    await saveHandle(handle);
    return handle;
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") logDebug("fsapi", String(err).slice(0, 60));
    return null; // user cancelled
  }
}

/** true when the stored handle is usable (asks the browser if needed) */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  ask: boolean,
): Promise<boolean> {
  const h = handle as PermHandle;
  try {
    const state = (await h.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (state === "granted") return true;
    if (!ask) return false;
    return (await h.requestPermission?.({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

export function fsapiStore(handle: FileSystemDirectoryHandle): FileStore {
  const dirOf = async (name: string, create: boolean) => {
    const parts = name.split("/").filter(Boolean);
    const leaf = parts.pop();
    if (!leaf) return null;
    let dir = handle;
    for (const part of parts) {
      try {
        dir = await dir.getDirectoryHandle(part, { create });
      } catch {
        return null;
      }
    }
    return { dir, leaf };
  };

  return {
    async list() {
      const out: string[] = [];
      const SKIP = /^(\.|node_modules$)/; // .obsidian, .git, .trash …
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
        for await (const [name, entry] of (dir as DirEntries).entries()) {
          if (SKIP.test(name)) continue;
          if (entry.kind === "file" && name.endsWith(".md")) {
            out.push(prefix + name);
          } else if (entry.kind === "directory" && depth > 0) {
            await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, depth - 1);
          }
        }
      };
      await walk(handle, "", 3);
      return out.sort((a, b) => b.localeCompare(a));
    },

    async read(name) {
      const at = await dirOf(name, false);
      if (!at) return null;
      try {
        const fh = await at.dir.getFileHandle(at.leaf);
        const file = await fh.getFile();
        return { text: await file.text(), mtime: file.lastModified };
      } catch {
        return null;
      }
    },

    async write(name, text) {
      const at = await dirOf(name, true);
      if (!at) throw new Error("bad path");
      const fh = await at.dir.getFileHandle(at.leaf, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    },
  };
}
