/**
 * City layout — pure function from note metrics to buildings.
 * Deterministic: the same vault always grows the same city. All randomness
 * derives from mulberry32(hash32(file)), never Math.random(). Positions come
 * from dates (the x axis is time), so editing a note never moves it.
 */

export type NoteMetric = {
  /** vault-relative path, NFC-normalized before hashing */
  file: string;
  /** YYYY-MM-DD — decides the block */
  date: string;
  words: number;
  mtime: number;
  /** outgoing [[wikilink]] targets (names, no .md) — powers backlinks */
  links?: string[];
  /** #tags found in the body */
  tags?: string[];
  /** a time capsule: sealed until this YYYY-MM-DD */
  capsule?: string;
};

export type Building = {
  file: string;
  date: string;
  /** world-space, abstract units */
  x: number;
  w: number;
  h: number;
  seed: number;
  /** 0..1 — how recently the note was touched (window light) */
  lit: number;
  /** 0..1 across depth rows for shading */
  depth: number;
};

export function hash32(input: string): number {
  const s = input.normalize("NFC");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86400000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS);
}

/** log-compressed height: wrote / didn't write matters, length contests don't */
export function heightOf(words: number): number {
  return 18 + 30 * Math.log2(words / 40 + 1);
}

/**
 * Lay the city along time. One building per note; same-day notes share a
 * block; skipped days are empty lots (gaps), never broken chains.
 * `now` only affects window light, never geometry.
 */
export function layout(metrics: NoteMetric[], now: number): Building[] {
  const sorted = [...metrics].sort((a, b) =>
    a.date === b.date ? a.file.localeCompare(b.file) : a.date.localeCompare(b.date),
  );
  const buildings: Building[] = [];
  let x = 0;
  let prevDay: number | null = null;

  for (const note of sorted) {
    const day = dayNumber(note.date);
    if (prevDay !== null) {
      const skipped = Math.max(0, day - prevDay - 1);
      x += skipped > 0 ? 14 + Math.min(skipped, 6) * 9 : 12;
    }
    prevDay = day;

    const seed = hash32(note.file);
    const rand = rng(seed);
    const w = 26 + Math.floor(rand() * 22);
    const h = heightOf(note.words) * (0.92 + rand() * 0.16);
    const age = Math.max(0, now - note.mtime);
    const lit = Math.max(0.08, 1 - age / (30 * DAY_MS));
    buildings.push({
      file: note.file,
      date: note.date,
      x,
      w,
      h,
      seed,
      lit,
      depth: rand(),
    });
    x += w + 6;
  }
  return buildings;
}

export function contentWidth(buildings: Building[]): number {
  if (buildings.length === 0) return 0;
  const last = buildings[buildings.length - 1];
  return last.x + last.w;
}
