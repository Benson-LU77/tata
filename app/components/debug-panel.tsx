"use client";

/**
 * The last few things that went wrong, tucked at the foot of settings —
 * so "it broke" can arrive as a screenshot with the actual error on it,
 * or as one tap of the copy button.
 */

import { useState, useSyncExternalStore } from "react";
import { debugEntries, emptyEntries, onDebug } from "../lib/debuglog";

export function DebugPanel() {
  const entries = useSyncExternalStore(onDebug, debugEntries, emptyEntries);
  const [copied, setCopied] = useState(false);
  if (entries.length === 0) return null;
  return (
    <div className="debug-panel">
      <em>
        diagnostics
        <button
          type="button"
          className="debug-copy"
          onClick={() => {
            const text = entries.map((e) => `${e.at} [${e.tag}] ${e.msg}`).join("\n");
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "✓" : "⧉"}
        </button>
      </em>
      {entries.slice(-8).map((e, i) => (
        <code key={i}>
          {e.at} [{e.tag}] {e.msg}
        </code>
      ))}
    </div>
  );
}
