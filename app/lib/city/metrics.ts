/**
 * NoteMetric extraction — three sources, one interface:
 * connected → Obsidian metadata (and the result is snapshotted to IndexedDB);
 * offline but once connected → the snapshot;
 * never connected → local drafts.
 * The main screen renders from whatever this returns; it never blocks on the network.
 */

import type { ObsidianClient } from "../obsidian";
import { cityCache, drafts } from "../drafts";
import { logDebug } from "../debuglog";
import type { NoteMetric } from "./layout";

export type { NoteMetric };

/** CJK-aware word count — plain split() undercounts Chinese by ~everything. */
/** outgoing wikilink targets, names only */
export function linksOf(text: string): string[] {
  const out = new Set<string>();
  for (const mt of text.matchAll(/\[\[([^\]|#]+)/g)) out.add(mt[1].trim());
  return [...out];
}

/** #tags in the body (unicode letters, dashes, slashes) */
export function tagsOf(text: string): string[] {
  const out = new Set<string>();
  for (const mt of text.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)) out.add(mt[2]);
  return [...out];
}

export function countWords(text: string): number {
  const cjk = text.match(/[぀-ヿ一-鿿]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

/** Date from our filename conventions, else from mtime. */
export function dateOf(file: string, mtime: number): string {
  const m = file.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(mtime);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function pool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit = 6,
): Promise<(R | null)[]> {
  const results: (R | null)[] = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index;
        index += 1;
        try {
          results[i] = await worker(items[i]);
        } catch {
          results[i] = null;
        }
      }
    }),
  );
  return results;
}

async function fromDrafts(): Promise<NoteMetric[]> {
  const all = await drafts.all();
  return all
    .filter((d) => d.content.trim() !== d.seed.trim())
    .map((d) => ({
      file: d.file,
      date: dateOf(d.file, d.updatedAt),
      words: countWords(d.content),
      mtime: d.updatedAt,
    }));
}

/** Deterministic synthetic city for density review (?demo=N). Dev aid only. */
export function demoMetrics(count: number, now: number): NoteMetric[] {
  const r = rngSimple(0x9e3779b9);
  const metrics: NoteMetric[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  let daysAgo = Math.floor(count * 1.5);
  for (let i = 0; i < count; i += 1) {
    daysAgo -= r() < 0.55 ? 0 : 1 + Math.floor(r() * 3);
    daysAgo = Math.max(0, daysAgo);
    const date = new Date(now - daysAgo * 86400000);
    metrics.push({
      file: `demo/${i}.md`,
      date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      words: Math.floor(30 + r() * 900),
      mtime: now - daysAgo * 86400000 - Math.floor(r() * 43200000),
    });
  }
  // the showcase skyline earns all three archetypes, deterministically:
  // a lighthouse needs a long silence before it, a bridge needs a
  // bare-date backfill, a chapel a page from the smallest hours
  const DAY = 86400000;
  const dstr = (n: number) => {
    const d = new Date(now - n * DAY);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const hole = new Set([24, 25, 26, 27, 28, 29, 30, 31].map(dstr));
  const out = metrics.filter((mm) => !hole.has(mm.date));
  out.push({ file: "demo/light.md", date: dstr(24), words: 420, mtime: now - 24 * DAY + 3600000 });
  out.push({ file: "demo/far.md", date: dstr(32), words: 260, mtime: now - 32 * DAY });
  out.push({ file: `demo/${dstr(15)}.md`, date: dstr(15), words: 180, mtime: now - 2 * DAY });
  const chapel = new Date(now - 5 * DAY);
  chapel.setHours(3, 15, 0, 0);
  out.push({ file: "demo/chapel.md", date: dstr(5), words: 333, mtime: chapel.getTime() });
  return out;
}

function rngSimple(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Load metrics. Fast path returns cache/drafts immediately; when a client is
 * given, a background sync refreshes from Obsidian and calls `onFresh`.
 */
/* one background vault read at a time — heartbeat and wake both call in */
let syncInFlight = false;
/* a sync that sees far fewer pages than the cache is usually a flap, not a
   purge — only believe the shrink when it repeats */
let shrinkStreak = 0;

export async function loadCityMetrics(
  client: Pick<ObsidianClient, "list" | "readDoc"> | null,
  onFresh?: (metrics: NoteMetric[]) => void,
): Promise<NoteMetric[]> {
  const cached = await cityCache.all();
  const quick = cached.length > 0 ? cached : await fromDrafts();

  if (client && !syncInFlight) {
    syncInFlight = true;
    void (async () => {
      try {
        const names = (await client.list()).filter(
          // templates are tools; exported letters are the city writing to
          // itself; replaced/ holds the copies an import displaced. None
          // is a page you wrote tonight, so none becomes a building —
          // counting them would also ratchet earnedFloor for good
          (n) => !/^(Templates|Letters|replaced)\//i.test(n),
        );
        const metas = await pool(names, async (name): Promise<NoteMetric> => {
          const doc = await client.readDoc(name);
          return {
            file: name,
            date: dateOf(name, doc.mtime ?? Date.now()),
            words: countWords(doc.content),
            mtime: doc.mtime ?? Date.now(),
            links: linksOf(doc.content),
            tags: tagsOf(doc.content),
          } satisfies NoteMetric;
        });
        let fresh = metas.filter((m): m is NoteMetric => m !== null);
        // date pin: files without a date in their name must never move —
        // keep the date we first observed even if mtime advances
        const pinned = new Map(cached.map((c) => [c.file, c.date]));
        fresh = fresh.map((m) => {
          if (!/\d{4}-\d{2}-\d{2}/.test(m.file)) {
            const pin = pinned.get(m.file);
            if (pin) return { ...m, date: pin };
          }
          return m;
        });
        const suspicious = cached.length >= 8 && fresh.length < cached.length / 2;
        if (suspicious && shrinkStreak < 2) {
          shrinkStreak += 1;
          logDebug("metrics", `partial sync? kept cache (${fresh.length}/${cached.length})`);
          const merged = new Map(cached.map((c) => [c.file, c]));
          for (const m of fresh) merged.set(m.file, m);
          const out = [...merged.values()];
          await cityCache.replaceAll(out);
          onFresh?.(out);
        } else {
          shrinkStreak = 0;
          // an empty vault is a real answer, not a failure: a brand-new
          // writer is connected even before the first page exists
          if (fresh.length > 0 || cached.length === 0) {
            await cityCache.replaceAll(fresh);
            onFresh?.(fresh);
          }
        }
      } catch {
        /* stay on cache */
      } finally {
        syncInFlight = false;
      }
    })();
  }
  return quick;
}
