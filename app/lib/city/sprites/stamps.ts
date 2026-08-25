/**
 * Pixel stamps — Tata's own picture language for the notebook.
 * `::cat::` (or `::貓::`) in a note renders as a small pixel drawing in
 * the editor; the vault only ever stores the plain text, so Obsidian
 * stays clean and readable. Same ASCII dialect as every sprite.
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
    "...6...",
    "..666..",
    "6666666",
    ".66666.",
    "..6.6..",
    ".6...6.",
  ],
  moon: [
    "..555..",
    ".55....",
    "555....",
    "555....",
    ".55....",
    "..555..",
  ],
  sun: [
    "6..6..6",
    ".66666.",
    ".65556.",
    "6655566",
    ".65556.",
    ".66666.",
    "6..6..6",
  ],
  book: [
    "0000000",
    "0555550",
    "0505050",
    "0505050",
    "0555550",
    "0000000",
  ],
  dumbbell: [
    "22...22",
    "2255522",
    "2255522",
    "22...22",
  ],
  pen: [
    "....55",
    "...550",
    "..550.",
    ".550..",
    "0500..",
    "00....",
  ],
  check: [
    ".....6",
    "....66",
    "6..66.",
    "66666.",
    ".666..",
    "..6...",
  ],
};

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
