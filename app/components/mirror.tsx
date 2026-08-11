"use client";

/**
 * The Mirror — where you decide how the amber figure walks its city.
 * A draft look previews live on a small canvas (composed exactly like the
 * atlas, amber remap and all); nothing changes outside until "Wear it".
 * Silhouettes (hats, hair, accessories) can cost Watts; the amber tone
 * itself is free forever — amber is not for sale, in any direction.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { PARTS, type PartSlot } from "../lib/city/sprites/parts";
import { composeYou, type YouLook } from "../lib/city/sprites/compose";
import { PALETTE } from "../lib/city/palette";

/** preview colours — the shader's amber remap, reproduced in CSS space */
const GREY = [PALETTE.v0, PALETTE.v1, PALETTE.v2, PALETTE.v3, PALETTE.v4, PALETTE.v5, PALETTE.v6, PALETTE.v7];
function pixelColor(ch: string): string | null {
  if (ch === ".") return null;
  const i = ch.charCodeAt(0) - 48;
  if (i <= 1) return GREY[i];
  if (i <= 3) return "#8a6c3c";
  if (i <= 5) return "#be9050";
  if (i === 6) return PALETTE.amber;
  return "#ffcd82";
}

const SLOTS: { slot: PartSlot; title: string }[] = [
  { slot: "hat", title: "Hat" },
  { slot: "hair", title: "Hair" },
  { slot: "acc", title: "Extra" },
];

export function MirrorPanel({
  open,
  look,
  owned,
  watts,
  onClose,
  onUnlock,
  onWear,
}: {
  open: boolean;
  look: YouLook;
  owned: string[];
  watts: number;
  onClose: () => void;
  onUnlock: (id: string, cost: number) => void;
  onWear: (look: YouLook) => void;
}) {
  const [draft, setDraft] = useState<YouLook>(look);
  // reset the draft each time the Mirror opens (setState-during-render
  // is React's endorsed pattern for derived resets — no effect cascade)
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(look);
  }

  const frames = useMemo(() => {
    const all = composeYou(draft);
    return [all.you_S_i, all.you_S_a, all.you_S_i, all.you_S_b];
  }, [draft]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!open) return;
    let fi = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const rows = frames[fi % frames.length];
      const sc = canvas.width / 8;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          const c = pixelColor(row[x]);
          if (!c) continue;
          ctx.fillStyle = c;
          ctx.fillRect(x * sc, y * sc, sc, sc);
        }
      });
      fi += 1;
    };
    draw();
    const id = window.setInterval(draw, 420);
    return () => window.clearInterval(id);
  }, [open, frames]);

  const isOwned = (id: string, cost: number) => cost === 0 || owned.includes(id);
  const pick = (slot: PartSlot, id: string) => setDraft((d) => ({ ...d, [slot]: id }));

  return (
    <aside className="settings-panel mirror-panel" aria-label="Mirror" aria-hidden={!open} inert={!open}>
      <div className="panel-heading">
        <span>Mirror</span>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="mirror-body">
        <canvas ref={canvasRef} className="mirror-preview" width={96} height={156} aria-label="Your figure" />
        <div className="mirror-controls">
          {SLOTS.map(({ slot, title }) => (
            <div key={slot} className="mirror-row">
              <span className="mirror-row-title">{title}</span>
              <div className="mirror-options">
                {PARTS.filter((p) => p.slot === slot).map((p) => {
                  const unlocked = isOwned(p.id, p.cost);
                  const active = draft[slot] === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={"mirror-opt" + (active ? " active" : "") + (unlocked ? "" : " locked")}
                      title={p.line}
                      onClick={() => {
                        if (unlocked) pick(slot, p.id);
                        else if (watts >= p.cost) {
                          onUnlock(p.id, p.cost);
                          pick(slot, p.id);
                        }
                      }}
                    >
                      {p.name}
                      {!unlocked && <em> {p.cost}W</em>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mirror-row">
            <span className="mirror-row-title">Amber</span>
            <div className="mirror-options">
              {[0, 1, 2, 3].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={"mirror-opt tone" + (draft.tone === t ? " active" : "")}
                  aria-label={`Amber tone ${t + 1}`}
                  onClick={() => setDraft((d) => ({ ...d, tone: t as YouLook["tone"] }))}
                >
                  <span
                    className="tone-chip"
                    style={{ background: ["#8a6c3c", "#be9050", PALETTE.amber, "#ffcd82"][t] }}
                  />
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="mirror-wear" onClick={() => onWear(draft)}>
            Wear it
          </button>
        </div>
      </div>
      <p className="depot-note">Silhouettes may cost Watts. Amber itself is never for sale.</p>
    </aside>
  );
}
