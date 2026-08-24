"use client";

/**
 * A page turning — procedurally drawn, no artwork. A paper edge sweeps
 * across the right page with its shadow ahead of it, in the notebook's
 * own cream ladder, rendered at 1/3 resolution and upscaled so the
 * pixels stay chunky like everything else in this city.
 *
 * Strictly cosmetic: it reads nothing but its trigger and NEVER delays,
 * batches or cancels a save — the doc store has already moved on by the
 * time the first frame draws. Front-loaded (fast start, soft landing),
 * under 360ms, skippable by pointer, silent under prefers-reduced-motion.
 */

import { useEffect, useRef } from "react";

const CREAM = { page: "#f2f3f5", under: "#c9ccd2", edge: "#ffffff", shade: "#2a2e36" };
const DURATION = 340;

export function PageTurn({ trigger }: { trigger: number }) {
  const hostRef = useRef<HTMLCanvasElement | null>(null);
  const firstRef = useRef(true);
  const rafRef = useRef(0);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false; // the book opening is not a page turning
      return;
    }
    const canvas = hostRef.current;
    if (!canvas) return;
    if (
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const box = canvas.parentElement?.getBoundingClientRect();
    if (!box || box.width < 60) return;
    const w = Math.max(40, Math.round(box.width / 3));
    const h = Math.max(40, Math.round(box.height / 3));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.style.opacity = "1";
    const started = performance.now();

    const skip = () => {
      window.cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, w, h);
      canvas.style.opacity = "0";
      canvas.removeEventListener("pointerdown", skip);
    };
    canvas.addEventListener("pointerdown", skip);

    const frame = (now: number) => {
      const raw = Math.min(1, (now - started) / DURATION);
      // fast out of the gate, soft landing
      const t = 1 - Math.pow(1 - raw, 2.2);
      ctx.clearRect(0, 0, w, h);
      // the turning sheet still covers the right side of the page
      const x = Math.round(w * (1 - t) * (1 - t * 0.15));
      if (x < w) {
        ctx.fillStyle = CREAM.page;
        ctx.fillRect(x, 0, w - x, h);
        // its lifted edge, one bright rib
        ctx.fillStyle = CREAM.edge;
        ctx.fillRect(x, 0, 2, h);
        // the shadow it throws ahead onto the new page
        const shade = Math.max(0, Math.round(10 * (1 - t)));
        for (let i = 0; i < shade; i += 1) {
          ctx.globalAlpha = 0.05 * (1 - i / shade);
          ctx.fillStyle = CREAM.shade;
          ctx.fillRect(x - 1 - i, 0, 1, h);
        }
        ctx.globalAlpha = 1;
        // the sheet's underside hints along the edge
        ctx.fillStyle = CREAM.under;
        ctx.fillRect(Math.min(w - 1, x + 2), 0, Math.max(0, Math.min(4, w - x - 2)), h);
      }
      if (raw < 1) {
        rafRef.current = window.requestAnimationFrame(frame);
      } else {
        skip();
      }
    };
    rafRef.current = window.requestAnimationFrame(frame);
    return () => skip();
  }, [trigger]);

  return <canvas ref={hostRef} className="page-turn" aria-hidden="true" />;
}
