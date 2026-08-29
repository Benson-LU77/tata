/**
 * The native vault — the iOS shell's own Documents folder, reached
 * through the Capacitor Vault plugin. Visible in the Files app,
 * carried by device backup; the same three verbs as every store.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { FileStore } from "./fs-bridge";
import { logDebug } from "../debuglog";

type VaultNative = {
  list(): Promise<{ names: string[] }>;
  read(args: { name: string }): Promise<{ exists: boolean; text?: string; mtime?: number }>;
  write(args: { name: string; text: string }): Promise<void>;
  /** open the system folder picker; rejects with PICK_CANCELLED */
  pickFolder(): Promise<{ name: string; path: string }>;
  folderStatus(): Promise<FolderStatus>;
  forgetFolder(): Promise<void>;
};

export type FolderStatus = {
  /** "folder" = a folder of the writer's own; "documents" = ours */
  mode: "folder" | "documents";
  /** a folder was chosen once and we cannot reach it right now */
  needsPick: boolean;
  /** what to call it on screen */
  name: string;
};

const Vault = registerPlugin<VaultNative>("Vault");

export function nativeAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Where the pages live, and whether we are locked out of it. A shell too
 * old to answer is treated as "our own Documents, all well" — the road it
 * has always walked.
 */
export async function folderStatus(): Promise<FolderStatus> {
  try {
    return await Vault.folderStatus();
  } catch {
    return { mode: "documents", needsPick: false, name: "" };
  }
}

/** the system picker; resolves null when the writer backs out */
export async function pickVaultFolder(): Promise<{ name: string } | null> {
  try {
    return await Vault.pickFolder();
  } catch (err) {
    logDebug("vault", `pick: ${String(err).slice(0, 60)}`);
    return null;
  }
}

export async function forgetVaultFolder(): Promise<void> {
  try {
    await Vault.forgetFolder();
  } catch {}
}

export function nativeStore(): FileStore {
  return {
    async list() {
      return (await Vault.list()).names;
    },
    async read(name) {
      const doc = await Vault.read({ name });
      if (!doc.exists || typeof doc.text !== "string") return null;
      return { text: doc.text, mtime: doc.mtime ?? 0 };
    },
    async write(name, text) {
      await Vault.write({ name, text });
    },
  };
}
