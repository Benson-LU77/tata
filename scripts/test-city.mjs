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

console.log("city tests: all passed");
