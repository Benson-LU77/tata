"use client";

/**
 * The notebook's left page: one month as a 7×6 calendar — the very grid
 * the city's blocks stand on (cellOf), so a square here IS a building
 * there. Written days are inked, deeper with more floors; today carries
 * the amber. Empty days are simply quiet paper: a month you skipped is
 * never scolded, it just wasn't written.
 */

import { useMemo } from "react";
import { cellOf, floorsOf } from "../lib/city/plan";

export type DayCell = { date: string; file: string; words: number };

const pad = (n: number) => String(n).padStart(2, "0");

export function BookCalendar({
  month,
  cells,
  activeFile,
  today,
  onPickDay,
  onMonthShift,
  monthLabel,
}: {
  /** YYYY-MM being shown */
  month: string;
  /** every written page, panel-wide (the component filters to the month) */
  cells: DayCell[];
  activeFile: string | null;
  /** YYYY-MM-DD */
  today: string;
  /** a written day was tapped (file), or today's empty square (null) */
  onPickDay: (file: string | null, date: string) => void;
  onMonthShift: (delta: number) => void;
  monthLabel: string;
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, { file: string; words: number }>();
    for (const c of cells) {
      if (!c.date.startsWith(month)) continue;
      const prev = map.get(c.date);
      // the daily page names the square; extra pages only add words
      const daily = / (Today|Tonight)\.md$/.test(c.file);
      map.set(c.date, {
        file: prev ? (daily ? c.file : prev.file) : c.file,
        words: (prev?.words ?? 0) + c.words,
      });
    }
    return map;
  }, [cells, month]);

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const grid: Array<{ date: string; day: number } | null> = useMemo(() => {
    const out: Array<{ date: string; day: number } | null> = Array(42).fill(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = `${month}-${pad(d)}`;
      const { col, row } = cellOf(date);
      out[row * 7 + col] = { date, day: d };
    }
    return out;
  }, [month, daysInMonth]);

  const written = [...byDate.keys()].length;

  return (
    <div className="book-left" aria-label={monthLabel}>
      <div className="book-month-bar">
        <button type="button" onClick={() => onMonthShift(-1)} aria-label="previous month">
          ◀
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => onMonthShift(1)} aria-label="next month">
          ▶
        </button>
      </div>
      <div className="book-grid" role="grid">
        {grid.map((cell, i) => {
          if (!cell) return <span key={i} className="book-cell void" />;
          const page = byDate.get(cell.date);
          const isToday = cell.date === today;
          const future = cell.date > today;
          const active = page && page.file === activeFile;
          const depth = page ? Math.min(4, Math.max(1, Math.ceil(floorsOf(page.words) / 3))) : 0;
          const cls =
            "book-cell" +
            (page ? ` inked d${depth}` : "") +
            (isToday ? " today" : "") +
            (active ? " active" : "") +
            (future ? " future" : "");
          const clickable = Boolean(page) || (isToday && !page);
          return clickable ? (
            <button
              key={cell.date}
              type="button"
              className={cls}
              onClick={() => onPickDay(page?.file ?? null, cell.date)}
              aria-label={cell.date}
              title={page ? `${cell.date} · ${page.words}` : cell.date}
            >
              {cell.day}
            </button>
          ) : (
            <span key={cell.date} className={cls} aria-label={cell.date}>
              {cell.day}
            </span>
          );
        })}
      </div>
      <em className="book-left-foot">{written > 0 ? `${written} · ${month}` : month}</em>
    </div>
  );
}
