// Determinism tests for the pure city layer. Run: npm run test:city
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

const out = mkdtempSync(join(tmpdir(), "tata-test-"));
for (const [entry, name] of [
  ["app/lib/city/layout.ts", "layout"],
  ["app/lib/city/plan.ts", "plan"],
  ["app/lib/game/watts.ts", "watts"],
  ["app/lib/city/residents.ts", "residents"],
  ["app/lib/city/sprites/compose.ts", "compose"],
  ["app/lib/city/sprites/parts.ts", "parts"],
  ["app/lib/game/bonds.ts", "bonds"],
  ["app/lib/city/metrics.ts", "metrics"],
  ["app/lib/game/commissions.ts", "commissions"],
  ["app/lib/obsidian.ts", "obsidian"],
  ["app/lib/game/shop.ts", "shop"],
]) {
  execSync(`npx esbuild ${entry} --bundle --format=esm --outfile=${join(out, name + ".js")}`, {
    stdio: "pipe",
  });
}

const { layout, hash32 } = await import(join(out, "layout.js"));
const { planCity } = await import(join(out, "plan.js"));
const { earnedWatts, levelFromWatts, streakOf, workOrders } = await import(join(out, "watts.js"));

const metrics = [
  { file: "2026-08-01 Tonight.md", date: "2026-08-01", words: 300, mtime: 1754000000000 },
  { file: "2026-08-01 22.10.md", date: "2026-08-01", words: 80, mtime: 1754003600000 },
  { file: "2026-08-03 Tonight.md", date: "2026-08-03", words: 900, mtime: 1754200000000 },
  { file: "隨手記.md", date: "2026-07-20", words: 50, mtime: 1753000000000 },
];
const NOW = 1754300000000;

// 1. determinism: identical input → identical city
assert.deepStrictEqual(layout(metrics, NOW), layout(metrics, NOW), "layout deterministic");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(planCity(metrics, NOW))),
  JSON.parse(JSON.stringify(planCity(metrics, NOW))),
  "plan deterministic",
);

// 2. editing a note never moves its building
const edited = metrics.map((m) =>
  m.file.startsWith("2026-08-03") ? { ...m, words: 2000, mtime: NOW } : m,
);
const a = planCity(metrics, NOW).lots.find((l) => l.file.startsWith("2026-08-03"));
const b = planCity(edited, NOW).lots.find((l) => l.file.startsWith("2026-08-03"));
assert.strictEqual(a.x, b.x, "x stable under edit");
assert.strictEqual(a.z, b.z, "z stable under edit");
assert.ok(b.floors > a.floors, "more words, more floors");

// 3. hash32 is NFC-stable (macOS NFD filenames must not grow a different city)
assert.strictEqual(hash32("é.md"), hash32("é.md"), "NFC normalization");

// 4. watts: padding is capped, writing nights dominate
const oneBigDay = [{ file: "a.md", date: "2026-08-01", words: 99999, mtime: 1 }];
const threeDays = ["01", "02", "03"].map((d) => ({
  file: `${d}.md`, date: `2026-08-${d}`, words: 100, mtime: 1,
}));
assert.ok(
  earnedWatts(threeDays) > earnedWatts(oneBigDay),
  "three nights beat one flooded day",
);
assert.ok(levelFromWatts(0) === 1 && levelFromWatts(100000) > levelFromWatts(1000), "levels rise");

// 5. streak counts consecutive days and never goes negative
assert.strictEqual(streakOf(metrics, "2026-08-03"), 1, "streak breaks on gaps");
assert.strictEqual(
  streakOf(threeDays, "2026-08-03"), 3, "streak counts consecutive nights");

// 6. work orders derive: always three, rotation is deterministic, and
// the guaranteed "write" order completes on any written night
const orders = workOrders(metrics, "2026-08-01");
assert.strictEqual(orders.length, 3, "three orders per night");
assert.ok(orders[0].id === "write" && orders[0].done, "write order done that night");
assert.deepStrictEqual(orders, workOrders(metrics, "2026-08-01"), "rotation deterministic");

// 7. earned watts are monotone: adding a later note never lowers the total
const { earnedWatts: ew, orderBonus: ob } = await import(join(out, "watts.js"));
const before = ew(metrics) + ob(metrics);
const more = [...metrics, { file: "2026-08-04 Today.md", date: "2026-08-04", words: 200, mtime: NOW }];
const after = ew(more) + ob(more);
assert.ok(after >= before, "the city never shrinks overnight");

// 7b. streaks pay: consecutive nights earn more than scattered ones,
// and extending history never lowers the bonus
{
  const { streakBonus } = await import(join(out, "watts.js"));
  const run = ["01","02","03","04"].map((d) => ({ file: `${d}.md`, date: `2026-08-${d}`, words: 100, mtime: 1 }));
  const scattered = ["01","03","05","07"].map((d) => ({ file: `${d}.md`, date: `2026-08-${d}`, words: 100, mtime: 1 }));
  assert.ok(streakBonus(run) > streakBonus(scattered), "a run beats scattered nights");
  const longer = [...run, { file: "05.md", date: "2026-08-05", words: 100, mtime: 1 }];
  assert.ok(streakBonus(longer) >= streakBonus(run), "the bonus never shrinks");
}

// 8. nobody moonwalks: every moving creature faces its velocity,
// whichever way it circles its block
{
  const { creaturesFor, poseAt } = await import(join(out, "residents.js"));
  const plan = planCity(metrics, NOW);
  const cast = creaturesFor(plan, metrics.length, { cats: 6, birds: 0, dogs: 2 });
  const EPS = 0.05;
  for (const c of cast) {
    if (c.kind === "bird") continue;
    for (let t = 0; t < 400; t += 7.3) {
      const p0 = poseAt(c, plan, t);
      const p1 = poseAt(c, plan, t + EPS);
      if (!p0.moving || !p1.moving) continue;
      const vx = p1.x - p0.x;
      const vz = p1.z - p0.z;
      const speed = Math.hypot(vx, vz);
      if (speed < 1e-6) continue;
      const dot = (Math.sin(p0.facing) * vx + Math.cos(p0.facing) * vz) / speed;
      assert.ok(dot > 0.7, `${c.kind}#${c.id} walks the way it faces (dot=${dot.toFixed(2)} at t=${t})`);
    }
  }
}

// 9. identity is forever: growing the city only ADDS residents — every
// existing key keeps its kind and seed (bonds depend on this)
{
  const { creaturesFor } = await import(join(out, "residents.js"));
  const plan = planCity(metrics, NOW);
  const small = creaturesFor(plan, 10, { cats: 2, birds: 1, dogs: 1 });
  const big = creaturesFor(plan, 200, { cats: 4, birds: 2, dogs: 2 });
  const byKey = new Map(big.map((c) => [c.key, c]));
  for (const c of small) {
    const later = byKey.get(c.key);
    assert.ok(later, `resident ${c.key} survived growth`);
    assert.strictEqual(later.kind, c.kind, `${c.key} keeps its kind`);
    assert.strictEqual(later.seed, c.seed, `${c.key} keeps its seed`);
  }
}

// 10. the Mirror never breaks the figure: default look reproduces the
// canonical sprite exactly; every part stays above the walk rows; every
// composed frame is legal palette art
{
  const { composeYou, DEFAULT_LOOK } = await import(join(out, "compose.js"));
  const { PARTS } = await import(join(out, "parts.js"));
  const golden = composeYou(DEFAULT_LOOK);
  assert.deepStrictEqual(
    golden.you_S_i,
    [
      ".00000..",
      ".04440..",
      "0444440.",
      "..0000..",
      ".066660.",
      "06166160",
      "06666660",
      ".066660.",
      ".004400.",
      "05444550",
      "05444550",
      ".044450.",
      ".00.00..",
    ],
    "default look reproduces the canonical you",
  );
  for (const part of PARTS) {
    for (const patch of Object.values(part.art)) {
      assert.ok(patch.top + patch.rows.length <= 9, `${part.id} stays above the walk rows`);
    }
  }
  for (const look of [
    DEFAULT_LOOK,
    { hat: "hat.hood", hair: "hair.long", acc: "acc.scarf", tone: 3 },
    { hat: "hat.none", hair: "hair.fringe", acc: "acc.none", tone: 0 },
  ]) {
    const frames = Object.entries(composeYou(look));
    assert.strictEqual(frames.length, 9, "nine frames always");
    for (const [name, rows] of frames) {
      assert.strictEqual(rows.length, 13, `${name} is 13 rows`);
      for (const row of rows) {
        assert.strictEqual(row.length, 8, `${name} rows are 8 wide`);
        assert.ok(/^[.0-7]+$/.test(row), `${name} resolves to legal palette art`);
      }
    }
  }
}

// 11. bonds: one day counts once, tiers gate on days, merge never regresses
{
  const { greet, tierOf, mergeBonds, nameOf } = await import(join(out, "bonds.js"));
  let b = greet({}, "cat:2", "2026-08-11");
  b = greet(b, "cat:2", "2026-08-11"); // same day, no double count
  assert.strictEqual(b["cat:2"].n, 1, "same-day greets count once");
  b = greet(b, "cat:2", "2026-08-12");
  assert.strictEqual(b["cat:2"].n, 2, "a new day counts");
  assert.strictEqual(tierOf(undefined), 0, "strangers are tier 0");
  assert.strictEqual(tierOf({ n: 1, met: "", last: "" }), 1, "first greet = familiar");
  assert.strictEqual(tierOf({ n: 20, met: "", last: "" }), 4, "twenty days = family");
  const m = mergeBonds(
    { "cat:2": { n: 3, met: "2026-08-01", last: "2026-08-10" } },
    { "cat:2": { n: 5, met: "2026-08-02", last: "2026-08-11" } },
  );
  assert.deepStrictEqual(
    m["cat:2"],
    { n: 5, met: "2026-08-01", last: "2026-08-11" },
    "merge takes max days, earliest meeting, latest greeting",
  );
  assert.strictEqual(nameOf("cat", 7), nameOf("cat", 7), "names are deterministic");
}

// 12. the calendar inverse: clicking a cell finds its date
// roundtrip: cellOf(dateAtCell) — via planCity grid semantics
const { dateAtCell } = await import(join(out, "plan.js"));
assert.strictEqual(dateAtCell("2026-08", 5, 1), "2026-08-08", "cell maps to date");
assert.strictEqual(dateAtCell("2026-08", 0, 0), null, "before the 1st is empty ground");
assert.strictEqual(dateAtCell("2026-02", 6, 4), null, "past month end is empty ground");

// 13. link & tag parsing: wikilinks and #tags surface, code stays quiet
{
  const { linksOf, tagsOf } = await import(join(out, "metrics.js"));
  const body = "去了 [[2026-08-01 Today]] 和 [[散步筆記|那篇]],想到 #夜行 和 #city/走路。\n#end";
  assert.deepStrictEqual(linksOf(body), ["2026-08-01 Today", "散步筆記"], "wikilink targets, alias-safe");
  assert.deepStrictEqual(tagsOf(body), ["夜行", "city/走路", "end"], "unicode tags parse");
  assert.deepStrictEqual(linksOf("no links here"), [], "empty is empty");
}

// 14. commissions: real-time construction, idempotent merge, letters once
{
  const { resolveCommissions, mergeCommissions, progressOf, mergeLetters } = await import(
    join(out, "commissions.js")
  );
  const t0 = 1754000000000;
  const DAY = 86400000;
  const lib = { id: "library", block: 0, placedAt: t0, completedAt: null, rewardClaimed: false };
  assert.ok(progressOf(lib, t0 + DAY) > 0.3 && progressOf(lib, t0 + DAY) < 0.35, "a day of scaffolding");
  const mid = resolveCommissions([lib], t0 + DAY);
  assert.strictEqual(mid.scaffolds.length, 1, "still building after a day");
  const done = resolveCommissions([lib], t0 + 4 * DAY);
  assert.strictEqual(done.built.length, 1, "three days later the doors open");
  // two devices ordered on different days: earliest placement wins, claim sticks
  const m = mergeCommissions(
    [{ ...lib, rewardClaimed: true, completedAt: t0 + 3 * DAY }],
    [{ ...lib, placedAt: t0 + DAY, block: 2 }],
  );
  assert.strictEqual(m.length, 1, "one library, ever");
  assert.strictEqual(m[0].placedAt, t0, "earliest placement wins");
  assert.strictEqual(m[0].block, 0, "the winner keeps its block");
  assert.ok(m[0].rewardClaimed, "a claimed letter stays claimed");
  const L = mergeLetters(
    [{ id: "library", date: "2026-08-05", read: true }],
    [{ id: "library", date: "2026-08-06", read: false }],
  );
  assert.strictEqual(L.length, 1, "one letter per opening");
  assert.ok(L[0].read && L[0].date === "2026-08-05", "earliest date, read sticks");
}

// 15. the vault guard: a page with words in it is never silently replaced
{
  const { ObsidianClient } = await import(join(out, "obsidian.js"));
  const client = new ObsidianClient({ url: "http://x", key: "k", folder: "" });

  /** fake vault: one file, served with or without an mtime stamp */
  const vault = { content: "", stamped: true, missing: false, writes: 0 };
  globalThis.fetch = async (url, init = {}) => {
    if ((init.method ?? "GET") === "PUT") {
      vault.writes += 1;
      vault.content = init.body;
      return { ok: true, status: 200 };
    }
    if (vault.missing) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        content: vault.content,
        stat: vault.stamped ? { mtime: 1000 } : {},
      }),
    };
  };

  // a) no mtime stamp + the vault moved on → conflict, nothing written
  vault.content = "a night of real writing";
  vault.stamped = false;
  vault.writes = 0;
  let r = await client.writeGuarded("p.md", "> 19:12\n\n", 1000, "something older");
  assert.strictEqual(r.ok, false, "unstamped divergence is a conflict");
  assert.strictEqual(vault.writes, 0, "and nothing was written");

  // b) we believe the page is new, but it already holds words → conflict
  vault.stamped = true;
  vault.writes = 0;
  r = await client.writeGuarded("p.md", "x", null, null);
  assert.strictEqual(r.ok, false, "a page we think is new is never clobbered");
  assert.strictEqual(vault.writes, 0, "and nothing was written");

  // c) a genuinely absent page is ours to create
  vault.missing = true;
  vault.writes = 0;
  r = await client.writeGuarded("new.md", "first words", null, null);
  assert.ok(r.ok && vault.writes === 1, "a real 404 writes");

  // d) the ordinary edit still goes through
  vault.missing = false;
  vault.content = "yesterday";
  vault.stamped = true;
  vault.writes = 0;
  r = await client.writeGuarded("p.md", "yesterday and today", 1000, "yesterday");
  assert.ok(r.ok && vault.writes === 1, "an ordinary edit saves");
}

// 16. the save file is as irreplaceable as the notes: never broadcast a
// state that has not seen the vault copy, never replace what we cannot read
{
  const { decideVaultWrite, EMPTY_STATE } = await import(join(out, "shop.js"));
  const mine = { ...EMPTY_STATE, owned: ["cats"], name: "阿七", updatedAt: 200 };

  // a) the vault was never read (Obsidian opened late, browser cleared)
  let d = decideVaultWrite({ ...EMPTY_STATE, updatedAt: 300 }, '{"owned":["dog"],"updatedAt":100}',
    { loaded: false, readFailed: false });
  assert.strictEqual(d.action, "skip", "an unloaded save never broadcasts");

  // b) the file is there but unreadable right now — leave it alone
  d = decideVaultWrite(mine, null, { loaded: true, readFailed: true });
  assert.strictEqual(d.action, "skip", "an unreadable save is never replaced");

  // c) half-written or corrupt JSON is not ours to overwrite
  d = decideVaultWrite(mine, "{not json", { loaded: true, readFailed: false });
  assert.strictEqual(d.action, "skip", "a corrupt save is never replaced");

  // d) another device moved on: fold it in rather than overwrite
  d = decideVaultWrite(mine, JSON.stringify({ owned: ["dog"], name: "", updatedAt: 900 }),
    { loaded: true, readFailed: false });
  assert.strictEqual(d.action, "write", "a newer vault copy is merged, not refused");
  assert.ok(d.state.owned.includes("cats") && d.state.owned.includes("dog"), "both devices keep what they bought");
  assert.strictEqual(d.state.name, "阿七", "and a name is not erased by an empty one");

  // e) genuinely absent, and the ordinary case, still write
  d = decideVaultWrite(mine, null, { loaded: true, readFailed: false });
  assert.strictEqual(d.action, "write", "an absent save is created");
  d = decideVaultWrite(mine, JSON.stringify({ updatedAt: 10 }), { loaded: true, readFailed: false });
  assert.strictEqual(d.action, "write", "our newer state saves normally");
}

console.log("city tests: all passed");
