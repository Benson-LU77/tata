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

const SLOTS: PartSlot[] = ["hat", "hair", "acc"];

export function MirrorPanel({
  open,
  look,
  owned,
  watts,
  name,
  onClose,
  onUnlock,
  onWear,
  onName,
  t,
}: {
  open: boolean;
  look: YouLook;
  owned: string[];
  watts: number;
  name: string;
  onClose: () => void;
  onUnlock: (id: string, cost: number) => void;
  onWear: (look: YouLook) => void;
  onName: (name: string) => void;
  t: (key: string) => string;
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
    <aside className="settings-panel mirror-panel" aria-label={t("mirror.title")} aria-hidden={!open} inert={!open}>
      <div className="panel-heading">
        <span>{t("mirror.title")}</span>
        <button type="button" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
      </div>
      <label className="mirror-name">
        <span>{t("mirror.name")}</span>
        <input
          type="text"
          defaultValue={name}
          key={name + (open ? "1" : "0")}
          maxLength={16}
          placeholder={t("mirror.name.placeholder")}
          onBlur={(e) => {
            if (e.target.value.trim() !== name) onName(e.target.value.trim());
          }}
          spellCheck={false}
        />
      </label>
      <div className="mirror-body">
        <canvas ref={canvasRef} className="mirror-preview" width={96} height={156} aria-label="Your figure" />
        <div className="mirror-controls">
          {SLOTS.map((slot) => (
            <div key={slot} className="mirror-row">
              <span className="mirror-row-title">{t("mirror.slot." + slot)}</span>
              <div className="mirror-options">
                {PARTS.filter((p) => p.slot === slot).map((p) => {
                  const unlocked = isOwned(p.id, p.cost);
                  const active = draft[slot] === p.id;
                  const name = t("part." + p.id + ".name") !== "part." + p.id + ".name" ? t("part." + p.id + ".name") : p.name;
                  const line = t("part." + p.id + ".line") !== "part." + p.id + ".line" ? t("part." + p.id + ".line") : p.line;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={"mirror-opt" + (active ? " active" : "") + (unlocked ? "" : " locked")}
                      title={line}
                      onClick={() => {
                        if (unlocked) pick(slot, p.id);
                        else if (watts >= p.cost) {
                          onUnlock(p.id, p.cost);
                          pick(slot, p.id);
                        }
                      }}
                    >
                      {name}
                      {!unlocked && <em> {p.cost}W</em>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mirror-row">
            <span className="mirror-row-title">{t("mirror.slot.amber")}</span>
            <div className="mirror-options">
              {[0, 1, 2, 3].map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={"mirror-opt tone" + (draft.tone === tone ? " active" : "")}
                  aria-label={`${t("mirror.tone.aria")} ${tone + 1}`}
                  onClick={() => setDraft((d) => ({ ...d, tone: tone as YouLook["tone"] }))}
                >
                  <span
                    className="tone-chip"
                    style={{ background: ["#8a6c3c", "#be9050", PALETTE.amber, "#ffcd82"][tone] }}
                  />
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="mirror-wear" onClick={() => onWear(draft)}>
            {t("mirror.wear")}
          </button>
        </div>
      </div>
    </aside>
  );
}
