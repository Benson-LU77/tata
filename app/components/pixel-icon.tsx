"use client";

import { useEffect, useRef } from "react";

/** the 8-grey palette, same hexes the quantise pass paints with */
const PAL = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];

/** rasterises an ASCII sprite once — crisp at any size via pixelated scaling */
export function PixelIcon({ rows, size = 32 }: { rows: string[]; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const w = rows[0]?.length ?? 0;
    const h = rows.length;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const ch = rows[y][x];
        if (ch === "." || ch === undefined) continue;
        ctx.fillStyle = PAL[ch.charCodeAt(0) - 48] ?? PAL[4];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [rows]);
  return (
    <canvas
      ref={ref}
      className="depot-thumb"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
