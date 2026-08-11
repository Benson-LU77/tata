"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { CityPlan, Lot } from "../lib/city/plan";
import { FLOOR_H } from "../lib/city/plan";
import { massing } from "../lib/city/voxel";
import { PALETTE } from "../lib/city/palette";
import { buildAtlas } from "../lib/city/sprites/atlas";
import { SPRITE_WORLD_H } from "../lib/city/sprites/data";
import { creaturesFor, poseAt } from "../lib/city/residents";
import type { Creature, CreatureExtras } from "../lib/city/residents";
import { CELL } from "../lib/city/plan";
import { rng } from "../lib/city/layout";

/**
 * The 3D city — native pixel pipeline.
 * Everything renders into a low-res target (~270 px tall, NearestFilter),
 * then a palette-quantise + Bayer-dither pass integer-scales it up. The
 * camera is orthographic (perspective breaks pixel stability) and orbits
 * with 45° detents. Amber remains reserved for tonight's building.
 */

const ELEVATION = 0.62; // rad, camera tilt above horizon

function hashBlock(month: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < month.length; i += 1) {
    h ^= month.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

let reducedMotionCache: boolean | null = null;
function prefersReducedMotion(): boolean {
  if (reducedMotionCache === null) {
    reducedMotionCache =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return reducedMotionCache;
}
const VIRTUAL_H = 324;
const INTRO_MS = 1600;
const YAW_DETENT = Math.PI / 4;

/**
 * Zoom detents defined by the resident's on-screen pixel height
 * (view = personWorld · cos(elevation) · VIRTUAL_H / px ≈ 342.9 / px).
 * Every stop lands sprites on an exact integer texel scale; the default
 * frames one month block with residents 12 px tall.
 */
const VIEW_STOPS = [64, 42.9, 28.6, 21.4, 14.3, 10.7, 7.1];
const VIEW_DEFAULT = VIEW_STOPS[2];
const VIEW_MIN = VIEW_STOPS[VIEW_STOPS.length - 1];

const QUANT_FRAG = `
precision mediump float;
uniform sampler2D uScene;
uniform vec2 uRes;
varying vec2 vUv;

const int STEPS = 8;
uniform vec3 uPal[STEPS];
uniform vec3 uAmber;
uniform vec3 uAmberDim;
uniform float uFog;
uniform float uTime;

float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int m[16];
  m[0]=0; m[1]=8; m[2]=2; m[3]=10;
  m[4]=12; m[5]=4; m[6]=14; m[7]=6;
  m[8]=3; m[9]=11; m[10]=1; m[11]=9;
  m[12]=15; m[13]=7; m[14]=13; m[15]=5;
  int idx = y * 4 + x;
  float v = 0.0;
  for (int i = 0; i < 16; i++) { if (i == idx) v = float(m[i]); }
  return (v + 0.5) / 16.0 - 0.5;
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 src = texture2D(uScene, vUv);
  vec3 c = src.rgb;
  // alpha-tag channel: hand-drawn pixels carry their palette index in
  // alpha ((i+0.5)/16, i 0..7 grey, 8..11 amber ramp) and skip the whole
  // tone pipeline — no pow remap, no dither, colours land exactly
  if (src.a < 0.94) {
    int ti = int(src.a * 16.0);
    vec3 outc = uPal[0];
    for (int i = 0; i < STEPS; i++) { if (i == ti) outc = uPal[i]; }
    if (ti == 8) outc = uAmberDim;
    if (ti == 9) outc = mix(uAmberDim, uAmber, 0.45);
    if (ti == 10) outc = uAmber;
    if (ti == 11) outc = uAmber * 1.16;
    gl_FragColor = vec4(outc, 1.0);
    return;
  }
  float warm = c.r - c.b;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  if (warm > 0.08) {
    // amber channel — tonight's light survives quantisation untouched
    gl_FragColor = vec4(mix(uAmberDim, uAmber, clamp(lum * 1.6, 0.0, 1.0)), 1.0);
    return;
  }
  if (lum < 0.035) {
    // deep space — composed in virtual-pixel space so it stays chunky
    vec2 vp = floor(vUv * uRes);
    lum = 0.008;

    // the galaxy: a rich diagonal river of dust and stars
    vec2 gdir = normalize(vec2(0.42, 1.0));
    float gd = abs(dot(vUv - vec2(0.5, 0.62), gdir));
    float gband = smoothstep(0.34, 0.0, gd);
    vec2 cell = floor(vp / 3.0);
    float gn = hash21(cell) * 0.6 + hash21(cell + 31.0) * 0.4;
    lum += gband * gband * (0.13 + gn * 0.22);

    // stars: a faint under-layer, much denser inside the band
    float s = hash21(vp);
    if (s > 0.994) lum = max(lum, 0.08 + 0.1 * hash21(vp + 3.0));
    if (s > 0.9982) lum = max(lum, 0.22 + 0.5 * hash21(vp + 7.0));
    if (gband > 0.2 && s > 0.972) lum = max(lum, 0.16 + 0.34 * hash21(vp + 13.0));
    if (s > 0.9993 && gband > 0.15) lum = 0.85; // jewels inside the band

    // a far gas giant, top left — it rotates
    vec2 pd = (vUv - vec2(0.16, 0.78)) * uRes;
    float pdist = length(pd);
    float ring = abs(length(pd / vec2(1.0, 0.42)) - 9.5);
    if (ring < 1.3 && pdist > 4.6) lum = 0.5 - ring * 0.18;
    if (pdist < 5.0) {
      float lat = pd.y / 5.0;
      float halfw = sqrt(max(0.04, 25.0 - pd.y * pd.y));
      float lon = asin(clamp(pd.x / halfw, -1.0, 1.0)) + uTime * 0.22;
      float bands2 = sin(lat * 8.0 + sin(lon * 2.0) * 1.2) * 0.5 + 0.5;
      lum = 0.42 + bands2 * 0.2 - lat * 0.05;
      float spot = cos(lon + 1.4) * cos(lat * 2.6);
      if (spot > 0.82) lum -= 0.2; // the storm, drifting across
      lum -= (pd.x + pd.y) * 0.013; // terminator
    }

    // a shooting star every ~47 s, deterministic
    float cyc = floor(uTime / 47.0);
    float ct = fract(uTime / 47.0) * 47.0;
    if (ct < 0.9) {
      vec2 a = vec2(0.15 + hash21(vec2(cyc, 1.0)) * 0.7, 0.95);
      vec2 dir2 = normalize(vec2(0.55, -1.0));
      vec2 head = a + dir2 * (ct / 0.9) * 0.5;
      vec2 rel = (vUv - head) * uRes;
      float along = dot(rel, -dir2);
      float off = abs(dot(rel, vec2(-dir2.y, dir2.x)));
      if (off < 0.8 && along > 0.0 && along < 7.0) {
        lum = max(lum, 0.8 - along * 0.11);
      }
    }
  }
  // sea fog: the far blocks half-dissolve into a pale band
  float band = smoothstep(0.38, 0.6, vUv.y) * (1.0 - smoothstep(0.62, 0.88, vUv.y));
  lum = mix(lum, max(lum, 0.17), uFog * band);
  float d = bayer(floor(vUv * uRes)) * (1.0 / float(STEPS));
  float t = clamp(pow(lum, 0.6) + d, 0.0, 0.999);
  int idx = int(t * float(STEPS));
  vec3 outc = uPal[0];
  for (int i = 0; i < STEPS; i++) { if (i == idx) outc = uPal[i]; }
  gl_FragColor = vec4(outc, 1.0);
}
`;

const BUILDING_VERT = `
attribute vec3 aTint;   // instance tone multiplier (or amber flag in .r>1)
attribute vec2 aInfo;   // x: lit 0..1, y: rand
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vTint;
varying vec2 vInfo;
void main() {
  vNormal = normalize(mat3(instanceMatrix) * normal);
  vec4 w = instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vTint = aTint;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BUILDING_FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vTint;
varying vec2 vInfo;
uniform float uFloorH;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

uniform float uSkin;

void main() {
  vec3 n = abs(vNormal);
  // unlit three-tone faces: top brightest, x-side dark, z-front mid
  float tone = (n.y > 0.5 ? 0.68 : (n.x > n.z ? 0.38 : 0.58)) * uSkin;
  float amber = step(1.9, vTint.r);
  vec3 base = amber > 0.5 ? vec3(0.55, 0.38, 0.16) : vTint * tone;

  // windows on vertical faces: one band per storey, sparse lit cells
  if (n.y < 0.5) {
    float floorIdx = floor(vWorld.y / uFloorH);
    float u = n.x > n.z ? vWorld.z : vWorld.x;
    float colIdx = floor(u * 3.0);
    float f = fract(vWorld.y / uFloorH);
    float inBand = step(0.3, f) * step(f, 0.72);
    float cell = fract(u * 3.0);
    float inCol = step(0.25, cell) * step(cell, 0.75);
    float h = hash(vec2(floorIdx + vInfo.y * 91.7, colIdx));
    float on = step(1.0 - (0.10 + vInfo.x * 0.35), h);
    float glow = inBand * inCol * on;
    if (amber > 0.5) {
      base = mix(base, vec3(0.95, 0.70, 0.35), glow);
    } else {
      base = mix(base, vec3(0.86, 0.88, 0.92) * (0.5 + 0.5 * hash(vec2(colIdx, floorIdx))), glow * 0.9);
    }
    // faint storey seam
    base *= 1.0 - 0.12 * step(f, 0.08);
  }
  gl_FragColor = vec4(base, 1.0);
}
`;

type Handles = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  rt: THREE.WebGLRenderTarget;
  quantScene: THREE.Scene;
  quantCam: THREE.OrthographicCamera;
  quantMat: THREE.ShaderMaterial;
  mesh: THREE.InstancedMesh | null;
  buildingMat: THREE.ShaderMaterial | null;
  lotOfInstance: Lot[];
  boxesPerInstance: { lot: Lot; box: { x: number; y: number; z: number; w: number; h: number; d: number } }[];
  spriteMesh: THREE.InstancedMesh | null;
  spriteMat: THREE.ShaderMaterial | null;
  spriteFrames: Record<string, { x: number; y: number; w: number; h: number }>;
  spriteRect: THREE.InstancedBufferAttribute | null;
  spriteParam: THREE.InstancedBufferAttribute | null;
  creatures: Creature[];
  weatherMesh: THREE.InstancedMesh | null;
  beam: THREE.Mesh | null;
};

const WEATHER_N = 480;

const CREATURE_FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vTint;
void main() {
  vec3 n = abs(vNormal);
  float tone = n.y > 0.5 ? 1.0 : (n.x > n.z ? 0.55 : 0.78);
  if (vTint.r > 1.9) {
    // you — the one amber figure in the city
    gl_FragColor = vec4(vec3(0.92, 0.62, 0.22) * tone, 1.0);
    return;
  }
  gl_FragColor = vec4(vTint * tone, 1.0);
}
`;

const CREATURE_VERT = `
attribute vec3 aTint;
varying vec3 vNormal;
varying vec3 vTint;
void main() {
  vNormal = normalize(mat3(instanceMatrix) * normal);
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

/**
 * Residents are hand-drawn pixel sprites on camera-facing quads. The
 * vertex shader snaps each quad to the virtual-pixel grid at an integer
 * texel scale, so the art lands exactly as drawn — the sprite-sheet look
 * of the reference pieces, inside a true 3D city. One quad per creature
 * plus one optional overlay (umbrella) per person when it rains.
 */
const SPRITE_VERT = `
attribute vec4 aRect;   // atlas rect in texels: x, y, w, h
attribute vec3 aParam;  // world height, mirror flag, amber flag
varying vec2 vUv2;
varying float vAmber;
uniform vec2 uRes;
uniform float uPxY;      // virtual pixels per world unit (vertical)
uniform float uAtlas;
uniform vec3 uCamOff;    // small shift toward the camera for depth
uniform float uSnap;     // 1 when the camera is at rest on a detent
void main() {
  vAmber = aParam.z;
  vec4 anchor = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  anchor.xyz += uCamOff;
  vec4 clip = projectionMatrix * viewMatrix * anchor;
  vec2 pix = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
  float kf = aParam.x * uPxY / max(aRect.w, 1.0);
  float k = uSnap > 0.5 ? max(1.0, floor(kf + 0.5)) : max(0.25, kf);
  vec2 corner = vec2(position.x + 0.5, position.y);
  vec2 sz = aRect.zw * k;
  vec2 p = pix + vec2((corner.x - 0.5) * sz.x, corner.y * sz.y);
  if (uSnap > 0.5) p = floor(p + 0.5);
  vec2 ndc = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(ndc * clip.w, clip.z, clip.w);
  float u = mix(corner.x, 1.0 - corner.x, aParam.y);
  vUv2 = (aRect.xy + vec2(u * aRect.z, (1.0 - corner.y) * aRect.w)) / uAtlas;
}
`;

const SPRITE_FRAG = `
precision mediump float;
varying vec2 vUv2;
varying float vAmber;
uniform sampler2D uTex;
void main() {
  float a = texture2D(uTex, vUv2).a;
  if (a > 0.94) discard; // transparent
  float i = floor(a * 16.0);
  if (vAmber > 0.5 && i > 1.5) {
    // the amber you: mid greys onto the amber ramp, outline stays dark
    i = i < 3.5 ? 8.0 : (i < 5.5 ? 9.0 : (i < 6.5 ? 10.0 : 11.0));
  }
  gl_FragColor = vec4(0.0, 0.0, 0.0, (i + 0.5) / 16.0);
}
`;

export type CityDecor = {
  lamps: boolean;
  trees: boolean;
  fountain: boolean;
  harbor: boolean;
  viaduct: boolean;
  observatory: boolean;
};
export type CityWeather = "none" | "rain" | "snow" | "fog";

export function City3D({
  plan,
  focus,
  matches,
  intro,
  extras,
  decor,
  skin,
  weather,
  writeMode,
  goMonth,
  ceremony,
  levelCap,
  streak,
  onHover,
  onOpen,
  onFail,
}: {
  plan: CityPlan;
  focus: string | null;
  matches: Set<string> | null;
  intro: boolean;
  extras: CreatureExtras;
  decor: CityDecor;
  skin: "base" | "chalk" | "ink";
  weather: CityWeather;
  /** writing mode: frame a close-up of the focus lot, not the whole city */
  writeMode: boolean;
  goMonth: { x: number; z: number; n: number } | null;
  /** a new structure just settled — beam of amber light + camera glide */
  ceremony: { file: string; n: number } | null;
  /** skyline height limit in floors — levelling up lets the city grow */
  levelCap: number;
  /** consecutive nights written — streetlights on the newest block */
  streak: number;
  onHover: (file: string | null, x: number, y: number) => void;
  onOpen: (file: string) => void;
  onFail: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hRef = useRef<Handles | null>(null);
  const yawRef = useRef(Math.PI / 4);
  const yawTargetRef = useRef(Math.PI / 4);
  const settledYawRef = useRef(Math.PI / 4);
  const viewRef = useRef(VIEW_DEFAULT);
  const viewGoalRef = useRef<number | null>(null);
  const viewSnapTimerRef = useRef<number | null>(null);
  const centerRef = useRef(new THREE.Vector3());
  const panRef = useRef({ x: 0, z: 0 });
  const panTargetRef = useRef<{ x: number; z: number } | null>(null);
  const introStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDrawRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; yaw: number; moved: boolean; pan: boolean; px: number; pz: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; view: number } | null>(null);
  /** per-file eased floor count — new buildings rise, edits grow smoothly */
  const growRef = useRef(new Map<string, number>());
  const knownFilesRef = useRef<Set<string> | null>(null);
  const growLastRef = useRef(0);
  const buildingsDirtyRef = useRef(true);
  const weatherSeedsRef = useRef<Float32Array | null>(null);
  const ceremonyRef = useRef<{ x: number; z: number; start: number } | null>(null);
  const waveRef = useRef<{ x: number; z: number; start: number; oldCap: number } | null>(null);
  const prevCapRef = useRef<number | null>(null);
  const hoverRef = useRef<string | null>(null);
  const stateRef = useRef({ plan, focus, matches, weather, levelCap, writeMode });

  useEffect(() => {
    stateRef.current = { plan, focus, matches, weather, levelCap, writeMode };
  }, [plan, focus, matches, weather, levelCap, writeMode]);

  /* ---------- frame ---------- */

  const applyInstances = useCallback((now: number) => {
    const h = hRef.current;
    if (!h || !h.mesh) return false;
    if (!buildingsDirtyRef.current) return false; // still city: skip 3000 matrices
    const { focus: fc, matches: mt } = stateRef.current;
    let animating = false;

    let introP = 1;
    if (introStartRef.current !== null) {
      introP = Math.min(1, (now - introStartRef.current) / INTRO_MS);
      if (introP < 1) animating = true;
    }

    // growth easing clock
    const gdt = Math.min(600, now - growLastRef.current);
    growLastRef.current = now;
    const gk = 1 - Math.exp(-gdt / 900);

    const m = new THREE.Matrix4();
    const tintAttr = h.mesh.geometry.getAttribute("aTint") as THREE.InstancedBufferAttribute;
    const n = h.boxesPerInstance.length;
    for (let i = 0; i < n; i += 1) {
      const { lot, box } = h.boxesPerInstance[i];
      const start = 0.1 + (((lot.seed >>> 12) % 100) / 100) * 0.6;
      const riseT = Math.min(1, Math.max(0, (introP - start) / 0.3));
      let rise = 1 - (1 - riseT) ** 3;

      // per-building growth: new files rise from the ground, edits grow smoothly
      if (!lot.file.startsWith("__") && lot.floors > 0) {
        let capNow = stateRef.current.levelCap;
        const wave = waveRef.current;
        if (wave) {
          const age = (now - wave.start) / 1000;
          if (age > 6) {
            waveRef.current = null;
          } else {
            const dist = Math.hypot(lot.x - wave.x, lot.z - wave.z);
            if (dist > age * 30) capNow = wave.oldCap; // the wave hasn't reached here yet
            else animating = true;
          }
        }
        const target = Math.min(lot.floors, capNow);
        let df = growRef.current.get(lot.file);
        if (df === undefined) {
          df = target;
          growRef.current.set(lot.file, df);
        }
        if (Math.abs(target - df) > 0.02) {
          df += (target - df) * gk;
          growRef.current.set(lot.file, df);
          animating = true;
        }
        rise *= Math.max(0.02, df / lot.floors);
      }

      // storey-quantised rise: floors land one by one
      const targetH = box.h;
      const currentH = Math.max(
        FLOOR_H * 0.5,
        Math.round((targetH * rise) / FLOOR_H) * FLOOR_H,
      );
      m.makeScale(box.w, currentH, box.d);
      m.setPosition(box.x, box.y * rise, box.z);
      h.mesh.setMatrixAt(i, m);

      // tint: amber for focus, ghost for search misses
      if (lot.file === "__ground__") {
        tintAttr.setXYZ(i, 0.42, 0.42, 0.45);
        continue;
      }
      if (lot.file === "__street__") {
        tintAttr.setXYZ(i, 0.56, 0.56, 0.58);
        continue;
      }
      if (lot.file === "__decor__") {
        // seed marks the part: 2 structure, 3 lamp head, 4 foliage, 5 sparkle
        const v =
          lot.seed === 3 ? 1.5 : lot.seed === 4 ? 0.98 : lot.seed === 5 ? 1.6 : lot.seed === 7 ? 0.82 : 0.55;
        tintAttr.setXYZ(i, v, v, v * 1.03);
        continue;
      }
      const isFocus = fc === lot.file;
      const dimmed = mt ? !mt.has(lot.file) : false;
      const grey = 0.72 + ((lot.seed >>> 8) % 100) / 400;
      if (isFocus) {
        tintAttr.setXYZ(i, 2.0, 2.0, 2.0); // flag: amber path in shader
      } else if (dimmed) {
        tintAttr.setXYZ(i, grey * 0.28, grey * 0.28, grey * 0.3);
      } else {
        tintAttr.setXYZ(i, grey, grey, grey * 1.04);
      }
    }
    h.mesh.instanceMatrix.needsUpdate = true;
    tintAttr.needsUpdate = true;
    if (!animating) buildingsDirtyRef.current = false; // settled — rest until poked
    return animating;
  }, []);

  const applyCreatures = useCallback((now: number) => {
    const h = hRef.current;
    if (!h || !h.spriteMesh || !h.spriteRect || !h.spriteParam || h.creatures.length === 0)
      return false;
    const { plan: pl, weather: w } = stateRef.current;
    const t = now / 1000;
    const m = new THREE.Matrix4();
    const rect = h.spriteRect;
    const param = h.spriteParam;
    const camYaw = settledYawRef.current;

    // pass 1: everyone's pose, then social adjustments
    const poses = h.creatures.map((c) => poseAt(c, pl, t));
    const chat = new Array(h.creatures.length).fill(false);

    // people who pause near each other stop and chat, facing one another
    for (let i = 0; i < h.creatures.length; i += 1) {
      const ci = h.creatures[i];
      if (ci.kind !== "person" && ci.kind !== "you") continue;
      if (poses[i].moving) continue;
      for (let j = i + 1; j < h.creatures.length; j += 1) {
        const cj = h.creatures[j];
        if (cj.kind !== "person" && cj.kind !== "you") continue;
        if (poses[j].moving) continue;
        const dx = poses[i].x - poses[j].x;
        const dz = poses[i].z - poses[j].z;
        if (dx * dx + dz * dz < 2.6) {
          poses[i] = { ...poses[i], facing: Math.atan2(-dx, -dz) };
          poses[j] = { ...poses[j], facing: Math.atan2(dx, dz) };
          chat[i] = true;
          chat[j] = true;
        }
      }
    }

    // the dog chases a cat for a little while every minute
    const chasing = t % 60 < 8;
    if (chasing) {
      const catIdx: number[] = [];
      h.creatures.forEach((c, i) => {
        if (c.kind === "cat") catIdx.push(i);
      });
      h.creatures.forEach((c, i) => {
        if (c.kind !== "dog" || catIdx.length === 0) return;
        const target = h.creatures[catIdx[c.seed % catIdx.length]];
        // run the cat's own ring, 1.1 s behind — an honest pursuit
        poses[i] = { ...poseAt(target, pl, t - 1.1), phase: t * 11 };
      });
    }

    // pass 2: one pixel-snapped quad per creature (+ umbrella overlays)
    let si = 0;
    const place = (
      name: string,
      x: number,
      y: number,
      z: number,
      worldH: number,
      mirror: number,
      amber: number,
    ) => {
      const f = h.spriteFrames[name];
      if (!f || si >= h.spriteMesh!.count) return;
      m.makeTranslation(x, y, z);
      h.spriteMesh!.setMatrixAt(si, m);
      rect.setXYZW(si, f.x, f.y, f.w, f.h);
      param.setXYZ(si, worldH, mirror, amber);
      si += 1;
    };
    for (let i = 0; i < h.creatures.length; i += 1) {
      const c = h.creatures[i];
      const p = poses[i];
      // screen-space heading relative to the settled camera yaw picks the
      // drawing: |right| wins ties so street walkers show their profile
      const rel = p.facing - camYaw;
      const sx = Math.sin(rel);
      const sz = Math.cos(rel);
      let dir: "S" | "E" | "N" = "E";
      let mirror = 0;
      if (Math.abs(sx) >= Math.abs(sz) - 1e-6) {
        mirror = sx < 0 ? 1 : 0;
      } else {
        dir = sz > 0 ? "S" : "N";
      }
      const beat = Math.floor(p.phase / Math.PI) % 2 === 0 ? "a" : "b";
      if (c.kind === "bird") {
        const y = p.y + Math.sin(p.phase * 0.5) * 0.3;
        place(`bird_E_${beat}`, p.x, y, p.z, SPRITE_WORLD_H.bird, mirror, 0);
        continue;
      }
      const frame = p.moving ? beat : "i";
      place(
        `${c.kind}_${dir}_${frame}`,
        p.x,
        p.y,
        p.z,
        SPRITE_WORLD_H[c.kind],
        mirror,
        c.kind === "you" ? 1 : 0,
      );
      if (w === "rain" && (c.kind === "person" || c.kind === "you")) {
        place("umbrella", p.x, p.y + SPRITE_WORLD_H[c.kind] * 0.92, p.z, SPRITE_WORLD_H.umbrella, 0, 0);
      }
    }
    for (; si < h.spriteMesh.count; si += 1) rect.setXYZW(si, 0, 0, 0, 0);
    h.spriteMesh.instanceMatrix.needsUpdate = true;
    rect.needsUpdate = true;
    param.needsUpdate = true;
    return true;
  }, []);

  const applyWeather = useCallback((now: number) => {
    const h = hRef.current;
    if (!h || !h.weatherMesh) return false;
    const w = stateRef.current.weather;
    if (w !== "rain" && w !== "snow") {
      if (h.weatherMesh.visible) h.weatherMesh.visible = false;
      return false;
    }
    h.weatherMesh.visible = true;
    if (!weatherSeedsRef.current) {
      const s = new Float32Array(WEATHER_N * 3);
      let a = 12345;
      const r = () => {
        a = (a * 1664525 + 1013904223) >>> 0;
        return a / 4294967296;
      };
      for (let i = 0; i < WEATHER_N * 3; i += 1) s[i] = r();
      weatherSeedsRef.current = s;
    }
    const seeds = weatherSeedsRef.current;
    const b = stateRef.current.plan.bounds;
    const t = now / 1000;
    const H = 15;
    const m = new THREE.Matrix4();
    const spanX = b.maxX - b.minX + 20;
    const spanZ = b.maxZ - b.minZ + 20;
    for (let i = 0; i < WEATHER_N; i += 1) {
      const sx = seeds[i * 3];
      const sz = seeds[i * 3 + 1];
      const ph = seeds[i * 3 + 2];
      if (w === "rain") {
        const y = H - ((t * 11 + ph * H * 5) % H);
        m.makeScale(0.03, 0.5, 0.03);
        m.setPosition(b.minX - 10 + sx * spanX + y * 0.06, y, b.minZ - 10 + sz * spanZ);
      } else {
        const y = H - ((t * 1.3 + ph * H * 2) % H);
        m.makeScale(0.09, 0.09, 0.09);
        m.setPosition(
          b.minX - 10 + sx * spanX + Math.sin(t * 0.8 + ph * 6.28) * 0.6,
          y,
          b.minZ - 10 + sz * spanZ + Math.cos(t * 0.6 + ph * 6.28) * 0.6,
        );
      }
      h.weatherMesh.setMatrixAt(i, m);
    }
    h.weatherMesh.instanceMatrix.needsUpdate = true;
    return true;
  }, []);

  const frame = useCallback(
    (now: number) => {
      const h = hRef.current;
      const canvas = canvasRef.current;
      if (!h || !canvas) return false;

      // yaw glide toward detent
      let animating = false;
      const dt = Math.min(600, now - lastDrawRef.current);
      const dy = yawTargetRef.current - yawRef.current;
      if (Math.abs(dy) > 0.001) {
        yawRef.current += dy * (1 - Math.exp(-dt / 140));
        animating = true;
      } else {
        yawRef.current = yawTargetRef.current;
      }
      // pan glide (camera travelling to a building or a month)
      const pt = panTargetRef.current;
      if (pt) {
        const k = 1 - Math.exp(-dt / 220);
        panRef.current.x += (pt.x - panRef.current.x) * k;
        panRef.current.z += (pt.z - panRef.current.z) * k;
        if (Math.hypot(pt.x - panRef.current.x, pt.z - panRef.current.z) < 0.2) {
          panRef.current.x = pt.x;
          panRef.current.z = pt.z;
          panTargetRef.current = null;
        }
        animating = true;
      }
      lastDrawRef.current = now;

      // settling beam animation (1.6 s)
      const cer = ceremonyRef.current;
      if (h.beam) {
        if (cer) {
          const cp = (now - cer.start) / 1600;
          if (cp >= 1) {
            ceremonyRef.current = null;
            h.beam.visible = false;
          } else {
            const width = 0.9 * (1 - cp) + 0.12;
            h.beam.visible = true;
            h.beam.position.set(cer.x, 0, cer.z);
            h.beam.scale.set(width, 26 * (0.3 + 0.7 * Math.min(1, cp * 3)), width);
            animating = true;
          }
        } else if (h.beam.visible) {
          h.beam.visible = false;
        }
      }

      if (applyInstances(now)) animating = true;
      // the city lives: creatures keep the loop breathing unless reduced motion
      if (!prefersReducedMotion()) {
        if (applyCreatures(now)) animating = true;
        if (applyWeather(now)) animating = true;
      } else {
        applyCreatures(0);
        applyWeather(0);
      }

      // sizing: integer pixel scale in device pixels, exact letterbox
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dw = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const dh = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      const S = Math.max(2, Math.floor(dh / VIRTUAL_H));
      const vw = Math.max(1, Math.floor(dw / S));
      const vh = Math.max(1, Math.floor(dh / S));
      if (h.rt.width !== vw || h.rt.height !== vh) {
        h.rt.setSize(vw, vh);
        (h.quantMat.uniforms.uRes.value as THREE.Vector2).set(vw, vh);
      }
      const rendererSize = new THREE.Vector2();
      h.renderer.getSize(rendererSize);
      if (rendererSize.x !== dw || rendererSize.y !== dh) {
        h.renderer.setSize(dw, dh, false);
      }

      // camera from yaw/view/pan around city centre — the view height is
      // decoupled from city size (an endless city must not shrink its cast)
      const writing = stateRef.current.writeMode;
      if (viewGoalRef.current !== null) {
        const goal = viewGoalRef.current;
        viewRef.current += (goal - viewRef.current) * Math.min(1, dt / 110);
        if (Math.abs(viewRef.current - goal) < goal * 0.004) {
          viewRef.current = goal;
          viewGoalRef.current = null;
        }
        animating = true;
      }
      // writing is a close-up of one building, never a city-wide letterbox
      const view = writing ? 15 : viewRef.current;
      const aspect = vw / vh;
      h.camera.left = (-view * aspect) / 2;
      h.camera.right = (view * aspect) / 2;
      h.camera.top = view / 2 + view * 0.14;
      h.camera.bottom = -view / 2 + view * 0.14;
      const cx = centerRef.current.x + panRef.current.x;
      const cz = centerRef.current.z + panRef.current.z;
      // constant range: with far = 900 even a decade of months fits the
      // frustum (float32 world coords stay honest well past 500 units)
      const dist = 400;
      h.camera.position.set(
        cx + Math.sin(yawRef.current) * Math.cos(ELEVATION) * dist,
        Math.sin(ELEVATION) * dist,
        cz + Math.cos(yawRef.current) * Math.cos(ELEVATION) * dist,
      );
      h.camera.lookAt(cx, 0, cz);
      h.camera.updateProjectionMatrix();

      // sub-pixel snap: cancel the fractional part of the camera centre in
      // virtual-pixel space via the projection matrix (the camera itself
      // never moves), so panning cannot shimmer the pixel grid. Skipped
      // while the yaw glide or zoom ease is in flight.
      if (
        Math.abs(yawRef.current - yawTargetRef.current) < 1e-4 &&
        viewGoalRef.current === null
      ) {
        h.camera.updateMatrixWorld();
        const me = h.camera.matrixWorld.elements;
        const wppX = (h.camera.right - h.camera.left) / vw;
        const wppY = (h.camera.top - h.camera.bottom) / vh;
        const px = (cx * me[0] + cz * me[2]) / wppX;
        const py = (cx * me[4] + cz * me[6]) / wppY;
        const fx = px - Math.floor(px);
        const fy = py - Math.floor(py);
        h.camera.projectionMatrix.elements[12] -= (fx * 2) / vw;
        h.camera.projectionMatrix.elements[13] -= (fy * 2) / vh;
      }

      // sprite uniforms: pixel density, rest state, and a small shift
      // toward the camera so quads sit in front of their own ground
      if (h.spriteMat) {
        const su = h.spriteMat.uniforms;
        (su.uRes.value as THREE.Vector2).set(vw, vh);
        su.uPxY.value = vh / view;
        const settled =
          Math.abs(yawRef.current - yawTargetRef.current) < 1e-4 && viewGoalRef.current === null;
        su.uSnap.value = settled ? 1 : 0;
        if (settled) settledYawRef.current = yawRef.current;
        (su.uCamOff.value as THREE.Vector3)
          .set(
            Math.sin(yawRef.current) * Math.cos(ELEVATION),
            Math.sin(ELEVATION),
            Math.cos(yawRef.current) * Math.cos(ELEVATION),
          )
          .multiplyScalar(0.3);
      }

      // two-pass: scene → low-res RT → quantise to screen (centered
      // integer-multiple blit; the margin stays background)
      h.quantMat.uniforms.uTime.value = now / 1000;
      h.renderer.setRenderTarget(h.rt);
      h.renderer.render(h.scene, h.camera);
      h.renderer.setRenderTarget(null);
      const ox = Math.floor((dw - vw * S) / 2);
      const oy = Math.floor((dh - vh * S) / 2);
      h.renderer.setViewport(ox, oy, vw * S, vh * S);
      h.renderer.render(h.quantScene, h.quantCam);
      h.renderer.setViewport(0, 0, dw, dh);
      return animating;
    },
    [applyInstances, applyCreatures, applyWeather],
  );

  const loop = useCallback(() => {
    const step = (now: number) => {
      const animating = frame(now);
      if (animating) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(step);
  }, [frame]);

  /* ---------- scene lifecycle ---------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    } catch {
      onFail();
      return;
    }
    renderer.setClearColor(new THREE.Color("#05060a"));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 900);

    // (ground lives inside the instanced mesh — one flat slab per city)

    const rt = new THREE.WebGLRenderTarget(320, 270, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });

    const quantScene = new THREE.Scene();
    const quantCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pal = ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"];
    const quantMat = new THREE.ShaderMaterial({
      uniforms: {
        uScene: { value: rt.texture },
        uRes: { value: new THREE.Vector2(320, 270) },
        uPal: { value: pal.map((c) => new THREE.Color(c)) },
        uAmber: { value: new THREE.Color(PALETTE.amber) },
        uAmberDim: { value: new THREE.Color("#8a6c3c") },
        uFog: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader:
        "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: QUANT_FRAG,
    });
    quantScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quantMat));

    hRef.current = {
      renderer,
      scene,
      camera,
      rt,
      quantScene,
      quantCam,
      quantMat,
      mesh: null,
      lotOfInstance: [],
      boxesPerInstance: [],
      spriteMesh: null,
      spriteMat: null,
      spriteFrames: {},
      spriteRect: null,
      spriteParam: null,
      creatures: [],
      weatherMesh: null,
      beam: null,
      buildingMat: new THREE.ShaderMaterial({
        uniforms: { uFloorH: { value: FLOOR_H }, uSkin: { value: 1 } },
        vertexShader: BUILDING_VERT,
        fragmentShader: BUILDING_FRAG,
      }),
    };

    // resident sprites: one atlas texture, one material for the whole cast
    {
      const atlas = buildAtlas();
      const tex = new THREE.DataTexture(atlas.data, atlas.size, atlas.size, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      hRef.current.spriteFrames = atlas.frames;
      hRef.current.spriteMat = new THREE.ShaderMaterial({
        uniforms: {
          uTex: { value: tex },
          uRes: { value: new THREE.Vector2(1, 1) },
          uPxY: { value: 10 },
          uAtlas: { value: atlas.size },
          uCamOff: { value: new THREE.Vector3() },
          uSnap: { value: 1 },
        },
        vertexShader: SPRITE_VERT,
        fragmentShader: SPRITE_FRAG,
        blending: THREE.NoBlending,
        transparent: false,
        side: THREE.DoubleSide,
      });
    }

    // weather particles — one mesh, repurposed for rain or snow
    {
      const wGeo = new THREE.BoxGeometry(1, 1, 1);
      wGeo.translate(0, 0.5, 0);
      const wMat = new THREE.ShaderMaterial({
        vertexShader: CREATURE_VERT,
        fragmentShader: CREATURE_FRAG,
      });
      const wTints = new Float32Array(WEATHER_N * 3).fill(0.7);
      wGeo.setAttribute("aTint", new THREE.InstancedBufferAttribute(wTints, 3));
      const wMesh = new THREE.InstancedMesh(wGeo, wMat, WEATHER_N);
      wMesh.count = WEATHER_N;
      wMesh.frustumCulled = false;
      wMesh.visible = false;
      scene.add(wMesh);
      hRef.current.weatherMesh = wMesh;
    }

    // the settling beam — a column of amber light for new structures
    {
      const bGeo = new THREE.BoxGeometry(1, 1, 1);
      bGeo.translate(0, 0.5, 0);
      const bMesh = new THREE.Mesh(
        bGeo,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.55, 0.2) }),
      );
      bMesh.visible = false;
      scene.add(bMesh);
      hRef.current.beam = bMesh;
    }
    introStartRef.current = performance.now();
    loop();

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rt.dispose();
      hRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- build instances when the plan changes ---------- */

  useEffect(() => {
    const h = hRef.current;
    if (!h) return;
    buildingsDirtyRef.current = true; // fresh mesh needs its matrices
    if (h.mesh) {
      h.scene.remove(h.mesh);
      h.mesh.geometry.dispose(); // material is shared and lives on
    }
    const entries: Handles["boxesPerInstance"] = [];
    for (const lot of plan.lots) {
      for (const box of massing(lot)) entries.push({ lot, box });
    }
    const decorLot = (x: number, z: number): Lot => ({
      file: "__decor__",
      date: "",
      x,
      z,
      half: 0,
      floors: 0,
      seed: 2,
      lit: 0,
    });
    if (decor.harbor && plan.blocks.length > 0) {
      // a dock off the west edge of the first block
      const fb = plan.blocks[0];
      const hx = fb.x - CELL * 2.2;
      const hz = fb.z + 3 * CELL;
      entries.push({ lot: decorLot(hx, hz), box: { x: hx, y: -0.1, z: hz, w: 4.5, h: 0.25, d: 2.2 } });
      entries.push({ lot: { ...decorLot(hx, hz), seed: 3 }, box: { x: hx - 1.6, y: 0.15, z: hz - 0.6, w: 0.14, h: 1.7, d: 0.14 } });
      entries.push({ lot: { ...decorLot(hx, hz), seed: 3 }, box: { x: hx - 1.6, y: 1.85, z: hz - 0.6, w: 1.2, h: 0.12, d: 0.12 } });
      entries.push({ lot: decorLot(hx, hz), box: { x: hx + 1.4, y: 0.15, z: hz + 0.5, w: 0.8, h: 0.5, d: 0.8 } });
    }
    if (decor.viaduct && plan.blocks.length > 1) {
      // a high road linking the first two blocks
      const a = plan.blocks[0];
      const bb = plan.blocks[1];
      const ax = a.x + 7.5 * CELL;
      const bx2 = bb.x - 0.5 * CELL;
      const vz = a.z + 3 * CELL;
      const mid = (ax + bx2) / 2;
      const len = Math.max(2, bx2 - ax);
      entries.push({ lot: { ...decorLot(mid, vz), seed: 3 }, box: { x: mid, y: 2.2, z: vz, w: len, h: 0.18, d: 0.9 } });
      for (let pi2 = 0; pi2 <= 2; pi2 += 1) {
        const px2 = ax + (len * pi2) / 2;
        entries.push({ lot: decorLot(px2, vz), box: { x: px2, y: 0, z: vz, w: 0.25, h: 2.2, d: 0.25 } });
      }
    }
    if (decor.observatory && plan.blocks.length > 0) {
      // a dome on the newest block's far corner, watching the galaxy
      const nb = plan.blocks[plan.blocks.length - 1];
      const ox2 = nb.x + 7.6 * CELL;
      const oz2 = nb.z - 0.6 * CELL;
      entries.push({ lot: decorLot(ox2, oz2), box: { x: ox2, y: 0, z: oz2, w: 1.3, h: 2.6, d: 1.3 } });
      entries.push({ lot: { ...decorLot(ox2, oz2), seed: 3 }, box: { x: ox2, y: 2.6, z: oz2, w: 1.0, h: 0.7, d: 1.0 } });
      entries.push({ lot: { ...decorLot(ox2, oz2), seed: 5 }, box: { x: ox2 + 0.3, y: 3.3, z: oz2, w: 0.18, h: 0.55, d: 0.18 } });
    }

    // streets — a faint grid between the month blocks, always there
    const streetLot: Lot = { file: "__street__", date: "", x: 0, z: 0, half: 0, floors: 0, seed: 6, lit: 0 };
    for (const block of plan.blocks) {
      entries.push({
        lot: streetLot,
        box: {
          x: block.x + 3.5 * CELL,
          y: -0.03,
          z: block.z + 6 * CELL + CELL * 0.5,
          w: 8 * CELL,
          h: 0.06,
          d: CELL * 0.7,
        },
      });
      entries.push({
        lot: streetLot,
        box: {
          x: block.x + 7 * CELL + CELL * 0.5,
          y: -0.03,
          z: block.z + 2.5 * CELL,
          w: CELL * 0.7,
          h: 0.06,
          d: 8 * CELL,
        },
      });
    }

    // streak: one small streetlight per consecutive night, newest block
    if (streak > 0 && plan.blocks.length > 0) {
      const nb = plan.blocks[plan.blocks.length - 1];
      const count = Math.min(streak, 14);
      for (let li = 0; li < count; li += 1) {
        const lx = nb.x + CELL * 0.5 + li * ((7 * CELL - CELL) / 13);
        const lz = nb.z + 6 * CELL + CELL * 0.5;
        const sLot: Lot = { file: "__decor__", date: "", x: lx, z: lz, half: 0, floors: 0, seed: 2, lit: 0 };
        entries.push({ lot: sLot, box: { x: lx, y: 0, z: lz, w: 0.06, h: 0.9, d: 0.06 } });
        entries.push({ lot: { ...sLot, seed: 3 }, box: { x: lx, y: 0.9, z: lz, w: 0.16, h: 0.13, d: 0.16 } });
      }
    }

    // decor bought with watts — lamps at corners, groves, the old fountain
    if (decor.lamps) {
      for (const block of plan.blocks) {
        const corners = [
          [block.x - CELL * 0.4, block.z - CELL * 0.4],
          [block.x + 7 * CELL + CELL * 0.4, block.z - CELL * 0.4],
          [block.x - CELL * 0.4, block.z + 6 * CELL + CELL * 0.4],
          [block.x + 7 * CELL + CELL * 0.4, block.z + 6 * CELL + CELL * 0.4],
        ];
        for (const [lx, lz] of corners) {
          entries.push({ lot: decorLot(lx, lz), box: { x: lx, y: 0, z: lz, w: 0.09, h: 1.5, d: 0.09 } });
          entries.push({ lot: decorLot(lx, lz), box: { x: lx, y: 0, z: lz, w: 0.2, h: 0.12, d: 0.2 } }); // pedestal
          entries.push({ lot: decorLot(lx, lz), box: { x: lx, y: 1.42, z: lz, w: 0.3, h: 0.05, d: 0.3 } }); // bracket
          entries.push({ lot: { ...decorLot(lx, lz), seed: 3 }, box: { x: lx, y: 1.5, z: lz, w: 0.22, h: 0.18, d: 0.22 } });
          entries.push({ lot: decorLot(lx, lz), box: { x: lx, y: 1.68, z: lz, w: 0.12, h: 0.06, d: 0.12 } }); // cap
          entries.push({ lot: { ...decorLot(lx, lz), seed: 7 }, box: { x: lx, y: -0.015, z: lz, w: 0.85, h: 0.02, d: 0.85 } }); // light pool
        }
      }
    }
    if (decor.trees) {
      for (const block of plan.blocks) {
        const rand = rng(hashBlock(block.month));
        for (let t = 0; t < 5; t += 1) {
          const tx = block.x + rand() * 7 * CELL;
          const tz = block.z + 6 * CELL + CELL * 0.42;
          entries.push({ lot: decorLot(tx, tz), box: { x: tx, y: 0, z: tz, w: 0.18, h: 0.08, d: 0.18 } }); // root flare
          entries.push({ lot: decorLot(tx, tz), box: { x: tx, y: 0, z: tz, w: 0.1, h: 0.4, d: 0.1 } });
          const cw2 = 0.5 + rand() * 0.2;
          entries.push({ lot: { ...decorLot(tx, tz), seed: 4 }, box: { x: tx, y: 0.4, z: tz, w: cw2, h: 0.42, d: cw2 } });
          entries.push({ lot: { ...decorLot(tx, tz), seed: 4 }, box: { x: tx, y: 0.82, z: tz, w: cw2 * 0.6, h: 0.3, d: cw2 * 0.6 } }); // crown
          entries.push({ lot: { ...decorLot(tx, tz), seed: 4 }, box: { x: tx, y: 1.12, z: tz, w: cw2 * 0.28, h: 0.16, d: cw2 * 0.28 } }); // tip
        }
      }
    }
    if (decor.fountain && plan.blocks.length > 0) {
      const first = plan.blocks[0];
      const fx = first.x + 3.5 * CELL;
      const fz = first.z - CELL * 0.5;
      entries.push({ lot: decorLot(fx, fz), box: { x: fx, y: 0, z: fz, w: 1.4, h: 0.18, d: 1.4 } });
      entries.push({ lot: { ...decorLot(fx, fz), seed: 4 }, box: { x: fx, y: 0.18, z: fz, w: 0.95, h: 0.08, d: 0.95 } }); // inner ring
      entries.push({ lot: decorLot(fx, fz), box: { x: fx, y: 0.18, z: fz, w: 0.24, h: 0.55, d: 0.24 } });
      entries.push({ lot: { ...decorLot(fx, fz), seed: 5 }, box: { x: fx, y: 0.73, z: fz, w: 0.16, h: 0.16, d: 0.16 } });
    }

    // ground slab under the whole city, through the same pipeline
    const b0 = plan.bounds;
    const groundLot = {
      file: "__ground__",
      date: "",
      x: (b0.minX + b0.maxX) / 2,
      z: (b0.minZ + b0.maxZ) / 2,
      half: 0,
      floors: 0,
      seed: 1,
      lit: 0,
    };
    // the island must cover every month block (streets included), not
    // just the lots — otherwise streets float in space
    let gMinX = b0.minX;
    let gMaxX = b0.maxX;
    let gMinZ = b0.minZ;
    let gMaxZ = b0.maxZ;
    for (const block of plan.blocks) {
      gMinX = Math.min(gMinX, block.x - CELL);
      gMaxX = Math.max(gMaxX, block.x + 8.5 * CELL);
      gMinZ = Math.min(gMinZ, block.z - CELL);
      gMaxZ = Math.max(gMaxZ, block.z + 7.5 * CELL);
    }
    const spanC = Math.max(gMaxX - gMinX, gMaxZ - gMinZ);
    const gMargin = Math.min(20, Math.max(5, spanC * 0.16));
    const gLotX = (gMinX + gMaxX) / 2;
    const gLotZ = (gMinZ + gMaxZ) / 2;
    entries.push({
      lot: { ...groundLot, x: gLotX, z: gLotZ },
      box: {
        x: gLotX,
        y: -0.22,
        z: gLotZ,
        w: gMaxX - gMinX + gMargin,
        h: 0.2,
        d: gMaxZ - gMinZ + gMargin,
      },
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0); // origin at base — lets intro rise by scaling Y
    const mat = h.buildingMat!;
    mat.uniforms.uSkin.value = skin === "chalk" ? 1.22 : skin === "ink" ? 0.78 : 1;
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, entries.length));
    mesh.count = entries.length;

    const tints = new Float32Array(entries.length * 3);
    const infos = new Float32Array(entries.length * 2);
    entries.forEach((e, i) => {
      const grey = 0.72 + ((e.lot.seed >>> 8) % 100) / 400; // per-building variance
      tints[i * 3] = grey;
      tints[i * 3 + 1] = grey;
      tints[i * 3 + 2] = grey * 1.04;
      infos[i * 2] = e.lot.lit;
      infos[i * 2 + 1] = ((e.lot.seed >>> 4) % 1000) / 1000;
    });
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 3));
    geo.setAttribute("aInfo", new THREE.InstancedBufferAttribute(infos, 2));

    h.scene.add(mesh);
    h.mesh = mesh;
    h.boxesPerInstance = entries;
    h.lotOfInstance = entries.map((e) => e.lot);

    // new files since last build rise from the ground (the settle ceremony)
    const files = new Set(plan.lots.map((l) => l.file));
    if (knownFilesRef.current === null) {
      knownFilesRef.current = files;
    } else {
      for (const f of files) {
        if (!knownFilesRef.current.has(f)) growRef.current.set(f, 0);
      }
      knownFilesRef.current = files;
    }

    // creatures: people circle their blocks, cats take the kerbs, birds the sky
    if (h.spriteMesh) {
      h.scene.remove(h.spriteMesh);
      h.spriteMesh.geometry.dispose(); // material and atlas live on
    }
    const creatures = creaturesFor(plan, plan.lots.length, extras);
    const slots = creatures.length * 2; // room for one overlay each (umbrella)
    if (slots > 0 && h.spriteMat) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.translate(0, 0.5, 0);
      const rect = new THREE.InstancedBufferAttribute(new Float32Array(slots * 4), 4);
      const paramA = new THREE.InstancedBufferAttribute(new Float32Array(slots * 3), 3);
      rect.setUsage(THREE.DynamicDrawUsage);
      paramA.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("aRect", rect);
      g.setAttribute("aParam", paramA);
      const mesh = new THREE.InstancedMesh(g, h.spriteMat, slots);
      mesh.count = slots;
      mesh.frustumCulled = false;
      h.scene.add(mesh);
      h.spriteMesh = mesh;
      h.spriteRect = rect;
      h.spriteParam = paramA;
      h.creatures = creatures;
    } else {
      h.spriteMesh = null;
      h.spriteRect = null;
      h.spriteParam = null;
      h.creatures = [];
    }

    const b = plan.bounds;
    centerRef.current.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    loop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, extras, decor, skin, streak, weather]);

  /* redraw on prop changes */
  useEffect(() => {
    buildingsDirtyRef.current = true;
    loop();
  }, [plan, focus, matches, intro, levelCap, extras, decor, skin, streak, loop]);

  /* month navigation from the dock */
  useEffect(() => {
    if (!goMonth) return;
    panTargetRef.current = {
      x: goMonth.x + 10.5 - centerRef.current.x,
      z: goMonth.z + 9 - centerRef.current.z,
    };
    loop();
  }, [goMonth, loop]);

  /* level up: a growth wave rolls out from the newest block */
  useEffect(() => {
    if (prevCapRef.current !== null && levelCap > prevCapRef.current && plan.blocks.length > 0) {
      const nb = plan.blocks[plan.blocks.length - 1];
      waveRef.current = {
        x: nb.x + 10.5,
        z: nb.z + 9,
        start: performance.now(),
        oldCap: prevCapRef.current,
      };
      buildingsDirtyRef.current = true;
      loop();
    }
    prevCapRef.current = levelCap;
  }, [levelCap, plan, loop]);

  /* a new structure settles: amber beam + camera glide */
  useEffect(() => {
    if (!ceremony) return;
    const lot = plan.lots.find((l) => l.file === ceremony.file);
    if (!lot) return;
    ceremonyRef.current = { x: lot.x, z: lot.z, start: performance.now() };
    buildingsDirtyRef.current = true;
    panTargetRef.current = {
      x: lot.x - centerRef.current.x,
      z: lot.z - centerRef.current.z,
    };
    loop();
  }, [ceremony, plan, loop]);

  /* the camera travels to tonight's building while you write */
  useEffect(() => {
    if (!focus) return;
    const lot = plan.lots.find((l) => l.file === focus);
    if (!lot) return;
    panTargetRef.current = {
      x: lot.x - centerRef.current.x,
      z: lot.z - centerRef.current.z,
    };
    loop();
  }, [focus, plan, loop]);

  /* weather changes retint the particles and update the fog uniform */
  useEffect(() => {
    const h = hRef.current;
    if (!h) return;
    if (h.weatherMesh) {
      const attr = h.weatherMesh.geometry.getAttribute("aTint") as THREE.InstancedBufferAttribute;
      (attr.array as Float32Array).fill(weather === "snow" ? 0.95 : 0.5);
      attr.needsUpdate = true;
    }
    h.quantMat.uniforms.uFog.value = weather === "fog" ? 1 : 0;
    loop();
  }, [weather, loop]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) loop();
    };
    document.addEventListener("visibilitychange", onVisible);
    const observer = new ResizeObserver(() => loop());
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      observer.disconnect();
    };
  }, [loop]);

  /* ---------- interaction ---------- */

  const raycast = useCallback((clientX: number, clientY: number): string | null => {
    const h = hRef.current;
    const canvas = canvasRef.current;
    if (!h || !h.mesh || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const caster = new THREE.Raycaster();
    caster.setFromCamera(ndc, h.camera);
    const hit = caster.intersectObject(h.mesh, false)[0];
    if (hit?.instanceId === undefined) return null;
    const file = h.lotOfInstance[hit.instanceId]?.file ?? null;
    return file && file.startsWith("__") ? null : file;
  }, []);

  /** clamp a view height to [closest stop, whole-city overview] */
  const clampView = useCallback((v: number) => {
    const b = stateRef.current.plan.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 20);
    const maxView = Math.max(VIEW_STOPS[0], span * 0.8);
    return Math.min(maxView, Math.max(VIEW_MIN, v));
  }, []);

  /** shortly after a zoom gesture ends, glide to the nearest detent */
  const scheduleViewSnap = useCallback(() => {
    if (viewSnapTimerRef.current !== null) window.clearTimeout(viewSnapTimerRef.current);
    viewSnapTimerRef.current = window.setTimeout(() => {
      viewSnapTimerRef.current = null;
      const v = viewRef.current;
      if (v > VIEW_STOPS[0] * 1.25) return; // free overview — no detent out here
      let best = VIEW_STOPS[0];
      for (const s of VIEW_STOPS) {
        if (Math.abs(Math.log(v / s)) < Math.abs(Math.log(v / best))) best = s;
      }
      viewGoalRef.current = best;
      loop();
    }, 240);
  }, [loop]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      // second finger: switch from drag to pinch-zoom
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: viewRef.current };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw: yawRef.current,
      moved: false,
      pan: event.shiftKey || event.button === 1,
      px: panRef.current.x,
      pz: panRef.current.z,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const tracked = pointersRef.current.get(event.pointerId);
      if (tracked) {
        tracked.x = event.clientX;
        tracked.y = event.clientY;
      }
      if (pinchRef.current && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchRef.current.dist > 0 && dist > 0) {
          viewGoalRef.current = null;
          viewRef.current = clampView(pinchRef.current.view * (pinchRef.current.dist / dist));
          loop();
        }
        return;
      }
      const drag = dragRef.current;
      if (drag) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          if (drag.pan) {
            panTargetRef.current = null;
            const h = hRef.current;
            const world = h ? (h.camera.right - h.camera.left) / (canvasRef.current?.clientWidth ?? 1) : 0.1;
            const yaw = yawRef.current;
            panRef.current.x = drag.px - (dx * Math.cos(yaw) - dy * Math.sin(yaw)) * world;
            panRef.current.z = drag.pz - (-dx * Math.sin(yaw) - dy * Math.cos(yaw)) * world;
          } else {
            yawRef.current = drag.yaw - dx * 0.008;
            yawTargetRef.current = yawRef.current;
          }
          loop();
        }
        return;
      }
      const hit = raycast(event.clientX, event.clientY);
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        onHover(hit, event.clientX, event.clientY);
      } else if (hit) {
        onHover(hit, event.clientX, event.clientY);
      }
    },
    [loop, onHover, raycast, clampView],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2 && pinchRef.current) {
        pinchRef.current = null;
        scheduleViewSnap();
      }
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag && drag.moved) {
        if (!drag.pan) {
          // snap yaw to the nearest 45° detent
          yawTargetRef.current = Math.round(yawRef.current / YAW_DETENT) * YAW_DETENT;
          loop();
        }
        return;
      }
      const hit = raycast(event.clientX, event.clientY);
      if (hit && !hit.startsWith("demo/")) onOpen(hit);
    },
    [loop, onOpen, raycast, scheduleViewSnap],
  );

  /** pan in camera-relative screen axes → world */
  const panBy = useCallback(
    (dxScreen: number, dzScreen: number) => {
      panTargetRef.current = null;
      const h = hRef.current;
      const canvas = canvasRef.current;
      const world = h && canvas ? (h.camera.right - h.camera.left) / canvas.clientWidth : 0.1;
      const yaw = yawRef.current;
      panRef.current.x += (dxScreen * Math.cos(yaw) - dzScreen * Math.sin(yaw)) * world;
      panRef.current.z += (-dxScreen * Math.sin(yaw) - dzScreen * Math.cos(yaw)) * world;
      loop();
    },
    [loop],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      // horizontal scroll pans; vertical zooms (pinch on trackpads too)
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        panBy(event.deltaX * 1.4, 0);
        return;
      }
      viewGoalRef.current = null;
      viewRef.current = clampView(viewRef.current * (event.deltaY > 0 ? 1.09 : 0.92));
      scheduleViewSnap();
      loop();
    },
    [loop, panBy, clampView, scheduleViewSnap],
  );

  /* arrow keys pan the city */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      const step = 90;
      if (event.key === "ArrowLeft") panBy(-step, 0);
      else if (event.key === "ArrowRight") panBy(step, 0);
      else if (event.key === "ArrowUp") panBy(0, -step);
      else if (event.key === "ArrowDown") panBy(0, step);
      else if (event.key === "q" || event.key === "Q") {
        yawTargetRef.current += YAW_DETENT;
        loop();
      } else if (event.key === "e" || event.key === "E") {
        yawTargetRef.current -= YAW_DETENT;
        loop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panBy, loop]);

  const onPointerLeave = useCallback(() => {
    pointersRef.current.clear();
    pinchRef.current = null;
    dragRef.current = null;
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      onHover(null, 0, 0);
    }
  }, [onHover]);

  return (
    <canvas
      ref={canvasRef}
      className="city-canvas city-canvas-3d"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
      aria-label="Your city of notes"
      role="img"
    />
  );
}
