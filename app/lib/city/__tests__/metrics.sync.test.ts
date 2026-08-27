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

const settle = () => new Promise((r) => setTimeout(r, 50));

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
    for (let i = 0; i < 3; i++) {
      const all = (await cityCache.all()).map((m) => m.file);
      await loadCityMetrics(fakeClient(all), () => {});
      await settle();
    }
  });

  it("keeps the cached city when a sync suddenly sees half of it gone", async () => {
    let fresh: NoteMetric[] = [];
    await loadCityMetrics(fakeClient(["2026-08-01.md"]), (m) => {
      fresh = m;
    });
    await settle();
    expect(fresh.length).toBe(10); // merged, not collapsed
    expect((await cityCache.all()).length).toBe(10);
  });

  it("believes the shrink once it repeats", async () => {
    for (let i = 0; i < 3; i++) {
      await loadCityMetrics(fakeClient(["2026-08-01.md"]), () => {});
      await settle();
    }
    expect((await cityCache.all()).length).toBe(1); // a real purge lands
  });

  it("small cities may shrink freely (no threshold below 8)", async () => {
    await seedCache(4);
    let fresh: NoteMetric[] = [];
    await loadCityMetrics(fakeClient(["2026-08-01.md"]), (m) => {
      fresh = m;
    });
    await settle();
    expect(fresh.length).toBe(1);
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
    await Promise.all([
      loadCityMetrics(slow, () => {}),
      loadCityMetrics(slow, () => {}),
      loadCityMetrics(slow, () => {}),
    ]);
    await settle();
    expect(listCalls).toBe(1);
  });
});
