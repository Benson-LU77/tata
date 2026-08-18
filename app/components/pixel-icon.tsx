"use client";

import { useEffect, useRef } from "react";

/** the 8-grey palette, same hexes the quantise pass paints with */
const PAL = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];

/** rasterises an ASCII sprite once — crisp at any size via pixelated scaling */
/** the amber ramp, for drawing "you" the way the city does */
export const AMBER_PAL = ["#06070a", "#2a1f10", "#4a3418", "#8a6c3c", "#b8894a", "#e0a84f", "#f2e3c8", "#f8f0dc"];

export function PixelIcon({ rows, size = 32, pal }: { rows: string[]; size?: number; pal?: string[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const w0 = rows[0]?.length ?? 1;
  const h0 = rows.length || 1;
  // keep the sprite's own proportions — size bounds the longer side
  const scale = size / Math.max(w0, h0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = rows[0]?.length ?? 0;
    const h = rows.length;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colors = pal ?? PAL;
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const ch = rows[y][x];
        if (ch === "." || ch === undefined) continue;
        ctx.fillStyle = colors[ch.charCodeAt(0) - 48] ?? colors[4];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [rows, pal]);
  return (
    <canvas
      ref={ref}
      className="depot-thumb"
      style={{ width: Math.round(w0 * scale), height: Math.round(h0 * scale) }}
      aria-hidden="true"
    />
  );
}
