/**
 * The local bookcase — OPFS, the browser's own private file system.
 *
 * Zero setup, works in every modern browser: pages become real .md files
 * the moment you write, before you have connected anything. Later they
 * can move wholesale into a picked folder or an Obsidian vault.
 */

import type { FileStore } from "./fs-bridge";

type DirEntries = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};


const ROOT = "vault";

async function rootDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const opfs = await navigator.storage.getDirectory();
    return await opfs.getDirectoryHandle(ROOT, { create });
  } catch {
    return null;
  }
}

/** walk a relative path like "Journal/2026/x.md" down to its directory */
async function dirOf(
  base: FileSystemDirectoryHandle,
  name: string,
  create: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; leaf: string } | null> {
  const parts = name.split("/").filter(Boolean);
  const leaf = parts.pop();
  if (!leaf) return null;
  let dir = base;
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part, { create });
    } catch {
      return null;
    }
  }
  return { dir, leaf };
}

export function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

export function opfsStore(): FileStore {
  return {
    async list() {
      const base = await rootDir(true);
      if (!base) return [];
      const out: string[] = [];
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
        for await (const [name, handle] of (dir as DirEntries).entries()) {
          if (handle.kind === "file" && name.endsWith(".md")) {
            out.push(prefix + name);
          } else if (handle.kind === "directory" && depth > 0) {
            await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, depth - 1);
          }
        }
      };
      await walk(base, "", 3);
      return out.sort((a, b) => b.localeCompare(a));
    },

    async read(name) {
      const base = await rootDir(false);
      if (!base) return null;
      const at = await dirOf(base, name, false);
      if (!at) return null;
      try {
        const fh = await at.dir.getFileHandle(at.leaf);
        const file = await fh.getFile();
        return { text: await file.text(), mtime: file.lastModified };
      } catch (err) {
        // only a genuine "no such entry" is absence; every other failure
        // must travel as a throw so the guard refuses instead of replacing
        if ((err as DOMException)?.name === "NotFoundError") return null;
        throw err;
      }
    },

    async write(name, text) {
      const base = await rootDir(true);
      if (!base) throw new Error("opfs unavailable");
      const at = await dirOf(base, name, true);
      if (!at) throw new Error("bad path");
      const fh = await at.dir.getFileHandle(at.leaf, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    },
  };
}
