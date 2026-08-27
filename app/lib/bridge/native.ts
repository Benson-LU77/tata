/**
 * The native vault — the iOS shell's own Documents folder, reached
 * through the Capacitor Vault plugin. Visible in the Files app,
 * carried by device backup; the same three verbs as every store.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { FileStore } from "./fs-bridge";

type VaultNative = {
  list(): Promise<{ names: string[] }>;
  read(args: { name: string }): Promise<{ exists: boolean; text?: string; mtime?: number }>;
  write(args: { name: string; text: string }): Promise<void>;
};

const Vault = registerPlugin<VaultNative>("Vault");

export function nativeAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
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
