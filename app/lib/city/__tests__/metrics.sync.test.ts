/**
 * The background vault sync must never let a flap flatten the city:
 * a read that sees far fewer pages than the cache is treated as a
 * partial sync (merge, keep cache) until the shrink repeats enough
 * times to be believed. And only one background read runs at a time.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadCityMetrics } from "../metrics";
import { cityCache } from "../../drafts";
import type { NoteMetric } from "../layout";

function metric(file: string, words = 10): NoteMetric {
  return {
    file,
    date: "2026-08-01",
    words,
    mtime: 1,
    links: [],
    tags: [],
  };
}

function fakeClient(names: string[]) {
  return {
    list: async () => names,
    readDoc: async () => ({ content: "hello there world", mtime: 2, tags: [] }),
  };
}

/**
 * Wait for the background sync to actually finish, rather than for a
 * fixed nap. The in-flight guard means a sync started while another is
 * running is skipped silently — so a sleep that is long enough on an idle
 * machine quietly tests nothing on a busy one.
 */
async function syncOnce(names: string[]): Promise<NoteMetric[] | null> {
  let got: NoteMetric[] | null = null;
  await loadCityMetrics(fakeClient(names), (m) => {
    got = m;
  });
  const started = Date.now();
  while (got === null && Date.now() - started < 5000) {
    await new Promise((r) => setTimeout(r, 20));
  }
  return got;
}

async function seedCache(n: number) {
  await cityCache.replaceAll(
    Array.from({ length: n }, (_, i) => metric(`2026-08-${String(i + 1).padStart(2, "0")}.md`)),
  );
}

describe("city sync guards", () => {
  beforeEach(async () => {
    await cityCache.replaceAll([metric("x.md")]); // reset via replace
    await seedCache(10);
    // drain any shrink streak left by a previous test: three healthy syncs
    for (let i = 0; i < 3; i += 1) {
      await syncOnce((await cityCache.all()).map((m) => m.file));
    }
  });

  it("keeps the cached city when a sync suddenly sees half of it gone", async () => {
    const fresh = await syncOnce(["2026-08-01.md"]);
    expect(fresh?.length).toBe(10); // merged, not collapsed
    expect((await cityCache.all()).length).toBe(10);
  });

  it("believes the shrink once it repeats", async () => {
    for (let i = 0; i < 3; i += 1) await syncOnce(["2026-08-01.md"]);
    expect((await cityCache.all()).length).toBe(1); // a real purge lands
  });

  it("small cities may shrink freely (no threshold below 8)", async () => {
    await seedCache(4);
    const fresh = await syncOnce(["2026-08-01.md"]);
    expect(fresh?.length).toBe(1);
  });

  it("overlapping syncs collapse to one background read", async () => {
    let listCalls = 0;
    const slow = {
      list: async () => {
        listCalls += 1;
        await new Promise((r) => setTimeout(r, 30));
        return (await cityCache.all()).map((m) => m.file);
      },
      readDoc: async () => ({ content: "hi", mtime: 2, tags: [] }),
    };
    let done = false;
    await Promise.all([
      loadCityMetrics(slow, () => {
        done = true;
      }),
      loadCityMetrics(slow, () => {}),
      loadCityMetrics(slow, () => {}),
    ]);
    const started = Date.now();
    while (!done && Date.now() - started < 5000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(listCalls).toBe(1);
  });
});
