"use client";

import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { CityPlan, Lot } from "../lib/city/plan";
import { FLOOR_H } from "../lib/city/plan";
import { massing } from "../lib/city/voxel";
import { PALETTE } from "../lib/city/palette";
import { terrainFor } from "../lib/city/terrain";
import { buildAtlas } from "../lib/city/sprites/atlas";
import { SPRITE_WORLD_H } from "../lib/city/sprites/data";
import { composeYou, DEFAULT_LOOK, type YouLook } from "../lib/city/sprites/compose";
import { composeCitizens, CITIZENS } from "../lib/city/npc";
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
uniform float uMoon;  // real lunar phase 0..1 (0 = new, 0.5 = full)
uniform float uLevel; // constellations lit, one per level, never dark
uniform vec2 uSky;    // owned sky: x sister planet, y periodic comet

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

    // the whole field drifts, one pixel at a time — the station turning
    vec2 sp = vp + floor(vec2(uTime * 1.1, uTime * 0.28));

    // the galaxy: a rich diagonal river of dust and stars, flowing
    vec2 gdir = normalize(vec2(0.42, 1.0));
    float gd = abs(dot(vUv - vec2(0.5, 0.62), gdir));
    float gband = smoothstep(0.34, 0.0, gd);
    vec2 cell = floor((vp + gdir * uTime * 2.2) / 3.0);
    float gn = hash21(cell) * 0.6 + hash21(cell + 31.0) * 0.4;
    float shimmer = 0.88 + 0.12 * sin(uTime * 0.5 + hash21(cell + 17.0) * 6.283);
    lum += gband * gband * (0.13 + gn * 0.22) * shimmer;

    // stars: a faint under-layer, much denser inside the band;
    // the bright ones twinkle in quantised steps, like they should
    float s = hash21(sp);
    if (s > 0.994) lum = max(lum, 0.08 + 0.1 * hash21(sp + 3.0));
    if (s > 0.9982) {
      float tw = 0.7 + 0.3 * sin(uTime * (0.8 + hash21(sp + 5.0) * 1.6) + hash21(sp + 9.0) * 6.283);
      lum = max(lum, (0.22 + 0.5 * hash21(sp + 7.0)) * tw);
    }
    if (gband > 0.2 && s > 0.972) lum = max(lum, 0.16 + 0.34 * hash21(sp + 13.0));
    if (s > 0.9993 && gband > 0.15) {
      // jewels inside the band, breathing
      lum = 0.85 * (0.8 + 0.2 * sin(uTime * (1.2 + hash21(sp + 4.0)) + hash21(sp + 11.0) * 6.283));
    }

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

    // a second, fainter one on the opposite diagonal, out of phase
    float cyc2 = floor((uTime + 14.5) / 29.0);
    float ct2 = mod(uTime + 14.5, 29.0);
    if (ct2 < 0.8) {
      vec2 a2 = vec2(0.9 - hash21(vec2(cyc2, 2.0)) * 0.65, 0.92);
      vec2 dir3 = normalize(vec2(-0.5, -1.0));
      vec2 head2 = a2 + dir3 * (ct2 / 0.8) * 0.42;
      vec2 rel2 = (vUv - head2) * uRes;
      float along2 = dot(rel2, -dir3);
      float off2 = abs(dot(rel2, vec2(-dir3.y, dir3.x)));
      if (off2 < 0.7 && along2 > 0.0 && along2 < 5.5) {
        lum = max(lum, 0.55 - along2 * 0.09);
      }
    }

    // constellations: one lights per level and never goes dark —
    // the sky is a record, like everything else here
    for (int ci = 0; ci < 12; ci++) {
      if (float(ci) >= min(uLevel, 12.0)) break;
      float fi = float(ci);
      vec2 cc = vec2(0.05 + hash21(vec2(fi, 41.0)) * 0.9, 0.48 + hash21(vec2(fi, 87.0)) * 0.47);
      if (distance(cc, vec2(0.16, 0.78)) < 0.15) cc.x += 0.3;  // clear of the gas giant
      if (distance(cc, vec2(0.84, 0.84)) < 0.11) cc.y -= 0.2;  // clear of the moon
      for (int si = 0; si < 5; si++) {
        float fs = float(si);
        vec2 off4 = (vec2(hash21(vec2(fi * 7.0 + fs, 3.0)), hash21(vec2(fs, fi * 11.0 + 5.0))) - 0.5) * 0.07;
        vec2 dpx = (vUv - (cc + off4)) * uRes;
        float ax = abs(dpx.x);
        float ay = abs(dpx.y);
        if (ax < 0.9 && ay < 0.9) lum = max(lum, 0.9);
        else if ((ax < 0.55 && ay < 2.3) || (ay < 0.55 && ax < 2.3)) lum = max(lum, 0.26);
      }
    }

    // a bought neighbour: pale banded disc, no ring, minding its own orbit
    if (uSky.x > 0.5) {
      vec2 sd = (vUv - vec2(0.60, 0.93)) * uRes;
      float sdist = length(sd);
      if (sdist < 4.2) {
        float slat = sd.y / 4.2;
        lum = 0.3 + (sin(slat * 9.0 + 1.7) * 0.5 + 0.5) * 0.14 - (sd.x + sd.y) * 0.02;
        if (sdist > 3.2) lum *= 0.8;
      }
    }

    // a bought comet: every 3.5 minutes it keeps its appointment
    if (uSky.y > 0.5) {
      float cyc3 = floor(uTime / 210.0);
      float ct3 = mod(uTime, 210.0);
      if (ct3 < 7.0) {
        float cp = ct3 / 7.0;
        vec2 a3 = vec2(-0.05, 0.55 + hash21(vec2(cyc3, 9.0)) * 0.35);
        vec2 pos3 = mix(a3, vec2(1.05, a3.y + 0.25), cp);
        pos3.y += sin(cp * 3.14159) * 0.06;
        vec2 rel3 = (vUv - pos3) * uRes;
        vec2 tdir = normalize(vec2(1.0, 0.22));
        float along3 = dot(rel3, -tdir);
        float off5 = abs(dot(rel3, vec2(-tdir.y, tdir.x)));
        if (length(rel3) < 1.6) lum = max(lum, 0.95);
        else if (along3 > 0.0 && along3 < 14.0 && off5 < 0.9 + along3 * 0.12) {
          lum = max(lum, 0.55 * (1.0 - along3 / 14.0) * (0.6 + 0.4 * hash21(floor(rel3) + cyc3)));
        }
      }
    }

    // the moon, in tonight's real phase — drawn last, it owns its pixels
    {
      vec2 mdp = (vUv - vec2(0.84, 0.84)) * uRes;
      float mdist = length(mdp);
      if (mdist < 6.0) {
        float nx = mdp.x / 6.0;
        float ny = mdp.y / 6.0;
        float sq = sqrt(max(0.0, 1.0 - ny * ny));
        float term = cos(6.28318 * uMoon) * sq;
        bool litp = uMoon < 0.5 ? nx >= term : nx <= -term;
        float mare = hash21(floor(mdp * 0.9) + 55.0);
        // earthshine: the dark side stays findable on any night
        lum = litp ? 0.56 + mare * 0.18 : 0.14 + mare * 0.04;
        if (mdist > 4.8) lum = litp ? lum * 0.75 : max(lum, 0.19);
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
uniform float uTime;

void main() {
  vec3 n = abs(vNormal);
  // unlit three-tone faces: top brightest, x-side dark, z-front mid
  float tone = (n.y > 0.5 ? 0.68 : (n.x > n.z ? 0.38 : 0.58)) * uSkin;
  float lampf = step(1.9, vTint.b) * (1.0 - step(1.9, vTint.r));
  vec3 vTint2 = vTint;
  if (lampf > 0.5) vTint2.b -= 2.0;
  float amber = step(1.9, vTint2.r);

  // foliage: crowns are leaves, not masonry — no windows, no roof tiles,
  // just a dark speckled clump that dithers into leafy texture
  if (vTint.g > 1.9 && vTint.r < 1.9) {
    float g2 = vTint.g - 2.0;
    vec3 p3 = floor(vWorld * 3.5);
    float sp = hash(p3.xz + p3.y * 7.7);
    float shade = n.y > 0.5 ? 0.5 : (n.x > n.z ? 0.3 : 0.42);
    vec3 leafc = vec3(g2 * shade * uSkin * (0.7 + sp * 0.55));
    leafc *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.3, vWorld.y));
    gl_FragColor = vec4(leafc, 1.0);
    return;
  }
  vec3 base = amber > 0.5 ? vec3(0.55, 0.38, 0.16) : vTint2 * tone;
  // a street lamp breathes once in a long while — barely, like a real bulb
  if (lampf > 0.5) {
    float fl = hash(vec2(floor(uTime * 2.0), floor(vWorld.x * 3.7) + floor(vWorld.z * 7.1)));
    base *= 1.0 - 0.5 * step(0.982, fl);
    base *= 1.35; // the head glows above plain concrete
  }

  if (n.y > 0.5) {
    // roofs carry weight up here: tile rows with seams, a hash per tile
    vec2 rp = floor(vWorld.xz / 0.75);
    base *= 0.9 + hash(rp) * 0.16;
    if (fract(vWorld.x / 0.75) < 0.09) base *= 0.78;
  }

  // facades come in three skins, chosen by the lot's own dice:
  // 0 office grid · 1 banded masonry · 2 glass curtain wall
  if (n.y < 0.5) {
    float style = floor(fract(vInfo.y * 7.31) * 3.0);
    float floorIdx = floor(vWorld.y / uFloorH);
    float u = n.x > n.z ? vWorld.z : vWorld.x;
    float colIdx = floor(u * 3.0);
    float f = fract(vWorld.y / uFloorH);
    float cell = fract(u * 3.0);
    float h = hash(vec2(floorIdx + vInfo.y * 91.7, colIdx));
    float on = step(1.0 - (0.10 + vInfo.x * 0.35), h);

    if (style < 0.5) {
      // office grid — the classic sparse windows
      float inBand = step(0.3, f) * step(f, 0.72);
      float inCol = step(0.25, cell) * step(cell, 0.75);
      float glow = inBand * inCol * on;
      if (amber > 0.5) base = mix(base, vec3(0.95, 0.70, 0.35), glow);
      else base = mix(base, vec3(0.86, 0.88, 0.92) * (0.5 + 0.5 * hash(vec2(colIdx, floorIdx))), glow * 0.9);
    } else if (style < 1.5) {
      // banded masonry — a bright spandrel line each storey, small panes
      base *= 0.94;
      if (f > 0.8) base *= 1.3;
      float inBand = step(0.34, f) * step(f, 0.66);
      float inCol = step(0.34, cell) * step(cell, 0.66);
      float glow = inBand * inCol * on;
      if (amber > 0.5) base = mix(base, vec3(0.95, 0.70, 0.35), glow);
      else base = mix(base, vec3(0.82, 0.84, 0.9) * (0.5 + 0.5 * hash(vec2(colIdx, floorIdx))), glow * 0.9);
    } else {
      // glass curtain — mullion columns, lit floors glow whole
      base *= 1.22;
      float mull = step(0.86, fract(u * 2.0));
      base *= 1.0 - 0.35 * mull;
      float lit = step(1.0 - (0.06 + vInfo.x * 0.2), hash(vec2(floorIdx, vInfo.y * 53.7)));
      float inBand = step(0.16, f) * step(f, 0.9);
      if (amber > 0.5) base = mix(base, vec3(0.95, 0.70, 0.35), lit * inBand * 0.8);
      else base = mix(base, vec3(0.8, 0.83, 0.9), lit * inBand * 0.55);
    }
    // faint storey seam
    base *= 1.0 - 0.12 * step(f, 0.08);
    // grounding shadow: buildings sit on the earth instead of floating
    base *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.22, vWorld.y));
  }
  gl_FragColor = vec4(base, 1.0);
}
`;

/**
 * The living ground: a terrain map (R8, 2 texels/world) picks the material
 * per patch; the shader draws meadow tone fields, stone slabs, plaza seams
 * and a cliff-shadow coastline. All in luminance — the quantise pass turns
 * the gradients into dithered pixel texture, reference-style.
 */
const GROUND_VERT = `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const GROUND_FRAG = `
precision mediump float;
varying vec3 vWorld;
uniform sampler2D uMap;
uniform vec2 uMin;
uniform vec2 uInv;
uniform vec2 uTexel;
uniform float uWx; // 0 clear, 1 rain, 2 snow, 3 fog

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = (vWorld.xz - uMin) * uInv;
  float id = texture2D(uMap, uv).r * 255.0;
  if (id < 0.5) discard;
  vec2 px = floor(vWorld.xz * 2.0);
  float n = hash21(px);
  vec2 slab = floor(vWorld.xz / 1.5);
  float tone;
  if (id < 1.5) {
    // meadow: a slow tone field + fine speckle + rare pale wildflowers
    tone = 0.14 + vn(vWorld.xz / 6.0) * 0.08 + n * 0.04;
    if (hash21(px + 17.0) > 0.995) tone = 0.5;
  } else if (id < 2.5) {
    // street: stone slabs with grout lines
    tone = 0.27 + hash21(slab) * 0.09;
    vec2 f = fract(vWorld.xz / 1.5);
    if (f.x < 0.07 || f.y < 0.07) tone *= 0.55;
  } else if (id < 3.5) {
    // plaza: quiet cells, one seam per calendar cell
    tone = 0.175 + n * 0.045;
    vec2 f2 = fract(vWorld.xz / 3.0);
    if (f2.x < 0.035 || f2.y < 0.035) tone *= 0.62;
  } else {
    // night sea between the month-islands: near-black swell bands and
    // the rare glint of something reflected
    tone = 0.05 + vn(vWorld.xz / 5.0) * 0.035;
    if (hash21(px + 41.0) > 0.9985) tone = 0.34;
  }
  // neighbours: void pulls a cliff shadow, sea meets land in a pale shoal
  float rim = min(
    min(texture2D(uMap, uv + vec2(uTexel.x, 0.0)).r,
        texture2D(uMap, uv - vec2(uTexel.x, 0.0)).r),
    min(texture2D(uMap, uv + vec2(0.0, uTexel.y)).r,
        texture2D(uMap, uv - vec2(0.0, uTexel.y)).r));
  float rimMax = max(
    max(texture2D(uMap, uv + vec2(uTexel.x, 0.0)).r,
        texture2D(uMap, uv - vec2(uTexel.x, 0.0)).r),
    max(texture2D(uMap, uv + vec2(0.0, uTexel.y)).r,
        texture2D(uMap, uv - vec2(0.0, uTexel.y)).r));
  if (rim * 255.0 < 0.5) tone = 0.04; // cliff shadow against open space
  if (id > 3.5 && rimMax * 255.0 > 0.5 && rimMax * 255.0 < 3.5) tone = 0.115; // lapping shoal
  if (id < 3.5 && id > 0.5 && rimMax * 255.0 > 3.5) tone = max(tone, 0.2); // lit sand at the waterline
  if (uWx > 1.5 && uWx < 2.5) {
    // snow: the meadow blankets over, walked streets stay darker
    if (id < 1.5) tone = 0.5 + n * 0.06;
    else if (id > 2.5) tone = 0.36 + n * 0.05;
    else tone = mix(tone, 0.4, 0.45);
  } else if (uWx > 0.5 && uWx < 1.5) {
    tone *= 0.8; // rain-dark ground
  }
  gl_FragColor = vec4(vec3(tone), 1.0);
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
  boxesPerInstance: { lot: Lot; box: { x: number; y: number; z: number; w: number; h: number; d: number }; leaf?: boolean; lampHead?: boolean }[];
  /** bought groves — sprites placed by the sprite pass, swaying in gusts */
  trees: { x: number; z: number; name: string; mirror: number }[];
  /** fixed-point animations: fountains, boats, lanterns, bells, dust */
  animSpots: {
    x: number;
    y: number;
    z: number;
    worldH: number;
    frames: string[];
    pick: (t: number) => number;
  }[];
  spriteMesh: THREE.InstancedMesh | null;
  spriteMat: THREE.ShaderMaterial | null;
  spriteFrames: Record<string, { x: number; y: number; w: number; h: number }>;
  spriteRect: THREE.InstancedBufferAttribute | null;
  spriteParam: THREE.InstancedBufferAttribute | null;
  ground: THREE.Mesh | null;
  groundMat: THREE.ShaderMaterial | null;
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
  sister: boolean;
  comet: boolean;
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
  level,
  streak,
  commissions,
  placements,
  billboard,
  onBillboardTap,
  quest,
  ariaLabel,
  onHover,
  onOpen,
  onCreatureTap,
  onGroundTap,
  encounterKey,
  encounterApproach,
  overture,
  overtureGo,
  wonder,
  onEncounterMeet,
  look,
  emote,
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
  level: number;
  /** consecutive nights written — streetlights on the newest block */
  streak: number;
  /** public works: id + block + construction progress (1 = open) */
  commissions: { id: string; block: number; progress: number }[];
  placements?: Record<string, { x: number; z: number }>;
  billboard?: boolean;
  onBillboardTap?: () => void;
  quest?: { key: string; done: boolean } | null;
  ariaLabel?: string;
  onHover: (file: string | null, x: number, y: number) => void;
  onOpen: (file: string) => void;
  /** a resident was tapped (never fires for ships) */
  onCreatureTap: (hit: { key: string; kind: string; seed: number; x: number; y: number }) => void;
  /** tapped the island itself — world coords, for the calendar inverse */
  onGroundTap?: (x: number, z: number) => void;
  /** resident to walk to and meet (encounter); null ends the meeting */
  encounterKey: string | null;
  /** the OTHER walker crosses the street to you (the demo's guide) */
  encounterApproach?: boolean;
  /** open on a far overview and glide down to street level (~5s) */
  overture?: boolean;
  overtureGo?: boolean;
  wonder?: boolean;
  /** you arrived — the exchange may begin */
  onEncounterMeet: (hit: { key: string; kind: string; seed: number }) => void;
  /** your figure, composed into the atlas at runtime */
  look: YouLook;
  /** a small thought above someone's head, until the given ms timestamp */
  emote: { key: string; icon: string; until: number } | null;
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
  /* a second finger ever touched down — the fingers that lift afterwards
     are ending a rotate/zoom, and none of them may land as a tap */
  const gestureRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    dist: number;
    view: number;
    cx: number;
    cy: number;
    px: number;
    pz: number;
    ang: number;
    yaw: number;
  } | null>(null);
  /** per-file eased floor count — new buildings rise, edits grow smoothly */
  const growRef = useRef(new Map<string, number>());
  const knownFilesRef = useRef<Set<string> | null>(null);
  const growLastRef = useRef(0);
  const buildingsDirtyRef = useRef(true);
  const weatherSeedsRef = useRef<Float32Array | null>(null);
  const ceremonyRef = useRef<{ x: number; z: number; start: number } | null>(null);
  /* a settling is a moment, not a state: replaying it every time the plan
     changes would relight a building you finished with days ago */
  const ceremonySeenRef = useRef(0);
  const waveRef = useRef<{ x: number; z: number; start: number; oldCap: number } | null>(null);
  const prevCapRef = useRef<number | null>(null);
  const hoverRef = useRef<string | null>(null);
  const dayLiftRef = useRef(1);
  const basePalRef = useRef<THREE.Color[]>(
    ["#06070a", "#0d0f13", "#171a20", "#2a2e36", "#4a4f59", "#8b9099", "#c9ccd2", "#f2f3f5"].map(
      (c) => new THREE.Color(c),
    ),
  );
  const stateRef = useRef({ plan, focus, matches, weather, levelCap, writeMode, emote, quest });
  const onMeetRef = useRef(onEncounterMeet);
  useEffect(() => {
    onMeetRef.current = onEncounterMeet;
  }, [onEncounterMeet]);

  useEffect(() => {
    stateRef.current = { plan, focus, matches, weather, levelCap, writeMode, emote, quest };
    loopRef.current?.();
  }, [plan, focus, matches, weather, levelCap, writeMode, emote]);
  const loopRef = useRef<(() => void) | null>(null);

  /* ---------- frame ---------- */

  /** project a creature's head to CSS pixel coords on the canvas */
  const projectCreature = useCallback((key: string, now: number) => {
    const h = hRef.current;
    const canvas = canvasRef.current;
    if (!h || !canvas) return null;
    const c = h.creatures.find((cc) => cc.key === key);
    if (!c) return null;
    const p = poseAt(c, stateRef.current.plan, now / 1000);
    const kindH = SPRITE_WORLD_H[c.kind === "bird" ? "ship" : c.kind] ?? 1;
    const v = new THREE.Vector3(p.x, p.y + kindH + 0.15, p.z).project(h.camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-v.y * 0.5 + 0.5) * canvas.clientHeight,
    };
  }, []);


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
      } else if (lot.file === hoverRef.current) {
        tintAttr.setXYZ(i, grey * 1.22, grey * 1.22, grey * 1.26);
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

    // pass 1: everyone's pose, then social adjustments. Each creature can
    // carry a personal time-shift: after a conversation their schedule is
    // re-anchored to the meeting spot, so they walk ON from where they
    // stood instead of hurrying back to where time says they should be.
    const shifts = shiftRef.current;
    const poses = h.creatures.map((c) => poseAt(c, pl, t + (shifts.get(c.key) ?? 0)));
    // the ceremony's opening mark: your ring anchors to the city's
    // centre the first frame the cast exists — the crane lands on you
    if (centreAnchorRef.current) {
      const you0 = h.creatures.find((cc) => cc.kind === "you");
      if (you0) {
        centreAnchorRef.current = false;
        // the ceremony lands mid-CROSSROADS: a spot in a street gap on
        // BOTH axes (a corridor between towers still hides you — the
        // sliver-behind-a-tower lesson), scored to sit dead centre of
        // the intersection square, then as near the city's heart as fits
        const cx0 = centerRef.current.x;
        const cz0 = centerRef.current.z;
        const bl = pl.blocks;
        const open = (x: number, z: number) =>
          !bl.some((b) => x > b.x - 1.5 && x < b.x + 21 + 1.5) &&
          !bl.some((b) => z > b.z - 1.5 && z < b.z + 18 + 1.5);
        const clr = (x: number, z: number) => {
          let cxm = Infinity;
          let czm = Infinity;
          for (const b of bl) {
            cxm = Math.min(cxm, Math.max(0, x <= b.x ? b.x - x : x - (b.x + 21)));
            czm = Math.min(czm, Math.max(0, z <= b.z ? b.z - z : z - (b.z + 18)));
          }
          return Math.min(cxm, czm);
        };
        let tx = cx0;
        let tz = cz0;
        let bestT = Infinity;
        for (let gx = -24; gx <= 24; gx += 1) {
          for (let gz = -24; gz <= 24; gz += 1) {
            const x = cx0 + gx;
            const z = cz0 + gz;
            if (!open(x, z)) continue;
            const score = Math.sqrt(gx * gx + gz * gz) - clr(x, z) * 6;
            if (score < bestT) {
              bestT = score;
              tx = x;
              tz = z;
            }
          }
        }
        let bestS = 0;
        let bestD = Infinity;
        for (let s2 = 0; s2 < 130; s2 += 0.25) {
          const p = poseAt(you0, pl, t + s2);
          const d = (p.x - tx) ** 2 + (p.z - tz) ** 2;
          if (d < bestD) {
            bestD = d;
            bestS = s2;
          }
        }
        shiftRef.current.set(you0.key, bestS);
        const p0 = poseAt(you0, pl, t + bestS);
        // the leftover ride is small (a ring already runs these streets)
        offsetRef.current.set(you0.key, { x: tx - p0.x, z: tz - p0.z });
      }
    }
    const offs = offsetRef.current;
    if (offs.size > 0) {
      const still = wonderRef.current || encRef.current !== null || overtureTweenRef.current !== null || overtureHoldRef.current;
      const dtOff = still ? 0 : Math.max(0, Math.min(0.25, t - offsetPrevTRef.current));
      const decay = Math.exp(-dtOff / 45);
      h.creatures.forEach((c, i) => {
        const o = offs.get(c.key);
        if (!o) return;
        o.x *= decay;
        o.z *= decay;
        if (o.x * o.x + o.z * o.z < 0.01) {
          offs.delete(c.key);
          return;
        }
        poses[i] = { ...poses[i], x: poses[i].x + o.x, z: poses[i].z + o.z };
      });
    }
    offsetPrevTRef.current = t;
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
        poses[i] = { ...poseAt(target, pl, t - 1.1 + (shifts.get(target.key) ?? 0)), phase: t * 11 };
      });
    }

    // the wonder beat overrides you: freeze mid-street, face the lens,
    // and look around — the camera slides in the first frame it sees this
    if (wonderRef.current) {
      const yIdx0 = h.creatures.findIndex((cc) => cc.kind === "you");
      if (yIdx0 >= 0) {
        if (!wonderPosRef.current) {
          const yp0 = poses[yIdx0];
          wonderPosRef.current = { x: yp0.x, z: yp0.z };
          panTargetRef.current = {
            x: yp0.x - centerRef.current.x,
            z: yp0.z - centerRef.current.z,
          };
          overtureTweenRef.current = { t0: performance.now(), from: viewRef.current, to: VIEW_STOPS[4], dur: 1100 };
        }
        const wp = wonderPosRef.current;
        const seq = Math.floor((t % 3.0) / 0.75); // front, left, front, right
        const off = seq === 1 ? -1.35 : seq === 3 ? 1.35 : 0;
        poses[yIdx0] = { ...poses[yIdx0], x: wp.x, z: wp.z, facing: camYaw + off, moving: false, phase: 0 };
      }
    }

    // the encounter overrides you and your interlocutor
    const enc = encRef.current;
    if (enc) {
      const dtE = Math.max(0, Math.min(0.25, t - enc.lastT));
      enc.lastT = t;
      const tIdx = h.creatures.findIndex((cc) => cc.key === enc.key);
      const yIdx = h.creatures.findIndex((cc) => cc.kind === "you");
      const step = (from: { x: number; z: number }, to: { x: number; z: number }, speed: number) => {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const d = Math.hypot(dx, dz);
        const s2 = speed * dtE;
        if (d <= s2) return { x: to.x, z: to.z, done: true, facing: Math.atan2(dx, dz) };
        return { x: from.x + (dx / d) * s2, z: from.z + (dz / d) * s2, done: false, facing: Math.atan2(dx, dz) };
      };
      if (yIdx >= 0) {
        if (enc.phase === "walk" && tIdx >= 0 && enc.approach) {
          // the guide crosses the street to YOU — you stand and watch
          const gap = 1.0;
          const wp = wonderPosRef.current;
          const yp = wp ? { ...poses[yIdx], x: wp.x, z: wp.z } : poses[yIdx];
          enc.you = { x: yp.x, z: yp.z };
          const d0 = Math.hypot(enc.target.x - yp.x, enc.target.z - yp.z);
          if (d0 <= gap + 0.05) {
            enc.phase = "meet";
            enc.meetAt = { ...enc.you };
            if (!enc.notified) {
              enc.notified = true;
              const tc = h.creatures[tIdx];
              onMeetRef.current({ key: tc.key, kind: tc.kind, seed: tc.seed });
            }
          } else {
            const mv = step(enc.target, { x: yp.x, z: yp.z }, 2.2);
            enc.target = { x: mv.x, z: mv.z };
            poses[tIdx] = { x: mv.x, y: poses[tIdx].y, z: mv.z, facing: mv.facing, moving: true, phase: t * 6.5 };
          }
          poses[yIdx] = {
            ...yp,
            facing: Math.atan2(enc.target.x - yp.x, enc.target.z - yp.z),
            moving: false,
            phase: 0,
          };
        } else if (enc.phase === "walk" && tIdx >= 0) {
          // the stop point is decided once — recomputing it every frame
          // makes you orbit the target forever when you start close
          const gap = 1.0;
          if (!enc.stopAt) {
            const dx0 = enc.target.x - enc.you.x;
            const dz0 = enc.target.z - enc.you.z;
            const d0 = Math.hypot(dx0, dz0);
            enc.stopAt =
              d0 <= gap
                ? { ...enc.you } // already at conversation distance
                : {
                    x: enc.target.x - (dx0 / d0) * gap,
                    z: enc.target.z - (dz0 / d0) * gap,
                  };
          }
          const mv = step(enc.you, enc.stopAt, 2.4);
          enc.you = { x: mv.x, z: mv.z };
          const arrived =
            mv.done || Math.hypot(enc.target.x - mv.x, enc.target.z - mv.z) <= gap + 0.05;
          poses[yIdx] = { x: mv.x, y: 0, z: mv.z, facing: mv.facing, moving: !arrived, phase: t * 6.5 };
          if (arrived) {
            enc.phase = "meet";
            enc.meetAt = { ...enc.you };
            if (!enc.notified) {
              enc.notified = true;
              const tc = h.creatures[tIdx];
              onMeetRef.current({ key: tc.key, kind: tc.kind, seed: tc.seed });
            }
          }
        } else if (enc.phase === "meet" && enc.meetAt) {
          poses[yIdx] = {
            x: enc.meetAt.x,
            y: 0,
            z: enc.meetAt.z,
            facing: Math.atan2(enc.target.x - enc.meetAt.x, enc.target.z - enc.meetAt.z),
            moving: false,
            phase: 0,
          };
        } else if (enc.phase === "leave") {
          // goodbye re-anchors both schedules to the meeting spot: find
          // the point on each walker's ring nearest to where they stand,
          // and shift their personal clock so the ring passes through it
          // NOW. They walk on from here — nobody hurries back in time.
          if (enc.leftAt === null) {
            enc.leftAt = t;
            enc.leaveFrom = { ...enc.you };
            const anchor = (idx: number, want: { x: number; z: number }) => {
              const c = h.creatures[idx];
              if (!c) return;
              const cur = shifts.get(c.key) ?? 0;
              // walking on means walking ON: prefer ring moments headed
              // the way this walker already faces, not back where they
              // came from — distance alone made goodbyes into U-turns
              const face = poses[idx].facing;
              const fx = Math.sin(face);
              const fz = Math.cos(face);
              let bestS = cur;
              let bestD = Infinity;
              for (let s = 0; s < 130; s += 0.25) {
                const p = poseAt(c, pl, t + cur + s);
                const q = poseAt(c, pl, t + cur + s + 0.4);
                const vx = q.x - p.x;
                const vz = q.z - p.z;
                const vd = Math.hypot(vx, vz);
                const align = vd > 0.01 ? (vx * fx + vz * fz) / vd : 0;
                const d = (p.x - want.x) ** 2 + (p.z - want.z) ** 2 + (1 - align) * 5;
                if (d < bestD) {
                  bestD = d;
                  bestS = cur + s;
                }
              }
              shifts.set(c.key, bestS);
              // the ring rarely passes exactly here: carry the leftover
              // as an offset so the walk continues from THIS spot
              const p0 = poseAt(c, pl, t + bestS);
              offsetRef.current.set(c.key, { x: want.x - p0.x, z: want.z - p0.z });
              poses[idx] = { ...p0, x: want.x, z: want.z }; // this frame too
            };
            anchor(yIdx, enc.you);
            if (tIdx >= 0) anchor(tIdx, enc.target);
          }
          const k = Math.min(1, (t - enc.leftAt) / 1.4);
          const e2 = k * k * (3 - 2 * k);
          const home = poses[yIdx];
          const from = enc.leaveFrom ?? enc.you;
          const lx = from.x + (home.x - from.x) * e2;
          const lz = from.z + (home.z - from.z) * e2;
          enc.you = { x: lx, z: lz };
          poses[yIdx] = {
            ...home,
            x: lx,
            z: lz,
            facing: k > 0.96 ? home.facing : Math.atan2(home.x - lx, home.z - lz),
            moving: k < 1,
            phase: t * 6.5,
          };
          if (k >= 1 && enc.blend <= 0.01) encRef.current = null;
        }
      }
      if (tIdx >= 0 && encRef.current) {
        if (enc.phase === "leave" && enc.leftAt !== null) {
          // they stroll back to their round in the same beat you do —
          // ending a chat must never teleport your interlocutor
          const k = Math.min(1, (t - enc.leftAt) / 1.4);
          const e2 = k * k * (3 - 2 * k);
          const sched = poses[tIdx];
          poses[tIdx] = {
            ...sched,
            x: enc.target.x + (sched.x - enc.target.x) * e2,
            z: enc.target.z + (sched.z - enc.target.z) * e2,
            facing: k > 0.96 ? sched.facing : Math.atan2(sched.x - enc.target.x, sched.z - enc.target.z),
            moving: k < 1,
            phase: t * 6.5,
          };
        } else {
          // the interlocutor stops and gives you their attention
          poses[tIdx] = {
            x: enc.target.x,
            y: poses[tIdx].y,
            z: enc.target.z,
            facing: Math.atan2((enc.you.x ?? 0) - enc.target.x, (enc.you.z ?? 0) - enc.target.z),
            moving: false,
            phase: 0,
          };
        }
      }
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
        // the sky lanes belong to little courier ships out here
        const y = p.y + Math.sin(p.phase * 0.5) * 0.3;
        place(`ship_E_${beat}`, p.x, y, p.z, SPRITE_WORLD_H.ship, mirror, 0);
        continue;
      }
      // population tide: people sleep; cats, the dog and you do not
      if (c.kind === "person") {
        const hr = new Date(now + performance.timeOrigin).getHours();
        const fr = hr < 5 ? 15 : hr < 8 ? 50 : hr < 17 ? 85 : 100;
        if ((c.seed >>> 3) % 100 >= fr) continue;
      }
      const frame = p.moving ? beat : "i";
      // wardrobe variety: each resident keeps one of three looks for life
      const look2 = c.kind === "person" ? `npc${c.seed % CITIZENS.length}` : c.kind;
      const encScale =
        enc && (c.kind === "you" || c.key === enc.key) ? 1 + 0.7 * enc.blend : 1;
      let sname = `${look2}_${dir}_${frame}`;
      // standing people facing you blink now and then
      if (
        !p.moving &&
        dir === "S" &&
        (c.kind === "person" || c.kind === "you") &&
        (t + (c.seed % 7)) % 4.3 < 0.16
      ) {
        sname = `${look2}_S_i_blink`;
      }
      if (!h.spriteFrames[sname]) sname = `${look2}_${dir}_i`;
      place(
        sname,
        p.x,
        p.y,
        p.z,
        (SPRITE_WORLD_H[look2] ?? 1.4) * encScale,
        mirror,
        c.kind === "you" ? 1 : 0,
      );
      if (w === "rain" && (c.kind === "person" || c.kind === "you")) {
        place("umbrella", p.x, p.y + SPRITE_WORLD_H[c.kind] * 0.92, p.z, SPRITE_WORLD_H.umbrella, 0, 0);
      }
      const em = stateRef.current.emote;
      if (em && em.key === c.key && now < em.until) {
        place(em.icon, p.x, p.y + SPRITE_WORLD_H[look2] + 0.3, p.z, 0.5, 0, 0);
      }
      if (enc && enc.phase === "walk" && c.key === enc.key) {
        place("emote_notice", p.x, p.y + (SPRITE_WORLD_H[look2] ?? 1.4) * encScale + 0.3, p.z, 0.5, 0, 0);
      }
      const q = stateRef.current.quest;
      if (q && !q.done && q.key === c.key && !(enc && enc.key === c.key)) {
        place("emote_question", p.x, p.y + (SPRITE_WORLD_H[look2] ?? 1.4) * encScale + 0.3, p.z, 0.5, 0, 0);
      }
    }
    // the groves sway in travelling gusts — a wave of wind, not a metronome
    for (const tr of h.trees) {
      const gust = Math.sin(t * 0.9 - (tr.x + tr.z) * 0.22) > 0.86;
      const nm = gust && h.spriteFrames[tr.name + "_b"] ? tr.name + "_b" : tr.name;
      place(nm, tr.x, 0, tr.z, SPRITE_WORLD_H[tr.name] ?? 1.4, tr.mirror, 0);
    }
    // fixed-point animations: water, boats, lanterns, the hourly bell
    for (const sp of h.animSpots) {
      const fi = sp.pick(t);
      if (fi < 0) continue;
      place(sp.frames[fi] ?? sp.frames[0], sp.x, sp.y, sp.z, sp.worldH, 0, 0);
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
      const overTw = overtureTweenRef.current;
      if (overTw) {
        const p = Math.min(1, (performance.now() - overTw.t0) / overTw.dur);
        const eased = p < 0.5 ? 2 * p * p : 1 - ((2 - 2 * p) ** 2) / 2;
        viewRef.current = overTw.from + (overTw.to - overTw.from) * eased;
        if (p >= 1) overtureTweenRef.current = null;
        animating = true;
      } else if (viewGoalRef.current !== null) {
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
      let cx = centerRef.current.x + panRef.current.x;
      let cz = centerRef.current.z + panRef.current.z;

      // meeting camera: ease toward the pair, ease home on goodbye —
      // writing mode always outranks the street
      const encC = encRef.current;
      if (encC && !writing) {
        const goal = encC.phase === "meet" ? 1 : encC.phase === "walk" ? 0.35 : 0;
        encC.blend += (goal - encC.blend) * Math.min(0.16, dt / 320);
        if (encC.blend > 0.005) {
          // the world keeps its size — only the camera drifts to frame
          // the pair; the two speakers themselves grow instead
          const anchor = encC.meetAt ?? encC.you;
          const midX = (anchor.x + encC.target.x) / 2;
          const midZ = (anchor.z + encC.target.z) / 2;
          cx = cx + (midX - cx) * encC.blend;
          cz = cz + (midZ - cz) * encC.blend;
          animating = true;
        }
      }
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
        viewGoalRef.current === null &&
        (!encRef.current || encRef.current.blend < 0.01 || encRef.current.blend > 0.99)
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

      // the city keeps local time: palette lifts toward a pale day and
      // sinks back to deep night (identity: always night-ish, never blue)
      {
        const hour = new Date().getHours() + new Date().getMinutes() / 60;
        // keyframes: deep night 1.0 · dawn 1.12 · day 1.3 · dusk 1.1
        const liftAt = (h2: number) => {
          if (h2 < 4) return 1.0;
          if (h2 < 7) return 1.0 + ((h2 - 4) / 3) * 0.12;
          if (h2 < 9) return 1.12 + ((h2 - 7) / 2) * 0.18;
          if (h2 < 16) return 1.3;
          if (h2 < 19) return 1.3 - ((h2 - 16) / 3) * 0.2;
          if (h2 < 22) return 1.1 - ((h2 - 19) / 3) * 0.1;
          return 1.0;
        };
        const lift = liftAt(hour);
        if (Math.abs(lift - dayLiftRef.current) > 0.004) {
          dayLiftRef.current = lift;
          const colors = h.quantMat.uniforms.uPal.value as THREE.Color[];
          basePalRef.current.forEach((c, i2) => {
            colors[i2].copy(c).multiplyScalar(i2 === 0 ? 1 : lift);
          });
        }
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
      h.buildingMat!.uniforms.uTime.value = now / 1000;
      // tonight's real moon — synodic month from the Jan 2000 new moon
      h.quantMat.uniforms.uMoon.value =
        (((now + performance.timeOrigin - 947182440000) % 2551442877) + 2551442877) % 2551442877 / 2551442877;
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
  loopRef.current = loop;

  /** the encounter — a walk, a meeting, a goodbye. Render-layer only:
   *  the pure f(t) model never learns it happened. */
  const encRef = useRef<{
    key: string;
    phase: "walk" | "meet" | "leave";
    target: { x: number; z: number };
    you: { x: number; z: number };
    meetAt: { x: number; z: number } | null;
    stopAt: { x: number; z: number } | null;
    blend: number;
    notified: boolean;
    lastT: number;
    /* goodbye bookkeeping: when the stroll apart began, and from where */
    leftAt: number | null;
    leaveFrom: { x: number; z: number } | null;
    /** they walk to you instead of you to them */
    approach: boolean;
  } | null>(null);
  /* per-creature schedule shifts — the "walk on from here" memory */
  const shiftRef = useRef<Map<string, number>>(new Map());
  /* per-creature position offsets: the ring rarely passes exactly
     through a meeting spot, so after goodbye the walker carries the
     difference and sheds it over ~45s — no visible slide back home */
  const offsetRef = useRef<Map<string, { x: number; z: number }>>(new Map());
  const offsetPrevTRef = useRef(0);
  const approachRef = useRef(false);
  approachRef.current = Boolean(encounterApproach);
  /* the overture: hold the overview while the veil is still up, then a
     scripted 5s crane shot down to street level — the old exponential
     ease spent itself behind the veil and nobody ever saw it */
  const overtureDoneRef = useRef(false);
  const overtureHoldRef = useRef(false);
  const centreAnchorRef = useRef(false);
  const overtureTweenRef = useRef<{ t0: number; from: number; to: number; dur: number } | null>(null);
  /* the wonder beat: you stop, face the lens, look around — the camera
     steps in close, and your frozen spot is where the guide finds you */
  const wonderRef = useRef(false);
  wonderRef.current = Boolean(wonder);
  const wonderPosRef = useRef<{ x: number; z: number } | null>(null);
  const wonderPrevRef = useRef(false);
  useEffect(() => {
    const was = wonderPrevRef.current;
    wonderPrevRef.current = Boolean(wonder);
    if (wonder && !was) {
      wonderPosRef.current = null; // captured fresh on the next frame
      loopRef.current?.();
    }
    if (!wonder && was) {
      overtureTweenRef.current = { t0: performance.now(), from: viewRef.current, to: VIEW_DEFAULT, dur: 900 };
      loopRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wonder]);

  useEffect(() => {
    if (!overture) return;
    if (!overtureDoneRef.current) {
      if (stateRef.current.plan.blocks.length === 0) return;
      overtureDoneRef.current = true;
      viewRef.current = clampView(VIEW_STOPS[0] * 1.5);
      viewGoalRef.current = null;
      overtureHoldRef.current = true;
      // the crane shot lands at the city's centre — so should you.
      // The cast may not exist yet: flag it, the loop captures it.
      centreAnchorRef.current = true;
      loopRef.current?.();
    }
    if (overtureGo && overtureHoldRef.current) {
      overtureHoldRef.current = false;
      overtureTweenRef.current = { t0: performance.now(), from: viewRef.current, to: VIEW_DEFAULT, dur: 5000 };
      loopRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overture, overtureGo, plan]);

  useEffect(() => {
    const h = hRef.current;
    if (!h) return;
    const now = lastDrawRef.current / 1000;
    if (encounterKey) {
      // idempotent: a rerender must never reset a meeting in progress —
      // that was the shaking-and-scrambled-dialogue bug
      if (encRef.current?.key === encounterKey) return;
      const target = h.creatures.find((c) => c.key === encounterKey);
      const you = h.creatures.find((c) => c.kind === "you");
      if (!target || !you) return;
      // both walkers may carry a schedule shift AND a position offset
      // from earlier meetings — forgetting the offset teleported you
      // back to the raw ring position for every second conversation
      const tOff = offsetRef.current.get(target.key);
      const tp0 = poseAt(target, stateRef.current.plan, now + (shiftRef.current.get(target.key) ?? 0));
      const tp = { ...tp0, x: tp0.x + (tOff?.x ?? 0), z: tp0.z + (tOff?.z ?? 0) };
      const start = encRef.current?.you ?? (() => {
        const yOff = offsetRef.current.get(you.key);
        const yp = poseAt(you, stateRef.current.plan, now + (shiftRef.current.get(you.key) ?? 0));
        return { x: yp.x + (yOff?.x ?? 0), z: yp.z + (yOff?.z ?? 0) };
      })();
      if (approachRef.current) {
        // the visitor was already on their way: a guide scheduled three
        // islands over must not spend twenty seconds beelining across
        // water — they enter from just up the street instead
        const adx = tp.x - start.x;
        const adz = tp.z - start.z;
        const ad = Math.hypot(adx, adz);
        if (ad > 9) {
          tp.x = start.x + (adx / ad) * 8;
          tp.z = start.z + (adz / ad) * 8;
        }
      }
      encRef.current = {
        key: encounterKey,
        phase: "walk",
        target: { x: tp.x, z: tp.z },
        you: { ...start },
        meetAt: null,
        stopAt: null,
        blend: encRef.current?.blend ?? 0,
        notified: false,
        lastT: now,
        leftAt: null,
        leaveFrom: null,
        approach: approachRef.current,
      };
    } else if (encRef.current && encRef.current.phase !== "leave") {
      encRef.current.phase = "leave";
    }
    loopRef.current?.();
  }, [encounterKey]);



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
        // basePal stays untouched; the frame loop lifts uPal by hour
        uAmber: { value: new THREE.Color(PALETTE.amber) },
        uAmberDim: { value: new THREE.Color("#8a6c3c") },
        uFog: { value: 0 },
        uTime: { value: 0 },
        uMoon: { value: 0 },
        uLevel: { value: 1 },
        uSky: { value: new THREE.Vector2(0, 0) },
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
      ground: null,
      groundMat: new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uMin: { value: new THREE.Vector2() },
          uInv: { value: new THREE.Vector2() },
          uTexel: { value: new THREE.Vector2() },
          uWx: { value: 0 },
        },
        vertexShader: GROUND_VERT,
        fragmentShader: GROUND_FRAG,
      }),
      creatures: [],
      trees: [],
      animSpots: [],
      weatherMesh: null,
      beam: null,
      buildingMat: new THREE.ShaderMaterial({
        uniforms: { uFloorH: { value: FLOOR_H }, uSkin: { value: 1 }, uTime: { value: 0 } },
        vertexShader: BUILDING_VERT,
        fragmentShader: BUILDING_FRAG,
      }),
    };

    // resident sprites: one atlas texture, one material for the whole cast
    {
      const atlas = buildAtlas({ ...composeYou(DEFAULT_LOOK), ...composeCitizens() });
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
    const spots: Handles["animSpots"] = [];
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
      spots.push({
        x: hx - 2.2, y: -0.08, z: hz + 1.5, worldH: 0.65,
        frames: ["boat_a", "boat_b"],
        pick: (t) => (Math.sin(t * 1.7) > 0 ? 0 : 1),
      });
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
      // a dome on the meadow past the newest block's far corner,
      // clear of the ring road, watching the galaxy
      const nb = plan.blocks[plan.blocks.length - 1];
      let ox2 = nb.x + 8.3 * CELL;
      let oz2 = nb.z - 1.25 * CELL;
      const forcedO = placements?.["observatory"];
      if (forcedO) {
        ox2 = forcedO.x;
        oz2 = forcedO.z;
      }
      entries.push({ lot: decorLot(ox2, oz2), box: { x: ox2, y: 0, z: oz2, w: 1.3, h: 2.6, d: 1.3 } });
      entries.push({ lot: { ...decorLot(ox2, oz2), seed: 3 }, box: { x: ox2, y: 2.6, z: oz2, w: 1.0, h: 0.7, d: 1.0 } });
      entries.push({ lot: { ...decorLot(ox2, oz2), seed: 5 }, box: { x: ox2 + 0.3, y: 3.3, z: oz2, w: 0.18, h: 0.55, d: 0.18 } });
    }

    // street furniture: two benches and a planter per month, always there,
    // on the grass verge just south of the ring road
    for (const block of plan.blocks) {
      const bz = block.z + 7.1 * CELL;
      for (const fx2 of [1.8, 5.2]) {
        const bx = block.x + fx2 * CELL;
        entries.push({ lot: decorLot(bx, bz), box: { x: bx, y: 0.14, z: bz, w: 0.62, h: 0.07, d: 0.22 } }); // seat
        entries.push({ lot: decorLot(bx, bz), box: { x: bx, y: 0.21, z: bz - 0.1, w: 0.62, h: 0.18, d: 0.05 } }); // back
        entries.push({ lot: decorLot(bx, bz), box: { x: bx - 0.24, y: 0, z: bz, w: 0.06, h: 0.14, d: 0.18 } });
        entries.push({ lot: decorLot(bx, bz), box: { x: bx + 0.24, y: 0, z: bz, w: 0.06, h: 0.14, d: 0.18 } });
      }
      const px3 = block.x + 3.5 * CELL;
      entries.push({ lot: decorLot(px3, bz), box: { x: px3, y: 0, z: bz, w: 0.4, h: 0.24, d: 0.4 } }); // planter
      entries.push({ lot: { ...decorLot(px3, bz), seed: 4 }, box: { x: px3, y: 0.24, z: bz, w: 0.3, h: 0.22, d: 0.3 } });
    }

    // public works: scaffolding climbs on real days; opened halls stand
    // on the meadow north of their month, each with its own silhouette
    for (const cm of commissions) {
      const blk = plan.blocks[Math.min(cm.block, plan.blocks.length - 1)];
      if (!blk) continue;
      const forcedW = placements?.[cm.id];
      const wx = forcedW?.x ?? blk.x + 3.5 * CELL;
      const wz = forcedW?.z ?? blk.z - CELL * 2.1;
      const cLot = (seed: number): Lot => ({ ...decorLot(wx, wz), seed });
      if (cm.progress < 1) {
        // scaffold: four posts, platforms stacked with progress, a crane arm
        const hFull = 3.2;
        const hNow = Math.max(0.35, hFull * cm.progress);
        for (const [px2, pz2] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) {
          entries.push({ lot: cLot(2), box: { x: wx + px2, y: 0, z: wz + pz2, w: 0.09, h: hNow, d: 0.09 } });
        }
        const decks = Math.max(1, Math.floor(hNow / 0.8));
        for (let dk = 1; dk <= decks; dk += 1) {
          entries.push({ lot: cLot(2), box: { x: wx, y: dk * 0.8 - 0.05, z: wz, w: 2.6, h: 0.08, d: 1.8 } });
        }
        entries.push({ lot: cLot(2), box: { x: wx - 1.2, y: hNow, z: wz - 0.8, w: 0.07, h: 0.9, d: 0.07 } });
        entries.push({ lot: cLot(3), box: { x: wx - 0.6, y: hNow + 0.82, z: wz - 0.8, w: 1.3, h: 0.07, d: 0.07 } });
        const dustPhase = ((cm.block * 7919) % 100) / 10;
        spots.push({
          x: wx + 0.8, y: hNow + 0.15, z: wz - 0.4, worldH: 0.54,
          frames: ["dust_a", "dust_b", "dust_c"],
          pick: (t) => {
            const c = (t + dustPhase) % 16;
            return c < 1.8 ? Math.min(2, Math.floor(c / 0.6)) : -1;
          },
        });
      } else if (cm.id === "library") {
        entries.push({ lot: cLot(2), box: { x: wx, y: 0, z: wz, w: 3.4, h: 1.5, d: 2.0 } });
        for (const cx2 of [-1.15, 0, 1.15]) {
          entries.push({ lot: cLot(3), box: { x: wx + cx2, y: 0, z: wz + 1.06, w: 0.22, h: 1.2, d: 0.16 } });
        }
        entries.push({ lot: cLot(2), box: { x: wx, y: 1.5, z: wz, w: 3.7, h: 0.18, d: 2.3 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 0, z: wz + 1.35, w: 2.2, h: 0.14, d: 0.5 } });
      } else if (cm.id === "greenhouse") {
        entries.push({ lot: cLot(5), box: { x: wx, y: 0, z: wz, w: 2.8, h: 1.1, d: 1.6 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 1.1, z: wz, w: 2.9, h: 0.1, d: 0.24 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 0, z: wz, w: 0.12, h: 1.25, d: 1.7 } });
        spots.push({
          x: wx + 0.7, y: 0.55, z: wz + 0.85, worldH: 0.54,
          frames: ["glint_a", "glint_b"],
          pick: (t) => {
            const c = (t * 0.13) % 11;
            return c < 0.5 ? (c < 0.25 ? 0 : 1) : -1;
          },
        });
      } else if (cm.id === "teahouse") {
        entries.push({ lot: cLot(2), box: { x: wx, y: 0, z: wz, w: 1.7, h: 1.0, d: 1.3 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 1.0, z: wz, w: 2.4, h: 0.14, d: 1.9 } });
        entries.push({ lot: cLot(2), box: { x: wx + 1.35, y: 0, z: wz + 0.7, w: 0.07, h: 1.35, d: 0.07 } });
        spots.push({
          x: wx + 1.35, y: 1.0, z: wz + 0.72, worldH: 0.65,
          frames: ["lantern_a", "lantern_b"],
          pick: (t) => (Math.sin(t * 1.2) > 0.2 ? 0 : 1),
        });
      } else if (cm.id === "belltower") {
        entries.push({ lot: cLot(2), box: { x: wx, y: 0, z: wz, w: 0.9, h: 4.2, d: 0.9 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 4.2, z: wz, w: 1.2, h: 0.5, d: 1.2 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 4.7, z: wz, w: 0.7, h: 0.3, d: 0.7 } });
        spots.push({
          x: wx, y: 4.14, z: wz + 0.62, worldH: 0.76,
          frames: ["bell_a", "bell_b", "bell_c"],
          pick: (t) => {
            const d2 = new Date(performance.timeOrigin + t * 1000);
            const intoHour = d2.getMinutes() * 60 + d2.getSeconds();
            return intoHour < 8 ? 1 + (Math.floor(t * 3) % 2) : 0;
          },
        });
      } else if (cm.id === "skybridge") {
        for (const px3 of [-1.6, 1.6]) {
          entries.push({ lot: cLot(2), box: { x: wx + px3, y: 0, z: wz, w: 0.4, h: 3.4, d: 0.4 } });
        }
        entries.push({ lot: cLot(2), box: { x: wx, y: 3.0, z: wz, w: 4.4, h: 0.16, d: 0.7 } });
        entries.push({ lot: cLot(3), box: { x: wx, y: 3.16, z: wz + 0.28, w: 4.4, h: 0.1, d: 0.06 } });
      } else if (cm.id === "planetarium") {
        entries.push({ lot: cLot(2), box: { x: wx, y: 0, z: wz, w: 2.6, h: 1.0, d: 2.2 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 1.0, z: wz, w: 2.0, h: 0.6, d: 1.7 } });
        entries.push({ lot: cLot(2), box: { x: wx, y: 1.6, z: wz, w: 1.3, h: 0.5, d: 1.1 } });
        entries.push({ lot: cLot(3), box: { x: wx, y: 2.1, z: wz, w: 0.14, h: 0.4, d: 0.5 } });
      }
    }

    // the noticeboard: a pinned sentence stands at the newest month's gate
    if (billboard && plan.blocks.length > 0) {
      // a civic fixture: it stands on the street south of the first
      // month and never moves again — landmarks you can give directions
      // by. (It used to stand a step past the island's edge, planted in
      // the water rather than the ground.)
      const bb2 = plan.blocks[0];
      const bx3 = bb2.x + 0.35 * CELL;
      const bz3 = bb2.z + 6.6 * CELL;
      const bLot: Lot = { file: "__billboard__", date: "", x: bx3, z: bz3, half: 0.9, floors: 0, seed: 5, lit: 1 };
      for (const px4 of [-0.75, 0.75]) {
        entries.push({ lot: bLot, box: { x: bx3 + px4, y: 0, z: bz3, w: 0.1, h: 1.3, d: 0.1 } });
      }
      entries.push({ lot: bLot, box: { x: bx3, y: 0.55, z: bz3, w: 1.9, h: 0.95, d: 0.1 } });
      entries.push({ lot: { ...bLot, seed: 2 }, box: { x: bx3, y: 1.5, z: bz3, w: 2.05, h: 0.09, d: 0.16 } });
      // the writing itself: three pale dithered lines
      for (const [ly, lw] of [[1.22, 1.5], [1.0, 1.3], [0.78, 1.42]] as const) {
        entries.push({ lot: { ...bLot, seed: 6 }, box: { x: bx3, y: ly, z: bz3 + 0.06, w: lw, h: 0.07, d: 0.02 }, leaf: false, lampHead: true });
      }
    }

    // streets live in the terrain map now — no geometry needed

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
          entries.push({ lot: { ...decorLot(lx, lz), seed: 3 }, box: { x: lx, y: 1.5, z: lz, w: 0.22, h: 0.18, d: 0.22 }, lampHead: true });
          entries.push({ lot: decorLot(lx, lz), box: { x: lx, y: 1.68, z: lz, w: 0.12, h: 0.06, d: 0.12 } }); // cap
          entries.push({ lot: { ...decorLot(lx, lz), seed: 7 }, box: { x: lx, y: 0.012, z: lz, w: 0.85, h: 0.02, d: 0.85 } }); // light pool
        }
      }
    }
    // free calendar cells of each block — days not yet written are the
    // city's pocket parks, where bought decor actually belongs
    const freeCellCache = new Map<number, { cx: number; cz: number }[]>();
    const freeOf = (bi: number): { cx: number; cz: number }[] => {
      let f = freeCellCache.get(bi);
      if (f === undefined) {
        const blk = plan.blocks[bi];
        const used = new Set<string>();
        for (const lot of plan.lots) {
          const c = Math.round((lot.x - blk.x - CELL / 2) / CELL);
          const r = Math.round((lot.z - blk.z - CELL / 2) / CELL);
          if (c >= 0 && c < 7 && r >= 0 && r < 6) used.add(`${c},${r}`);
        }
        f = [];
        for (let r = 0; r < 6; r += 1) {
          for (let c = 0; c < 7; c += 1) {
            if (!used.has(`${c},${r}`)) {
              f.push({ cx: blk.x + c * CELL + CELL / 2, cz: blk.z + r * CELL + CELL / 2 });
            }
          }
        }
        freeCellCache.set(bi, f);
      }
      return f;
    };

    // pocket groves are hand-drawn sprites now (boxes never read as trees) —
    // scattered on the free days of each month, drawn by the sprite pass
    const trees: Handles["trees"] = [];
    if (decor.trees) {
      const species = ["tree_round", "tree_pine", "tree_slim"];
      plan.blocks.forEach((block, bi) => {
        const rand = rng(hashBlock(block.month));
        const free = freeOf(bi);
        for (let t = 0; t < 6 && free.length > 0; t += 1) {
          const cell = free.splice(Math.floor(rand() * free.length), 1)[0];
          trees.push({
            x: cell.cx + (rand() - 0.5) * 1.2,
            z: cell.cz + (rand() - 0.5) * 1.2,
            name: species[Math.floor(rand() * species.length)],
            mirror: rand() < 0.5 ? 1 : 0,
          });
        }
      });
    }
    h.trees = trees;
    h.animSpots = spots;
    if (decor.fountain && plan.blocks.length > 0) {
      const first = plan.blocks[0];
      // the plaza of your first month: the free cell nearest its heart
      const free = freeOf(0);
      let fx = first.x + 1.6 * CELL;
      let fz = first.z - CELL * 1.5; // meadow fallback for a fully built month
      if (free.length > 0) {
        const cx0 = first.x + 3.5 * CELL;
        const cz0 = first.z + 3 * CELL;
        let best = 0;
        let bd = Infinity;
        free.forEach((c, i) => {
          const d2 = (c.cx - cx0) * (c.cx - cx0) + (c.cz - cz0) * (c.cz - cz0);
          if (d2 < bd) { bd = d2; best = i; }
        });
        const cell = free.splice(best, 1)[0];
        fx = cell.cx;
        fz = cell.cz;
      }
      const forcedF = placements?.["fountain"];
      if (forcedF) {
        fx = forcedF.x;
        fz = forcedF.z;
      }
      entries.push({ lot: decorLot(fx, fz), box: { x: fx, y: 0, z: fz, w: 1.4, h: 0.18, d: 1.4 } });
      entries.push({ lot: { ...decorLot(fx, fz), seed: 4 }, box: { x: fx, y: 0.18, z: fz, w: 0.95, h: 0.08, d: 0.95 } }); // inner ring
      entries.push({ lot: decorLot(fx, fz), box: { x: fx, y: 0.18, z: fz, w: 0.24, h: 0.55, d: 0.24 } });
      entries.push({ lot: { ...decorLot(fx, fz), seed: 5 }, box: { x: fx, y: 0.73, z: fz, w: 0.16, h: 0.16, d: 0.16 } });
      spots.push({
        x: fx, y: 0.5, z: fz, worldH: 0.87,
        frames: ["fountain_w_a", "fountain_w_b", "fountain_w_c"],
        pick: (t) => Math.floor(t * 5) % 3,
      });
    }

    // the island itself: a terrain-mapped plane with an organic coastline
    {
      const terr = terrainFor(plan);
      const tex = new THREE.DataTexture(terr.data, terr.w, terr.h, THREE.RedFormat, THREE.UnsignedByteType);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.unpackAlignment = 1;
      tex.needsUpdate = true;
      const gm = h.groundMat!;
      const prev = gm.uniforms.uMap.value as THREE.DataTexture | null;
      if (prev) prev.dispose();
      gm.uniforms.uMap.value = tex;
      (gm.uniforms.uMin.value as THREE.Vector2).set(terr.minX, terr.minZ);
      (gm.uniforms.uInv.value as THREE.Vector2).set(1 / terr.worldW, 1 / terr.worldH);
      (gm.uniforms.uTexel.value as THREE.Vector2).set(1 / terr.w, 1 / terr.h);
      gm.uniforms.uWx.value = weather === "rain" ? 1 : weather === "snow" ? 2 : weather === "fog" ? 3 : 0;
      if (h.ground) {
        h.scene.remove(h.ground);
        h.ground.geometry.dispose();
      }
      const gGeo = new THREE.PlaneGeometry(terr.worldW, terr.worldH);
      gGeo.rotateX(-Math.PI / 2);
      const gMesh = new THREE.Mesh(gGeo, gm);
      gMesh.position.set(terr.minX + terr.worldW / 2, 0, terr.minZ + terr.worldH / 2);
      gMesh.frustumCulled = false;
      h.scene.add(gMesh);
      h.ground = gMesh;
    }
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
      tints[i * 3 + 1] = e.leaf ? 2.0 + grey : grey; // g>1.9 flags foliage
      tints[i * 3 + 2] = e.lampHead ? 2.0 + grey * 1.04 : grey * 1.04; // b>1.9 flags a lamp head
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
    const slots = creatures.length * 2 + 8 + h.trees.length + h.animSpots.length; // umbrellas, emotes, groves, spot animations
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
    h.quantMat!.uniforms.uLevel.value = level;
    (h.quantMat!.uniforms.uSky.value as THREE.Vector2).set(decor.sister ? 1 : 0, decor.comet ? 1 : 0);
  }, [plan, extras, decor, skin, streak, weather, commissions, level, placements, billboard]);

  /* the Mirror: a new look recomposes your nine frames into the atlas.
     Texture and frame table swap in the same tick — they must never
     disagree, or every sprite in town samples the wrong rectangle. */
  useEffect(() => {
    const h = hRef.current;
    if (!h || !h.spriteMat) return;
    const atlas = buildAtlas({ ...composeYou(look), ...composeCitizens() });
    const tex = new THREE.DataTexture(atlas.data, atlas.size, atlas.size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const old = h.spriteMat.uniforms.uTex.value as THREE.DataTexture | null;
    h.spriteMat.uniforms.uTex.value = tex;
    h.spriteFrames = atlas.frames;
    if (old) old.dispose();
    loop();
  }, [look, loop]);

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
    if (!ceremony || ceremony.n === ceremonySeenRef.current) return;
    const lot = plan.lots.find((l) => l.file === ceremony.file);
    if (!lot) return; // the plan has not caught up yet — the next one will
    ceremonySeenRef.current = ceremony.n;
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
    if (file === "__billboard__") return file;
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
      gestureRef.current = true;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        view: viewRef.current,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        px: panRef.current.x,
        pz: panRef.current.z,
        ang: Math.atan2(b.y - a.y, b.x - a.x),
        yaw: yawRef.current,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      yaw: yawRef.current,
      moved: false,
      pan: event.shiftKey || event.button === 1 || event.pointerType === "touch",
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
        const pinch = pinchRef.current;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.dist > 0 && dist > 0) {
          viewGoalRef.current = null;
          viewRef.current = clampView(pinch.view * (pinch.dist / dist));
        }
        // two-finger twist steers the camera
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        yawRef.current = pinch.yaw + (ang - pinch.ang);
        yawTargetRef.current = yawRef.current;
        // and the centroid drags the city, like any map
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const dcx = cx - pinch.cx;
        const dcy = cy - pinch.cy;
        panTargetRef.current = null;
        const h2 = hRef.current;
        const world = h2 ? (h2.camera.right - h2.camera.left) / (canvasRef.current?.clientWidth ?? 1) : 0.1;
        const yaw2 = yawRef.current;
        panRef.current.x = pinch.px - (dcx * Math.cos(yaw2) + dcy * Math.sin(yaw2)) * world;
        panRef.current.z = pinch.pz - (dcy * Math.cos(yaw2) - dcx * Math.sin(yaw2)) * world;
        loop();
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
            // grab-the-city: the ground follows the finger on BOTH axes.
            // screen-right is world (cos, -sin), screen-down is (sin, cos) —
            // the old matrix had the vertical inverted; the first fix
            // flipped both and broke the horizontal instead.
            panRef.current.x = drag.px - (dx * Math.cos(yaw) + dy * Math.sin(yaw)) * world;
            panRef.current.z = drag.pz - (dy * Math.cos(yaw) - dx * Math.sin(yaw)) * world;
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
        buildingsDirtyRef.current = true;
        loop();
        onHover(hit, event.clientX, event.clientY);
      } else if (hit) {
        onHover(hit, event.clientX, event.clientY);
      }
    },
    [loop, onHover, raycast, clampView],
  );

  /** nearest resident within tap radius, in screen space — sprite quads
   *  are sized in the vertex shader, so CPU raycasts can't see them */
  const pickCreature = useCallback(
    (clientX: number, clientY: number) => {
      const h = hRef.current;
      const canvas = canvasRef.current;
      if (!h || !canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const radius = window.matchMedia("(pointer: coarse)").matches ? 30 : 22;
      let best: { key: string; kind: string; seed: number; x: number; y: number } | null = null;
      let bestD = radius;
      for (const c of h.creatures) {
        if (c.kind === "bird") continue; // you can't greet a courier ship
        const pos = projectCreature(c.key, lastDrawRef.current);
        if (!pos) continue;
        const d = Math.hypot(pos.x - px, pos.y - py + 8); // aim at the body
        if (d < bestD) {
          bestD = d;
          best = { key: c.key, kind: c.kind, seed: c.seed, x: pos.x, y: pos.y };
        }
      }
      return best;
    },
    [projectCreature],
  );

  const groundPoint = useCallback((clientX: number, clientY: number): { x: number; z: number } | null => {
    const h = hRef.current;
    const canvas = canvasRef.current;
    if (!h || !h.ground || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const caster = new THREE.Raycaster();
    caster.setFromCamera(ndc, h.camera);
    const hit = caster.intersectObject(h.ground, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2 && pinchRef.current) {
        pinchRef.current = null;
        scheduleViewSnap();
      }
      if (gestureRef.current) {
        // this finger is ending a two-finger gesture, not making a point.
        // It used to fall through and "tap" whatever lot it lifted from —
        // rotating the city kept summoning the notebook.
        if (pointersRef.current.size === 0) gestureRef.current = false;
        dragRef.current = null;
        return;
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
      // residents first — they are small targets, buildings are not
      const creature = pickCreature(event.clientX, event.clientY);
      if (creature) {
        onCreatureTap(creature);
        return;
      }
      const hit = raycast(event.clientX, event.clientY);
      if (hit === "__billboard__") {
        onBillboardTap?.();
        return;
      }
      if (hit && !hit.startsWith("demo/")) {
        onOpen(hit);
        return;
      }
      if (!hit && onGroundTap) {
        const g = groundPoint(event.clientX, event.clientY);
        if (g) onGroundTap(g.x, g.z);
      }
    },
    [loop, onOpen, raycast, scheduleViewSnap, pickCreature, onCreatureTap, groundPoint, onGroundTap, onBillboardTap],
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
    gestureRef.current = false; // no stale gesture may eat the next tap
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
      // iOS cancels pointers freely (system gestures, palm touches). An
      // uncleared cancel left stale entries in pointersRef, kept the
      // gesture flag latched, and every later tap was silently eaten —
      // "the buildings stopped responding".
      onPointerCancel={onPointerLeave}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
      aria-label={ariaLabel ?? "Your city of notes"}
      role="img"
    />
  );
}
