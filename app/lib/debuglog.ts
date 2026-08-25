/**
 * A tiny ring of the last things that went wrong — so a screenshot of
 * the settings panel can carry the real error to whoever is debugging.
 * Nothing leaves the device.
 */

export type LogEntry = { at: string; tag: string; msg: string };

const RING: LogEntry[] = [];
const MAX = 20;
const listeners = new Set<() => void>();
/* useSyncExternalStore needs a STABLE snapshot between changes */
let snapshot: LogEntry[] = RING.slice();
const EMPTY: LogEntry[] = [];

export function logDebug(tag: string, msg: string) {
  const at = new Date().toTimeString().slice(0, 8);
  RING.push({ at, tag, msg: msg.slice(0, 200) });
  if (RING.length > MAX) RING.shift();
  snapshot = RING.slice();
  for (const fn of listeners) fn();
}

export function debugEntries(): LogEntry[] {
  return snapshot;
}

export function emptyEntries(): LogEntry[] {
  return EMPTY;
}

export function onDebug(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* global nets — anything uncaught lands in the ring too */
if (typeof window !== "undefined" && !(window as { __tataLog?: unknown }).__tataLog) {
  (window as { __tataLog?: unknown }).__tataLog = logDebug; // one instance, reachable for field debugging
  window.addEventListener("error", (e) => {
    logDebug("error", `${e.message} @${(e.filename ?? "").split("/").pop()}:${e.lineno}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    logDebug("promise", String(e.reason).slice(0, 200));
  });
}
