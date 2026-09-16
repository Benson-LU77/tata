/**
 * Pixel stamps — Tata's own picture language for the notebook.
 * `::cat::` (or `::貓::`) in a note renders as a small pixel drawing in
 * the editor; the vault only ever stores the plain text, so Obsidian
 * stays clean and readable. Same ASCII dialect as every sprite.
 *
 * One rule the city does not have: a stamp is read on paper, so its ink must
 * stay in steps 0–4. Steps 5 and up fall below 3:1 against the page and the
 * drawing quietly disappears.
 */

import { SPRITES } from "./data";

const DRAWN: Record<string, string[]> = {
  heart: [
    ".22.22.",
    "2442442",
    "2444442",
    ".24442.",
    "..242..",
    "...2...",
  ],
  star: [
    "...1...",
    "..111..",
    "1111111",
    ".11111.",
    "..1.1..",
    ".1...1.",
  ],
  moon: [
    "..111..",
    ".11....",
    "111....",
    "111....",
    ".11....",
    "..111..",
  ],
  sun: [
    "1..1..1",
    ".11111.",
    ".14441.",
    "1144411",
    ".14441.",
    ".11111.",
    "1..1..1",
  ],
  book: [
    "1111111",
    "1444441",
    "1414141",
    "1414141",
    "1444441",
    "1111111",
  ],
  dumbbell: [
    "22...22",
    "2244422",
    "2244422",
    "22...22",
  ],
  pen: [
    "....11",
    "...114",
    "..114.",
    ".114..",
    "4140..",
    "44....",
  ],
  check: [
    ".....1",
    "....11",
    "1..11.",
    "11111.",
    ".111..",
    "..1...",
  ],
};

/*
 * The six borrowed from the city need no translation: each one is outlined in
 * the bottom steps, which read as ink on paper as readily as they read as
 * shadow at night. Flipping them was tried and thrown away — it buys contrast
 * the drawings already had, and spends every highlight to get it.
 */
/** canonical stamp id → sprite rows */
export const STAMPS: Record<string, string[]> = {
  cat: SPRITES.cat_S_i,
  dog: SPRITES.dog_S_i,
  ship: SPRITES.ship_E_a,
  tree: SPRITES.tree_round,
  bell: SPRITES.bell_a,
  boat: SPRITES.boat_a,
  ...DRAWN,
};

/** aliases — both languages land on the same drawing */
export const STAMP_ALIAS: Record<string, string> = {
  "貓": "cat",
  "狗": "dog",
  "船": "ship",
  "飛船": "ship",
  "樹": "tree",
  "鐘": "bell",
  "小船": "boat",
  "心": "heart",
  "愛": "heart",
  "星": "star",
  "星星": "star",
  "月": "moon",
  "月亮": "moon",
  "太陽": "sun",
  "日": "sun",
  "書": "book",
  "啞鈴": "dumbbell",
  "健身": "dumbbell",
  "筆": "pen",
  "勾": "check",
  "完成": "check",
};

export function stampRows(name: string): string[] | null {
  return STAMPS[name] ?? STAMPS[STAMP_ALIAS[name]] ?? null;
}

/** the ::picker speaks ONE language — every alias still types fine */
export function stampMenu(lang?: "en" | "zh"): { insert: string; id: string }[] {
  const out: { insert: string; id: string }[] = [];
  if (lang === "zh") {
    const covered = new Set<string>();
    for (const [alias, id] of Object.entries(STAMP_ALIAS)) {
      if (!/[\u2e80-\u9fff]/.test(alias) || covered.has(id)) continue;
      covered.add(id);
      out.push({ insert: alias, id }); // one row per stamp — every alias still types
    }
    for (const id of Object.keys(STAMPS)) if (!covered.has(id)) out.push({ insert: id, id });
  } else {
    for (const id of Object.keys(STAMPS)) out.push({ insert: id, id });
  }
  return out;
}
