/**
 * A vault bridge is any way for the city to reach a folder of .md files.
 * Three kinds exist: the Obsidian REST plugin (the original road), a real
 * folder via the File System Access API (Chromium), and the browser's own
 * private file system (OPFS) — the zero-setup local bookcase.
 *
 * The interface is exactly what the app already consumed from
 * ObsidianClient, so the REST client satisfies it structurally.
 */

import type { NoteDoc, WriteResult } from "../obsidian";

export type BridgeKind = "rest" | "fsapi" | "opfs" | "native";

export type VaultBridge = {
  list(): Promise<string[]>;
  readDoc(name: string): Promise<NoteDoc>;
  read(name: string): Promise<string>;
  writeGuarded(
    name: string,
    content: string,
    baseMtime: number | null,
    baseContent?: string | null,
  ): Promise<WriteResult>;
  /** tata.json only — pages you wrote never travel this way */
  writeOwn(name: string, content: string): Promise<void>;
  /** full-text search — REST only today; absent bridges fall back */
  search?(q: string, signal?: AbortSignal): Promise<{ name: string; snippet: string }[]>;
  /** open the note in the Obsidian app — REST only */
  openInObsidian?(name: string): Promise<void>;
  /** cheap liveness probe */
  health?(): Promise<{ ok: boolean; authenticated: boolean }>;
};

/** which road the words travel; stored per-browser */
export const BRIDGE_MODE_KEY = "tata.bridge";

export function loadBridgeMode(): BridgeKind | null {
  try {
    const raw = window.localStorage.getItem(BRIDGE_MODE_KEY);
    if (raw === "rest" || raw === "fsapi" || raw === "opfs" || raw === "native") return raw;
    return null;
  } catch {
    return null;
  }
}

export function saveBridgeMode(mode: BridgeKind) {
  try {
    window.localStorage.setItem(BRIDGE_MODE_KEY, mode);
  } catch {}
}
