/**
 * Residents — pure f(t). No simulation state: given a time, every creature
 * has a position, so a sleeping tab wakes up consistent and everything is
 * testable. People circle their home block on the streets, cats wander
 * shorter kerb loops, birds cross the sky. Counts grow sub-linearly with
 * the number of notes — a city with company, not a crowd.
 */

import type { CityPlan } from "./plan";
import { CELL } from "./plan";
import { rng, hash32 } from "./layout";

export type CreatureKind = "person" | "cat" | "bird" | "dog" | "you";

export type CreatureExtras = { cats: number; birds: number; dogs: number };

export type Creature = {
  /** render index only — never persist anything against this */
  id: number;
  /** stable identity ("person:7", "cat:2") — populations only grow, so a
   *  key never changes hands; bonds and looks may safely attach to it */
  key: string;
  kind: CreatureKind;
  seed: number;
  /** anchor: which block (index into plan.blocks) it lives around */
  block: number;
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  /** heading in radians */
  facing: number;
  moving: boolean;
  /** walk-cycle phase 0..2π */
  phase: number;
};

const BLOCK_SPAN_X = 7 * CELL;
const BLOCK_SPAN_Z = 6 * CELL;
const MARGIN = CELL * 0.5;

export function creaturesFor(
  plan: CityPlan,
  noteCount: number,
  extras: CreatureExtras = { cats: 0, birds: 0, dogs: 0 },
): Creature[] {
  if (plan.blocks.length === 0 || noteCount === 0) return [];
  const people = Math.min(60, Math.max(2, Math.round(3 * Math.log(1 + noteCount))));
  const cats = Math.min(12, Math.floor(noteCount / 8)) + extras.cats;
  const birds = Math.min(8, Math.floor(noteCount / 15)) + extras.birds;
  const out: Creature[] = [];
  let id = 0;
  const add = (kind: CreatureKind, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const key = `${kind}:${i}`;
      const seed = hash32(key);
      out.push({ id, key, kind, seed, block: seed % plan.blocks.length });
      id += 1;
    }
  };
  add("person", people);
  add("cat", cats);
  add("bird", birds);
  add("dog", extras.dogs);
  // and you — one amber figure, living in the newest month
  out.push({ id, key: "you:0", kind: "you", seed: 0xa11ce, block: plan.blocks.length - 1 });
  return out;
}

/** rectangular street loop around a block, with idle pauses at corners */
function loopPose(
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  speed: number,
  pauseFrac: number,
  t: number,
  clockwise: boolean,
): { x: number; z: number; facing: number; moving: boolean; dist: number } {
  const perim = 4 * (halfX + halfZ);
  const loopTime = perim / speed / (1 - pauseFrac);
  let p = (t % loopTime) / loopTime; // 0..1 including pauses
  // counter-clockwise walkers traverse the ring in reverse, so their
  // velocity is opposite the segment direction — flip facing to match
  const dir = clockwise ? 1 : -1;
  if (!clockwise) p = 1 - p;
  // four segments, each with a pause at its end
  const segTimes = [halfX * 2, halfZ * 2, halfX * 2, halfZ * 2].map(
    (l) => (l / perim) * (1 - pauseFrac),
  );
  const pause = pauseFrac / 4;
  let x = cx - halfX;
  let z = cz - halfZ;
  let facing = 0;
  let moving = true;
  let acc = 0;
  const corners = [
    { x: cx + halfX, z: cz - halfZ, dx: 1, dz: 0 },
    { x: cx + halfX, z: cz + halfZ, dx: 0, dz: 1 },
    { x: cx - halfX, z: cz + halfZ, dx: -1, dz: 0 },
    { x: cx - halfX, z: cz - halfZ, dx: 0, dz: -1 },
  ];
  let sx = cx - halfX;
  let sz = cz - halfZ;
  for (let s = 0; s < 4; s += 1) {
    const seg = segTimes[s];
    const corner = corners[s];
    if (p < acc + seg) {
      const f = (p - acc) / seg;
      x = sx + (corner.x - sx) * f;
      z = sz + (corner.z - sz) * f;
      facing = Math.atan2(corner.dx * dir, corner.dz * dir);
      moving = true;
      return { x, z, facing, moving, dist: 0 };
    }
    acc += seg;
    if (p < acc + pause) {
      x = corner.x;
      z = corner.z;
      facing = Math.atan2(corner.dx * dir, corner.dz * dir);
      moving = false;
      return { x, z, facing, moving, dist: 0 };
    }
    acc += pause;
    sx = corner.x;
    sz = corner.z;
  }
  return { x, z, facing, moving, dist: 0 };
}

export function poseAt(c: Creature, plan: CityPlan, tSec: number): Pose {
  const rand = rng(c.seed);
  const block = plan.blocks[c.block] ?? plan.blocks[0];
  const cx = block.x + BLOCK_SPAN_X / 2;
  const cz = block.z + BLOCK_SPAN_Z / 2;
  const t = tSec + rand() * 500; // phase offset per creature

  if (c.kind === "bird") {
    // straight glides across the whole city, wrapping
    const b = plan.bounds;
    const w = b.maxX - b.minX + 60;
    const speed = 3.5 + rand() * 2;
    const zLane = b.minZ + ((c.seed >>> 6) % 100) / 100 * (b.maxZ - b.minZ);
    const x = b.minX - 30 + ((t * speed) % w);
    const y = 8 + rand() * 6;
    return { x, y, z: zLane + Math.sin(t * 0.6 + rand() * 6) * 2, facing: Math.PI / 2, moving: true, phase: t * 9 };
  }

  if (c.kind === "cat") {
    const side = MARGIN * 0.6;
    const p = loopPose(
      cx,
      cz,
      BLOCK_SPAN_X / 2 + side,
      BLOCK_SPAN_Z / 2 + side,
      0.9 + rand() * 0.5,
      0.45,
      t,
      rand() < 0.5,
    );
    return { ...p, y: 0, phase: t * 6 };
  }

  if (c.kind === "dog") {
    // the dog patrols: faster, wider loop, hardly ever stops
    const p = loopPose(
      cx,
      cz,
      BLOCK_SPAN_X / 2 + MARGIN * 1.4,
      BLOCK_SPAN_Z / 2 + MARGIN * 1.4,
      2.4 + rand() * 0.6,
      0.08,
      t,
      rand() < 0.5,
    );
    return { ...p, y: 0, phase: t * 9 };
  }

  if (c.kind === "you") {
    // you walk the newest block, unhurried, pausing often
    const p = loopPose(
      cx,
      cz,
      BLOCK_SPAN_X / 2 + MARGIN,
      BLOCK_SPAN_Z / 2 + MARGIN,
      1.1,
      0.42,
      t,
      true,
    );
    return { ...p, y: 0, phase: t * 6.5 };
  }

  const p = loopPose(
    cx,
    cz,
    BLOCK_SPAN_X / 2 + MARGIN,
    BLOCK_SPAN_Z / 2 + MARGIN,
    1.4 + rand() * 0.9,
    0.3,
    t,
    rand() < 0.5,
  );
  return { ...p, y: 0, phase: t * 7 };
}
