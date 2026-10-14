import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Clock,
  RotateCcw,
  Send,
  AlertCircle,
  Sparkles,
  SkipForward,
  Radio,
  Check,
  ChevronRight,
} from 'lucide-react';
import type {
  SideNettingMatchConfig,
  SideNettingPrompt,
  SideNettingRarityTier,
  SideNettingRoundResult,
  SideNettingRoundSubmission,
} from './types';
import {
  SIDE_NETTING_TIER_CONFIGS,
} from './types';
import {
  drawMatchPrompts,
  evaluateAnswer,
  searchSideNettingPlayers,
  getBallKnowerRating,
} from './sideNettingEngine';
import { soundFX } from '../../utils/audio';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';

/* ============================================================================
 * WORLD CONSTANTS
 * One world unit ≈ one metre. Camera looks down +z towards the far goal.
 * ==========================================================================*/

const TAU = Math.PI * 2;
const Z_GOAL = 96;
const GOAL_HW = 3.66;
const GOAL_H = 2.44;
const NET_D = 2.2;
const PITCH_HW = 34;
const OWN_LINE = -9;
const BALL_R = 0.3;
const NEAR = 0.35;
const MAX_PARTICLES = 720;

const ZONE_EDGES = [500, 1500, 2600, 3600];
const depthToZ = (d: number) => (d / 4000) * (Z_GOAL - 4);
const ZONE_Z = ZONE_EDGES.map(depthToZ);

const TIER_ORDER: SideNettingRarityTier[] = [
  'Tap-In',
  'Starter XI',
  'Cult Hero',
  "Streets Won't Forget",
  "Ballon d'Or Knowledge",
];
const MISS_HEX = '#f43f5e';
const TIER_HEX = [MISS_HEX, ...TIER_ORDER.map((t) => SIDE_NETTING_TIER_CONFIGS[t].glowColor)];
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const TIER_RGB = TIER_HEX.map(hexToRgb);
const CYAN_RGB = '0,240,255';
const GOLD_FLASH_RGB = '255,240,190';

const tierIndexOf = (tier?: SideNettingRarityTier | 'Miss' | null) =>
  !tier || tier === 'Miss' ? 0 : Math.max(0, TIER_ORDER.indexOf(tier) + 1);
const zoneIndexForDepth = (d: number) =>
  d >= 3600 ? 4 : d >= 2600 ? 3 : d >= 1500 ? 2 : d >= 500 ? 1 : 0;
const zoneIndexForZ = (z: number) => {
  let i = 0;
  for (let k = 0; k < ZONE_Z.length; k++) if (z >= ZONE_Z[k]) i = k + 1;
  return i;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (v: number) => v - Math.floor(v);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const PITCH_ZONES = [
  { label: 'TAP-IN', short: 'TAP-IN', pts: 5, from: 0, to: 500 },
  { label: 'STARTER XI', short: 'STARTER', pts: 30, from: 500, to: 1500 },
  { label: 'CULT HERO', short: 'CULT', pts: 50, from: 1500, to: 2600 },
  { label: "STREETS WON'T FORGET", short: 'STREETS', pts: 85, from: 2600, to: 3600 },
  { label: "BALLON D'OR", short: "BALLON D'OR", pts: 100, from: 3600, to: 4000 },
].map((z, i) => ({ ...z, color: TIER_HEX[i + 1] }));

const REVEAL_COPY = [
  { headline: 'NO SHOT', kicker: 'CHANCE GONE BEGGING' },
  { headline: 'TAP-IN', kicker: 'ROUTINE FINISH' },
  { headline: 'CLINICAL', kicker: 'STARTER XI KNOWLEDGE' },
  { headline: 'CULT CLASSIC', kicker: 'DEEP CUT DETECTED' },
  { headline: 'WORLDIE!', kicker: "THE STREETS WON'T FORGET" },
  { headline: 'SIDE NETTING!', kicker: "TOP BINS • BALLON D'OR RECALL" },
];

/* ============================================================================
 * STADIUM ENGINE — pure Canvas2D, zero external assets.
 * Runs its own rAF loop and reads phase changes pushed in from React, so the
 * 35ms depth-counter re-renders never touch the render path.
 * ==========================================================================*/

type ShotKind = 'land' | 'net' | 'scuff';

interface ShotPlan {
  kind: ShotKind;
  tierIdx: number;
  side: number;
  zEnd: number;
  endX: number;
  endY: number;
  H: number;
  swerve: number;
  duration: number;
  bounced: boolean;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  css: string;
  size: number;
  kind: number; // 0 spark, 1 confetti, 2 dust, 3 firework, 4 bloom, 5 charge
  rot: number;
  vr: number;
}

interface Ring {
  x: number;
  z: number;
  t0: number;
  dur: number;
  maxR: number;
  rgb: string;
}

interface TelemetryNodes {
  speed: HTMLElement | null;
  peak: HTMLElement | null;
  spin: HTMLElement | null;
  curl: HTMLElement | null;
  mode: HTMLElement | null;
}

interface StadiumEngine {
  setPhase: (phase: DiveState, target: number, tierIdx: number, roundIdx: number) => void;
  setFlags: (wrong: boolean, urgent: boolean) => void;
  destroy: () => void;
}

const SWERVE_BY_TIER = [0.3, 1.0, 3.5, 6, 8, 9];
const LOFT_BY_TIER = [0.35, 0.5, 3.5, 6.5, 9.5, 6];

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: Array<[number, number, number]> = (
  [
    [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
    [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
  ] as Array<[number, number, number]>
).map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as [number, number, number];
});

const cssCache = new Map<string, string>();
const rgbCss = (rgb: string) => {
  let c = cssCache.get(rgb);
  if (!c) {
    c = `rgb(${rgb})`;
    cssCache.set(rgb, c);
  }
  return c;
};

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function planShot(target: number, tierIdx: number, roundIdx: number): ShotPlan {
  const rnd = seeded(roundIdx * 7919 + target * 13 + 17);
  const side = rnd() < 0.5 ? -1 : 1;
  const duration = target > 0 ? 2200 : 800;
  if (tierIdx >= 5) {
    return {
      kind: 'net', tierIdx: 5, side, zEnd: Z_GOAL + 0.9, endX: side * (GOAL_HW - BALL_R - 0.02),
      endY: 2.0, H: LOFT_BY_TIER[5], swerve: SWERVE_BY_TIER[5], duration, bounced: true,
    };
  }
  if (target <= 0 || tierIdx === 0) {
    return {
      kind: 'scuff', tierIdx: 0, side, zEnd: 1.6, endX: side * 0.9, endY: BALL_R,
      H: LOFT_BY_TIER[0], swerve: SWERVE_BY_TIER[0], duration, bounced: true,
    };
  }
  return {
    kind: 'land', tierIdx, side, zEnd: depthToZ(target), endX: side * (0.6 + rnd() * 1.4) * tierIdx,
    endY: BALL_R, H: LOFT_BY_TIER[tierIdx], swerve: SWERVE_BY_TIER[tierIdx], duration, bounced: false,
  };
}

// Normalised time -> normalised path progress. Ground shots share the HUD counter's
// cubic ease-out so the ball sits exactly where the readout says; the Ballon d'Or
// strike rockets out, drops into bullet-time, then snaps into the net at full pace.
function shotV(p: ShotPlan, t: number) {
  if (p.kind !== 'net') return 1 - Math.pow(1 - t, 3);
  if (t < 0.5) {
    const u = t / 0.5;
    return 0.72 * (1 - (1 - u) * (1 - u));
  }
  if (t < 0.82) return 0.72 + 0.13 * ((t - 0.5) / 0.32);
  const u = (t - 0.82) / 0.18;
  return 0.85 + 0.15 * u * u;
}

function shotPos(p: ShotPlan, v: number, out: { x: number; y: number; z: number }) {
  out.z = p.zEnd * v;
  out.x = p.endX * (p.kind === 'net' ? v * v : v) - p.side * p.swerve * Math.sin(Math.PI * v) * (1 - 0.35 * v);
  if (p.kind === 'net') {
    out.y = BALL_R + (p.endY - BALL_R) * v + p.H * Math.sin(Math.PI * v);
    return;
  }
  const fe = 0.78;
  if (v < fe) {
    out.y = BALL_R + p.H * Math.sin((Math.PI * v) / fe);
  } else {
    const u = (v - fe) / (1 - fe);
    out.y = BALL_R + p.H * 0.2 * Math.abs(Math.sin(Math.PI * u * 2)) * (1 - u);
  }
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

function makeGlowSprite(rgb: string) {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.16, `rgba(${rgb},0.6)`);
  gr.addColorStop(0.45, `rgba(${rgb},0.16)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function makeStreakSprite() {
  const c = makeCanvas(512, 32);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const gr = g.createLinearGradient(0, 0, 512, 0);
  gr.addColorStop(0, 'rgba(110,210,255,0)');
  gr.addColorStop(0.5, 'rgba(210,245,255,1)');
  gr.addColorStop(1, 'rgba(110,210,255,0)');
  g.fillStyle = gr;
  g.globalAlpha = 0.25;
  g.fillRect(0, 8, 512, 16);
  g.globalAlpha = 0.5;
  g.fillRect(0, 13, 512, 6);
  g.globalAlpha = 1;
  g.fillRect(0, 15, 512, 2);
  return c;
}

function makeCrowdTexture() {
  const c = makeCanvas(512, 256);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#050913';
  g.fillRect(0, 0, 512, 256);
  const hues = [205, 190, 350, 48, 160, 280];
  for (let row = 0; row < 32; row++) {
    g.fillStyle = row % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.25)';
    g.fillRect(0, row * 8, 512, 8);
    for (let i = 0; i < 130; i++) {
      const x = Math.random() * 512;
      const hue = hues[i % hues.length];
      g.fillStyle = `hsla(${hue},${30 + Math.random() * 45}%,${16 + Math.random() * 28}%,0.95)`;
      g.fillRect(x, row * 8 + 2 + Math.random() * 3, 2, 3);
    }
  }
  return c;
}

function makeLedTexture() {
  const c = makeCanvas(2048, 64);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#02050c';
  g.fillRect(0, 0, 2048, 64);
  g.font = 'italic 900 42px "Barlow Condensed", Impact, sans-serif';
  g.textBaseline = 'middle';
  const msg = '  SIDE NETTING  ✦  TOP BINS  ✦  BALL KNOWERS ONLY  ✦  DEEP CUTS FLY FURTHER  ✦';
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#00f0ff');
  grad.addColorStop(0.5, '#ccff00');
  grad.addColorStop(1, '#00f0ff');
  g.fillStyle = grad;
  let x = 0;
  const wMsg = Math.max(200, g.measureText(msg).width);
  while (x < 1024) {
    g.fillText(msg, x, 34);
    x += wMsg;
  }
  g.drawImage(c, 0, 0, 1024, 64, 1024, 0, 1024, 64);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 2048; i += 3) g.fillRect(i, 0, 1, 64);
  for (let j = 0; j < 64; j += 3) g.fillRect(0, j, 2048, 1);
  return c;
}

function makeFlashPoints() {
  const pts: Array<{ x: number; y: number; z: number; seed: number }> = [];
  for (let i = 0; i < 190; i++) {
    const u = Math.random();
    const v = Math.random();
    const seed = Math.random() * 1000;
    if (i < 80) {
      pts.push({ x: (-64 + u * 128) * (1 + v * 0.25), y: v * 24, z: Z_GOAL + 9 + v * 23, seed });
    } else {
      const sd = i % 2 ? 1 : -1;
      pts.push({ x: sd * (42 + v * 18), y: v * 20, z: -30 + u * (Z_GOAL + 39), seed });
    }
  }
  return pts;
}

const FLOODLIGHTS: Array<[number, number]> = [
  [-50, -12], [50, -12], [-50, 42], [50, 42], [-50, Z_GOAL + 16], [50, Z_GOAL + 16],
];

function createStadiumEngine(
  canvas: HTMLCanvasElement,
  telemetry: React.RefObject<TelemetryNodes>
): StadiumEngine {
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  let alive = true;
  const reduceMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = reduceMotion ? 0.25 : 1;

  let W = 1;
  let H = 1;
  let CX = 0.5;
  let HZ = 0.4;
  let F = 800;
  let FZ = 800;
  let dpr = 1;
  let dprCap = Math.min(window.devicePixelRatio || 1, 2);
  let skyGrad: CanvasGradient | string = '#02040a';
  let hazeGrad: CanvasGradient | string = 'rgba(0,0,0,0)';
  let vignette = makeCanvas(2, 2);

  const glowWhite = makeGlowSprite('255,255,255');
  const glowCool = makeGlowSprite('160,215,255');
  const glowCyan = makeGlowSprite(CYAN_RGB);
  const glowTier = TIER_RGB.map(makeGlowSprite);
  const streak = makeStreakSprite();
  const crowd = makeCrowdTexture();
  let led = makeLedTexture();
  const flashPts = makeFlashPoints();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (alive) led = makeLedTexture();
    });
  }

  // Camera starts high above the far stand and swoops down behind the ball.
  const cam = { x: -18, y: 22, z: -46, zoom: 0.8, roll: 0 };
  const ball = { x: 0, y: BALL_R, z: 0, a: 0, b: 0 };
  const prevBall = { x: 0, y: BALL_R, z: 0 };
  let vel = 0;
  let latVel = 0;
  let phase: DiveState = 'idle-surface';
  let lastRound = -1;
  let phaseT0 = performance.now() / 1000;
  let plan: ShotPlan | null = null;
  let shotT0 = 0;
  let shotT = 0;
  let shotDone = false;
  let doneT = 0;
  let slowMo = false;
  let zonesCrossed = 0;
  const zoneFlash = [-10, -10, -10, -10];
  let netHit: { side: number; y: number; z: number; t0: number } | null = null;
  let beacon: { x: number; z: number; rgb: string; ti: number; t0: number } | null = null;
  let trauma = 0;
  let flash = 0;
  let flashRgb = '255,255,255';
  let zoomKick = 0;
  let stormUntil = 0;
  let fireworksUntil = 0;
  let strobeUntil = 0;
  let nextFirework = 0;
  let celebrateRgb = CYAN_RGB;
  let celebrateUntil = 0;
  let wrong = false;
  let urgent = false;
  let wrongT0 = -10;
  let peakKmh = 0;
  let peakCurl = 0;
  let dustCount = 0;
  const ascendFrom = { x: 0, y: BALL_R, z: 0 };
  const trail: Array<{ x: number; y: number; z: number }> = [];
  const parts: Particle[] = [];
  const rings: Ring[] = [];
  const polyPts: number[] = [];
  const pt = { x: 0, y: 0, s: 0 };
  let T = performance.now() / 1000;
  let lastMs = performance.now();
  let raf = 0;
  let frameNo = 0;
  let perfAcc = 0;
  let perfFrames = 0;

  /* ---------------- sizing ---------------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, rect.width || window.innerWidth);
    H = Math.max(1, rect.height || window.innerHeight);
    dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    CX = W / 2;
    HZ = H * 0.4;
    F = H * 0.92;

    const sg = ctx.createLinearGradient(0, -H * 0.4, 0, HZ);
    sg.addColorStop(0, '#010208');
    sg.addColorStop(0.55, '#030714');
    sg.addColorStop(1, '#0c1c36');
    skyGrad = sg;

    const hg = ctx.createLinearGradient(0, HZ - H * 0.05, 0, HZ + H * 0.2);
    hg.addColorStop(0, 'rgba(60,120,190,0)');
    hg.addColorStop(0.22, 'rgba(60,120,190,0.24)');
    hg.addColorStop(1, 'rgba(20,50,90,0)');
    hazeGrad = hg;

    const vw = Math.max(2, Math.round(W / 3));
    const vh = Math.max(2, Math.round(H / 3));
    vignette = makeCanvas(vw, vh);
    const vctx = vignette.getContext('2d') as CanvasRenderingContext2D;
    const vg = vctx.createRadialGradient(vw / 2, vh * 0.55, Math.min(vw, vh) * 0.28, vw / 2, vh * 0.55, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(0,0,0,0.32)');
    vg.addColorStop(1, 'rgba(0,0,0,0.86)');
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, vw, vh);
  }

  /* ---------------- projection ---------------- */
  function project(x: number, y: number, z: number) {
    const d = z - cam.z;
    if (d < NEAR) return false;
    const s = FZ / d;
    pt.x = CX + (x - cam.x) * s;
    pt.y = HZ + (cam.y - y) * s;
    pt.s = s;
    return true;
  }

  // Appends a near-plane-clipped 3D segment to the current path.
  function seg(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    let d1 = z1 - cam.z;
    let d2 = z2 - cam.z;
    if (d1 < NEAR && d2 < NEAR) return;
    if (d1 < NEAR) {
      const k = (NEAR - d1) / (d2 - d1);
      x1 += (x2 - x1) * k;
      y1 += (y2 - y1) * k;
      d1 = NEAR;
    } else if (d2 < NEAR) {
      const k = (NEAR - d2) / (d1 - d2);
      x2 += (x1 - x2) * k;
      y2 += (y1 - y2) * k;
      d2 = NEAR;
    }
    const s1 = FZ / d1;
    const s2 = FZ / d2;
    ctx.moveTo(CX + (x1 - cam.x) * s1, HZ + (cam.y - y1) * s1);
    ctx.lineTo(CX + (x2 - cam.x) * s2, HZ + (cam.y - y2) * s2);
  }

  function groundCircle(cx: number, cz: number, r: number, n: number, a0 = 0, a1 = TAU) {
    let px = cx + Math.sin(a0) * r;
    let pz = cz - Math.cos(a0) * r;
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const nx = cx + Math.sin(a) * r;
      const nz = cz - Math.cos(a) * r;
      seg(px, 0, pz, nx, 0, nz);
      px = nx;
      pz = nz;
    }
  }

  function polyPath(c: number[]) {
    polyPts.length = 0;
    ctx.beginPath();
    for (let i = 0; i < c.length; i += 3) {
      if (!project(c[i], c[i + 1], c[i + 2])) return false;
      polyPts.push(pt.x, pt.y);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    return true;
  }

  function groundQuad(xa: number, xb: number, za: number, zb: number) {
    return polyPath([xa, 0, za, xb, 0, za, xb, 0, zb, xa, 0, zb]);
  }

  /* ---------------- fx spawners ---------------- */
  function addTrauma(a: number) {
    trauma = Math.min(1, trauma + a * motion);
  }

  function spawn(p: Particle) {
    if (parts.length < MAX_PARTICLES) parts.push(p);
  }

  function burst(x: number, y: number, z: number, n: number, rgb: string, speed: number, kind = 0) {
    const css = rgbCss(rgb);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * TAU;
      const u = kind === 3 ? Math.random() * 2 - 1 : 0.15 + Math.random() * 0.85;
      const sp = speed * (0.35 + Math.random() * 0.75);
      const hz = Math.sqrt(Math.max(0, 1 - u * u));
      const life = kind === 3 ? 1.1 + Math.random() * 0.8 : 0.55 + Math.random() * 0.75;
      spawn({
        x, y, z,
        vx: Math.cos(th) * hz * sp,
        vy: u * sp * (kind === 3 ? 1 : 1.15),
        vz: Math.sin(th) * hz * sp,
        life, max: life, css,
        size: 0.04 + Math.random() * 0.07,
        kind, rot: 0, vr: 0,
      });
    }
  }

  function confetti(x: number, y: number, z: number, n: number, spread: number, rgb: string) {
    const palette = [rgb, '255,255,255', '204,255,0', '0,240,255', rgb];
    for (let i = 0; i < n; i++) {
      const life = 3 + Math.random() * 2;
      spawn({
        x: x + (Math.random() - 0.5) * spread,
        y: y + Math.random() * 6,
        z: z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        life, max: life,
        css: rgbCss(palette[i % palette.length]),
        size: 0.16 + Math.random() * 0.16,
        kind: 1,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  function ring(x: number, z: number, maxR: number, rgb: string, dur: number) {
    if (rings.length < 24) rings.push({ x, z, maxR, rgb, dur, t0: T });
  }

  function firework() {
    const x = (Math.random() - 0.5) * 70;
    const y = 22 + Math.random() * 12;
    const z = Z_GOAL + 22 + Math.random() * 18;
    const pal = [TIER_RGB[5], '255,255,255', celebrateRgb, CYAN_RGB];
    const rgb = pal[Math.floor(Math.random() * pal.length)];
    burst(x, y, z, 64, rgb, 9 + Math.random() * 4, 3);
    spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.35, max: 0.35, css: rgbCss(rgb), size: 10, kind: 4, rot: 0, vr: 0 });
  }

  /* ---------------- phase control ---------------- */
  function resetShot() {
    plan = null;
    shotDone = false;
    slowMo = false;
    netHit = null;
    beacon = null;
    trail.length = 0;
    zonesCrossed = 0;
    peakKmh = 0;
    peakCurl = 0;
    ball.x = 0;
    ball.y = BALL_R;
    ball.z = 0;
    prevBall.x = 0;
    prevBall.y = BALL_R;
    prevBall.z = 0;
  }

  function setPhase(next: DiveState, target: number, tierIdx: number, roundIdx: number) {
    if (next === phase && roundIdx === lastRound) return;
    const prevPhase = phase;
    phase = next;
    lastRound = roundIdx;
    const now = performance.now() / 1000;
    T = now;
    phaseT0 = now;

    switch (next) {
      case 'idle-surface':
        resetShot();
        fireworksUntil = 0;
        stormUntil = 0;
        celebrateUntil = 0;
        break;
      case 'answered-bubble':
        resetShot();
        break;
      case 'diving': {
        if (prevPhase !== 'answered-bubble') resetShot();
        plan = planShot(target, tierIdx, roundIdx);
        shotT0 = now;
        shotT = 0;
        shotDone = false;
        zonesCrossed = 0;
        peakKmh = 0;
        peakCurl = 0;
        trail.length = 0;
        // STRIKE: concussive flash, FOV punch, spark spray off the laces
        addTrauma(0.38);
        flash = Math.max(flash, 0.32 * motion);
        flashRgb = '235,250,255';
        zoomKick = -0.14;
        burst(ball.x, ball.y, ball.z, 34, '220,250,255', 6, 0);
        burst(ball.x, ball.y, ball.z, 14, CYAN_RGB, 8, 0);
        ring(ball.x, ball.z, 3.2, CYAN_RGB, 0.55);
        ring(ball.x, ball.z, 1.6, '255,255,255', 0.35);
        break;
      }
      case 'at-depth':
        break;
      case 'ascending':
        ascendFrom.x = ball.x;
        ascendFrom.y = ball.y;
        ascendFrom.z = ball.z;
        plan = null;
        shotDone = false;
        netHit = null;
        beacon = null;
        trail.length = 0;
        break;
      case 'game-over':
        resetShot();
        fireworksUntil = Infinity;
        stormUntil = now + 3.5;
        celebrateRgb = TIER_RGB[5];
        celebrateUntil = now + 5;
        nextFirework = now + 0.3;
        break;
    }
  }

  function setFlags(w: boolean, u: boolean) {
    if (w && !wrong) {
      wrongT0 = performance.now() / 1000;
      addTrauma(0.24);
      flash = Math.max(flash, 0.16 * motion);
      flashRgb = TIER_RGB[0];
      burst(ball.x, ball.y + 0.2, ball.z, 16, TIER_RGB[0], 3.2, 0);
    }
    wrong = w;
    urgent = u;
  }

  function onShotComplete() {
    if (!plan) return;
    const ti = plan.tierIdx;
    const rgb = TIER_RGB[ti];
    if (plan.kind === 'net') {
      netHit = { side: plan.side, y: plan.endY, z: plan.zEnd, t0: T };
      addTrauma(1);
      flash = 0.9 * motion;
      flashRgb = GOLD_FLASH_RGB;
      zoomKick = 0.16;
      burst(ball.x, ball.y, ball.z, 150, rgb, 11, 0);
      burst(ball.x, ball.y, ball.z, 60, '255,255,255', 8, 0);
      confetti(0, 9, Z_GOAL - 3, 220, 16, rgb);
      ring(0, Z_GOAL - 1, 10, rgb, 1.3);
      ring(ball.x, ball.z, 4, '255,255,255', 0.6);
      stormUntil = T + 4.5;
      fireworksUntil = T + 5.5;
      nextFirework = T + 0.25;
      strobeUntil = T + 1.6;
      celebrateRgb = rgb;
      celebrateUntil = T + 6;
      beacon = { x: 0, z: Z_GOAL + 1, rgb, ti, t0: T };
    } else if (plan.kind === 'scuff') {
      addTrauma(0.18);
      flash = Math.max(flash, 0.22 * motion);
      flashRgb = TIER_RGB[0];
      ring(ball.x, ball.z, 2.4, TIER_RGB[0], 0.7);
      burst(ball.x, BALL_R, ball.z, 22, TIER_RGB[0], 3.5, 0);
    } else {
      beacon = { x: ball.x, z: ball.z, rgb, ti, t0: T };
      ring(ball.x, ball.z, 3 + ti * 1.8, rgb, 0.9);
      ring(ball.x, ball.z, 1.5 + ti, '255,255,255', 0.5);
      burst(ball.x, BALL_R + 0.1, ball.z, 18 + ti * 26, rgb, 4 + ti * 1.6, 0);
      addTrauma(0.08 + ti * 0.11);
      flash = Math.max(flash, (ti >= 3 ? 0.14 + (ti - 3) * 0.2 : 0.05) * motion);
      flashRgb = rgb;
      if (ti >= 3) {
        stormUntil = T + 1 + (ti - 3) * 1.8;
        celebrateRgb = rgb;
        celebrateUntil = T + 2 + (ti - 3) * 2;
      }
      if (ti >= 4) {
        confetti(ball.x, 7, ball.z, 120, 9, rgb);
        fireworksUntil = T + 3;
        nextFirework = T + 0.2;
        zoomKick = 0.07;
      }
    }
  }

  const netBulge = (s: number) => 0.95 * Math.exp(-2.6 * s) * Math.cos(7.5 * s);

  function netDisp(panelSide: number, y: number, z: number) {
    if (!netHit || netHit.side !== panelSide) return 0;
    const s = T - netHit.t0;
    if (s > 3.5) return 0;
    const dy = y - netHit.y;
    const dz = z - netHit.z;
    const dist = Math.sqrt(dy * dy + dz * dz);
    return 0.95 * Math.exp(-2.6 * s) * Math.exp((-dist * dist) / 0.8) * Math.cos(7.5 * s - dist * 3.2) * panelSide;
  }

  /* ---------------- simulation ---------------- */
  function updateShot(dt: number) {
    if (!plan) return;
    shotT = clamp01((T - shotT0) / (plan.duration / 1000));
    if (!shotDone) {
      const v = shotV(plan, shotT);
      shotPos(plan, v, ball);
      slowMo = plan.kind === 'net' && shotT >= 0.5 && shotT < 0.82;
      ball.a += dt * (vel / BALL_R) * 0.16;
      ball.b += dt * plan.swerve * 0.9 * plan.side;
      trail.push({ x: ball.x, y: ball.y, z: ball.z });
      if (trail.length > 28) trail.shift();

      const zc = zoneIndexForZ(ball.z);
      while (zonesCrossed < zc && plan.kind !== 'scuff') {
        const k = zonesCrossed;
        zonesCrossed++;
        zoneFlash[k] = T;
        const zr = TIER_RGB[k + 2];
        ring(ball.x, ZONE_Z[k], 2.4 + k * 0.7, zr, 0.75);
        burst(ball.x, ball.y, ball.z, 10 + k * 5, zr, 5, 0);
        addTrauma(0.07 + k * 0.03);
        flash = Math.max(flash, 0.07 * motion);
        flashRgb = zr;
      }

      if (plan.kind === 'land' && !plan.bounced && v >= 0.78) {
        plan.bounced = true;
        const zr = TIER_RGB[Math.min(5, zoneIndexForZ(ball.z) + 1)];
        ring(ball.x, ball.z, 1.4 + plan.tierIdx * 0.5, zr, 0.5);
        burst(ball.x, 0.05, ball.z, 10, '200,230,210', 2.5, 0);
        addTrauma(0.05 + plan.H * 0.012);
      }

      const straight = plan.endX * (plan.zEnd > 0 ? ball.z / plan.zEnd : 0);
      peakCurl = Math.max(peakCurl, Math.abs(ball.x - straight));

      if (shotT >= 1) {
        shotDone = true;
        slowMo = false;
        doneT = T;
        onShotComplete();
      }
      return;
    }

    const s = T - doneT;
    if (plan.kind === 'net' && netHit) {
      const side = plan.side;
      const sFall = 0.16;
      const b = netBulge(s);
      ball.x = side * (GOAL_HW - BALL_R + Math.max(0, b) * 0.85) - (s > sFall ? side * Math.min(0.5, (s - sFall) * 0.6) : 0);
      ball.z = plan.zEnd + Math.min(0.5, s * 0.4);
      if (s < sFall) {
        ball.y = plan.endY;
      } else {
        const tf = s - sFall;
        const tG = Math.sqrt((plan.endY - BALL_R) / 4.9);
        if (tf < tG) ball.y = plan.endY - 4.9 * tf * tf;
        else {
          const tb = tf - tG;
          ball.y = BALL_R + 0.55 * Math.exp(-3.2 * tb) * Math.abs(Math.sin(tb * 6.5));
        }
      }
      ball.a += dt * Math.max(0, 3 - s) * 4;
    } else {
      ball.a += dt * Math.max(0, 1.2 - s) * 3;
    }
    if (trail.length) trail.shift();
  }

  function updateParticles(dt: number) {
    const dragSpark = Math.pow(0.985, dt * 60);
    const dragConf = Math.pow(0.95, dt * 60);
    const dragFw = Math.pow(0.972, dt * 60);
    dustCount = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      switch (p.kind) {
        case 0:
          p.vy -= 9.8 * dt;
          p.vx *= dragSpark;
          p.vz *= dragSpark;
          break;
        case 1:
          p.vy -= 2.2 * dt;
          p.vx = p.vx * dragConf + Math.sin(T * 3 + p.rot) * dt * 1.5;
          p.vz *= dragConf;
          p.vy *= Math.pow(0.985, dt * 60);
          p.rot += p.vr * dt;
          break;
        case 2:
          dustCount++;
          p.vy += Math.sin(T * 0.7 + p.rot) * dt * 0.05;
          break;
        case 3:
          p.vy -= 2.6 * dt;
          p.vx *= dragFw;
          p.vy *= dragFw;
          p.vz *= dragFw;
          break;
        default:
          break;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02 && (p.kind === 0 || p.kind === 1)) {
        p.y = 0.02;
        if (p.kind === 0) {
          p.vy *= -0.35;
          p.vx *= 0.7;
          p.vz *= 0.7;
        } else {
          p.vx = 0;
          p.vy = 0;
          p.vz = 0;
          p.vr = 0;
        }
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      if (T - rings[i].t0 > rings[i].dur) rings.splice(i, 1);
    }
  }

  function update(dt: number) {
    trauma = Math.max(0, trauma - dt * 0.9);
    flash *= Math.exp(-dt * 5.5);
    zoomKick *= Math.exp(-dt * 4);
    prevBall.x = ball.x;
    prevBall.y = ball.y;
    prevBall.z = ball.z;

    switch (phase) {
      case 'idle-surface':
      case 'game-over':
        ball.x = T - wrongT0 < 0.5 ? Math.sin(T * 80) * 0.06 : 0;
        ball.y = BALL_R;
        ball.z = 0;
        ball.a += dt * 0.35;
        break;
      case 'answered-bubble': {
        const u = clamp01((T - phaseT0) / 0.75);
        ball.x = Math.sin(T * 60) * 0.012 * u;
        ball.a += dt * (1 + u * u * 26);
        for (let i = 0; i < 3; i++) {
          const th = Math.random() * TAU;
          const rad = 1.6 + Math.random() * 1.2;
          const px = ball.x + Math.cos(th) * rad;
          const py = 0.2 + Math.random() * 1.6;
          const pz = ball.z + Math.sin(th) * rad * 0.6;
          const life = 0.32;
          spawn({
            x: px, y: py, z: pz,
            vx: (ball.x - px) / life, vy: (ball.y - py) / life, vz: (ball.z - pz) / life,
            life, max: life, css: rgbCss(Math.random() < 0.3 ? '255,255,255' : CYAN_RGB),
            size: 0.035, kind: 5, rot: 0, vr: 0,
          });
        }
        break;
      }
      case 'diving':
      case 'at-depth':
        updateShot(dt);
        break;
      case 'ascending': {
        const u = clamp01((T - phaseT0) / 1.05);
        const e = easeInOutCubic(u);
        ball.x = ascendFrom.x + (0 - ascendFrom.x) * e;
        ball.z = ascendFrom.z + (0 - ascendFrom.z) * e;
        ball.y = ascendFrom.y + (BALL_R - ascendFrom.y) * e + Math.sin(Math.PI * e) * Math.min(6, ascendFrom.z * 0.08);
        ball.a -= dt * 30 * (1 - e);
        if (u < 1) {
          trail.push({ x: ball.x, y: ball.y, z: ball.z });
          if (trail.length > 22) trail.shift();
        } else if (trail.length) trail.shift();
        break;
      }
    }

    if (dt > 0) {
      const dx = ball.x - prevBall.x;
      const dy = ball.y - prevBall.y;
      const dz = ball.z - prevBall.z;
      const inst = Math.sqrt(dx * dx + dy * dy + dz * dz) / dt;
      vel += (inst - vel) * Math.min(1, dt * 18);
      latVel += (dx / dt - latVel) * Math.min(1, dt * 10);
    }

    // ambient dust motes drifting through the floodlights
    if (dustCount < 34 && Math.random() < 0.5) {
      const life = 4 + Math.random() * 4;
      spawn({
        x: cam.x + (Math.random() - 0.5) * 18,
        y: 0.4 + Math.random() * 5,
        z: cam.z + 3 + Math.random() * 26,
        vx: (Math.random() - 0.5) * 0.3, vy: Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.3,
        life, max: life, css: '#cfe8ff', size: 0.025, kind: 2, rot: Math.random() * TAU, vr: 0,
      });
    }

    if (T < fireworksUntil && T > nextFirework) {
      firework();
      nextFirework = T + (fireworksUntil === Infinity ? 0.8 + Math.random() * 0.9 : 0.3 + Math.random() * 0.45);
    }

    updateParticles(dt);
    updateCamera(dt);
  }

  function updateCamera(dt: number) {
    let tx = 0;
    let ty = 3.1;
    let tz = -10.5;
    let tzoom = 1;
    let troll = 0;
    let rate = 2.2;
    const inFlight = (phase === 'diving' || phase === 'at-depth') && plan && !shotDone;

    switch (phase) {
      case 'idle-surface':
        tx = Math.sin(T * 0.23) * 0.7;
        ty = 3.1 + Math.sin(T * 0.37) * 0.1;
        troll = Math.sin(T * 0.19) * 0.006;
        rate = 1.9;
        break;
      case 'answered-bubble':
        tx = 0.35;
        ty = 2.05;
        tz = -7.4;
        tzoom = 1.12;
        troll = -0.018;
        rate = 4.5;
        break;
      case 'diving':
      case 'at-depth':
        if (!plan) break;
        if (inFlight) {
          if (slowMo) {
            tx = ball.x - plan.side * 1.1;
            ty = ball.y + 0.55;
            tz = ball.z - 4.4;
            tzoom = 1.2 + Math.sin(T * 7) * 0.012;
            troll = plan.side * 0.045;
            rate = 3.4;
          } else {
            tx = ball.x * 0.55;
            ty = 2.5 + ball.y * 0.5;
            tz = ball.z - 9.5;
            tzoom = 1;
            troll = Math.max(-0.07, Math.min(0.07, -latVel * 0.006));
            rate = 3.2;
          }
        } else if (plan.kind === 'net') {
          tx = -plan.side * 2.9;
          ty = 2.4;
          tz = Z_GOAL - 7.6;
          tzoom = 1.1;
          troll = -plan.side * 0.015 + Math.sin(T * 0.5) * 0.005;
          rate = 2.6;
        } else {
          tx = ball.x * 0.7 + Math.sin(T * 0.3) * 1.1;
          ty = 2.7;
          tz = ball.z - 8.6;
          tzoom = 1.04;
          troll = Math.sin(T * 0.27) * 0.008;
          rate = 2.2;
        }
        break;
      case 'ascending':
        tx = ball.x * 0.5;
        ty = 3.1 + Math.min(2, ball.y * 0.3);
        tz = ball.z - 10.5;
        rate = 7;
        break;
      case 'game-over':
        tx = Math.sin(T * 0.11) * 12;
        ty = 8 + Math.sin(T * 0.17) * 2;
        tz = 18 + Math.sin(T * 0.07) * 22;
        tzoom = 0.95;
        troll = Math.sin(T * 0.13) * 0.02;
        rate = 0.8;
        break;
    }

    const k = 1 - Math.exp(-rate * dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.z += (tz - cam.z) * k;
    cam.zoom += (tzoom - cam.zoom) * k;
    cam.roll += (troll - cam.roll) * k;
    if (inFlight) cam.z = Math.max(cam.z, ball.z - 24);
  }

  /* ---------------- rendering ---------------- */
  function drawSky() {
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-W * 0.4, -H * 0.6, W * 1.8, HZ + H * 0.6 + 2);
    if (project(0, 34, Z_GOAL + 44)) {
      const sz = Math.min(W * 2.5, pt.s * 150);
      ctx.globalCompositeOperation = 'lighter';
      const celebrating = T < celebrateUntil;
      ctx.globalAlpha = celebrating ? 0.22 + 0.08 * Math.sin(T * 6) : 0.13;
      ctx.drawImage(celebrating ? glowTier[TIER_RGB.indexOf(celebrateRgb)] || glowCool : glowCool, pt.x - sz / 2, pt.y - sz * 0.3, sz, sz * 0.6);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawStandSurface(c: number[], fill: string) {
    if (!polyPath(c)) return;
    ctx.fillStyle = fill;
    ctx.fill();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < polyPts.length; i += 2) {
      minX = Math.min(minX, polyPts[i]);
      maxX = Math.max(maxX, polyPts[i]);
      minY = Math.min(minY, polyPts[i + 1]);
      maxY = Math.max(maxY, polyPts[i + 1]);
    }
    minX = Math.max(minX, -W);
    maxX = Math.min(maxX, W * 2);
    minY = Math.max(minY, -H);
    maxY = Math.min(maxY, H * 2);
    if (maxX - minX < 2 || maxY - minY < 2) return;
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(crowd, minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
  }

  function drawStands() {
    const zN = Math.max(-30, cam.z + 1.5);
    for (const sd of [-1, 1]) {
      drawStandSurface([sd * 42, 0, zN, sd * 42, 0, Z_GOAL + 9, sd * 60, 20, Z_GOAL + 28, sd * 60, 20, zN], '#070c18');
    }
    drawStandSurface([-64, 0, Z_GOAL + 9, 64, 0, Z_GOAL + 9, 80, 24, Z_GOAL + 32, -80, 24, Z_GOAL + 32], '#080e1b');

    // roof edges
    ctx.beginPath();
    seg(-80, 24, Z_GOAL + 32, 80, 24, Z_GOAL + 32);
    seg(-60, 20, zN, -60, 20, Z_GOAL + 28);
    seg(60, 20, zN, 60, 20, Z_GOAL + 28);
    seg(-60, 20, Z_GOAL + 28, -80, 24, Z_GOAL + 32);
    seg(60, 20, Z_GOAL + 28, 80, 24, Z_GOAL + 32);
    ctx.strokeStyle = 'rgba(0,240,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // roof light rigs
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    for (let x = -80; x <= 80; x += 10) {
      if (!project(x, 24.6, Z_GOAL + 32)) continue;
      const sz = Math.max(5, pt.s * 3);
      ctx.drawImage(glowCool, pt.x - sz / 2, pt.y - sz / 2, sz, sz);
    }
    for (const sd of [-1, 1]) {
      for (let z = Math.ceil(Math.max(-30, cam.z + 4) / 12) * 12; z < Z_GOAL + 28; z += 12) {
        if (!project(sd * 60, 20.6, z)) continue;
        const sz = Math.max(5, pt.s * 3);
        ctx.drawImage(glowCool, pt.x - sz / 2, pt.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFlashBulbs() {
    const density = T < stormUntil ? 0.22 : 0.012;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < flashPts.length; i++) {
      const p = flashPts[i];
      const k = Math.floor(T * 9 + p.seed);
      const h = fract(Math.sin(k * 12.9898 + p.seed * 78.233) * 43758.5453);
      if (h > density) continue;
      if (!project(p.x, p.y, p.z)) continue;
      const sz = 5 + (h / density) * 9;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glowWhite, pt.x - sz / 2, pt.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFloodlights() {
    const strobing = T < strobeUntil;
    const intensity = strobing ? (Math.sin(T * 38) > 0 ? 1.15 : 0.45) : 1;
    const red = urgent ? 0.5 + 0.5 * Math.sin(T * TAU) : 0;
    const br = Math.round(170 + 85 * red);
    const bg = Math.round(215 - 125 * red);
    const bb = Math.round(255 - 145 * red);
    for (const [fx, fz] of FLOODLIGHTS) {
      if (!project(fx, 36, fz)) continue;
      const hx = pt.x;
      const hy = pt.y;
      const hs = pt.s;

      ctx.beginPath();
      seg(fx, 0, fz, fx, 35, fz);
      ctx.strokeStyle = 'rgba(16,26,46,0.95)';
      ctx.lineWidth = Math.max(1, hs * 0.6);
      ctx.stroke();

      const gx = fx * 0.35;
      const gz = fz < 0 ? fz + 26 : fz > 60 ? fz - 26 : fz;
      if (project(gx - 11, 0, gz)) {
        const ax = pt.x;
        const ay = pt.y;
        if (project(gx + 11, 0, gz)) {
          const grad = ctx.createLinearGradient(hx, hy, (ax + pt.x) / 2, (ay + pt.y) / 2);
          grad.addColorStop(0, `rgba(${br},${bg},${bb},${0.13 * intensity})`);
          grad.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(ax, ay);
          ctx.lineTo(pt.x, pt.y);
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      const sz = Math.min(W * 0.7, Math.max(26, hs * 16));
      ctx.globalAlpha = 0.85 * intensity;
      ctx.drawImage(glowCool, hx - sz / 2, hy - sz / 2, sz, sz);
      ctx.drawImage(glowWhite, hx - sz * 0.18, hy - sz * 0.18, sz * 0.36, sz * 0.36);
      const len = Math.min(W * 1.3, sz * 4.5);
      const th = sz * 0.2;
      ctx.globalAlpha = 0.45 * intensity;
      ctx.drawImage(streak, hx - len / 2, hy - th / 2, len, th);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawGround() {
    ctx.fillStyle = '#030807';
    ctx.fillRect(-W * 0.4, HZ - 1, W * 1.8, H * 1.6);

    const base = OWN_LINE - 6;
    const step = 6;
    const z0 = Math.max(base, cam.z + NEAR);
    const i0 = Math.max(0, Math.floor((z0 - base) / step));
    for (let i = i0; ; i++) {
      const za = base + i * step;
      if (za > Z_GOAL + 10) break;
      const zs = Math.max(za, z0);
      const zb = za + step;
      if (zb <= zs) continue;
      if (!groundQuad(-PITCH_HW - 4, PITCH_HW + 4, zs, zb)) continue;
      ctx.fillStyle = za > Z_GOAL ? '#07130e' : i % 2 ? '#0b2118' : '#091a13';
      ctx.fill();
    }

    // floodlight pools
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.075;
    for (const lz of [6, 30, 54, 78]) {
      for (const lx of [-15, 15]) {
        if (!project(lx, 0, lz)) continue;
        const sz = pt.s * 38;
        const sq = Math.max(0.05, Math.min(1, cam.y / (lz - cam.z)));
        ctx.drawImage(glowCool, pt.x - sz / 2, pt.y - (sz * sq) / 2, sz, sz * sq);
      }
    }
    ctx.globalAlpha = 1;

    // landed-zone band glows in the tier colour
    if (beacon && beacon.ti >= 1 && beacon.ti <= 4) {
      const zi = beacon.ti - 1;
      const za = zi === 0 ? -1 : ZONE_Z[zi - 1];
      const zb = ZONE_Z[zi];
      const zs = Math.max(za, cam.z + NEAR);
      if (zb > zs && groundQuad(-PITCH_HW, PITCH_HW, zs, zb)) {
        ctx.fillStyle = `rgba(${beacon.rgb},${0.06 + 0.035 * Math.sin(T * 4)})`;
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function groundText(text: string, x: number, z: number, size: number, style: string) {
    if (!project(x, 0, z)) return;
    const k = (pt.s * size) / 100;
    if (k * 100 < 4) return;
    const squash = Math.max(0.04, Math.min(1, cam.y / (z - cam.z)));
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.scale(k, k * squash);
    ctx.fillStyle = style;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawZoneMarkings() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';
    for (let k = 0; k < ZONE_Z.length; k++) {
      const z = ZONE_Z[k];
      if (z < cam.z + NEAR) continue;
      const fl = Math.max(0, 1 - (T - zoneFlash[k]) / 0.8);
      ctx.beginPath();
      for (let x = -PITCH_HW; x < PITCH_HW; x += 4) seg(x, 0, z, x + 2.2, 0, z);
      ctx.strokeStyle = `rgba(${TIER_RGB[k + 2]},${0.3 + fl * 0.65})`;
      ctx.lineWidth = 2 + fl * 4;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.font = 'italic 900 100px "Barlow Condensed", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < PITCH_ZONES.length; i++) {
      const za = i === 0 ? 0 : ZONE_Z[i - 1];
      const zb = i === 4 ? Z_GOAL - 4 : ZONE_Z[i];
      const zMid = i === 0 ? 7 : (za + zb) / 2;
      const lit = beacon && beacon.ti === i + 1;
      groundText(
        `${PITCH_ZONES[i].label}  ${PITCH_ZONES[i].pts}`,
        0,
        zMid,
        1.9,
        `rgba(${TIER_RGB[i + 1]},${lit ? 0.42 + 0.12 * Math.sin(T * 5) : 0.15})`
      );
    }
  }

  function drawPitchLines() {
    ctx.beginPath();
    seg(-PITCH_HW, 0, OWN_LINE, -PITCH_HW, 0, Z_GOAL);
    seg(PITCH_HW, 0, OWN_LINE, PITCH_HW, 0, Z_GOAL);
    seg(-PITCH_HW, 0, Z_GOAL, PITCH_HW, 0, Z_GOAL);
    seg(-PITCH_HW, 0, OWN_LINE, PITCH_HW, 0, OWN_LINE);
    const half = Z_GOAL - 52.5;
    seg(-PITCH_HW, 0, half, PITCH_HW, 0, half);
    groundCircle(0, half, 9.15, 48);
    groundCircle(0, half, 0.25, 8);
    const bz = Z_GOAL - 16.5;
    seg(-20.16, 0, bz, 20.16, 0, bz);
    seg(-20.16, 0, bz, -20.16, 0, Z_GOAL);
    seg(20.16, 0, bz, 20.16, 0, Z_GOAL);
    const sz6 = Z_GOAL - 5.5;
    seg(-9.16, 0, sz6, 9.16, 0, sz6);
    seg(-9.16, 0, sz6, -9.16, 0, Z_GOAL);
    seg(9.16, 0, sz6, 9.16, 0, Z_GOAL);
    groundCircle(0, Z_GOAL - 11, 0.22, 8);
    groundCircle(0, Z_GOAL - 11, 9.15, 16, -0.927, 0.927);
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(90,220,255,0.10)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(220,248,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawSpotAndGuide() {
    if (phase !== 'idle-surface' && phase !== 'answered-bubble' && phase !== 'ascending') return;
    const charge = phase === 'answered-bubble' ? clamp01((T - phaseT0) / 0.75) : 0;
    ctx.globalCompositeOperation = 'lighter';
    if (project(0, 0, 0)) {
      const sz = pt.s * (3.2 + charge * 2);
      const sq = Math.max(0.05, Math.min(1, cam.y / -cam.z));
      ctx.globalAlpha = 0.28 + charge * 0.4;
      ctx.drawImage(glowCyan, pt.x - sz / 2, pt.y - (sz * sq) / 2, sz, sz * sq);
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    groundCircle(0, 0, 0.95 + Math.sin(T * 3) * 0.05 - charge * 0.3, 32);
    ctx.strokeStyle = `rgba(${CYAN_RGB},${0.45 + 0.25 * Math.sin(T * 3) + charge * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (phase === 'idle-surface') {
      // animated aim guide flowing towards the far goal
      const n = 46;
      const off = fract(T * 0.9);
      for (let i = 0; i < n; i++) {
        const f = (i + off) / n;
        const z = 1.4 + f * (Z_GOAL - 1.4);
        if (!project(0, 0.02, z)) continue;
        const a = (1 - f) * 0.5;
        const r = Math.max(1, pt.s * 0.16);
        ctx.fillStyle = `rgba(${CYAN_RGB},${a})`;
        ctx.fillRect(pt.x - r, pt.y - r * 0.4, r * 2, r * 0.8);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawLedBoards() {
    const celebrating = T < celebrateUntil;
    const boardRgb = celebrating ? celebrateRgb : CYAN_RGB;
    const zb = Z_GOAL + 5;
    if (project(-34, 1, zb)) {
      const x0 = pt.x;
      const y0 = pt.y;
      if (project(34, 0, zb)) {
        const w = pt.x - x0;
        const h = pt.y - y0;
        if (w > 2 && h > 0.5) {
          const scroll = (T * 90) % 1024;
          ctx.drawImage(led, scroll, 0, 1024, 64, x0, y0, w, h);
          if (celebrating) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(${boardRgb},${0.12 + 0.08 * Math.sin(T * 12)})`;
            ctx.fillRect(x0, y0, w, h);
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
    }
    const zN = Math.max(OWN_LINE - 3, cam.z + NEAR + 0.2);
    for (const sd of [-1, 1]) {
      const x = sd * 37;
      if (polyPath([x, 0, zN, x, 0, zb, x, 0.9, zb, x, 0.9, zN])) {
        ctx.fillStyle = '#050a16';
        ctx.fill();
      }
      ctx.beginPath();
      seg(x, 0.9, zN, x, 0.9, zb);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${boardRgb},${celebrating ? 0.75 : 0.45})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawHaze() {
    const a = clamp01((Z_GOAL - cam.z - 22) / 60);
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(-W * 0.4, HZ - H * 0.06, W * 1.8, H * 0.28);
    ctx.globalAlpha = 1;
  }

  function drawGoalNets() {
    const hitAge = netHit ? T - netHit.t0 : 99;
    if (project(0, 1.2, Z_GOAL + 1.2)) {
      const sz = pt.s * (14 + (hitAge < 2 ? (2 - hitAge) * 5 : 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.7, 0.2 + 0.06 * Math.sin(T * 2.4) + (hitAge < 2 ? (2 - hitAge) * 0.15 : 0));
      ctx.drawImage(glowTier[5], pt.x - sz / 2, pt.y - sz / 2, sz, sz);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    const top = (z: number) => GOAL_H - (0.35 * (z - Z_GOAL)) / NET_D;
    const zBack = Z_GOAL + NET_D;
    const backTop = top(zBack);

    const drawSide = (sd: number) => {
      const x0 = sd * GOAL_HW;
      ctx.beginPath();
      for (let j = 0; j <= 6; j++) {
        const z = Z_GOAL + (NET_D * j) / 6;
        const tp = top(z);
        let py = 0;
        let pxv = x0 + netDisp(sd, 0, z);
        for (let i = 1; i <= 8; i++) {
          const y = (tp * i) / 8;
          const nx = x0 + netDisp(sd, y, z);
          seg(pxv, py, z, nx, y, z);
          pxv = nx;
          py = y;
        }
      }
      for (let i = 1; i <= 8; i++) {
        let pz = Z_GOAL;
        let py = (top(pz) * i) / 8;
        let pxv = x0 + netDisp(sd, py, pz);
        for (let j = 1; j <= 8; j++) {
          const z = Z_GOAL + (NET_D * j) / 8;
          const y = (top(z) * i) / 8;
          const nx = x0 + netDisp(sd, y, z);
          seg(pxv, py, pz, nx, y, z);
          pxv = nx;
          py = y;
          pz = z;
        }
      }
      const hot = netHit && netHit.side === sd && hitAge < 3;
      if (hot) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,215,120,${0.35 + 0.5 * Math.max(0, 1 - hitAge / 3)})`;
        ctx.lineWidth = 1.4;
      } else {
        ctx.strokeStyle = 'rgba(210,235,255,0.26)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    };

    drawSide(-1);
    drawSide(1);

    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const x = -GOAL_HW + (2 * GOAL_HW * i) / 14;
      seg(x, 0, zBack, x, backTop, zBack);
      seg(x, GOAL_H, Z_GOAL, x, backTop, zBack);
    }
    for (let i = 1; i <= 8; i++) {
      const y = (backTop * i) / 8;
      seg(-GOAL_HW, y, zBack, GOAL_HW, y, zBack);
    }
    for (let j = 1; j <= 4; j++) {
      const z = Z_GOAL + (NET_D * j) / 4;
      seg(-GOAL_HW, top(z), z, GOAL_HW, top(z), z);
    }
    ctx.strokeStyle = 'rgba(210,235,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGoalFrame() {
    const d = Z_GOAL - cam.z;
    if (d < NEAR) return;
    const w = Math.max(2, (0.12 * FZ) / d);
    ctx.beginPath();
    seg(-GOAL_HW, 0, Z_GOAL, -GOAL_HW, GOAL_H, Z_GOAL);
    seg(GOAL_HW, 0, Z_GOAL, GOAL_HW, GOAL_H, Z_GOAL);
    seg(-GOAL_HW, GOAL_H, Z_GOAL, GOAL_HW, GOAL_H, Z_GOAL);
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(200,240,255,0.16)';
    ctx.lineWidth = w * 4;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#f4f8ff';
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.beginPath();
    const zb = Z_GOAL + NET_D;
    seg(-GOAL_HW, 0, zb, -GOAL_HW, GOAL_H - 0.35, zb);
    seg(GOAL_HW, 0, zb, GOAL_HW, GOAL_H - 0.35, zb);
    ctx.strokeStyle = 'rgba(200,215,235,0.6)';
    ctx.lineWidth = Math.max(1, w * 0.4);
    ctx.stroke();
  }

  function drawRings() {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const age = clamp01((T - r.t0) / r.dur);
      const R = r.maxR * (1 - Math.pow(1 - age, 3));
      if (!project(r.x - R, 0, r.z)) continue;
      const x0 = pt.x;
      if (!project(r.x + R, 0, r.z)) continue;
      const x1 = pt.x;
      if (!project(r.x, 0, r.z - R)) continue;
      const yNear = pt.y;
      if (!project(r.x, 0, r.z + R)) continue;
      const yFar = pt.y;
      const rx = Math.abs(x1 - x0) / 2;
      const ry = Math.abs(yNear - yFar) / 2;
      if (rx < 0.5) continue;
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - age) * 0.9})`;
      ctx.lineWidth = 1 + 3 * (1 - age);
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (yNear + yFar) / 2, rx, Math.max(0.5, ry), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBeacon() {
    if (!beacon) return;
    if (!project(beacon.x, 0, beacon.z)) return;
    const bx = pt.x;
    const by = pt.y;
    const bs = pt.s;
    if (!project(beacon.x, 16, beacon.z)) return;
    const ty = pt.y;
    const age = T - beacon.t0;
    const grow = clamp01(age / 0.35);
    const w = bs * (0.7 + beacon.ti * 0.12);
    const a = (beacon.ti >= 5 ? 0.16 : 0.32) * (1 + 0.3 * Math.sin(T * 6)) * grow;
    const grad = ctx.createLinearGradient(0, by, 0, ty);
    grad.addColorStop(0, `rgba(${beacon.rgb},${a})`);
    grad.addColorStop(1, `rgba(${beacon.rgb},0)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    const topY = by + (ty - by) * grow;
    ctx.beginPath();
    ctx.moveTo(bx - w, by);
    ctx.lineTo(bx + w, by);
    ctx.lineTo(bx + w * 0.35, topY);
    ctx.lineTo(bx - w * 0.35, topY);
    ctx.closePath();
    ctx.fill();
    const gs = bs * 6;
    const sq = Math.max(0.06, Math.min(1, cam.y / (beacon.z - cam.z)));
    ctx.globalAlpha = 0.5 * grow;
    ctx.drawImage(glowTier[beacon.ti], bx - gs / 2, by - (gs * sq) / 2, gs, gs * sq);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function ballRgb() {
    if (T - wrongT0 < 0.6) return TIER_RGB[0];
    if (phase === 'ascending' || !plan || (phase !== 'diving' && phase !== 'at-depth')) return CYAN_RGB;
    if (plan.kind === 'scuff') return TIER_RGB[0];
    if (shotDone) return TIER_RGB[plan.tierIdx];
    return TIER_RGB[Math.min(5, zoneIndexForZ(ball.z) + 1)];
  }

  function trailRgb(z: number) {
    if (phase === 'ascending') return CYAN_RGB;
    if (plan && plan.kind === 'scuff') return TIER_RGB[0];
    return TIER_RGB[Math.min(5, zoneIndexForZ(z) + 1)];
  }

  function drawTrail() {
    const n = trail.length;
    if (n < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let px = 0;
    let py = 0;
    let has = false;
    for (let i = 0; i < n; i++) {
      const p = trail[i];
      if (!project(p.x, p.y, p.z)) {
        has = false;
        continue;
      }
      if (has) {
        const f = i / (n - 1);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(pt.x, pt.y);
        ctx.strokeStyle = rgbCss(trailRgb(p.z));
        ctx.globalAlpha = f * 0.6;
        ctx.lineWidth = Math.max(1, BALL_R * pt.s * 1.3 * f);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = f * 0.55;
        ctx.lineWidth = Math.max(0.6, BALL_R * pt.s * 0.5 * f);
        ctx.stroke();
      }
      px = pt.x;
      py = pt.y;
      has = true;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBall() {
    const rgb = ballRgb();
    if (project(ball.x, 0, ball.z)) {
      const r = BALL_R * pt.s;
      const d = ball.z - cam.z;
      const sq = Math.max(0.08, Math.min(0.7, cam.y / d));
      const hgt = ball.y - BALL_R;
      const grow = 1.15 + hgt * 0.12;
      ctx.fillStyle = `rgba(0,0,0,${0.6 / (1 + hgt * 0.5)})`;
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, r * grow, Math.max(0.5, r * grow * sq * 1.4), 0, 0, TAU);
      ctx.fill();
    }
    if (!project(ball.x, ball.y, ball.z)) return;
    const r = BALL_R * pt.s;
    if (r < 0.4) return;
    const bx = pt.x;
    const by = pt.y;

    ctx.globalCompositeOperation = 'lighter';
    const auraIdx = TIER_RGB.indexOf(rgb);
    const aura = auraIdx >= 0 ? glowTier[auraIdx] : glowCyan;
    const charge = phase === 'answered-bubble' ? clamp01((T - phaseT0) / 0.75) : 0;
    const speedGlow = Math.min(1, vel / 90);
    ctx.globalAlpha = 0.35 + speedGlow * 0.35 + charge * 0.4;
    const as = r * (5 + speedGlow * 3 + charge * 3);
    ctx.drawImage(aura, bx - as / 2, by - as / 2, as, as);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.08, bx, by, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#dde4ec');
    g.addColorStop(1, '#5f6a79');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, TAU);
    ctx.fill();

    if (r > 2.5) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, TAU);
      ctx.clip();
      ctx.fillStyle = 'rgba(12,16,24,0.9)';
      const ca = Math.cos(ball.a);
      const sa = Math.sin(ball.a);
      const cb = Math.cos(ball.b);
      const sb = Math.sin(ball.b);
      for (const v of ICO) {
        const y1 = v[1] * ca - v[2] * sa;
        const z1 = v[1] * sa + v[2] * ca;
        const x2 = v[0] * cb + z1 * sb;
        const z2 = -v[0] * sb + z1 * cb;
        if (z2 < -0.15) continue;
        const px = bx + x2 * r * 0.86;
        const py = by - y1 * r * 0.86;
        const pr = r * 0.3;
        const ang = Math.atan2(-y1, x2);
        ctx.beginPath();
        ctx.ellipse(px, py, Math.max(0.3, pr * Math.max(0.2, z2)), pr, ang, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${rgb},0.85)`;
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.95, Math.PI * 0.1, Math.PI * 1.05);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(bx - r * 0.38, by - r * 0.45, r * 0.2, r * 0.12, -0.6, 0, TAU);
    ctx.fill();

    if (charge > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -T * 70;
      ctx.strokeStyle = `rgba(${CYAN_RGB},${0.3 + charge * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, r * (4.4 - charge * 3), 0, TAU);
      ctx.stroke();
      ctx.lineDashOffset = T * 50;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + charge * 0.5})`;
      ctx.beginPath();
      ctx.arc(bx, by, r * (2.8 - charge * 1.4), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 1) continue;
      const a = Math.min(1, (p.life / p.max) * 1.6);
      if (p.kind === 2) {
        if (!project(p.x, p.y, p.z)) continue;
        const r = Math.max(0.6, p.size * pt.s);
        ctx.globalAlpha = Math.min(1, p.life) * 0.22;
        ctx.fillStyle = p.css;
        ctx.fillRect(pt.x - r, pt.y - r, r * 2, r * 2);
        continue;
      }
      if (p.kind === 4) {
        if (!project(p.x, p.y, p.z)) continue;
        const sz = p.size * pt.s;
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(glowWhite, pt.x - sz / 2, pt.y - sz / 2, sz, sz);
        continue;
      }
      if (!project(p.x, p.y, p.z)) continue;
      const x1 = pt.x;
      const y1 = pt.y;
      const s1 = pt.s;
      const tl = p.kind === 5 ? 0.06 : 0.035;
      if (!project(p.x - p.vx * tl, p.y - p.vy * tl, p.z - p.vz * tl)) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.css;
      ctx.lineWidth = Math.max(1, p.size * s1);
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind !== 1) continue;
      if (!project(p.x, p.y, p.z)) continue;
      const sz = p.size * pt.s;
      if (sz < 0.6) continue;
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const flip = Math.abs(Math.cos(p.rot * 1.7 + p.vr));
      const hw = sz * 0.5;
      const hh = sz * 0.28 * flip + 0.4;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.css;
      ctx.beginPath();
      ctx.moveTo(pt.x + c * hw - s * hh, pt.y + s * hw + c * hh);
      ctx.lineTo(pt.x - c * hw - s * hh, pt.y - s * hw + c * hh);
      ctx.lineTo(pt.x - c * hw + s * hh, pt.y - s * hw - c * hh);
      ctx.lineTo(pt.x + c * hw + s * hh, pt.y + s * hw - c * hh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines() {
    const inFlight = (phase === 'diving' || phase === 'at-depth') && plan && !shotDone;
    if (!inFlight || slowMo || vel < 30) return;
    const a = Math.min(0.24, (vel - 30) / 260);
    const maxDim = Math.max(W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(220,245,255,${a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * TAU;
      const r0 = (0.28 + Math.random() * 0.3) * maxDim;
      const len = (0.06 + Math.random() * 0.16) * maxDim * Math.min(1.4, vel / 110);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      ctx.moveTo(CX + dx * r0, HZ + dy * r0);
      ctx.lineTo(CX + dx * (r0 + len), HZ + dy * (r0 + len));
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  function render() {
    FZ = F * Math.max(0.5, cam.zoom + zoomKick);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const tr = trauma * trauma;
    const shx = (Math.sin(T * 47.3) + Math.sin(T * 31.7 + 1.3) * 0.6) * tr * 16;
    const shy = (Math.sin(T * 53.1 + 0.7) + Math.sin(T * 27.9 + 2.1) * 0.6) * tr * 12;
    const shr = Math.sin(T * 39.7 + 0.3) * tr * 0.025;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(CX + shx, HZ + shy);
    ctx.rotate(cam.roll + shr);
    ctx.translate(-CX, -HZ);

    drawSky();
    drawStands();
    drawFlashBulbs();
    drawFloodlights();
    drawGround();
    drawZoneMarkings();
    drawPitchLines();
    drawSpotAndGuide();
    drawLedBoards();
    drawHaze();
    drawBeacon();
    drawGoalNets();
    const ballInside = ball.z > Z_GOAL;
    if (!ballInside) drawGoalFrame();
    drawRings();
    drawTrail();
    drawBall();
    if (ballInside) drawGoalFrame();
    drawParticles();
    drawSpeedLines();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(vignette, 0, 0, W, H);
    if (slowMo) {
      ctx.fillStyle = 'rgba(6,14,36,0.22)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(T * 7);
      ctx.drawImage(vignette, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (phase === 'ascending') {
      ctx.fillStyle = 'rgba(0,18,36,0.2)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const k = Math.floor(T * 24);
      for (let i = 0; i < 7; i++) {
        const r = fract(Math.sin((k * 7 + i) * 91.7) * 43758.5453);
        ctx.fillStyle = 'rgba(0,240,255,0.08)';
        ctx.fillRect(0, r * H, W, 2 + r * 6);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(${flashRgb},${Math.min(0.9, flash)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function writeTelemetry() {
    const tn = telemetry.current;
    if (!tn) return;
    const inFlight = (phase === 'diving' || phase === 'at-depth') && plan && !shotDone;
    const kmh = inFlight ? Math.round(18 + vel * 1.05) : 0;
    if (inFlight) peakKmh = Math.max(peakKmh, kmh);
    const put = (el: HTMLElement | null, v: string) => {
      if (el && el.textContent !== v) el.textContent = v;
    };
    put(tn.speed, String(kmh));
    put(tn.peak, String(peakKmh));
    put(tn.spin, inFlight && plan ? Math.round(vel * 92 + plan.swerve * 55).toLocaleString() : '0');
    put(tn.curl, plan ? peakCurl.toFixed(1) : '0.0');
    if (tn.mode) {
      const label = slowMo ? 'SLOW-MO  ×0.25' : '';
      put(tn.mode, label);
      const op = label ? '1' : '0';
      if (tn.mode.style.opacity !== op) tn.mode.style.opacity = op;
    }
  }

  function frame(nowMs: number) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    let dtMs = nowMs - lastMs;
    lastMs = nowMs;
    if (dtMs > 50) dtMs = 50;
    if (dtMs < 0) dtMs = 0;
    T = nowMs / 1000;

    // adaptive resolution: if we can't hold ~45fps, shed pixels until we can
    perfAcc += dtMs;
    perfFrames++;
    if (perfFrames >= 90) {
      if (perfAcc / perfFrames > 22 && dprCap > 1) {
        dprCap = Math.max(1, dprCap - 0.25);
        resize();
      }
      perfAcc = 0;
      perfFrames = 0;
    }

    update(dtMs / 1000);
    render();
    frameNo++;
    if (frameNo % 3 === 0) writeTelemetry();
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return {
    setPhase,
    setFlags,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}

interface StadiumCanvasProps {
  phase: DiveState;
  targetDepth: number;
  tierIdx: number;
  roundIdx: number;
  wrongShake: boolean;
  urgent: boolean;
  telemetryRef: React.RefObject<TelemetryNodes>;
}

const StadiumCanvas = React.memo(function StadiumCanvas({
  phase,
  targetDepth,
  tierIdx,
  roundIdx,
  wrongShake,
  urgent,
  telemetryRef,
}: StadiumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StadiumEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createStadiumEngine(canvasRef.current, telemetryRef);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [telemetryRef]);

  useEffect(() => {
    engineRef.current?.setPhase(phase, targetDepth, tierIdx, roundIdx);
  }, [phase, targetDepth, tierIdx, roundIdx]);

  useEffect(() => {
    engineRef.current?.setFlags(wrongShake, urgent);
  }, [wrongShake, urgent]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 block w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
});

/* ============================================================================
 * BROADCAST UI PIECES
 * ==========================================================================*/

const RangeStrip: React.FC<{ depth: number }> = ({ depth }) => {
  const zi = zoneIndexForDepth(depth);
  return (
    <div className="sn-panel px-3 py-2 flex items-center gap-3">
      <div className="shrink-0 leading-none min-w-[78px]">
        <span className="font-athletic font-black text-lg tabular-nums" style={{ color: PITCH_ZONES[zi].color }}>
          {depth}m
        </span>
        <span className="block font-mono text-[8px] tracking-[0.2em] text-slate-400 mt-0.5 uppercase">
          {PITCH_ZONES[zi].short}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex gap-[3px]">
          {PITCH_ZONES.map((z) => {
            const fill = clamp01((depth - z.from) / (z.to - z.from));
            return (
              <div
                key={z.label}
                className="relative h-[6px] bg-white/[0.07] overflow-hidden skew-x-[-20deg]"
                style={{ flexGrow: z.to - z.from, flexBasis: 0 }}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${fill * 100}%`, background: z.color, boxShadow: `0 0 8px ${z.color}` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-[3px] mt-1">
          {PITCH_ZONES.map((z) => (
            <span
              key={z.label}
              className="font-mono text-[8px] font-bold text-right"
              style={{ flexGrow: z.to - z.from, flexBasis: 0, color: z.color, opacity: 0.75 }}
            >
              {z.pts}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const RangeRail: React.FC<{ depth: number; progress: number }> = ({ depth, progress }) => {
  const zi = zoneIndexForDepth(depth);
  return (
    <div className="sn-panel w-[184px] h-[min(430px,56vh)] p-4 flex flex-col">
      <span className="font-mono text-[9px] font-bold tracking-[0.3em] text-slate-400">STRIKE RANGE</span>
      <div className="flex items-baseline gap-1 leading-none mt-1">
        <span
          className="font-athletic font-black text-[40px] tabular-nums transition-colors duration-300"
          style={{ color: PITCH_ZONES[zi].color, textShadow: `0 0 18px ${PITCH_ZONES[zi].color}66` }}
        >
          {depth.toLocaleString()}
        </span>
        <span className="font-mono text-xs text-slate-400">m</span>
      </div>
      <div className="relative flex-1 my-3 flex gap-3 min-h-0">
        <div className="relative w-2 bg-white/[0.06] overflow-visible">
          <div
            className="absolute bottom-0 inset-x-0"
            style={{
              height: `${progress * 100}%`,
              background: 'linear-gradient(0deg, #f59e0b 0%, #10b981 25%, #06b6d4 50%, #a855f7 75%, #eab308 100%)',
              boxShadow: `0 0 14px ${PITCH_ZONES[zi].color}`,
            }}
          />
          <div
            className="absolute -left-1.5 -right-1.5 h-[3px] bg-white shadow-[0_0_10px_#fff]"
            style={{ bottom: `calc(${progress * 100}% - 1px)` }}
          />
        </div>
        <div className="flex-1 flex flex-col-reverse min-h-0">
          {PITCH_ZONES.map((z, i) => (
            <div
              key={z.label}
              className="flex flex-col justify-center border-t border-white/[0.06] min-h-0 overflow-hidden transition-opacity duration-300"
              style={{ flexGrow: z.to - z.from, flexBasis: 0, opacity: depth > 0 && i <= zi ? 1 : 0.42 }}
            >
              <span className="font-athletic italic font-black text-[13px] leading-none tracking-wide truncate" style={{ color: z.color }}>
                {z.label}
              </span>
              <span className="font-mono text-[8px] text-slate-500 leading-tight">
                {z.from.toLocaleString()}m • {z.pts} PTS
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <span className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-slate-400 block">PITCH ZONE</span>
        <span className="text-[11px] font-mono font-black" style={{ color: PITCH_ZONES[zi].color }}>
          {PITCH_ZONES[zi].label}
        </span>
      </div>
    </div>
  );
};

const TrophySvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="snTrophyGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff6c8" />
        <stop offset="35%" stopColor="#facc15" />
        <stop offset="70%" stopColor="#b7791f" />
        <stop offset="100%" stopColor="#fde68a" />
      </linearGradient>
      <linearGradient id="snTrophyBase" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1f2937" />
        <stop offset="100%" stopColor="#05070c" />
      </linearGradient>
    </defs>
    <path d="M34 22h52v18c0 17-11.6 30-26 30S34 57 34 40V22z" fill="url(#snTrophyGold)" />
    <path d="M34 28H20c0 14 7 22 17 23M86 28h14c0 14-7 22-17 23" fill="none" stroke="url(#snTrophyGold)" strokeWidth="6" strokeLinecap="round" />
    <path d="M54 69h12l3 17H51z" fill="url(#snTrophyGold)" />
    <rect x="40" y="86" width="40" height="8" rx="2" fill="url(#snTrophyGold)" />
    <rect x="34" y="94" width="52" height="14" rx="3" fill="url(#snTrophyBase)" stroke="#facc15" strokeOpacity="0.6" />
    <path d="M44 28c0 14 4 24 10 30" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
    <path d="M60 33l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L60 49.5l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z" fill="#fff" fillOpacity="0.85" />
  </svg>
);

const ARENA_CSS = `
  @keyframes errorShake {
    0%, 100% { transform: translateX(0); }
    15%, 45%, 75% { transform: translateX(-9px); }
    30%, 60%, 90% { transform: translateX(9px); }
  }
  .animate-error-shake { animation: errorShake 0.45s ease-in-out; }

  @keyframes snRise {
    from { opacity: 0; transform: translate3d(0, 14px, 0); }
    to { opacity: 1; transform: none; }
  }
  .sn-rise { animation: snRise 0.45s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes snSlam {
    0% { opacity: 0; transform: scale(2.5) skewX(-10deg); letter-spacing: 0.25em; }
    45% { opacity: 1; transform: scale(0.92) skewX(-10deg); letter-spacing: 0.01em; }
    70% { transform: scale(1.05) skewX(-10deg); }
    100% { opacity: 1; transform: scale(1) skewX(-10deg); letter-spacing: 0.01em; }
  }
  .sn-slam { animation: snSlam 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; will-change: transform; }

  @keyframes snGlitch {
    0%, 100% { transform: skewX(-10deg); clip-path: inset(0 0 0 0); }
    20% { transform: skewX(-10deg) translate(-4px, 1px); clip-path: inset(12% 0 52% 0); }
    40% { transform: skewX(-10deg) translate(4px, -1px); clip-path: inset(58% 0 8% 0); }
    60% { transform: skewX(-10deg) translate(-2px, 0); clip-path: inset(30% 0 38% 0); }
    80% { transform: skewX(-10deg) translate(1px, 1px); clip-path: inset(0 0 0 0); }
  }
  .sn-glitch { animation: snSlam 0.6s cubic-bezier(0.16, 1, 0.3, 1) both, snGlitch 0.36s steps(2, end) 0.6s 3; }

  @keyframes snRays {
    from { transform: translate(-50%, -50%) rotate(0deg); }
    to { transform: translate(-50%, -50%) rotate(360deg); }
  }
  .sn-rays {
    position: absolute; left: 50%; top: 50%; width: 820px; height: 820px; pointer-events: none;
    background: repeating-conic-gradient(from 0deg, rgba(var(--rgb), 0.2) 0deg 5deg, transparent 5deg 15deg);
    -webkit-mask: radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 25%, transparent 62%);
    mask: radial-gradient(circle, #000 0%, rgba(0,0,0,0.6) 25%, transparent 62%);
    animation: snRays 16s linear infinite;
  }

  @keyframes snShimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  .sn-gold-text {
    background: linear-gradient(100deg, #fff7d1 0%, #facc15 25%, #ffffff 50%, #eab308 75%, #fff7d1 100%);
    background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    animation: snSlam 0.75s cubic-bezier(0.16, 1, 0.3, 1) both, snShimmer 2.2s linear infinite;
  }

  @keyframes snSheen {
    0% { transform: translateX(-160%) skewX(-20deg); }
    55%, 100% { transform: translateX(380%) skewX(-20deg); }
  }
  .sn-sheen { position: relative; overflow: hidden; }
  .sn-sheen::after {
    content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 34%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
    animation: snSheen 2.8s ease-in-out infinite; pointer-events: none;
  }

  @keyframes snBlink { 50% { opacity: 0.25; } }
  .sn-blink { animation: snBlink 1s steps(1) infinite; }

  @keyframes snPulseRing {
    0% { transform: scale(0.6); opacity: 0.9; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  .sn-live-dot { position: relative; width: 7px; height: 7px; border-radius: 9999px; background: #ff2d55; box-shadow: 0 0 10px #ff2d55; flex-shrink: 0; }
  .sn-live-dot::after { content: ''; position: absolute; inset: 0; border-radius: inherit; border: 1px solid #ff2d55; animation: snPulseRing 1.4s ease-out infinite; }

  .sn-panel {
    position: relative;
    background: linear-gradient(180deg, rgba(12, 19, 34, 0.94), rgba(5, 9, 18, 0.95));
    border: 1px solid rgba(148, 197, 255, 0.13);
    clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
  }
  .sn-panel::before {
    content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.75), transparent);
  }

  .sn-letterbox {
    position: fixed; left: 0; right: 0; height: 7vh; background: #000; z-index: 20; pointer-events: none;
    transition: transform 0.6s cubic-bezier(0.7, 0, 0.2, 1);
  }
  .sn-letterbox.sn-top { top: 0; transform: translateY(-100%); }
  .sn-letterbox.sn-bottom { bottom: 0; transform: translateY(100%); }
  .sn-cine .sn-letterbox { transform: none; }

  @keyframes snUrgent {
    0%, 100% { box-shadow: inset 0 0 0 1px rgba(244, 63, 94, 0.45); }
    50% { box-shadow: inset 0 0 0 1px rgba(244, 63, 94, 1), inset 0 0 20px rgba(244, 63, 94, 0.55); }
  }
  .sn-urgent { animation: snUrgent 0.9s ease-in-out infinite; }

  @keyframes snTagIn {
    from { opacity: 0; transform: translate3d(-28px, 0, 0) skewX(-10deg); }
    to { opacity: 1; transform: skewX(-10deg); }
  }
  .sn-tag-in { animation: snTagIn 0.4s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes snImpactKick {
    0% { transform: none; }
    12% { transform: translate3d(-8px, 5px, 0) scale(1.015); }
    28% { transform: translate3d(7px, -4px, 0); }
    46% { transform: translate3d(-3px, 2px, 0); }
    70% { transform: translate3d(1px, -1px, 0); }
    100% { transform: none; }
  }
  .sn-kick { animation: snImpactKick 0.6s cubic-bezier(0.2, 0.8, 0.3, 1); }

  .sn-strike {
    background: linear-gradient(180deg, #e2ff4d 0%, #ccff00 45%, #9fd400 100%);
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    box-shadow: 0 0 28px rgba(204, 255, 0, 0.35);
  }

  @media (prefers-reduced-motion: reduce) {
    .sn-slam, .sn-glitch, .sn-gold-text, .sn-rays, .sn-kick, .sn-sheen::after, .sn-live-dot::after, .sn-tag-in, .sn-rise {
      animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    }
  }
`;

interface SideNettingArenaProps {
  config: SideNettingMatchConfig;
  onExitArena: () => void;
}

type DiveState = 'idle-surface' | 'answered-bubble' | 'diving' | 'at-depth' | 'ascending' | 'game-over';

export const SideNettingArena: React.FC<SideNettingArenaProps> = ({
  config,
  onExitArena,
}) => {
  const {
    isMultiplayer,
    isHost,
    opponent,
    myPlayerId,
    party,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
    leaveParty,
  } = useGameSync('side_netting');

  const [initialData] = useState(() => drawMatchPrompts(config.roundCount, []));
  const [prompts, setPrompts] = useState<SideNettingPrompt[]>(() => {
    if (gameInitData?.sharedData?.prompts && gameInitData.sharedData.prompts.length > 0) {
      return gameInitData.sharedData.prompts;
    }
    return initialData.prompts;
  });

  // Sync authoritative prompts from server gameInitData
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.prompts && gameInitData.sharedData.prompts.length > 0) {
      setPrompts(gameInitData.sharedData.prompts);
    }
  }, [isMultiplayer, gameInitData]);
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>(initialData.updatedExcludedIds);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(config.timerSeconds);
  const [diveState, setDiveState] = useState<DiveState>('idle-surface');

  // Opponent multiplayer state
  const [opponentLockedIn, setOpponentLockedIn] = useState(false);
  const [opponentSubmission, setOpponentSubmission] = useState<SideNettingRoundSubmission | null>(null);
  const [opponentTotalScore, setOpponentTotalScore] = useState(0);
  const [opponentStrikeFinished, setOpponentStrikeFinished] = useState(false);

  // Answer & Input state
  const [inputVal, setInputVal] = useState<string>('');
  const [currentSubmission, setCurrentSubmission] = useState<SideNettingRoundSubmission | null>(null);

  // Autocomplete dropdown state
  const [suggestions, setSuggestions] = useState<Array<{ name: string; position?: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // Wrong Answer Shake state
  const [lastAttemptedInvalid, setLastAttemptedInvalid] = useState<string | null>(null);
  const [isWrongAnswerShake, setIsWrongAnswerShake] = useState<boolean>(false);
  const [shakeMessage, setShakeMessage] = useState<string | null>(null);

  // Depth meter animation state (0 to 4000 meters)
  const [displayDepth, setDisplayDepth] = useState<number>(0);

  // Cumulative match results
  const [totalScore, setTotalScore] = useState<number>(0);
  const [maxDepthReached, setMaxDepthReached] = useState<number>(0);
  const [roundResults, setRoundResults] = useState<SideNettingRoundResult[]>([]);
  const [showForfeitModal, setShowForfeitModal] = useState<boolean>(false);

  // Strike completion, post-round popup & rematch states
  const [userFinishedRound, setUserFinishedRound] = useState(false);
  const [isPostRoundModalOpen, setIsPostRoundModalOpen] = useState(false);
  const [isGuestReadyForNext, setIsGuestReadyForNext] = useState(false);
  const [guestHasClickedReady, setGuestHasClickedReady] = useState(false);
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);
  const lastProcessedEventIdRef = useRef<number | string | null>(null);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver: diveState === 'game-over',
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena,
    arenaKey: 'side-netting',
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const currentPrompt = prompts[currentRoundIdx] || prompts[0];

  // Instant player autocomplete dropdown search (requires at least 3 characters)
  useEffect(() => {
    const trimmed = inputVal.trim();
    if (trimmed.length < 3 || diveState !== 'idle-surface') {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const hits = searchSideNettingPlayers(trimmed, currentPrompt, 7);
    setSuggestions(hits);
    setSelectedIndex(0);
    setShowDropdown(hits.length > 0);
  }, [inputVal, currentPrompt, diveState]);

  // 1. ROUND START: RESET TO SURFACE & FOCUS INPUT
  useEffect(() => {
    if (diveState === 'game-over') return;
    setDiveState('idle-surface');
    setDisplayDepth(0);
    setInputVal('');
    setShowDropdown(false);
    setSuggestions([]);
    setLastAttemptedInvalid(null);
    setIsWrongAnswerShake(false);
    setShakeMessage(null);
    setCurrentSubmission(null);
    setOpponentLockedIn(false);
    setOpponentSubmission(null);
    setUserFinishedRound(false);
    setOpponentStrikeFinished(false);
    setIsPostRoundModalOpen(false);
    setIsGuestReadyForNext(false);
    setGuestHasClickedReady(false);
    if (config.timerSeconds > 0) {
      setSecondsLeft(config.timerSeconds);
    }
    window.setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentRoundIdx, config.timerSeconds]);

  // Synchronize incoming multiplayer events
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent._eventId && lastProcessedEventIdRef.current === lastGameEvent._eventId) {
      return;
    }
    lastProcessedEventIdRef.current = lastGameEvent._eventId || null;

    if (lastGameEvent.event === 'sidenetting_lock_in') {
      const { roundIdx: evRound, submission } = lastGameEvent.data || {};
      if (evRound === currentRoundIdx && submission) {
        setOpponentLockedIn(true);
        setOpponentSubmission(submission);
        setOpponentTotalScore((prev) => prev + (submission.score || 0));
      }
    } else if (lastGameEvent.event === 'sidenetting_strike_finished') {
      const { roundIdx: evRound } = lastGameEvent.data || {};
      if (evRound === currentRoundIdx) {
        setOpponentStrikeFinished(true);
      }
    } else if (lastGameEvent.event === 'sidenetting_player_ready') {
      setIsGuestReadyForNext(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'sidenetting_next_round') {
      const { nextRoundIdx } = lastGameEvent.data || {};
      if (typeof nextRoundIdx === 'number' && nextRoundIdx > currentRoundIdx) {
        setIsPostRoundModalOpen(false);
        setUserFinishedRound(false);
        setOpponentStrikeFinished(false);
        setOpponentLockedIn(false);
        setGuestHasClickedReady(false);
        setDiveState('ascending');
        soundFX.playClick(750);
        window.setTimeout(() => {
          setCurrentRoundIdx(nextRoundIdx);
          setDiveState('idle-surface');
          setDisplayDepth(0);
          setInputVal('');
          setSecondsLeft(config.timerSeconds > 0 ? config.timerSeconds : 60);
          window.setTimeout(() => inputRef.current?.focus(), 150);
        }, 1200);
      }
    } else if (lastGameEvent.event === 'sidenetting_game_over') {
      setIsPostRoundModalOpen(false);
      setDiveState('game-over');
      soundFX.playVictoryFanfare();
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handlePlayAgain();
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, currentRoundIdx, config.timerSeconds]);

  // Open post-round breakdown when both players finish strike in multiplayer
  useEffect(() => {
    if (!isMultiplayer) return;
    if (userFinishedRound && opponentStrikeFinished && diveState === 'at-depth') {
      const timer = window.setTimeout(() => {
        setIsPostRoundModalOpen(true);
      }, 700);
      return () => window.clearTimeout(timer);
    }
  }, [isMultiplayer, userFinishedRound, opponentStrikeFinished, diveState]);

  // Safety fallback: if opponent locked in, ensure post-round modal opens within 4s max even if packet lost
  useEffect(() => {
    if (!isMultiplayer || !opponentLockedIn || opponentStrikeFinished) return;
    const fallbackTimer = window.setTimeout(() => {
      setOpponentStrikeFinished(true);
    }, 4000);
    return () => window.clearTimeout(fallbackTimer);
  }, [isMultiplayer, opponentLockedIn, opponentStrikeFinished]);

  // 2. ROUND TIMER
  useEffect(() => {
    if (diveState !== 'idle-surface') return;
    if (config.timerSeconds <= 0) return; // relaxed mode

    if (secondsLeft <= 0) {
      // Time expired: auto-lock as NO ANSWER (never submit partially typed random letters)
      triggerSubmission('');
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 3 && next > 0) {
          soundFX.playCountdownTick(next <= 1 ? 3 : 2);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [diveState, secondsLeft, config.timerSeconds]);

  // Core execution of a validated submission
  const triggerSubmission = (finalAnswer: string) => {
    const evaluated = evaluateAnswer(finalAnswer, currentPrompt);
    setCurrentSubmission(evaluated);
    setShowDropdown(false);
    setSuggestions([]);
    setIsWrongAnswerShake(false);
    setShakeMessage(null);

    if (isMultiplayer) {
      sendAction('sidenetting_lock_in', {
        roundIdx: currentRoundIdx,
        answer: finalAnswer,
        submission: evaluated,
      });
    }

    // Step A: Show speech bubble next to player/mascot at the surface
    setDiveState('answered-bubble');
    soundFX.playLockIn();

    // Step B: After 750ms, dive downwards into the ocean!
    window.setTimeout(() => {
      setDiveState('diving');
      if (evaluated.isValid) soundFX.playPhaseShift();
      else soundFX.playVoltBuzz();

      // Step C: Animate depth meters roll-up
      const target = evaluated.depthMeters;
      const durationMs = target > 0 ? 2200 : 800;
      const startTime = Date.now();
      let lastTickerBucket = 0;

      const depthTicker = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // smooth cubic ease-out
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentMeters = Math.round(target * eased);
        setDisplayDepth(currentMeters);

        const currentBucket = Math.floor(currentMeters / 150);
        if (currentBucket > lastTickerBucket) {
          lastTickerBucket = currentBucket;
          soundFX.playSlotTick();
        }

        if (progress >= 1) {
          window.clearInterval(depthTicker);
          setDisplayDepth(target);
          setDiveState('at-depth');

          if (evaluated.score >= 50) {
            soundFX.playSuccess();
          } else if (evaluated.score > 0) {
            soundFX.playBid();
          }

          // Record score
          setTotalScore((prev) => prev + evaluated.score);
          setMaxDepthReached((prev) => Math.max(prev, target));
          setRoundResults((prev) => [
            ...prev,
            { prompt: currentPrompt, submission: evaluated },
          ]);

          // Step D: Mark strike completed; wait for opponent in multiplayer or trigger post-round modal in solo
          setUserFinishedRound(true);
          if (isMultiplayer) {
            sendAction('sidenetting_strike_finished', {
              roundIdx: currentRoundIdx,
            });
          }

          if (!isMultiplayer) {
            window.setTimeout(() => {
              setIsPostRoundModalOpen(true);
            }, 1000);
          }
        }
      }, 35);
    }, 750);
  };

  // 3. LOCK IN ANSWER WITH VALIDATION & SHAKE ERROR
  const handleLockAnswer = (e?: React.FormEvent, answerOverride?: string) => {
    if (e) e.preventDefault();
    if (diveState !== 'idle-surface') return;

    const answerToTest = (answerOverride || inputVal).trim();
    if (!answerToTest) return;

    setShowDropdown(false);

    // Validate strictly against the question's accepted answer pool
    // Ensure the player CANNOT send a wrong answer no matter what!
    const evalPreview = evaluateAnswer(answerToTest, currentPrompt);
    if (!evalPreview.isValid) {
      soundFX.playVoltBuzz();
      setIsWrongAnswerShake(true);
      setShakeMessage(`"${answerToTest}" is not a valid answer for this question! Try another player.`);
      window.setTimeout(() => setIsWrongAnswerShake(false), 900);
      return;
    }

    // Valid answer -> Send and Dive!
    soundFX.playClick(900);
    triggerSubmission(answerToTest);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (diveState !== 'idle-surface') return;

    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && suggestions.length > 0 && suggestions[selectedIndex]) {
        const chosen = suggestions[selectedIndex];
        setInputVal(chosen.name);
        handleLockAnswer(undefined, chosen.name);
      } else if (inputVal.trim().length > 0) {
        handleLockAnswer();
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handlePlayAgain = () => {
    soundFX.playClick(950);
    // Draw fresh non-repeating questions
    const nextResult = drawMatchPrompts(config.roundCount, usedPromptIds);
    setPrompts(nextResult.prompts);
    setUsedPromptIds(nextResult.updatedExcludedIds);
    setCurrentRoundIdx(0);

    // Reset timer before resetting diveState to prevent the 0-second auto-skip bug
    const initialSeconds = config.timerSeconds > 0 ? config.timerSeconds : 0;
    setSecondsLeft(initialSeconds);

    setInputVal('');
    setShowDropdown(false);
    setSuggestions([]);
    setLastAttemptedInvalid(null);
    setIsWrongAnswerShake(false);
    setShakeMessage(null);
    setCurrentSubmission(null);
    setDisplayDepth(0);
    setTotalScore(0);
    setMaxDepthReached(0);
    setOpponentTotalScore(0);
    setRoundResults([]);
    setUserFinishedRound(false);
    setIsPostRoundModalOpen(false);
    setIsGuestReadyForNext(false);
    setGuestHasClickedReady(false);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);

    setDiveState('idle-surface');
    window.setTimeout(() => inputRef.current?.focus(), 120);
  };

  const handleRequestOrExecuteRematch = () => {
    if (isMultiplayer) {
      if (!isHost) {
        sendAction('player_rematch_ready', {});
        setHasRequestedRematch(true);
        soundFX.playClick(900);
        return;
      }
      sendAction('match_restart', {});
    }
    handlePlayAgain();
  };

  // Proceed to Next Question or Final Scoreboard
  const handleProceedNextQuestion = useCallback(() => {
    if (!isPostRoundModalOpen) return;

    if (!isMultiplayer) {
      soundFX.playClick(750);
      setIsPostRoundModalOpen(false);
      setUserFinishedRound(false);
      setOpponentStrikeFinished(false);
      setOpponentLockedIn(false);
      if (currentRoundIdx + 1 < prompts.length) {
        setDiveState('ascending');
        window.setTimeout(() => {
          setCurrentRoundIdx((prev) => prev + 1);
          setDiveState('idle-surface');
          setDisplayDepth(0);
          setInputVal('');
          setSecondsLeft(config.timerSeconds > 0 ? config.timerSeconds : 60);
          window.setTimeout(() => inputRef.current?.focus(), 150);
        }, 1200);
      } else {
        setDiveState('game-over');
        soundFX.playVictoryFanfare();
      }
    } else if (!isHost) {
      if (!guestHasClickedReady) {
        soundFX.playClick(750);
        sendAction('sidenetting_player_ready', { roundIdx: currentRoundIdx });
        setGuestHasClickedReady(true);
      }
    } else {
      soundFX.playClick(750);
      setIsPostRoundModalOpen(false);
      setUserFinishedRound(false);
      setOpponentStrikeFinished(false);
      setOpponentLockedIn(false);
      setIsGuestReadyForNext(false);
      if (currentRoundIdx + 1 < prompts.length) {
        const nextRound = currentRoundIdx + 1;
        sendAction('sidenetting_next_round', { nextRoundIdx: nextRound });
        setDiveState('ascending');
        window.setTimeout(() => {
          setCurrentRoundIdx(nextRound);
          setDiveState('idle-surface');
          setDisplayDepth(0);
          setInputVal('');
          setSecondsLeft(config.timerSeconds > 0 ? config.timerSeconds : 60);
          window.setTimeout(() => inputRef.current?.focus(), 150);
        }, 1200);
      } else {
        sendAction('sidenetting_game_over', {});
        setDiveState('game-over');
        soundFX.playVictoryFanfare();
      }
    }
  }, [
    isPostRoundModalOpen,
    isMultiplayer,
    isHost,
    guestHasClickedReady,
    currentRoundIdx,
    prompts.length,
    config.timerSeconds,
    sendAction,
  ]);

  // Keyboard shortcut: Press Enter while on Next Question / Scoreboard breakdown modal to proceed
  useEffect(() => {
    if (!isPostRoundModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleProceedNextQuestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPostRoundModalOpen, handleProceedNextQuestion]);

  // Ball Knower classification for endgame
  const avgScore =
    roundResults.length > 0 ? Math.round(totalScore / roundResults.length) : 0;
  const ratingBadge = getBallKnowerRating(avgScore, maxDepthReached);

  const matchedTierConfig =
    currentSubmission?.tier && currentSubmission.tier !== 'Miss'
      ? SIDE_NETTING_TIER_CONFIGS[currentSubmission.tier]
      : null;

  // Normalized progress from 0 to 1 based on depth (4,000m = 100%)
  const drillProgress = Math.min(1, displayDepth / 4000);

  // Live DOM nodes the stadium engine writes 60fps telemetry into (bypasses React).
  const telemetryRef = useRef<TelemetryNodes>({ speed: null, peak: null, spin: null, curl: null, mode: null });

  const revealTierIdx = tierIndexOf(currentSubmission?.tier);
  const revealHex = TIER_HEX[revealTierIdx];
  const revealRgb = TIER_RGB[revealTierIdx];
  const revealCopy = REVEAL_COPY[revealTierIdx];
  const revealHeadline =
    revealTierIdx === 0 ? (currentSubmission?.rawInput ? 'WIDE!' : 'NO SHOT') : revealCopy.headline;
  const revealKicker =
    revealTierIdx === 0
      ? currentSubmission?.rawInput
        ? 'OFF TARGET'
        : 'CHANCE GONE BEGGING'
      : revealCopy.kicker;
  const isCinematic = diveState === 'answered-bubble' || diveState === 'diving';
  const isUrgent = config.timerSeconds > 0 && diveState === 'idle-surface' && secondsLeft <= 10;
  const timerFraction = config.timerSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / config.timerSeconds)) : 0;
  const TIMER_CIRC = 2 * Math.PI * 17;
  const opponentTierIdx = tierIndexOf(opponentSubmission?.tier);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#02040a] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="pointer-events-none absolute w-[520px] h-[520px] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #00f0ff 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_30px_rgba(0,240,255,0.3)]">
            <Radio className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h2 className="font-athletic italic text-3xl font-black uppercase tracking-wider text-white">
              SYNCHRONIZING ARENA
            </h2>
            <p className="text-[10px] font-mono text-neutral-400 mt-1 uppercase tracking-[0.3em]">
              Connecting to authoritative match server...
            </p>
          </div>
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-cyan-400 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const opponentPill =
    isMultiplayer && opponent ? (
      <div className="sn-panel flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] sm:text-[11px] shrink-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            opponentLockedIn ? 'bg-[#ccff00] animate-pulse shadow-[0_0_8px_#ccff00]' : 'bg-[#00f0ff]'
          }`}
        />
        <span className="text-slate-300 uppercase font-bold truncate max-w-[110px]">{opponent.name}:</span>
        <span className={opponentLockedIn ? 'text-[#ccff00] font-bold' : 'text-slate-400'}>
          {opponentLockedIn ? 'LOCKED IN' : 'THINKING...'}
        </span>
      </div>
    ) : null;

  return (
    <div
      className={`relative min-h-screen min-h-[100dvh] w-full bg-[#02040a] text-white flex flex-col overflow-x-hidden overflow-y-auto select-none font-sans ${
        diveState === 'game-over' ? '' : 'md:overflow-hidden'
      } ${isCinematic ? 'sn-cine' : ''}`}
    >
      <style>{ARENA_CSS}</style>

      {/* ================= LIVE CANVAS STADIUM (pitch, crowd, floodlights, ball, net, fx) ================= */}
      <StadiumCanvas
        phase={diveState}
        targetDepth={currentSubmission?.depthMeters ?? 0}
        tierIdx={revealTierIdx}
        roundIdx={currentRoundIdx}
        wrongShake={isWrongAnswerShake}
        urgent={isUrgent}
        telemetryRef={telemetryRef}
      />

      {/* RED HUE SCREEN OVERLAY UPON WRONG ANSWER */}
      <div
        className={`pointer-events-none fixed inset-0 z-40 transition-opacity duration-300 ${
          isWrongAnswerShake ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(ellipse at center, rgba(244,63,94,0.04) 35%, rgba(136,19,55,0.55) 100%)',
          boxShadow: 'inset 0 0 0 6px rgba(244,63,94,0.55)',
        }}
      />

      {/* CINEMATIC LETTERBOX (slides in for the wind-up and flight) */}
      <div className="sn-letterbox sn-top" />
      <div className="sn-letterbox sn-bottom" />

      {/* ================= TOP BROADCAST SCOREBUG ================= */}
      <header className="relative z-30 w-full px-2 sm:px-4 pt-2">
        <div className="max-w-[1400px] mx-auto flex items-stretch gap-1.5 sm:gap-2.5 h-[52px] sm:h-[58px]">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick(500);
              setShowForfeitModal(true);
            }}
            className="sn-panel min-h-[44px] min-w-[44px] w-11 sm:w-12 shrink-0 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Exit to Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="sn-panel flex-1 min-w-0 flex items-center gap-3 px-3 sm:px-4">
            <div className="min-w-0 leading-none">
              <div className="flex items-center gap-2">
                <span className="sn-live-dot" />
                <span className="font-athletic italic font-black text-[17px] sm:text-[22px] tracking-wide uppercase whitespace-nowrap">
                  SIDE <span className="text-[#ccff00]">NETTING</span>
                </span>
              </div>
              <p className="font-mono text-[9px] sm:text-[10px] text-slate-400 tracking-[0.22em] mt-1 whitespace-nowrap">
                ROUND {pad2(currentRoundIdx + 1)} / {pad2(prompts.length)}
              </p>
            </div>

            {/* Round pips coloured by the tier each strike reached */}
            <div className="hidden sm:flex items-center gap-1 ml-auto pl-2 min-w-0 overflow-hidden">
              {prompts.map((p, i) => {
                const res = roundResults[i];
                const color = res ? TIER_HEX[tierIndexOf(res.submission.tier)] : undefined;
                const isCurrent = i === currentRoundIdx && !res;
                return (
                  <span
                    key={`${p.id}-${i}`}
                    className={`h-[5px] w-2.5 xl:w-4 shrink-0 skew-x-[-20deg] ${isCurrent ? 'bg-white sn-blink' : ''}`}
                    style={{
                      background: color ?? (isCurrent ? undefined : 'rgba(255,255,255,0.1)'),
                      boxShadow: color ? `0 0 6px ${color}` : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Multiplayer Opponent Status Pill */}
          {opponentPill && <div className="hidden md:flex">{opponentPill}</div>}

          {/* Live Score Tally */}
          <div className="sn-panel shrink-0 flex items-center gap-3 sm:gap-4 px-3 sm:px-4">
            <div className="leading-none">
              <span className="block font-mono text-[8px] sm:text-[9px] tracking-[0.2em] text-slate-400 uppercase">
                <span className="sm:hidden">PTS</span>
                <span className="hidden sm:inline">TOTAL POINTS</span>
              </span>
              <span className="font-athletic font-black text-xl sm:text-2xl tabular-nums text-[#ccff00] drop-shadow-[0_0_10px_rgba(204,255,0,0.45)]">
                {totalScore}
              </span>
            </div>
            {isMultiplayer && opponent && (
              <>
                <div className="w-px self-stretch my-2.5 bg-white/10" />
                <div className="leading-none">
                  <span className="block font-mono text-[8px] sm:text-[9px] tracking-[0.2em] text-slate-400 uppercase truncate max-w-[64px] sm:max-w-[110px]">
                    {opponent.name}
                  </span>
                  <span className="font-athletic font-black text-xl sm:text-2xl tabular-nums text-[#00f0ff] drop-shadow-[0_0_10px_rgba(0,240,255,0.45)]">
                    {opponentTotalScore}
                  </span>
                </div>
              </>
            )}
            <div className="hidden sm:block w-px self-stretch my-2.5 bg-white/10" />
            <div className="hidden sm:block leading-none">
              <span className="block font-mono text-[9px] tracking-[0.2em] text-slate-400">MAX RANGE</span>
              <span className="font-athletic font-black text-2xl tabular-nums text-white">{maxDepthReached}m</span>
            </div>
          </div>

          {/* Shot Clock */}
          {config.timerSeconds > 0 && diveState === 'idle-surface' && (
            <div
              className={`sn-panel shrink-0 w-[52px] sm:w-[62px] flex items-center justify-center ${
                secondsLeft <= 10 ? 'sn-urgent' : ''
              }`}
            >
              <svg viewBox="0 0 40 40" className="absolute inset-0 m-auto w-[40px] h-[40px] sm:w-[46px] sm:h-[46px] -rotate-90" aria-hidden="true">
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  stroke={secondsLeft <= 10 ? '#f43f5e' : '#ccff00'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={TIMER_CIRC}
                  strokeDashoffset={TIMER_CIRC * (1 - timerFraction)}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
              </svg>
              <span
                className={`relative font-athletic font-black text-lg sm:text-xl tabular-nums ${
                  secondsLeft <= 10 ? 'text-rose-300' : 'text-white'
                }`}
              >
                {secondsLeft}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ================= MAIN STAGE ================= */}
      <main className="relative z-10 w-full flex-1 flex flex-col">
        {diveState !== 'game-over' && (
          <>
            {/* Compact range ladder + opponent status (mobile / tablet) */}
            <div className="lg:hidden px-2 sm:px-4 mt-1.5 flex flex-col gap-1.5 max-w-3xl w-full mx-auto">
              <RangeStrip depth={displayDepth} />
              {opponentPill && <div className="md:hidden flex">{opponentPill}</div>}
            </div>

            {/* THE QUESTION: broadcast lower-third card */}
            <section
              className={`relative px-2 sm:px-6 mt-2 transition-all duration-500 ${
                diveState === 'idle-surface' ? 'opacity-100' : 'opacity-0 -translate-y-2 pointer-events-none'
              }`}
            >
              <div key={`q-${currentRoundIdx}`} className="sn-rise sn-panel max-w-3xl mx-auto pl-5 pr-4 sm:pl-7 sm:pr-6 py-3 sm:py-4">
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#ccff00] to-[#00f0ff]" />
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <span className="px-2 py-[2px] bg-[#ccff00] text-black font-mono text-[9px] sm:text-[10px] font-black tracking-[0.2em] shrink-0">
                    ROUND {currentRoundIdx + 1} OF {prompts.length}
                  </span>
                  {currentPrompt.category && (
                    <span className="font-mono text-[9px] sm:text-[10px] font-bold tracking-[0.22em] text-cyan-300/90 uppercase truncate">
                      {currentPrompt.category}
                    </span>
                  )}
                </div>
                <h1 className="text-[15px] sm:text-lg lg:text-[21px] font-semibold leading-snug text-white text-balance">
                  “{currentPrompt.prompt}”
                </h1>
              </div>
            </section>

            {/* Open window onto the canvas pitch */}
            <div className="flex-1 min-h-[150px] sm:min-h-[220px]" />

            {/* BOTTOM: THE ANSWER DOCK WITH DID-YOU-MEAN & WRONG ANSWER SHAKE */}
            <div
              className={`relative z-20 w-full max-w-2xl mx-auto px-2.5 sm:px-4 pt-1 pb-[max(66px,env(safe-area-inset-bottom))] md:pb-[max(14px,env(safe-area-inset-bottom))] space-y-2 transition-all duration-500 ${
                diveState === 'idle-surface' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
              }`}
            >
              {shakeMessage && (
                <div
                  className={`sn-rise px-3.5 py-2 border flex items-center justify-between gap-2.5 ${
                    isWrongAnswerShake
                      ? 'bg-[#2a0a14]/95 border-rose-500/60 text-rose-200'
                      : 'bg-[#2a1c05]/95 border-amber-400/60 text-amber-200'
                  }`}
                  style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))' }}
                >
                  <div className="flex items-center gap-2 text-xs font-mono">
                    {isWrongAnswerShake ? (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span>{shakeMessage}</span>
                  </div>
                </div>
              )}

              <form
                onSubmit={handleLockAnswer}
                className={`relative flex items-stretch gap-2 transition-all ${
                  isWrongAnswerShake ? 'animate-error-shake' : ''
                }`}
              >
                <div className="relative flex-1 min-w-0">
                  {/* Floating Autocomplete Dropdown */}
                  {showDropdown && suggestions.length > 0 && diveState === 'idle-surface' && (
                    <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl bg-[#090d18] border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-md overflow-y-auto max-h-52 z-50 divide-y divide-white/5">
                      {suggestions.map((item, idx) => {
                        const isSelected = idx === selectedIndex;
                        const posColor =
                          item.position === 'FWD'
                            ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                            : item.position === 'MID'
                            ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                            : item.position === 'DEF'
                            ? 'text-sky-400 bg-sky-500/10 border-sky-500/30'
                            : item.position === 'GK'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                            : 'text-slate-400 bg-white/5 border-white/10';

                        return (
                          <button
                            key={item.name}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setInputVal(item.name);
                              handleLockAnswer(undefined, item.name);
                            }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors ${
                              isSelected
                                ? 'bg-[#ccff00]/15 text-white cursor-pointer'
                                : 'hover:bg-white/5 text-slate-200 cursor-pointer'
                            }`}
                          >
                            <span className="font-sans font-black text-sm uppercase truncate text-white">
                              {item.name}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              {item.position && (
                                <span
                                  className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border shrink-0 ${posColor}`}
                                >
                                  {item.position}
                                </span>
                              )}
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 text-[#ccff00]">
                                STRIKE
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <svg
                    viewBox="0 0 24 24"
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${
                      inputVal.trim() ? 'text-[#ccff00]' : 'text-slate-500'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                    <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputVal}
                    disabled={diveState !== 'idle-surface'}
                    onChange={(e) => {
                      setInputVal(e.target.value);
                      if (lastAttemptedInvalid) setLastAttemptedInvalid(null);
                      if (shakeMessage) setShakeMessage(null);
                      setShowDropdown(true);
                    }}
                    onFocus={() => {
                      if (inputVal.trim().length >= 3) {
                        setShowDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setShowDropdown(false), 200);
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Name your shot..."
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className={`w-full h-full min-h-[52px] pl-10 pr-16 py-3 bg-[#040811]/95 border text-base sm:text-[15px] font-semibold text-white placeholder:text-slate-500 shadow-[0_12px_40px_rgba(0,0,0,0.6)] transition-all focus:outline-none ${
                      isWrongAnswerShake
                        ? 'border-rose-500 ring-2 ring-rose-500/50'
                        : 'border-white/15 focus:border-[#ccff00] focus:shadow-[0_0_0_1px_#ccff00,0_0_30px_rgba(204,255,0,0.2)]'
                    }`}
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px))' }}
                  />
                  {inputVal.trim() && diveState === 'idle-surface' && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold uppercase tracking-widest text-[#ccff00] animate-pulse">
                      READY
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!inputVal.trim() || diveState !== 'idle-surface'}
                  className="sn-strike sn-sheen px-4 sm:px-7 min-h-[52px] disabled:opacity-40 disabled:grayscale disabled:pointer-events-none text-black font-athletic italic text-lg sm:text-xl font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 hover:brightness-110 active:scale-[0.97]"
                >
                  <span>STRIKE</span>
                  <Send className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={diveState !== 'idle-surface'}
                  onClick={() => {
                    soundFX.playVoltBuzz();
                    triggerSubmission('');
                  }}
                  className="sn-panel px-3 sm:px-4 min-h-[52px] hover:bg-white/[0.06] disabled:opacity-40 disabled:pointer-events-none text-slate-300 hover:text-white font-athletic italic text-base font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Skip this question immediately"
                >
                  <SkipForward className="w-4 h-4" />
                  <span className="hidden sm:inline">SKIP</span>
                </button>
              </form>
              <p className="hidden sm:block text-center font-mono text-[9px] tracking-[0.32em] text-slate-500">
                THE DEEPER THE CUT, THE FURTHER IT FLIES • ↵ TO STRIKE
              </p>
            </div>
          </>
        )}

        {/* ================= GAME OVER PODIUM ================= */}
        {diveState === 'game-over' && (
          <div className="flex-1 flex items-center justify-center px-3 py-6">
            <div className="sn-rise sn-panel max-w-xl w-full p-6 sm:p-8 text-center">
              <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#ccff00] via-[#facc15] to-[#00f0ff]" />
              <div className="relative w-24 h-24 mx-auto mb-3">
                <div
                  className="absolute inset-[-30%] rounded-full blur-2xl opacity-60"
                  style={{ background: 'radial-gradient(circle, rgba(250,204,21,0.7), transparent 65%)' }}
                />
                <TrophySvg className="relative w-full h-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.8)]" />
              </div>

              {/* Multiplayer Result Banner or Solo Drill Tag */}
              {isMultiplayer ? (
                <div className="mb-2">
                  <span
                    className={`px-4 py-1.5 text-[10px] sm:text-xs font-mono font-black uppercase tracking-[0.2em] inline-block ${
                      totalScore > opponentTotalScore
                        ? 'bg-[#ccff00]/15 border border-[#ccff00]/50 text-[#ccff00]'
                        : opponentTotalScore > totalScore
                        ? 'bg-rose-500/15 border border-rose-500/50 text-rose-300'
                        : 'bg-cyan-500/15 border border-cyan-400/50 text-cyan-300'
                    }`}
                  >
                    {totalScore > opponentTotalScore
                      ? 'VICTORY : SQUAD OUTCLASSED'
                      : opponentTotalScore > totalScore
                      ? 'DEFEAT : OPPONENT PREVAILS'
                      : 'HONOURS EVEN : STALEMATE'}
                  </span>
                  <h1 className="sn-slam font-athletic italic text-5xl sm:text-6xl font-black uppercase text-white mt-3 leading-none">
                    {totalScore > opponentTotalScore
                      ? 'MATCH WON'
                      : opponentTotalScore > totalScore
                      ? 'MATCH LOST'
                      : 'DRAW'}
                  </h1>
                </div>
              ) : (
                <div>
                  <span className="px-4 py-1 text-[10px] sm:text-xs font-mono font-black uppercase tracking-[0.2em] bg-[#ccff00]/15 border border-[#ccff00]/50 text-[#ccff00] inline-block">
                    DRILL COMPLETED
                  </span>
                  <h1 className="sn-slam font-athletic italic text-5xl sm:text-6xl font-black uppercase text-white mt-3 leading-none">
                    SESSION CONCLUDED
                  </h1>
                </div>
              )}

              {/* Scoreboard Comparison */}
              {isMultiplayer ? (
                <div className="grid grid-cols-2 gap-3 my-5">
                  <div
                    className={`p-4 sm:p-5 bg-black/60 border ${
                      totalScore >= opponentTotalScore ? 'border-[#ccff00]/50 shadow-[0_0_24px_rgba(204,255,0,0.18)]' : 'border-white/10'
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#ccff00] block mb-1">YOU</span>
                    <span className="font-athletic text-5xl sm:text-6xl font-black text-[#ccff00] tabular-nums leading-none">
                      {totalScore}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 block mt-1.5">TOTAL POINTS</span>
                  </div>

                  <div
                    className={`p-4 sm:p-5 bg-black/60 border ${
                      opponentTotalScore >= totalScore ? 'border-cyan-400/50 shadow-[0_0_24px_rgba(0,240,255,0.18)]' : 'border-white/10'
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-300 block mb-1 truncate">
                      {opponent?.name.toUpperCase() || 'OPPONENT'}
                    </span>
                    <span className="font-athletic text-5xl sm:text-6xl font-black text-cyan-300 tabular-nums leading-none">
                      {opponentTotalScore}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 block mt-1.5">TOTAL POINTS</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 my-6">
                  <div className="p-4 sm:p-5 bg-black/60 border border-[#ccff00]/40">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1">TOTAL POINTS</span>
                    <span className="font-athletic text-5xl sm:text-6xl font-black text-[#ccff00] tabular-nums leading-none">
                      {totalScore}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 block mt-1.5">ACROSS {prompts.length} ROUNDS</span>
                  </div>

                  <div className="p-4 sm:p-5 bg-black/60 border border-white/10">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1">FURTHEST STRIKE</span>
                    <span className="font-athletic text-5xl sm:text-6xl font-black text-cyan-300 tabular-nums leading-none">
                      {maxDepthReached}m
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 block mt-1.5">MAX PITCH RANGE</span>
                  </div>
                </div>
              )}

              {/* Round-by-round strike map */}
              {roundResults.length > 0 && (
                <div className="flex items-end justify-center gap-1 h-12 mb-5" aria-hidden="true">
                  {roundResults.map((r, i) => {
                    const ti = tierIndexOf(r.submission.tier);
                    return (
                      <div
                        key={`bar-${i}`}
                        className="w-3 sm:w-4 skew-x-[-12deg] sn-rise"
                        style={{
                          height: `${Math.max(8, (r.submission.depthMeters / 4000) * 100)}%`,
                          background: TIER_HEX[ti],
                          boxShadow: `0 0 10px ${TIER_HEX[ti]}`,
                          animationDelay: `${i * 60}ms`,
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Ball Knower Rating Badge */}
              <div className="p-4 bg-white/[0.04] border border-white/10 mb-6 flex items-center justify-between gap-3 text-left">
                <div className="min-w-0">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                    BALL KNOWER CLASSIFICATION:
                  </span>
                  <h4 className="font-athletic italic text-2xl font-black uppercase text-white mt-0.5 leading-none">
                    {ratingBadge.title}
                  </h4>
                  <p className="text-xs font-mono text-slate-400 mt-1">{ratingBadge.desc}</p>
                </div>

                <span className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-black uppercase shrink-0 ${ratingBadge.badgeClass}`}>
                  AVG {avgScore} PTS
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-stretch gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isMultiplayer) sendGameLeave();
                    handleCleanExit();
                  }}
                  className="sn-panel flex-1 py-4 hover:bg-white/[0.06] text-sm font-athletic italic font-black uppercase tracking-widest text-slate-300 transition-all cursor-pointer"
                >
                  RETURN TO HUB
                </button>
                <button
                  type="button"
                  disabled={isMultiplayer && !isHost && hasRequestedRematch}
                  onClick={handleRequestOrExecuteRematch}
                  className={`flex-1 py-4 font-athletic italic font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                    isMultiplayer && !isHost && hasRequestedRematch
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                      : isMultiplayer && isHost && isOpponentRematchReady
                      ? 'sn-strike sn-sheen text-black animate-pulse cursor-pointer'
                      : 'sn-strike sn-sheen text-black cursor-pointer hover:brightness-110'
                  }`}
                >
                  <RotateCcw className={`w-4 h-4 ${isMultiplayer && !isHost && hasRequestedRematch ? 'animate-spin' : ''}`} />
                  <span>
                    {isMultiplayer && !isHost
                      ? hasRequestedRematch
                        ? 'HOST NOTIFIED : WAITING FOR HOST'
                        : 'PLAY AGAIN'
                      : isMultiplayer && isHost
                      ? isOpponentRematchReady
                        ? 'OPPONENT READY : PLAY AGAIN'
                        : 'PLAY AGAIN'
                      : 'PLAY AGAIN'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= FIXED CINEMATIC OVERLAYS ================= */}
      {diveState !== 'game-over' && (
        <>
          {/* Desktop strike-range telemetry rail */}
          <div className="hidden lg:flex fixed right-5 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <RangeRail depth={displayDepth} progress={drillProgress} />
          </div>

          {/* Shot tag -> tier reveal */}
          <div className="fixed inset-x-0 top-[max(17vh,134px)] lg:top-[15vh] z-20 flex justify-center px-3 pointer-events-none">
            {(diveState === 'answered-bubble' || diveState === 'diving') && currentSubmission && (
              <div className="flex flex-col items-center gap-2">
                <div className="sn-tag-in flex items-stretch shadow-[0_12px_40px_rgba(0,0,0,0.65)] max-w-[92vw]">
                  <span className="px-2.5 sm:px-3 flex items-center bg-[#ccff00] text-black font-mono text-[10px] sm:text-[11px] font-black tracking-[0.2em] shrink-0">
                    {diveState === 'answered-bubble' ? 'LOCKED' : 'STRIKE'}
                  </span>
                  <span className="px-3 sm:px-4 py-1.5 sm:py-2 bg-[#050a14]/95 border border-white/15 font-athletic italic font-black text-xl sm:text-3xl uppercase tracking-wide text-white truncate">
                    "{currentSubmission.rawInput ? currentSubmission.rawInput : 'NO ANSWER'}"
                  </span>
                </div>
                <div
                  ref={(el) => {
                    telemetryRef.current.mode = el;
                  }}
                  className="px-3 py-1 font-mono text-[10px] font-black tracking-[0.3em] text-[#facc15] border border-[#facc15]/50 bg-black/75 transition-opacity duration-200"
                  style={{ opacity: 0 }}
                />
              </div>
            )}

            {diveState === 'at-depth' && currentSubmission && (
              <div
                key={`reveal-${currentRoundIdx}`}
                className={`relative flex flex-col items-center text-center max-w-[94vw] ${revealTierIdx >= 4 ? 'sn-kick' : ''}`}
                style={{ ['--rgb' as string]: revealRgb } as React.CSSProperties}
              >
                {revealTierIdx >= 4 && <div className="sn-rays" aria-hidden="true" />}
                <span
                  className="sn-rise relative font-mono text-[10px] sm:text-xs font-black tracking-[0.35em] uppercase"
                  style={{ color: revealHex }}
                >
                  {revealKicker}
                </span>
                <h2
                  className={`relative font-athletic italic font-black uppercase leading-[0.86] text-[56px] sm:text-[88px] lg:text-[112px] whitespace-nowrap ${
                    revealTierIdx === 5 ? 'sn-gold-text' : revealTierIdx === 0 ? 'sn-glitch' : 'sn-slam'
                  }`}
                  style={
                    revealTierIdx === 5
                      ? { filter: 'drop-shadow(0 0 22px rgba(250,204,21,0.65))' }
                      : {
                          color: revealHex,
                          textShadow: `0 0 26px rgba(${revealRgb},0.6), 0 0 70px rgba(${revealRgb},0.35)`,
                        }
                  }
                >
                  {revealHeadline}
                </h2>
                <div className="sn-rise relative mt-2 flex flex-wrap items-stretch justify-center [animation-delay:250ms]">
                  <span className="px-3 py-1.5 bg-[#050a14]/95 border border-white/15 font-athletic italic font-black text-lg sm:text-2xl uppercase text-white max-w-[70vw] truncate">
                    "{currentSubmission.rawInput ? currentSubmission.rawInput : 'NO ANSWER'}"
                  </span>
                  <span
                    className="px-3 py-1.5 font-mono text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center"
                    style={{
                      backgroundColor: currentSubmission.isValid ? matchedTierConfig?.glowColor || '#10b981' : '#f43f5e',
                      color: currentSubmission.isValid ? '#000000' : '#ffffff',
                    }}
                  >
                    {currentSubmission.isValid
                      ? `${matchedTierConfig?.label || currentSubmission.tier.toUpperCase()} • +${currentSubmission.score} PTS`
                      : 'MISS (0m)'}
                  </span>
                </div>
                {currentSubmission.matchedAnswer && (
                  <p className="sn-rise relative mt-2.5 max-w-md px-3 py-1 bg-black/60 font-mono text-[10px] sm:text-[11px] text-slate-300 tracking-wide [animation-delay:450ms]">
                    <span className="text-slate-500">PICKED BY </span>
                    <span className="font-black" style={{ color: revealHex }}>
                      {currentSubmission.matchedAnswer.pickRatePct}%
                    </span>
                    {currentSubmission.matchedAnswer.commentary && (
                      <>
                        <span className="text-slate-600"> • </span>
                        {currentSubmission.matchedAnswer.commentary}
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            {diveState === 'ascending' && (
              <div className="sn-tag-in px-3 sm:px-4 py-1.5 bg-black/80 border border-cyan-400/40 font-mono text-[10px] sm:text-[11px] font-black tracking-[0.2em] sm:tracking-[0.35em] text-cyan-300 whitespace-nowrap">
                ◀◀ REWIND • NEXT CHANCE LOADING
              </div>
            )}
          </div>

          {/* Hawk-eye style flight telemetry */}
          {(diveState === 'diving' || diveState === 'at-depth') && (
            <div className="fixed inset-x-0 bottom-[9vh] z-20 flex justify-center px-2 pointer-events-none">
              <div className="sn-rise sn-panel flex items-stretch divide-x divide-white/10 font-mono">
                <div className="px-3 sm:px-5 py-2 min-w-[84px] sm:min-w-[118px]">
                  <span className="block text-[8px] sm:text-[9px] tracking-[0.25em] text-slate-400">
                    {diveState === 'diving' ? 'BALL SPEED' : 'TOP SPEED'}
                  </span>
                  <span className="font-athletic font-black text-2xl sm:text-3xl tabular-nums text-white leading-none">
                    {diveState === 'diving' ? (
                      <span
                        ref={(el) => {
                          telemetryRef.current.speed = el;
                        }}
                      />
                    ) : (
                      <span
                        ref={(el) => {
                          telemetryRef.current.peak = el;
                        }}
                      />
                    )}
                  </span>
                  <span className="text-[9px] text-slate-500 ml-1">KM/H</span>
                </div>
                <div className="px-3 sm:px-5 py-2 min-w-[96px] sm:min-w-[132px]">
                  <span className="block text-[8px] sm:text-[9px] tracking-[0.25em] text-slate-400">DISTANCE</span>
                  <span
                    className="font-athletic font-black text-2xl sm:text-3xl tabular-nums leading-none"
                    style={{ color: PITCH_ZONES[zoneIndexForDepth(displayDepth)].color }}
                  >
                    {displayDepth.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-slate-500 ml-1">M</span>
                </div>
                <div className="px-3 sm:px-5 py-2 min-w-[72px] sm:min-w-[104px]">
                  <span className="block text-[8px] sm:text-[9px] tracking-[0.25em] text-slate-400">CURL</span>
                  <span className="font-athletic font-black text-2xl sm:text-3xl tabular-nums text-white leading-none">
                    <span
                      ref={(el) => {
                        telemetryRef.current.curl = el;
                      }}
                    />
                  </span>
                  <span className="text-[9px] text-slate-500 ml-1">M</span>
                </div>
                <div className="hidden sm:block px-5 py-2 min-w-[118px]">
                  <span className="block text-[9px] tracking-[0.25em] text-slate-400">SPIN</span>
                  <span className="font-athletic font-black text-3xl tabular-nums text-white leading-none">
                    <span
                      ref={(el) => {
                        telemetryRef.current.spin = el;
                      }}
                    />
                  </span>
                  <span className="text-[9px] text-slate-500 ml-1">RPM</span>
                </div>
              </div>
            </div>
          )}

          {/* Waiting for Opponent Strike Banner in Multiplayer */}
          {isMultiplayer && userFinishedRound && !isPostRoundModalOpen && diveState === 'at-depth' && (
            <div className="fixed inset-x-0 bottom-[calc(9vh+68px)] sm:bottom-[calc(9vh+76px)] z-20 flex justify-center px-3 pointer-events-none">
              <div className="px-5 py-2 bg-black/85 border border-cyan-400/40 shadow-[0_0_25px_rgba(0,240,255,0.25)] flex items-center gap-2.5 animate-pulse">
                <Clock className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
                <span className="font-mono text-[10px] sm:text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  STRIKE REGISTERED : WAITING FOR {opponent?.name.toUpperCase() || 'OPPONENT'} TO FINISH...
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= POST-ROUND RESULT BREAKDOWN MODAL ================= */}
      {isPostRoundModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#02040a]/80 flex items-center justify-center p-3 sm:p-4">
          <div className="sn-rise sn-panel w-full max-w-xl p-5 sm:p-7 flex flex-col gap-4 sm:gap-5 shadow-[0_28px_80px_rgba(0,0,0,0.9)]">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${revealHex}, transparent)` }} />
            {/* Header: Round & Prompt */}
            <div className="text-center pb-3 border-b border-white/10">
              <span className="px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest bg-cyan-500/15 text-cyan-300 border border-cyan-400/40 inline-block mb-2">
                ROUND {currentRoundIdx + 1} OF {prompts.length} : STRIKE BREAKDOWN
              </span>
              <h3 className="font-sans text-base sm:text-lg font-semibold text-white tracking-tight leading-snug">
                "{currentPrompt.prompt}"
              </h3>
            </div>

            {/* Answer & Score Comparison Cards */}
            <div className={`grid ${isMultiplayer ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
              {/* YOU */}
              <div className="relative p-4 pl-5 bg-black/60 border border-white/10 flex flex-col justify-between overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: revealHex, boxShadow: `0 0 12px ${revealHex}` }} />
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">YOUR STRIKE</span>
                  <span className="font-athletic italic text-xl sm:text-2xl font-black text-white uppercase block truncate leading-tight">
                    {currentSubmission?.matchedAnswer?.text || currentSubmission?.rawInput || 'NO ANSWER'}
                  </span>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-xs font-mono font-bold" style={{ color: revealHex }}>
                      {displayDepth}m
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-300">
                      {currentSubmission?.tier || 'MISSED'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-slate-400">POINTS:</span>
                  <span className="font-athletic text-2xl font-black text-[#ccff00] tabular-nums">+{currentSubmission?.score || 0}</span>
                </div>
              </div>

              {/* OPPONENT */}
              {isMultiplayer && (
                <div className="relative p-4 pl-5 bg-black/60 border border-white/10 flex flex-col justify-between overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: TIER_HEX[opponentTierIdx], boxShadow: `0 0 12px ${TIER_HEX[opponentTierIdx]}` }}
                  />
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 block mb-1 truncate">
                      {opponent?.name.toUpperCase() || 'OPPONENT'}
                    </span>
                    <span className="font-athletic italic text-xl sm:text-2xl font-black text-white uppercase block truncate leading-tight">
                      {opponentSubmission?.matchedAnswer?.text || opponentSubmission?.rawInput || 'NO ANSWER'}
                    </span>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-xs font-mono font-bold text-cyan-300">
                        {opponentSubmission?.matchedAnswer?.rarityScore ? Math.round((opponentSubmission.matchedAnswer.rarityScore / 100) * 4000) : 0}m
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-[10px] font-mono font-bold uppercase text-slate-300">
                        {opponentSubmission?.tier || 'MISSED'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase text-slate-400">POINTS:</span>
                    <span className="font-athletic text-2xl font-black text-cyan-300 tabular-nums">+{opponentSubmission?.score || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Live Overall Score Strip */}
            {isMultiplayer && (
              <div className="py-2.5 px-4 bg-white/[0.03] border border-white/10 flex items-center justify-around font-mono text-xs">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block">YOU</span>
                  <span className="text-[#ccff00] font-black text-base">{totalScore} PTS</span>
                </div>
                <span className="text-slate-600 font-black">:</span>
                <div className="text-right">
                  <span className="text-slate-400 uppercase text-[10px] block">{opponent?.name.toUpperCase() || 'OPPONENT'}</span>
                  <span className="text-cyan-300 font-black text-base">{opponentTotalScore} PTS</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-1">
              {!isMultiplayer ? (
                <button
                  type="button"
                  onClick={handleProceedNextQuestion}
                  className="sn-strike sn-sheen w-full py-3.5 text-black font-athletic italic font-black text-base uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer hover:brightness-110"
                >
                  <span>{currentRoundIdx + 1 < prompts.length ? 'NEXT QUESTION' : 'VIEW FINAL SCOREBOARD'}</span>
                  <span className="text-[10px] bg-black/20 text-black px-1.5 py-0.5 font-mono font-bold not-italic ml-1">↵ ENTER</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : !isHost ? (
                /* Guest */
                <button
                  type="button"
                  disabled={guestHasClickedReady}
                  onClick={handleProceedNextQuestion}
                  className={`w-full py-3.5 font-athletic italic font-black text-base uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    guestHasClickedReady
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                      : 'sn-strike sn-sheen text-black cursor-pointer hover:brightness-110'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{guestHasClickedReady ? 'READY : WAITING FOR HOST...' : 'READY FOR NEXT'}</span>
                  {!guestHasClickedReady && (
                    <span className="text-[10px] bg-black/20 text-black px-1.5 py-0.5 font-mono font-bold not-italic ml-1">↵ ENTER</span>
                  )}
                </button>
              ) : (
                /* Host */
                <button
                  type="button"
                  onClick={handleProceedNextQuestion}
                  className={`sn-strike sn-sheen w-full py-3.5 text-black font-athletic italic font-black text-base uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer hover:brightness-110 ${
                    isGuestReadyForNext ? 'animate-pulse' : ''
                  }`}
                >
                  <span>
                    {currentRoundIdx + 1 < prompts.length
                      ? isGuestReadyForNext
                        ? 'OPPONENT READY : NEXT QUESTION'
                        : 'NEXT QUESTION'
                      : isGuestReadyForNext
                      ? 'OPPONENT READY : FINAL RESULTS'
                      : 'VIEW FINAL RESULTS'}
                  </span>
                  <span className="text-[10px] bg-black/20 text-black px-1.5 py-0.5 font-mono font-bold not-italic ml-1">↵ ENTER</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multiplayer Opponent Forfeit Dialog */}
      <MultiplayerForfeitModal
        forfeitEvent={playerForfeitEvent}
        onReturnToHub={() => {
          clearForfeit();
          if (party.roomCode?.startsWith('match_')) {
            leaveParty();
          }
          handleCleanExit();
        }}
      />

      {/* In-Game Exit / Forfeit Confirmation Guard */}
      <ForfeitMatchModal
        isOpen={showForfeitModal}
        onStay={() => setShowForfeitModal(false)}
        onForfeit={() => {
          if (isMultiplayer) sendGameLeave();
          if (party.roomCode?.startsWith('match_')) {
            leaveParty();
          }
          setShowForfeitModal(false);
          handleCleanExit();
        }}
      />
    </div>
  );
};
