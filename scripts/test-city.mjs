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

console.log("city tests: all passed");
