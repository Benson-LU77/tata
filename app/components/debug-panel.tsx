"use client";

/**
 * The last few things that went wrong, tucked at the foot of settings —
 * so "it broke" can arrive as a screenshot with the actual error on it.
 */

import { useSyncExternalStore } from "react";
import { debugEntries, emptyEntries, onDebug } from "../lib/debuglog";

export function DebugPanel() {
  const entries = useSyncExternalStore(onDebug, debugEntries, emptyEntries);
  if (entries.length === 0) return null;
  return (
    <div className="debug-panel">
      <em>diagnostics</em>
      {entries.slice(-8).map((e, i) => (
        <code key={i}>
          {e.at} [{e.tag}] {e.msg}
        </code>
      ))}
    </div>
  );
}
