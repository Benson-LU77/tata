/**
 * The bridge factory: which road do the words travel today?
 *
 *   rest  — the Obsidian Local REST API plugin (the original road)
 *   fsapi — a real folder the user picked (Chromium desktop)
 *   opfs  — the browser's own bookcase (zero setup, every browser)
 *
 * Mode is chosen once and remembered; when nothing was ever chosen the
 * resolution is: a saved REST key → rest; a saved folder handle → fsapi;
 * otherwise the bookcase, so a brand-new visitor can simply write.
 */

import { ObsidianClient, loadConfig } from "../obsidian";
import type { VaultBridge, BridgeKind } from "./types";
import { loadBridgeMode } from "./types";
import { buildFsBridge } from "./fs-bridge";
import { opfsAvailable, opfsStore } from "./opfs";
import { fsapiAvailable, loadHandle, ensurePermission, fsapiStore } from "./fsapi";
import { nativeAvailable, nativeStore } from "./native";

export type ResolvedBridge = {
  mode: BridgeKind;
  bridge: VaultBridge | null;
  /** fsapi only: a stored folder exists but the browser wants a click
   *  before it re-grants access */
  needsPermission?: boolean;
};

export async function resolveBridge(): Promise<ResolvedBridge> {
  /* inside the iOS shell there is exactly one road: the app's own
     Documents folder. No chooser, no fallbacks. */
  if (nativeAvailable()) {
    return { mode: "native", bridge: buildFsBridge(nativeStore()) };
  }
  const chosen = loadBridgeMode();

  if (chosen === "fsapi" || (!chosen && fsapiAvailable())) {
    const handle = await loadHandle();
    if (handle) {
      if (await ensurePermission(handle, false)) {
        return { mode: "fsapi", bridge: buildFsBridge(fsapiStore(handle)) };
      }
      return { mode: "fsapi", bridge: null, needsPermission: true };
    }
    if (chosen === "fsapi") return { mode: "fsapi", bridge: null };
  }

  const config = loadConfig();
  if (chosen === "rest" || (!chosen && config)) {
    return { mode: "rest", bridge: config ? new ObsidianClient(config) : null };
  }

  if (opfsAvailable()) {
    return { mode: "opfs", bridge: buildFsBridge(opfsStore()) };
  }
  return { mode: chosen ?? "rest", bridge: null };
}

/** fsapi re-grant, from a user gesture: returns the live bridge */
export async function regrantFolder(): Promise<VaultBridge | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  if (!(await ensurePermission(handle, true))) return null;
  return buildFsBridge(fsapiStore(handle));
}
