"use client";

/**
 * The sea chart — every month-island at once, drawn from the same
 * cityPlan the 3D city stands on. Not a navigation shortcut so much as
 * the one picture where you can SEE how long you've been writing: each
 * island a month, each speck a night, brightness carrying the floors.
 *
 * Pure 2D canvas over plan data. Touches no 3D pipeline, no store.
 * Clicking an island sails the camera there; clicking close to a speck
 * opens that night's page.
 */

import { useEffect, useMemo, useRef } from "react";
import type { CityPlan } from "../lib/city/plan";
import { CELL } from "../lib/city/plan";

const INK = ["#06070a", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];
const AMBER = "#e0a84f";
const SCALE = 2; // canvas px per world unit before upscale

export function CityMinimap({
  plan,
  activeMonth,
  todayFile,
  onPickMonth,
  onPickLot,
}: {
  plan: CityPlan;
  activeMonth: string | null;
  todayFile: string | null;
  onPickMonth: (index: number) => void;
  onPickLot: (file: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const geo = useMemo(() => {
    const pad = 2.2 * CELL;
    const minX = Math.min(...plan.blocks.map((b) => b.x)) - pad;
    const minZ = Math.min(...plan.blocks.map((b) => b.z)) - pad;
    const maxX = Math.max(...plan.blocks.map((b) => b.x + 7 * CELL)) + pad;
    const maxZ = Math.max(...plan.blocks.map((b) => b.z + 6 * CELL)) + pad;
    return { minX, minZ, w: (maxX - minX) * SCALE, h: (maxZ - minZ) * SCALE };
  }, [plan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || plan.blocks.length === 0) return;
    canvas.width = Math.max(40, Math.round(geo.w));
    canvas.height = Math.max(40, Math.round(geo.h));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const X = (wx: number) => (wx - geo.minX) * SCALE;
    const Z = (wz: number) => (wz - geo.minZ) * SCALE;

    ctx.fillStyle = INK[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // causeways first, beneath the islands
    ctx.strokeStyle = INK[2];
    ctx.lineWidth = 2;
    for (let i = 0; i + 1 < plan.blocks.length; i += 1) {
      const a = plan.blocks[i];
      const b = plan.blocks[i + 1];
      ctx.beginPath();
      ctx.moveTo(X(a.x + 3.5 * CELL), Z(a.z + 3 * CELL));
      ctx.lineTo(X(b.x + 3.5 * CELL), Z(b.z + 3 * CELL));
      ctx.stroke();
    }

    for (const [i, b] of plan.blocks.entries()) {
      const x0 = X(b.x - 0.85 * CELL);
      const z0 = Z(b.z - 0.85 * CELL);
      const w = (7.7 * CELL) * SCALE;
      const h = (6.7 * CELL) * SCALE;
      ctx.fillStyle = INK[1];
      ctx.fillRect(x0, z0, w, h);
      ctx.strokeStyle = b.month === activeMonth ? AMBER : INK[3];
      ctx.lineWidth = b.month === activeMonth ? 2 : 1;
      ctx.strokeRect(x0 + 0.5, z0 + 0.5, w - 1, h - 1);
      ctx.fillStyle = INK[4];
      ctx.font = "7px monospace";
      ctx.fillText(plan.blocks[i].month.slice(2), x0 + 3, z0 + h - 3);
    }

    for (const lot of plan.lots) {
      if (lot.file.startsWith("__")) continue;
      const bright = Math.min(6, 2 + Math.floor(lot.floors / 4));
      ctx.fillStyle = lot.file === todayFile ? AMBER : INK[bright];
      const s = lot.file === todayFile ? 3 : 2;
      ctx.fillRect(Math.round(X(lot.x)) - 1, Math.round(Z(lot.z)) - 1, s, s);
    }
  }, [plan, geo, activeMonth, todayFile]);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = geo.minX + ((e.clientX - rect.left) / rect.width) * (canvas.width / SCALE);
    const wz = geo.minZ + ((e.clientY - rect.top) / rect.height) * (canvas.height / SCALE);
    // a speck within reach opens its night
    let best: { file: string; d: number } | null = null;
    for (const lot of plan.lots) {
      if (lot.file.startsWith("__")) continue;
      const d = Math.hypot(lot.x - wx, lot.z - wz);
      if (d < 1.6 && (!best || d < best.d)) best = { file: lot.file, d };
    }
    if (best) {
      onPickLot(best.file);
      return;
    }
    // otherwise the island answers
    for (const [i, b] of plan.blocks.entries()) {
      if (wx >= b.x - CELL && wx <= b.x + 8 * CELL && wz >= b.z - CELL && wz <= b.z + 7 * CELL) {
        onPickMonth(i);
        return;
      }
    }
  };

  if (plan.blocks.length === 0) return null;
  return (
    <canvas
      ref={canvasRef}
      className="city-chart"
      style={{ width: Math.max(120, Math.round(geo.w * 1.6)) }}
      onClick={pick}
      aria-label="sea chart"
      role="img"
    />
  );
}
