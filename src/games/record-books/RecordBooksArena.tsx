import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Crown,
  Flame,
  Lock,
  RotateCcw,
  Search,
  SkipForward,
  Trophy,
  Radio,
} from 'lucide-react';
import type {
  RecordBooksClubRecord,
  RecordBooksMatchConfig,
  RecordBooksRoundResult,
  RecordBooksSubmissionEval,
} from './types';
import {
  evaluateRecordBooksSubmission,
  generateClubSequence,
  generateRecordBooksOpponentSubmission,
  isSameRecordBooksPlayer,
  searchRecordBooksPlayers,
} from './recordBooksEngine';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import { useKeyboardKeeper, keepTypingFocus } from '../../hooks/useKeyboardKeeper';
import { soundFX } from '../../utils/audio';

/* ============================================================================
 * HALL OF FAME — palette & helpers
 * ==========================================================================*/

const BLAZE = '#ff9f1c';
const BLAZE_RGB = '255,159,28';
const GOLD = '#fbbf24';
const GOLD_RGB = '251,191,36';
const SKY = '#38bdf8';
const SKY_RGB = '56,189,248';
const ROSE_RGB = '244,63,94';
const TAU = Math.PI * 2;

const POSITION_TAG: Record<string, string> = {
  GK: '#34d399',
  DEF: '#38bdf8',
  MID: '#fbbf24',
  FWD: '#fb7185',
};

const centerOf = (el: Element | null | undefined) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
};

const restartClass = (el: HTMLElement | null, cls: string) => {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};

/* ============================================================================
 * FX ENGINE — transparent canvas overlay: sparks, gold embers, shockwaves,
 * flashes and confetti. The rAF loop sleeps whenever nothing is alive.
 * ==========================================================================*/

interface RbParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  css: string;
  kind: number; // 0 spark, 1 confetti, 2 ember
  rot: number;
  vr: number;
}

interface RbRing {
  x: number;
  y: number;
  r1: number;
  t0: number;
  dur: number;
  rgb: string;
  w: number;
}

interface RbFlash {
  x: number;
  y: number;
  r: number;
  t0: number;
  dur: number;
  rgb: string;
}

interface RbFxEngine {
  burst: (x: number, y: number, rgb: string, n: number, speed?: number) => void;
  embers: (x: number, y: number, rgb: string, n: number, spread?: number) => void;
  confetti: (x: number, y: number, n: number, palette: string[]) => void;
  shockwave: (x: number, y: number, rgb: string, radius: number, dur?: number, width?: number) => void;
  flash: (x: number, y: number, rgb: string, radius: number, dur?: number) => void;
  destroy: () => void;
}

function createRbFxEngine(canvas: HTMLCanvasElement): RbFxEngine {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const density = reduce ? 0.3 : 1;
  const MAX = 800;
  let W = 1;
  let H = 1;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let alive = true;
  let last = performance.now();
  const parts: RbParticle[] = [];
  const rings: RbRing[] = [];
  const flashes: RbFlash[] = [];
  const cssCache = new Map<string, string>();
  const rgbCss = (rgb: string) => {
    let c = cssCache.get(rgb);
    if (!c) {
      c = `rgb(${rgb})`;
      cssCache.set(rgb, c);
    }
    return c;
  };
  const now = () => performance.now() / 1000;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  function kick() {
    if (running || !alive) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function burst(x: number, y: number, rgb: string, n: number, speed = 500) {
    const css = rgbCss(rgb);
    const count = Math.round(n * density);
    for (let i = 0; i < count && parts.length < MAX; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.85);
      const life = 0.45 + Math.random() * 0.6;
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.25,
        life, max: life,
        size: 1.2 + Math.random() * 2.2,
        css, kind: 0, rot: 0, vr: 0,
      });
    }
    kick();
  }

  function embers(x: number, y: number, rgb: string, n: number, spread = 120) {
    const css = rgbCss(rgb);
    const count = Math.round(n * density);
    for (let i = 0; i < count && parts.length < MAX; i++) {
      const life = 1 + Math.random() * 1.2;
      parts.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread * 0.35,
        vx: (Math.random() - 0.5) * 40,
        vy: -40 - Math.random() * 110,
        life, max: life,
        size: 1.2 + Math.random() * 2.2,
        css, kind: 2, rot: Math.random() * TAU, vr: 0,
      });
    }
    kick();
  }

  function confetti(x: number, y: number, n: number, palette: string[]) {
    const count = Math.round(n * density);
    for (let i = 0; i < count && parts.length < MAX; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 300 + Math.random() * 560;
      const life = 1.5 + Math.random() * 1.2;
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, max: life,
        size: 5 + Math.random() * 6,
        css: rgbCss(palette[i % palette.length]),
        kind: 1,
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 18,
      });
    }
    kick();
  }

  function shockwave(x: number, y: number, rgb: string, radius: number, dur = 0.6, width = 4) {
    if (rings.length < 30) rings.push({ x, y, r1: radius, t0: now(), dur, rgb, w: width });
    kick();
  }

  function flash(x: number, y: number, rgb: string, radius: number, dur = 0.35) {
    if (flashes.length < 14) flashes.push({ x, y, r: radius, t0: now(), dur, rgb });
    kick();
  }

  function tick(nowMs: number) {
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
    last = nowMs;
    const t = nowMs / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = (t - f.t0) / f.dur;
      if (age >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const r = Math.max(1, f.r * (0.6 + age * 0.6));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,250,235,${0.8 * (1 - age)})`);
      g.addColorStop(0.25, `rgba(${f.rgb},${0.5 * (1 - age)})`);
      g.addColorStop(1, `rgba(${f.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const age = (t - r.t0) / r.dur;
      if (age >= 1) {
        rings.splice(i, 1);
        continue;
      }
      const rad = Math.max(1, r.r1 * (1 - Math.pow(1 - age, 3)));
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - age) * 0.9})`;
      ctx.lineWidth = Math.max(0.5, r.w * (1 - age) + 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - age) * 0.2})`;
      ctx.lineWidth = r.w * 4 * (1 - age) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad * 0.86, 0, TAU);
      ctx.stroke();
    }

    const drag = Math.pow(0.9, dt * 60);
    const dragConf = Math.pow(0.96, dt * 60);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
      const a = Math.min(1, (p.life / p.max) * 1.8);
      if (p.kind === 0) {
        p.vy += 780 * dt;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.css;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
        ctx.stroke();
      } else if (p.kind === 2) {
        p.vx = p.vx * Math.pow(0.97, dt * 60) + Math.sin(t * 3 + p.rot) * 30 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.css;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else {
        p.vy += 520 * dt;
        p.vx = p.vx * dragConf + Math.sin(t * 4 + p.rot) * 24 * dt;
        p.vy *= dragConf;
        p.rot += p.vr * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind !== 1) continue;
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const hw = p.size * 0.5;
      const hh = p.size * 0.3 * Math.abs(Math.cos(p.rot * 1.6)) + 0.6;
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.css;
      ctx.beginPath();
      ctx.moveTo(p.x + c * hw - s * hh, p.y + s * hw + c * hh);
      ctx.lineTo(p.x - c * hw - s * hh, p.y - s * hw + c * hh);
      ctx.lineTo(p.x - c * hw + s * hh, p.y - s * hw - c * hh);
      ctx.lineTo(p.x + c * hw + s * hh, p.y + s * hw - c * hh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (parts.length || rings.length || flashes.length) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
      ctx.clearRect(0, 0, W, H);
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    burst,
    embers,
    confetti,
    shockwave,
    flash,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}

const RbFxCanvas: React.FC<{ engineRef: React.RefObject<RbFxEngine | null> }> = ({ engineRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createRbFxEngine(canvasRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef]);
  return <canvas ref={canvasRef} className="fixed inset-0 z-[45] w-full h-full pointer-events-none" aria-hidden="true" />;
};

/* ============================================================================
 * MECHANICAL ODOMETER — one vertical digit reel per column. Driven directly
 * by the arena's tally ticker so every roll stays in sync with the slot-tick SFX.
 * ==========================================================================*/

interface OdometerProps {
  value: number;
  digits: number;
  rolling: boolean;
  color: string;
  glowRgb: string;
  className?: string;
}

const Odometer: React.FC<OdometerProps> = ({ value, digits, rolling, color, glowRgb, className = '' }) => {
  const safe = Math.max(0, Math.round(value));
  const str = String(safe).padStart(digits, '0');
  const significantFrom = digits - String(safe).length;
  return (
    <span className={`inline-flex items-stretch gap-[3px] leading-none ${className}`} aria-label={String(safe)}>
      <span className="self-center mr-0.5 opacity-70" style={{ color }}>+</span>
      {str.split('').map((ch, i) => {
        const d = Number(ch);
        const dim = i < significantFrom && safe > 0 ? 0.22 : i < significantFrom ? 0.35 : 1;
        return (
          <span
            key={i}
            className="relative inline-block overflow-hidden rounded-[4px] bg-gradient-to-b from-[#05070b] via-[#121722] to-[#05070b] border border-white/10"
            style={{ height: '1.08em', width: '0.72em' }}
          >
            <span
              className={`absolute inset-x-0 top-0 flex flex-col items-center will-change-transform ${rolling ? 'rb-reel-blur' : ''}`}
              style={{
                transform: `translate3d(0, ${-d * 1.08}em, 0)`,
                transition: rolling ? 'transform 70ms linear' : 'transform 280ms cubic-bezier(0.2, 1.5, 0.4, 1)',
                color,
                opacity: dim,
                textShadow: dim === 1 ? `0 0 14px rgba(${glowRgb},0.6)` : 'none',
              }}
            >
              {Array.from({ length: 10 }).map((_, n) => (
                <span key={n} className="flex items-center justify-center" style={{ height: '1.08em' }}>
                  {n}
                </span>
              ))}
            </span>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70" />
            <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/50" />
          </span>
        );
      })}
    </span>
  );
};

// Eased total-score readout with a floating "+N" chip on every gain.
const TallyCounter: React.FC<{ value: number; className?: string; chipClass: string }> = ({ value, className = '', chipClass }) => {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const prevRef = useRef(value);
  const [deltas, setDeltas] = useState<Array<{ id: number; d: number }>>([]);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (nowMs: number) => {
      const p = Math.min(1, (nowMs - t0) / 600);
      const cur = from + (value - from) * (1 - Math.pow(1 - p, 3));
      shownRef.current = cur;
      setShown(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  useEffect(() => {
    const d = value - prevRef.current;
    prevRef.current = value;
    if (d <= 0) return;
    const id = performance.now() + Math.random();
    setDeltas((prev) => [...prev.slice(-1), { id, d }]);
    const timer = window.setTimeout(() => setDeltas((prev) => prev.filter((x) => x.id !== id)), 1300);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span className={`relative inline-block tabular-nums ${className}`}>
      {Math.round(shown).toLocaleString()}
      {deltas.map((x) => (
        <span key={x.id} className={`rb-delta absolute left-1/2 -top-4 font-mono text-[10px] font-black px-1.5 pointer-events-none ${chipClass}`}>
          +{x.d}
        </span>
      ))}
    </span>
  );
};

// Golden laurel wreath that draws itself around the crest monument.
const Laurel: React.FC<{ className?: string; animate?: boolean }> = ({ className, animate = true }) => {
  // Leaves sit on a 46-unit arc around the crest, from the base (110deg) up to the crown (240deg).
  const leaves: Array<{ x: number; y: number; rot: number; key: string; i: number }> = [];
  for (let i = 0; i < 9; i++) {
    const deg = 112 + i * 15.5;
    const a = (deg * Math.PI) / 180;
    const r = i % 2 === 0 ? 49 : 43;
    const lx = 60 + Math.cos(a) * r;
    const ly = 60 + Math.sin(a) * r;
    leaves.push({ x: lx, y: ly, rot: deg, key: `l${i}`, i });
    leaves.push({ x: 120 - lx, y: ly, rot: 180 - deg, key: `r${i}`, i });
  }
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rbLaurelGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff1c1" />
          <stop offset="45%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path
        d="M44.3 103.2 A46 46 0 0 1 37 20.2"
        fill="none"
        stroke="url(#rbLaurelGold)"
        strokeWidth="1.6"
        strokeLinecap="round"
        className={animate ? 'rb-draw' : ''}
      />
      <path
        d="M75.7 103.2 A46 46 0 0 0 83 20.2"
        fill="none"
        stroke="url(#rbLaurelGold)"
        strokeWidth="1.6"
        strokeLinecap="round"
        className={animate ? 'rb-draw' : ''}
      />
      {leaves.map((l) => (
        <ellipse
          key={l.key}
          cx={l.x}
          cy={l.y}
          rx="2.6"
          ry="6.8"
          fill="url(#rbLaurelGold)"
          transform={`rotate(${l.rot} ${l.x} ${l.y})`}
          className={animate ? 'rb-leaf' : ''}
          style={animate ? { animationDelay: `${120 + l.i * 50}ms` } : undefined}
        />
      ))}
    </svg>
  );
};

const RB_CSS = `
  @keyframes rbRise { from { opacity: 0; transform: translate3d(0, 14px, 0); } to { opacity: 1; transform: none; } }
  .rb-rise { animation: rbRise 0.45s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes rbMonument {
    0% { opacity: 0; transform: translate3d(0, -40px, 0) scale(1.25); filter: brightness(2.4); }
    55% { opacity: 1; transform: translate3d(0, 4px, 0) scale(0.97); filter: brightness(1.4); }
    100% { opacity: 1; transform: none; filter: none; }
  }
  .rb-monument { animation: rbMonument 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.1) both; }

  @keyframes rbEngrave {
    0% { opacity: 0; letter-spacing: 0.4em; filter: blur(6px); }
    100% { opacity: 1; letter-spacing: 0.02em; filter: none; }
  }
  .rb-engrave { animation: rbEngrave 0.6s cubic-bezier(0.2, 0.9, 0.25, 1) 0.15s both; }

  @keyframes rbDraw { from { stroke-dasharray: 140; stroke-dashoffset: 140; } to { stroke-dasharray: 140; stroke-dashoffset: 0; } }
  .rb-draw { animation: rbDraw 0.7s cubic-bezier(0.4, 0, 0.2, 1) both; }
  @keyframes rbLeaf { from { opacity: 0; transform-box: fill-box; transform-origin: center; scale: 0.2; } to { opacity: 1; scale: 1; } }
  .rb-leaf { animation: rbLeaf 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both; transform-box: fill-box; transform-origin: center; }

  @keyframes rbSpin { to { transform: rotate(360deg); } }
  .rb-halo { animation: rbSpin 40s linear infinite; will-change: transform; }

  @keyframes rbBeamL { 0%, 100% { transform: rotate(-14deg); } 50% { transform: rotate(-6deg); } }
  @keyframes rbBeamR { 0%, 100% { transform: rotate(14deg); } 50% { transform: rotate(6deg); } }
  .rb-beam-l { animation: rbBeamL 12s ease-in-out infinite; transform-origin: 50% 0%; will-change: transform; }
  .rb-beam-r { animation: rbBeamR 14s ease-in-out infinite; transform-origin: 50% 0%; will-change: transform; }

  @keyframes rbSlam {
    0% { transform: scale(1); }
    18% { transform: scale(1.045); filter: brightness(1.45); }
    40% { transform: scale(0.985); }
    65% { transform: scale(1.01); }
    100% { transform: scale(1); filter: none; }
  }
  .rb-slam { animation: rbSlam 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2); }

  @keyframes rbLockStamp {
    0% { opacity: 0; transform: scale(2) rotate(-8deg); }
    45% { opacity: 1; transform: scale(0.92) rotate(-8deg); }
    100% { opacity: 1; transform: scale(1) rotate(-8deg); }
  }
  .rb-lock-stamp { animation: rbLockStamp 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

  @keyframes rbCrown {
    0% { opacity: 0; transform: translate3d(-50%, -20px, 0) scale(1.8) rotate(-12deg); }
    50% { opacity: 1; transform: translate3d(-50%, 2px, 0) scale(0.92) rotate(3deg); }
    100% { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1) rotate(0deg); }
  }
  .rb-crown { animation: rbCrown 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

  @keyframes rbBorderFlow { to { transform: rotate(360deg); } }
  .rb-electric { position: absolute; inset: -60%; pointer-events: none; animation: rbBorderFlow 3.6s linear infinite;
    background: conic-gradient(from 0deg, transparent 0deg, var(--rb-c) 50deg, transparent 110deg, transparent 180deg, var(--rb-c) 230deg, transparent 290deg); }

  .rb-reel-blur { filter: blur(0.7px); }

  @keyframes rbRowIn { from { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.98); } to { opacity: 1; transform: none; } }
  .rb-row-in { animation: rbRowIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

  @keyframes rbDropIn { from { opacity: 0; transform: translate3d(0, 14px, 0) scaleY(0.94); } to { opacity: 1; transform: none; } }
  .rb-drop-in { animation: rbDropIn 0.28s cubic-bezier(0.34, 1.4, 0.64, 1) both; transform-origin: bottom center; }

  @keyframes rbShake {
    0%, 100% { transform: none; }
    15% { transform: translate3d(-8px, 0, 0); }
    30% { transform: translate3d(7px, 0, 0); }
    45% { transform: translate3d(-5px, 0, 0); }
    60% { transform: translate3d(3px, 0, 0); }
    80% { transform: translate3d(-1px, 0, 0); }
  }
  .rb-shake { animation: rbShake 0.45s cubic-bezier(0.2, 0.8, 0.3, 1); }

  @keyframes rbDelta {
    0% { opacity: 0; transform: translate3d(-50%, 6px, 0) scale(0.8); }
    15% { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1.15); }
    100% { opacity: 0; transform: translate3d(-50%, -22px, 0) scale(1); }
  }
  .rb-delta { animation: rbDelta 1.25s cubic-bezier(0.2, 0.8, 0.3, 1) both; }

  @keyframes rbBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .rb-bar { animation: rbBar 1s cubic-bezier(0.4, 0, 0.2, 1) both; transform-origin: left center; }

  @keyframes rbSheen { 0% { transform: translateX(-160%) skewX(-20deg); } 55%, 100% { transform: translateX(380%) skewX(-20deg); } }
  .rb-sheen { position: relative; overflow: hidden; }
  .rb-sheen::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 30%; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent); animation: rbSheen 3.2s ease-in-out infinite; }

  @keyframes rbHolo { 0% { transform: translate3d(-140%, 0, 0) skewX(-18deg); } 100% { transform: translate3d(260%, 0, 0) skewX(-18deg); } }
  .rb-holo { position: absolute; top: 0; bottom: 0; left: 0; width: 45%; pointer-events: none; mix-blend-mode: screen;
    background: linear-gradient(90deg, transparent, rgba(251,191,36,0.32), rgba(255,255,255,0.35), rgba(255,159,28,0.25), transparent);
    animation: rbHolo 1.2s cubic-bezier(0.4, 0, 0.2, 1) both; }

  @keyframes rbSoftPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  .rb-soft-pulse { animation: rbSoftPulse 2.4s ease-in-out infinite; }

  @keyframes rbCount {
    0% { transform: scale(2.4); opacity: 0; filter: blur(8px); }
    35% { transform: scale(0.95); opacity: 1; filter: none; }
    60% { transform: scale(1.03); }
    100% { transform: scale(1); opacity: 1; }
  }
  .rb-count { animation: rbCount 0.75s cubic-bezier(0.16, 1, 0.3, 1) both; }

  .rb-panel {
    position: relative;
    background: linear-gradient(180deg, rgba(17,21,31,0.94), rgba(8,10,16,0.96));
    border: 1px solid rgba(255,255,255,0.08);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  }
  .rb-panel::before {
    content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--rb-accent, rgba(251,191,36,0.8)), transparent);
  }
  .rb-chamfer { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }
  .rb-press { transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.15s, background-color 0.15s, border-color 0.15s, color 0.15s; }
  .rb-press:active { transform: scale(0.94); transition-duration: 0.08s; }
  .rb-gold-text {
    background: linear-gradient(180deg, #fff7d6 0%, #fbbf24 45%, #c2780b 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }

  @media (prefers-reduced-motion: reduce) {
    .rb-halo, .rb-beam-l, .rb-beam-r, .rb-electric, .rb-sheen::after, .rb-soft-pulse { animation: none !important; }
    .rb-shake, .rb-slam { animation: none !important; }
  }
`;

interface RecordBooksArenaProps {
  config: RecordBooksMatchConfig;
  onExitArena: () => void;
}

type RoundStage =
  | 'club-intro'
  | 'playing'
  | 'both-locked'
  | 'tally-user'
  | 'tally-opponent'
  | 'round-done';

const ROUND_DURATION_SECONDS = 25;

// How long a guest waits for the host's round transition before advancing on its own
const HOST_FALLBACK_MS = 2500;
// After the round clock hits 0, how long to wait for the opponent's (auto-)lock-in
const LOST_LOCK_GRACE_MS = 4000;
// Minimum gap between outgoing "typing" pings (the receiver shows the indicator for 2s)
const TYPING_PING_INTERVAL_MS = 1000;

export const RecordBooksArena: React.FC<RecordBooksArenaProps> = ({
  config,
  onExitArena,
}) => {
  const {
    isMultiplayer,
    isHost,
    opponent,
    myPlayerId,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
    party,
    leaveParty,
  } = useGameSync('record-books');

  const [clubSequence, setClubSequence] = useState<RecordBooksClubRecord[]>(() => {
    if (gameInitData?.sharedData?.clubSequence && gameInitData.sharedData.clubSequence.length > 0) {
      return gameInitData.sharedData.clubSequence;
    }
    return generateClubSequence(config.difficulty, config.totalRounds);
  });

  // Sync authoritative clubSequence from server gameInitData
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.clubSequence && gameInitData.sharedData.clubSequence.length > 0) {
      setClubSequence(gameInitData.sharedData.clubSequence);
    }
  }, [isMultiplayer, gameInitData]);

  const [roundIdx, setRoundIdx] = useState(0);
  const [stage, setStage] = useState<RoundStage>('club-intro');

  // Multiplayer round bookkeeping: the host drives transitions, guests only fall back if it goes
  // quiet, and a lock-in from an opponent who is already a round ahead is held until we get there.
  const roundIdxRef = useRef<number>(0);
  const pendingOpponentLocksRef = useRef<Record<number, RecordBooksSubmissionEval>>({});

  // Synchronized round transition curtain & rematch readiness
  const [roundTransitionCount, setRoundTransitionCount] = useState<number | null>(null);
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);

  // Round timer
  const [secondsLeft, setSecondsLeft] = useState<number>(ROUND_DURATION_SECONDS);

  // Input & Autocomplete state
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isOpponentTyping, setIsOpponentTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);

  // Round evaluations (set as soon as each player locks in) & Arcade Ticker values
  const [userEval, setUserEval] = useState<RecordBooksSubmissionEval | null>(null);
  const [opponentEval, setOpponentEval] = useState<RecordBooksSubmissionEval | null>(null);
  const [userTickerValue, setUserTickerValue] = useState(0);
  const [opponentTickerValue, setOpponentTickerValue] = useState(0);

  // Cumulative scores & round history
  const [userTotalScore, setUserTotalScore] = useState(0);
  const [opponentTotalScore, setOpponentTotalScore] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RecordBooksRoundResult[]>([]);
  const [isMatchOver, setIsMatchOver] = useState(false);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver,
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena,
    arenaKey: 'record-books',
  });

  const inputRef = useRef<HTMLInputElement>(null);
  // Phones: keep the keyboard up across rounds (see useKeyboardKeeper)
  const { hold: holdKeyboard, keeper: keyboardKeeper } = useKeyboardKeeper();

  const currentClub = clubSequence[roundIdx] || clubSequence[0];
  const opponentLabel = isMultiplayer && opponent?.name ? opponent.name : (config.lobbyMode === 'solo' ? 'AI SCOUT' : 'OPPONENT');
  const metricLabel = 'ALL-TIME LEAGUE GOALS';
  const metricUnit = 'LEAGUE GOALS';

  // Instant fuzzy autocomplete suggestions (requires at least 3 letters)
  const suggestions = useMemo(() => {
    if (stage !== 'playing' || userEval !== null || query.trim().length < 3) return [];
    return searchRecordBooksPlayers(query, 7);
  }, [query, stage, userEval]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Stage 1: Brief club reveal transition at start of each round
  useEffect(() => {
    if (stage !== 'club-intro') return;
    const timer = window.setTimeout(() => {
      setStage('playing');
      setSecondsLeft(ROUND_DURATION_SECONDS);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [stage, roundIdx]);

  // Opponent automatic lock-in timer during 'playing' (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'playing' || opponentEval !== null) return;

    const delayMs =
      userEval !== null
        ? 650
        : 4500 + Math.floor(Math.random() * 3000);

    const timer = window.setTimeout(() => {
      const oppPick = generateRecordBooksOpponentSubmission(
        currentClub,
        config.metric,
        userEval?.playerName ?? null
      );
      setOpponentEval(oppPick);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, stage, opponentEval, userEval, currentClub, config.metric]);

  const lastProcessedEventIdRef = useRef<number | string | null>(null);

  // Synchronize incoming multiplayer events from opponent
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    // Process each relayed event exactly once (guards StrictMode double effects & re-deliveries)
    if (lastGameEvent._eventId && lastProcessedEventIdRef.current === lastGameEvent._eventId) return;
    lastProcessedEventIdRef.current = lastGameEvent._eventId ?? null;

    if (lastGameEvent.event === 'player_typing') {
      setIsOpponentTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsOpponentTyping(false), 2000);
    } else if (lastGameEvent.event === 'record_lock_in') {
      const { roundIdx: evRound, evaluation } = lastGameEvent.data || {};
      if (evRound === roundIdx && evaluation) {
        setOpponentEval(evaluation);
        setIsOpponentTyping(false);
      } else if (typeof evRound === 'number' && evRound > roundIdx && evaluation) {
        pendingOpponentLocksRef.current[evRound] = evaluation;
      }
    } else if (lastGameEvent.event === 'next_round_request') {
      const { nextRoundIdx } = lastGameEvent.data || {};
      if (typeof nextRoundIdx === 'number' && nextRoundIdx > roundIdx) {
        handleNextRound(nextRoundIdx);
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handleRematch();
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, roundIdx]);

  // Apply a lock-in that arrived while we were still finishing the previous round
  useEffect(() => {
    if (!isMultiplayer) return;
    const buffered = pendingOpponentLocksRef.current[roundIdx];
    if (!buffered) return;
    delete pendingOpponentLocksRef.current[roundIdx];
    setOpponentEval(buffered);
  }, [isMultiplayer, roundIdx]);

  // Transition from 'playing' to 'both-locked' as soon as BOTH userEval and opponentEval are locked in
  useEffect(() => {
    if (stage === 'playing' && userEval !== null && opponentEval !== null) {
      setStage('both-locked');
    }
  }, [stage, userEval, opponentEval]);

  // Brief pause in 'both-locked' so both players see each other's locked-in player names before scores roll up
  useEffect(() => {
    if (stage !== 'both-locked') return;
    soundFX.playLockIn();
    const timer = window.setTimeout(() => {
      setStage('tally-user');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // Stage 2: Active round countdown timer while in 'playing'
  useEffect(() => {
    if (stage !== 'playing') return;
    if (secondsLeft <= 0) {
      if (userEval === null) {
        handleLockIn('', true);
      }
      if (isMultiplayer && opponentEval === null) {
        // Their client auto-passes at 0s too; if that never lands, don't freeze the round
        const lostLockTimer = window.setTimeout(() => {
          setOpponentEval((prev) =>
            prev ?? { skipped: true, playerName: 'TIMED OUT', statCount: 0, allTimeRank: null }
          );
        }, LOST_LOCK_GRACE_MS);
        return () => window.clearTimeout(lostLockTimer);
      }
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
  }, [stage, secondsLeft, userEval, opponentEval, isMultiplayer]);

  // Stage 3: Staggered Arcade Number Ticker for Player 1 -> Player 2
  useEffect(() => {
    if (stage !== 'tally-user' || !userEval) return;

    const target = userEval.statCount;
    const duration = target === 0 ? 320 : Math.min(1150, Math.max(550, target * 2.4));
    const startTime = performance.now();
    let rafId = 0;
    let lastTickVal = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(target * eased);
      setUserTickerValue(currentVal);

      if (currentVal !== lastTickVal && currentVal > 0 && currentVal % 3 === 0) {
        lastTickVal = currentVal;
        soundFX.playSlotTick();
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setUserTickerValue(target);
        setUserTotalScore((prev) => prev + target);
        if (target > 0) {
          soundFX.playSuccess();
        } else {
          soundFX.playVoltBuzz();
        }
        window.setTimeout(() => {
          setStage('tally-opponent');
        }, 320);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, userEval]);

  useEffect(() => {
    if (stage !== 'tally-opponent' || !opponentEval || !userEval) return;

    const target = opponentEval.statCount;
    const duration = target === 0 ? 320 : Math.min(1150, Math.max(550, target * 2.4));
    const startTime = performance.now();
    let rafId = 0;
    let lastTickVal = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(target * eased);
      setOpponentTickerValue(currentVal);

      if (currentVal !== lastTickVal && currentVal > 0 && currentVal % 3 === 0) {
        lastTickVal = currentVal;
        soundFX.playSlotTick();
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setOpponentTickerValue(target);
        setOpponentTotalScore((prev) => prev + target);
        soundFX.playHammer();
        setRoundHistory((prev) => [
          ...prev,
          {
            roundNumber: roundIdx + 1,
            club: currentClub,
            metric: config.metric,
            userEval,
            opponentEval,
          },
        ]);
        window.setTimeout(() => {
          setStage('round-done');
        }, 240);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, opponentEval, userEval, roundIdx, currentClub, config.metric]);

  const handleLockIn = (submittedText: string, isSkip = false) => {
    if (stage !== 'playing' || userEval !== null) return;

    const trimmed = isSkip ? '' : submittedText.trim();

    // Prevent locking in the same player the opponent already locked in
    if (
      !isSkip &&
      trimmed &&
      opponentEval &&
      isSameRecordBooksPlayer(trimmed, opponentEval.playerName, currentClub, config.metric)
    ) {
      soundFX.playVoltBuzz();
      setDuplicateWarning(
        `${opponentEval.playerName} is already locked in by ${opponentLabel}! Choose a different player.`
      );
      return;
    }

    setDuplicateWarning(null);

    const uEval: RecordBooksSubmissionEval =
      isSkip || !trimmed
        ? {
            skipped: true,
            playerName: 'PASSED',
            statCount: 0,
            allTimeRank: null,
          }
        : evaluateRecordBooksSubmission(trimmed, currentClub, config.metric);

    if (isSkip || !trimmed) {
      soundFX.playClick(450);
    } else {
      soundFX.playLockIn();
    }

    holdKeyboard();
    setUserEval(uEval);
    setUserTickerValue(0);
    setShowDropdown(false);

    if (isMultiplayer) {
      sendAction('record_lock_in', {
        roundIdx,
        evaluation: uEval,
      });
    }
  };

  const handleNextRound = (targetRoundIdx?: number) => {
    if (isMultiplayer && targetRoundIdx === undefined && !isHost) {
      return; // Guests cannot advance round unilaterally
    }
    const nextIdx = targetRoundIdx !== undefined ? targetRoundIdx : roundIdx + 1;
    // Idempotent: a late host request or a guest fallback for a round we already reached is a no-op
    if (isMultiplayer && targetRoundIdx !== undefined && targetRoundIdx <= roundIdxRef.current) return;
    if (isMultiplayer && targetRoundIdx === undefined) {
      sendAction('next_round_request', { nextRoundIdx: nextIdx });
    }
    roundIdxRef.current = nextIdx;
    if (nextIdx >= config.totalRounds) {
      soundFX.playVictoryFanfare();
      setIsMatchOver(true);
      return;
    }

    soundFX.playCardFlip();

    setRoundIdx(nextIdx);
    setQuery('');
    setDuplicateWarning(null);
    setUserEval(null);
    setOpponentEval(null);
    setUserTickerValue(0);
    setOpponentTickerValue(0);
    setSecondsLeft(ROUND_DURATION_SECONDS);
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setStage('club-intro');
    }, 1000);
  };

  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number>(4);

  // Multiplayer auto-advance timer for round-done screen (4s auto transition)
  useEffect(() => {
    if (stage !== 'round-done' || !isMultiplayer) return;

    // The host advances; a guest only advances itself if the host's request never shows up
    let left = 4;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    setAutoAdvanceSeconds(left);
    const interval = setInterval(() => {
      left -= 1;
      setAutoAdvanceSeconds(Math.max(0, left));
      if (left > 0) return;
      clearInterval(interval);
      if (isHost) {
        handleNextRound();
      } else {
        fallbackTimer = setTimeout(() => handleNextRound(roundIdx + 1), HOST_FALLBACK_MS);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [stage, isMultiplayer, isHost, roundIdx]);

  // Keyboard shortcut: Press ENTER on round-done screen to immediately proceed to NEXT CLUB / Final Scoreboard (Solo mode only)
  useEffect(() => {
    if (stage !== 'round-done' || isMultiplayer) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleNextRound();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [stage, roundIdx, config.totalRounds, isMultiplayer]);

  const handleRematch = () => {
    soundFX.playClick(900);
    roundIdxRef.current = 0;
    pendingOpponentLocksRef.current = {};
    // Multiplayer rematches replay the server's freshly seeded club sequence
    const seededSequence = isMultiplayer ? gameInitData?.sharedData?.clubSequence : undefined;
    setClubSequence(
      seededSequence && seededSequence.length > 0
        ? seededSequence
        : generateClubSequence(config.difficulty, config.totalRounds)
    );
    setRoundIdx(0);
    setQuery('');
    setDuplicateWarning(null);
    setUserEval(null);
    setOpponentEval(null);
    setUserTickerValue(0);
    setOpponentTickerValue(0);
    setUserTotalScore(0);
    setOpponentTotalScore(0);
    setRoundHistory([]);
    setIsMatchOver(false);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setSecondsLeft(ROUND_DURATION_SECONDS);
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setStage('club-intro');
    }, 1000);
  };

  const handleRequestOrExecuteRematch = () => {
    if (isMultiplayer) {
      if (!isHost) {
        sendAction('player_rematch_ready', {});
        setHasRequestedRematch(true);
        soundFX.playClick(900);
        return;
      }
      // Host asks the server to re-seed; everyone (host included) restarts on its match_restart
      sendAction('match_restart', {});
      soundFX.playClick(900);
      return;
    }
    handleRematch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (stage !== 'playing' || userEval !== null) return;

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
        setQuery(chosen.name);
        handleLockIn(chosen.name, false);
      } else if (query.trim().length > 0) {
        handleLockIn(query, false);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  /* ======================================================================
   * VISUAL CHOREOGRAPHY LAYER
   * Presentation-only refs, state & effects. They react to the round state
   * above and never feed back into it.
   * ====================================================================*/
  const fxRef = useRef<RbFxEngine | null>(null);
  const crestRef = useRef<HTMLDivElement>(null);
  const userCardRef = useRef<HTMLDivElement>(null);
  const oppCardRef = useRef<HTMLDivElement>(null);
  const userTickerRef = useRef<HTMLDivElement>(null);
  const oppTickerRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fxTimersRef = useRef<number[]>([]);

  const scheduleFx = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    fxTimersRef.current.push(id);
  };

  useEffect(() => {
    const timers = fxTimersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Club monument unveiled: gold flash + rising embers from the plinth.
  useEffect(() => {
    if (stage !== 'club-intro') return;
    scheduleFx(() => {
      const fx = fxRef.current;
      const c = centerOf(crestRef.current);
      if (!fx || !c) return;
      fx.embers(c.x, c.y + c.h * 0.45, GOLD_RGB, 26, c.w * 1.4);
    }, 260);
  }, [stage, roundIdx]);

  // Your lock-in: instant impact on your faceoff card.
  useEffect(() => {
    if (!userEval) return;
    restartClass(userCardRef.current, 'rb-slam');
    const c = centerOf(userCardRef.current);
    if (!c || !fxRef.current) return;
    const rgb = userEval.skipped ? ROSE_RGB : BLAZE_RGB;
    if (!userEval.skipped) fxRef.current.burst(c.x, c.y, rgb, 22, 380);
  }, [userEval]);

  // Opponent lock-in.
  useEffect(() => {
    if (!opponentEval) return;
    restartClass(oppCardRef.current, 'rb-slam');
  }, [opponentEval]);

  // Tally slams: your ticker lands as the stage hands over to the opponent tally,
  // theirs lands as the round resolves, then the round leader is crowned.
  useEffect(() => {
    const fx = fxRef.current;
    if (stage === 'tally-opponent' && userEval) {
      restartClass(userCardRef.current, 'rb-slam');
      const c = centerOf(userTickerRef.current);
      if (fx && c) {
        if (userEval.statCount > 0) {
          fx.burst(c.x, c.y, GOLD_RGB, 30 + Math.min(40, userEval.statCount / 6), 520);
          fx.embers(c.x, c.y, BLAZE_RGB, 12, 80);
        }
      }
    }
    if (stage === 'round-done' && opponentEval && userEval) {
      restartClass(oppCardRef.current, 'rb-slam');
      const c = centerOf(oppTickerRef.current);
      if (fx && c) {
        if (opponentEval.statCount > 0) fx.burst(c.x, c.y, SKY_RGB, 26, 480);
      }
      scheduleFx(() => {
        const f = fxRef.current;
        if (!f) return;
        if (userEval.statCount > opponentEval.statCount) {
          const u = centerOf(userCardRef.current);
          if (u) {
            f.confetti(u.x, u.y - u.h * 0.3, 90, [GOLD_RGB, BLAZE_RGB, '255,255,255', '255,236,179']);
          }
        } else if (opponentEval.statCount > userEval.statCount) {
          const o = centerOf(oppCardRef.current);
          if (o) {
            f.burst(o.x, o.y - o.h * 0.5, SKY_RGB, 26, 400);
          }
        }
      }, 320);
    }
  }, [stage]);

  // Duplicate pick rejection: console shake.
  useEffect(() => {
    if (!duplicateWarning) return;
    restartClass(consoleRef.current, 'rb-shake');
  }, [duplicateWarning]);

  // Full-time confetti for a victory.
  useEffect(() => {
    if (!isMatchOver || userTotalScore <= opponentTotalScore) return;
    scheduleFx(() => {
      const fx = fxRef.current;
      if (!fx) return;
      const x = window.innerWidth / 2;
      fx.confetti(x, window.innerHeight * 0.28, 190, [GOLD_RGB, BLAZE_RGB, '255,255,255', '255,236,179']);
    }, 250);
  }, [isMatchOver]);

  // Keep the keyboard-selected suggestion in view.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row="${selectedIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, suggestions]);

  const metricHeadline = 'ALL-TIME TOP LEAGUE SCORERS';

  // Match End & Summary Screen
  if (isMatchOver) {
    const userWon = userTotalScore > opponentTotalScore;
    const isDraw = userTotalScore === opponentTotalScore;
    const verdictColor = userWon ? GOLD : isDraw ? SKY : '#fb7185';

    return (
      <div className="min-h-screen min-h-[calc(100dvh/var(--zoom,1))] w-full bg-[#06080d] text-white flex flex-col items-center justify-center p-3 sm:p-6 relative overflow-x-hidden overflow-y-auto">
        <style>{RB_CSS}</style>
        <VaultBackdrop />
        <RbFxCanvas engineRef={fxRef} />

        <div
          className="rb-panel rb-rise relative z-10 max-w-3xl w-full p-5 sm:p-7 my-4"
          style={{ ['--rb-accent' as string]: `${verdictColor}cc` } as React.CSSProperties}
        >
          {/* Header Verdict */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative w-24 h-24 mb-2 flex items-center justify-center">
              <Laurel className="absolute inset-0 w-full h-full" />
              <div className="absolute inset-[22%] rounded-full" style={{ background: `radial-gradient(circle, ${verdictColor}55, transparent 70%)` }} />
              <Trophy className="relative w-9 h-9" style={{ color: verdictColor, filter: `drop-shadow(0 0 12px ${verdictColor})` }} />
            </div>

            <div className="rb-chamfer inline-flex items-center gap-2 px-3 py-1 bg-white/[0.04] border border-[#fbbf24]/30 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#ff9f1c]">
                LEAGUE GOALS TALLY COMPLETE •{' '}
                {config.difficultyCurve === 'rising' ? 'RISING DIFFICULTY' : `${config.difficulty.toUpperCase()} TIER`}
              </span>
            </div>

            <h1
              className={`rb-count font-athletic italic text-5xl sm:text-6xl font-black uppercase tracking-wide leading-[0.9] ${userWon ? 'rb-gold-text' : ''}`}
              style={userWon ? { filter: 'drop-shadow(0 0 18px rgba(251,191,36,0.45))' } : { color: verdictColor }}
            >
              {userWon
                ? 'RECORD BOOKS DOMINATED'
                : isDraw
                ? 'DEAD HEAT TALLY'
                : `${opponentLabel} TAKES THE CROWN`}
            </h1>
          </div>

          {/* Head-to-Head Total Tally Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
            <div
              className={`rb-chamfer relative p-4 border text-center overflow-hidden ${
                userWon ? 'bg-[#ff9f1c]/10 border-[#ff9f1c]/45' : 'bg-white/[0.03] border-white/10'
              }`}
            >
              {userWon && <Crown className="absolute top-2 right-2 w-4 h-4 text-[#fbbf24]" />}
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block">
                YOUR TOTAL {metricUnit}
              </span>
              <TallyCounter
                value={userTotalScore}
                className="font-athletic text-5xl sm:text-6xl font-black text-[#ff9f1c] mt-1 leading-none"
                chipClass="bg-[#ff9f1c] text-black"
              />
            </div>

            <div
              className={`rb-chamfer relative p-4 border text-center overflow-hidden ${
                !userWon && !isDraw ? 'bg-sky-400/10 border-sky-400/45' : 'bg-white/[0.03] border-white/10'
              }`}
            >
              {!userWon && !isDraw && <Crown className="absolute top-2 right-2 w-4 h-4 text-sky-300" />}
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block truncate">
                {opponentLabel} TOTAL {metricUnit}
              </span>
              <TallyCounter
                value={opponentTotalScore}
                className="font-athletic text-5xl sm:text-6xl font-black text-sky-400 mt-1 leading-none"
                chipClass="bg-sky-400 text-black"
              />
            </div>
          </div>

          {/* Round-by-Round Breakdown */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 mb-6">
            {roundHistory.map((r, i) => {
              const userSkipped = r.userEval.skipped;
              const userBeatOpp = r.userEval.statCount > r.opponentEval.statCount;
              const oppBeatUser = r.opponentEval.statCount > r.userEval.statCount;

              return (
                <div
                  key={r.roundNumber}
                  className={`rb-rise rb-chamfer relative flex items-center justify-between gap-2 px-3.5 py-2.5 border ${
                    userSkipped ? 'bg-rose-500/[0.07] border-rose-500/35' : 'bg-white/[0.025] border-white/5'
                  }`}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: userSkipped ? '#f43f5e' : userBeatOpp ? BLAZE : oppBeatUser ? SKY : 'rgba(255,255,255,0.15)' }}
                  />
                  {/* Left: Round & Club */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`text-[10px] font-mono font-bold w-6 ${userSkipped ? 'text-rose-400' : 'text-neutral-500'}`}>
                      R{r.roundNumber}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center p-1 shrink-0">
                      <img src={r.club.badgeUrl} alt={r.club.name} className="w-full h-full object-contain" />
                    </div>
                    <span className="hidden sm:block text-xs font-athletic italic font-black uppercase tracking-wide text-white truncate">
                      {r.club.name}
                    </span>
                  </div>

                  {/* Right: User vs Opponent choices & stats */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {userSkipped ? (
                      <div className="px-2.5 py-0.5 bg-rose-500/20 border border-rose-500/50 text-[10px] font-mono font-black uppercase tracking-widest text-rose-300">
                        SKIPPED
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-200 max-w-[90px] sm:max-w-[125px] truncate">
                          {r.userEval.playerName}
                        </span>
                        <span
                          className={`text-xs font-mono font-black px-2 py-0.5 border tabular-nums ${
                            userBeatOpp
                              ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] border-[#ff9f1c]/40'
                              : r.userEval.statCount > 0
                              ? 'bg-white/[0.06] text-white border-white/15'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {r.userEval.statCount}
                        </span>
                      </div>
                    )}

                    <span className="text-[10px] font-athletic italic font-black text-neutral-600">VS</span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-sky-200 max-w-[90px] sm:max-w-[125px] truncate">
                        {r.opponentEval.playerName}
                      </span>
                      <span
                        className={`text-xs font-mono font-black px-2 py-0.5 border tabular-nums ${
                          oppBeatUser ? 'bg-sky-400/15 text-sky-300 border-sky-400/40' : 'bg-white/[0.05] text-neutral-300 border-white/10'
                        }`}
                      >
                        {r.opponentEval.statCount}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rematch / Exit Actions */}
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={() => {
                if (isMultiplayer) sendGameLeave();
                if (party.roomCode?.startsWith('match_')) {
                  leaveParty();
                }
                handleCleanExit();
              }}
              className="rb-press rb-chamfer flex-1 py-3.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-sm font-athletic italic font-black uppercase tracking-widest text-neutral-300 cursor-pointer"
            >
              RETURN TO HUB
            </button>
            <button
              type="button"
              disabled={isMultiplayer && !isHost && hasRequestedRematch}
              onClick={handleRequestOrExecuteRematch}
              className={`rb-press rb-chamfer flex-1 py-3.5 font-athletic italic font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 ${
                isMultiplayer && !isHost && hasRequestedRematch
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                  : isMultiplayer && isHost && isOpponentRematchReady
                  ? 'rb-sheen bg-gradient-to-b from-[#ffc46b] via-[#ff9f1c] to-[#d97706] text-black shadow-[0_0_25px_rgba(255,159,28,0.5)] cursor-pointer'
                  : 'rb-sheen bg-gradient-to-b from-[#ffc46b] via-[#ff9f1c] to-[#d97706] text-black shadow-[0_10px_28px_rgba(255,159,28,0.3)] cursor-pointer'
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
    );
  }

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#06080d] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="pointer-events-none absolute w-[520px] h-[520px] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #ff9f1c 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-[#ff9f1c]/10 border border-[#ff9f1c]/40 flex items-center justify-center text-[#ff9f1c] shadow-[0_0_30px_rgba(255,159,28,0.3)]">
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
            <div className="h-full bg-[#ff9f1c] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const isLowTime = stage === 'playing' && secondsLeft <= 8;
  const showUserScore =
    stage === 'tally-user' || stage === 'tally-opponent' || stage === 'round-done';
  const showOpponentScore = stage === 'tally-opponent' || stage === 'round-done';

  const roundDone = stage === 'round-done' && userEval && opponentEval;
  const userLeads = Boolean(roundDone && userEval && opponentEval && userEval.statCount > opponentEval.statCount);
  const oppLeads = Boolean(roundDone && userEval && opponentEval && opponentEval.statCount > userEval.statCount);
  const roundTied = Boolean(roundDone && userEval && opponentEval && userEval.statCount === opponentEval.statCount);
  const userDigits = Math.max(2, String(userEval?.statCount ?? 0).length);
  const oppDigits = Math.max(2, String(opponentEval?.statCount ?? 0).length);
  const timerFrac = Math.max(0, Math.min(1, secondsLeft / ROUND_DURATION_SECONDS));
  const TIMER_CIRC = 2 * Math.PI * 16;

  return (
    <div className="min-h-screen min-h-[calc(100dvh/var(--zoom,1))] max-md:min-h-0 max-md:h-[var(--app-h,calc(100dvh/var(--zoom,1)))] w-full bg-[#06080d] text-white flex flex-col relative overflow-x-hidden overflow-y-auto md:overflow-hidden select-none">
      {keyboardKeeper}
      <style>{RB_CSS}</style>
      <VaultBackdrop />
      <RbFxCanvas engineRef={fxRef} />

      {/* Synchronized Round Transition Curtain */}
      {roundTransitionCount !== null && (
        <div className="fixed inset-0 z-50 bg-[#06080d]/95 flex flex-col items-center justify-center">
          <div className="text-center space-y-3 px-6">
            <span className="font-mono text-[11px] tracking-[0.4em] text-[#ff9f1c] uppercase block">
              ROUND {roundIdx + 1} OF {config.totalRounds}
            </span>
            <h2 className="rb-count font-athletic italic font-black text-5xl md:text-7xl uppercase tracking-wide leading-none rb-gold-text">
              REVEALING CLUB...
            </h2>
            <div className="w-48 h-[3px] bg-white/10 mx-auto overflow-hidden">
              <div className="rb-bar h-full bg-gradient-to-r from-[#ff9f1c] to-[#fbbf24]" />
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 min-h-0 w-full max-w-5xl mx-auto flex flex-col gap-3 p-2.5 pb-16 sm:p-4 sm:pb-16 md:p-5">
        {/* TOP BROADCAST HUD */}
        <header className="rb-panel w-full flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                setShowForfeitModal(true);
              }}
              className="rb-press rb-chamfer min-h-[42px] min-w-[42px] w-[42px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white cursor-pointer"
              title="Exit to Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0 leading-none overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-athletic italic text-[15px] sm:text-xl font-black uppercase tracking-wide whitespace-nowrap">
                  <span className="hidden min-[400px]:inline">THE </span>RECORD <span className="rb-gold-text">BOOKS</span>
                </span>
                <span className="hidden sm:inline px-1.5 py-[2px] text-[9px] font-mono font-bold uppercase tracking-widest bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30">
                  LEAGUE GOALS
                </span>
                <span className="hidden md:inline px-1.5 py-[2px] text-[9px] font-mono font-bold uppercase tracking-widest bg-white/[0.05] text-neutral-300 border border-white/10">
                  {config.difficultyCurve === 'rising' ? currentClub.difficulty : config.difficulty}
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-mono text-neutral-400 mt-1 truncate tracking-wider">
                ROUND {roundIdx + 1} OF {config.totalRounds}
                {config.lobbyMode !== 'solo' ? ` • ROOM ${config.roomCode}` : ' • VS AI SCOUT'}
              </p>
            </div>
          </div>

          {/* Center / Right Live Score & Timer Strip */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Timer Ring */}
            <div
              className={`relative flex items-center gap-1.5 p-1 sm:pr-2.5 rb-chamfer border ${
                stage !== 'playing'
                  ? 'bg-white/[0.03] border-white/10 text-neutral-400'
                  : isLowTime
                  ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
                  : 'bg-[#ff9f1c]/10 border-[#ff9f1c]/35 text-[#ff9f1c]'
              }`}
            >
              <span className="relative w-8 h-8 shrink-0">
                <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill="none"
                    stroke={stage !== 'playing' ? 'rgba(148,163,184,0.5)' : isLowTime ? '#f43f5e' : BLAZE}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={TIMER_CIRC}
                    strokeDashoffset={stage === 'playing' ? TIMER_CIRC * (1 - timerFrac) : 0}
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                  />
                </svg>
                <Clock className={`absolute inset-0 m-auto w-3.5 h-3.5 ${stage === 'playing' ? 'hidden sm:block' : ''}`} />
                {stage === 'playing' && (
                  <span className="sm:hidden absolute inset-0 flex items-center justify-center font-athletic font-black text-[13px] tabular-nums">
                    {secondsLeft}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline text-sm font-athletic font-black tracking-wider tabular-nums">
                {stage === 'playing' ? `${secondsLeft}s` : 'LOCKED'}
              </span>
            </div>

            {/* Scoreboard */}
            <div className="rb-chamfer flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3.5 py-1 bg-black/55 border border-white/10">
              <div className="text-right leading-none">
                <span className="text-[8px] sm:text-[9px] font-mono uppercase tracking-wider text-neutral-400 block">YOU</span>
                <TallyCounter
                  value={userTotalScore}
                  className="font-athletic text-xl font-black text-[#ff9f1c] leading-none"
                  chipClass="bg-[#ff9f1c] text-black"
                />
              </div>
              <span className="text-xs font-athletic italic font-black text-neutral-600">VS</span>
              <div className="text-left leading-none">
                <span className="text-[8px] sm:text-[9px] font-mono uppercase tracking-wider text-neutral-400 block truncate max-w-[70px] sm:max-w-[110px]">
                  {opponentLabel}
                </span>
                <TallyCounter
                  value={opponentTotalScore}
                  className="font-athletic text-xl font-black text-sky-400 leading-none"
                  chipClass="bg-sky-400 text-black"
                />
              </div>
            </div>
          </div>
        </header>

        {/* MAIN STAGE */}
        <main className="relative w-full max-w-4xl mx-auto my-auto flex flex-col gap-3">
          {/* Stage 1: Club Intro Transition */}
          {stage === 'club-intro' ? (
            <div className="rb-panel relative flex flex-col items-center justify-center text-center min-h-[380px] p-8 overflow-hidden">
              <MonumentLights />
              <div className="relative rb-chamfer inline-flex items-center gap-2 px-3.5 py-1 bg-[#ff9f1c]/10 border border-[#ff9f1c]/35 mb-5">
                <BookOpen className="w-3.5 h-3.5 text-[#ff9f1c]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-[#ff9f1c]">
                  ROUND {roundIdx + 1} CLUB REVEAL
                </span>
              </div>

              <div ref={crestRef} className="rb-monument relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center">
                <Laurel className="absolute inset-0 w-full h-full" />
                <div className="rb-halo absolute inset-[16%] rounded-full border border-dashed border-[#fbbf24]/25" />
                <div className="absolute inset-[22%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.28), transparent 70%)' }} />
                <img
                  src={currentClub.badgeUrl}
                  alt={currentClub.name}
                  className="relative w-[46%] h-[46%] object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)]"
                />
              </div>

              <h2 className="rb-engrave relative font-athletic italic text-4xl sm:text-6xl font-black uppercase tracking-wide text-white mt-3 leading-none">
                {currentClub.name}
              </h2>
              <p className="relative text-[11px] font-mono uppercase tracking-[0.25em] text-neutral-400 mt-3">
                TARGET METRIC: <span className="text-[#fbbf24]">{metricLabel}</span>
              </p>
            </div>
          ) : (
            <>
              {/* CLUB MONUMENT BANNER */}
              <div className="rb-panel relative px-4 sm:px-6 py-4 sm:py-5 overflow-hidden">
                <MonumentLights compact />
                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-5">
                  <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                    <div ref={crestRef} className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 flex items-center justify-center">
                      <Laurel className="absolute inset-0 w-full h-full" animate={false} />
                      <div className="rb-halo absolute inset-[18%] rounded-full border border-dashed border-[#fbbf24]/20" />
                      <div className="absolute inset-[22%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.22), transparent 70%)' }} />
                      <img
                        src={currentClub.badgeUrl}
                        alt={currentClub.name}
                        className="relative w-[48%] h-[48%] object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.7)]"
                      />
                    </div>

                    <div className="text-left min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="rb-chamfer inline-flex items-center gap-1.5 px-2 py-[3px] bg-[#ff9f1c]/10 border border-[#ff9f1c]/35">
                          <Flame className="w-3 h-3 text-[#ff9f1c]" />
                          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#ff9f1c]">
                            {metricLabel}
                          </span>
                        </span>
                        <span className="hidden sm:inline px-2 py-[3px] border border-[#fbbf24]/25 text-[9px] font-mono font-bold uppercase tracking-[0.18em] text-[#fbbf24]/80 -rotate-2">
                          {config.difficultyCurve === 'rising' ? currentClub.difficulty : config.difficulty} ARCHIVE
                        </span>
                      </div>

                      <span className="block font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-neutral-500">{metricHeadline}</span>
                      <h1 className="font-athletic italic text-3xl sm:text-5xl font-black uppercase tracking-wide text-white leading-[0.95] truncate">
                        {currentClub.name}
                      </h1>
                      <p className="hidden sm:block text-xs text-neutral-400 mt-1">
                        Name a player with a high <span className="text-white font-semibold">league goal</span> tally
                        for {currentClub.name}.
                      </p>
                    </div>
                  </div>

                  {/* Round Progress */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                      CLUB {roundIdx + 1} OF {config.totalRounds}
                    </span>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: config.totalRounds }).map((_, i) => {
                        const h = roundHistory[i];
                        const won = h && h.userEval.statCount > h.opponentEval.statCount;
                        const lost = h && h.opponentEval.statCount > h.userEval.statCount;
                        return (
                          <span
                            key={i}
                            className={`h-1.5 skew-x-[-20deg] transition-all duration-300 ${i === roundIdx ? 'w-6' : 'w-2.5'}`}
                            style={{
                              background: h
                                ? won
                                  ? BLAZE
                                  : lost
                                  ? SKY
                                  : 'rgba(255,255,255,0.45)'
                                : i === roundIdx
                                ? GOLD
                                : 'rgba(255,255,255,0.12)',
                              boxShadow: i === roundIdx ? '0 0 10px rgba(251,191,36,0.7)' : 'none',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* HEAD-TO-HEAD ARCHIVAL FACEOFF CARDS */}
              <div className="relative grid grid-cols-2 gap-2.5 sm:gap-4">
                {/* VS emblem */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rotate-45 bg-[#06080d] border border-[#fbbf24]/40 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.8)] pointer-events-none">
                  <span className="-rotate-45 font-athletic italic font-black text-xs sm:text-sm rb-gold-text">VS</span>
                </div>

                {/* LEFT SIDE: YOU */}
                <div ref={userCardRef} className="relative">
                  {userLeads && (
                    <div className="rb-crown absolute left-1/2 -top-3 z-30 whitespace-nowrap flex items-center gap-1 px-2 py-[3px] bg-gradient-to-b from-[#ffe08a] to-[#f59e0b] text-black font-mono text-[9px] font-black tracking-widest shadow-[0_0_18px_rgba(251,191,36,0.7)]">
                      <Crown className="w-3 h-3" /> ROUND LEAD
                    </div>
                  )}
                  {roundTied && (
                    <div className="rb-crown absolute left-1/2 -top-3 z-30 whitespace-nowrap px-2 py-[3px] bg-white/90 text-black font-mono text-[9px] font-black tracking-widest">
                      TIED
                    </div>
                  )}
                  <div
                    className="rb-chamfer relative h-full p-[1px] overflow-hidden"
                    style={{
                      background: userLeads
                        ? 'transparent'
                        : userEval === null
                        ? 'rgba(255,255,255,0.08)'
                        : userEval.skipped
                        ? 'rgba(244,63,94,0.45)'
                        : 'rgba(255,159,28,0.45)',
                      ['--rb-c' as string]: 'rgba(251,191,36,0.95)',
                    } as React.CSSProperties}
                  >
                    {userLeads && <div className="rb-electric" />}
                    <div
                      className="rb-chamfer relative h-full p-3 sm:p-4 overflow-hidden"
                      style={{
                        background:
                          userEval === null
                            ? 'linear-gradient(180deg, rgba(17,21,31,0.96), rgba(8,10,16,0.96))'
                            : userEval.skipped
                            ? 'linear-gradient(180deg, rgba(60,10,22,0.92), rgba(10,8,12,0.96))'
                            : 'linear-gradient(180deg, rgba(60,34,6,0.9), rgba(10,9,8,0.96))',
                      }}
                    >
                      {showUserScore && (userEval?.statCount ?? 0) > 0 && <div className="rb-holo" />}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: BLAZE, boxShadow: `0 0 10px ${BLAZE}` }} />

                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 truncate">
                          YOUR SELECTION
                        </span>

                        {userEval === null ? (
                          <span className="rb-soft-pulse px-1.5 py-0.5 bg-white/[0.05] border border-white/10 text-[8px] sm:text-[9px] font-mono uppercase tracking-widest text-neutral-400 shrink-0">
                            SELECTING...
                          </span>
                        ) : userEval.skipped ? (
                          <span className="px-1.5 py-0.5 bg-rose-500/25 border border-rose-500/50 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-widest text-rose-300 shrink-0">
                            SKIPPED
                          </span>
                        ) : showUserScore && userEval.allTimeRank ? (
                          <span className="px-1.5 py-0.5 bg-[#fbbf24]/20 border border-[#fbbf24]/45 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-widest text-[#fbbf24] shrink-0">
                            #{userEval.allTimeRank} ALL-TIME
                          </span>
                        ) : showUserScore ? (
                          <span className="px-1.5 py-0.5 bg-white/[0.06] border border-white/10 text-[8px] sm:text-[9px] font-mono uppercase tracking-widest text-neutral-400 shrink-0">
                            UNRANKED (0)
                          </span>
                        ) : (
                          <span className="rb-lock-stamp inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#ff9f1c]/20 border border-[#ff9f1c]/50 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-widest text-[#ff9f1c] shrink-0">
                            <Lock className="w-2.5 h-2.5" />
                            LOCKED IN
                          </span>
                        )}
                      </div>

                      <p
                        className={`font-athletic italic text-lg sm:text-2xl font-black uppercase tracking-wide truncate leading-tight ${
                          userEval === null ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {userEval === null ? 'AWAITING YOUR PICK...' : userEval.skipped ? 'PASSED' : userEval.playerName}
                      </p>
                      <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-0.5 truncate">
                        {currentClub.name} • {metricUnit}
                      </p>

                      {/* Mechanical tally odometer */}
                      <div ref={userTickerRef} className="mt-2 sm:mt-3 h-11 sm:h-14 flex items-center">
                        {showUserScore ? (
                          <Odometer
                            value={userTickerValue}
                            digits={userDigits}
                            rolling={stage === 'tally-user'}
                            color={(userEval?.statCount ?? 0) > 0 ? BLAZE : '#737373'}
                            glowRgb={(userEval?.statCount ?? 0) > 0 ? BLAZE_RGB : '115,115,115'}
                            className="font-athletic font-black text-[34px] sm:text-[46px]"
                          />
                        ) : (
                          <span className="font-mono text-[10px] tracking-[0.3em] text-neutral-600">
                            {userEval === null ? 'TALLY SEALED' : 'AWAITING TALLY'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT SIDE: OPPONENT / AI SCOUT */}
                <div ref={oppCardRef} className="relative">
                  {oppLeads && (
                    <div className="rb-crown absolute left-1/2 -top-3 z-30 whitespace-nowrap flex items-center gap-1 px-2 py-[3px] bg-gradient-to-b from-[#bae6fd] to-[#38bdf8] text-black font-mono text-[9px] font-black tracking-widest shadow-[0_0_18px_rgba(56,189,248,0.7)]">
                      <Crown className="w-3 h-3" /> ROUND LEAD
                    </div>
                  )}
                  {roundTied && (
                    <div className="rb-crown absolute left-1/2 -top-3 z-30 whitespace-nowrap px-2 py-[3px] bg-white/90 text-black font-mono text-[9px] font-black tracking-widest">
                      TIED
                    </div>
                  )}
                  <div
                    className="rb-chamfer relative h-full p-[1px] overflow-hidden"
                    style={{
                      background: oppLeads ? 'transparent' : opponentEval === null ? 'rgba(255,255,255,0.08)' : 'rgba(56,189,248,0.45)',
                      ['--rb-c' as string]: 'rgba(56,189,248,0.95)',
                    } as React.CSSProperties}
                  >
                    {oppLeads && <div className="rb-electric" />}
                    <div
                      className="rb-chamfer relative h-full p-3 sm:p-4 overflow-hidden"
                      style={{
                        background:
                          opponentEval === null
                            ? 'linear-gradient(180deg, rgba(17,21,31,0.96), rgba(8,10,16,0.96))'
                            : 'linear-gradient(180deg, rgba(8,40,60,0.9), rgba(8,10,16,0.96))',
                      }}
                    >
                      {showOpponentScore && (opponentEval?.statCount ?? 0) > 0 && <div className="rb-holo" />}
                      <div className="absolute right-0 top-0 bottom-0 w-[3px]" style={{ background: SKY, boxShadow: `0 0 10px ${SKY}` }} />

                      <div className="flex items-center justify-between gap-1.5 mb-1.5">
                        <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-widest text-sky-300 truncate">
                          {opponentLabel} SELECTION
                        </span>

                        {opponentEval === null ? (
                          <span className="rb-soft-pulse px-1.5 py-0.5 bg-white/[0.05] border border-white/10 text-[8px] sm:text-[9px] font-mono uppercase tracking-widest text-neutral-400 shrink-0">
                            SELECTING...
                          </span>
                        ) : showOpponentScore && opponentEval.allTimeRank ? (
                          <span className="px-1.5 py-0.5 bg-sky-400/20 border border-sky-400/40 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-widest text-sky-300 shrink-0">
                            #{opponentEval.allTimeRank} ALL-TIME
                          </span>
                        ) : (
                          <span className="rb-lock-stamp inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-400/20 border border-sky-400/40 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-widest text-sky-300 shrink-0">
                            <Lock className="w-2.5 h-2.5" />
                            LOCKED IN
                          </span>
                        )}
                      </div>

                      <p
                        className={`font-athletic italic text-lg sm:text-2xl font-black uppercase tracking-wide truncate leading-tight ${
                          opponentEval === null ? 'text-neutral-500' : 'text-white'
                        }`}
                      >
                        {opponentEval === null ? 'THINKING...' : opponentEval.playerName}
                      </p>
                      <p className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-0.5 truncate">
                        {currentClub.name} • {metricUnit}
                      </p>

                      <div ref={oppTickerRef} className="mt-2 sm:mt-3 h-11 sm:h-14 flex items-center">
                        {showOpponentScore ? (
                          <Odometer
                            value={opponentTickerValue}
                            digits={oppDigits}
                            rolling={stage === 'tally-opponent'}
                            color={SKY}
                            glowRgb={SKY_RGB}
                            className="font-athletic font-black text-[34px] sm:text-[46px]"
                          />
                        ) : (
                          <span className="font-mono text-[10px] tracking-[0.3em] text-neutral-600">
                            {opponentEval === null ? 'TALLY SEALED' : 'AWAITING TALLY'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SEARCH INPUT BAR (while user has not locked in yet) OR ROUND DONE BAR */}
              {stage === 'playing' && userEval === null ? (
                <div
                  ref={consoleRef}
                  onPointerDown={keepTypingFocus}
                  onMouseDown={keepTypingFocus}
                  className="rb-panel relative z-30 p-3 sm:p-4 kb:p-2 overflow-visible"
                  style={{ clipPath: 'none' }}
                >
                  {duplicateWarning && (
                    <div className="rb-rise mb-3 px-3.5 py-2 bg-rose-500/15 border border-rose-500/40 flex items-center gap-2 text-xs font-semibold text-rose-200">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{duplicateWarning}</span>
                    </div>
                  )}

                  {/* Opponent typing indicator */}
                  {isOpponentTyping && opponentEval === null && (
                    <div className="rb-soft-pulse mb-2 text-[11px] font-mono text-sky-400 flex items-center gap-1.5 pl-1">
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-sky-400" />
                        <span className="w-1 h-1 rounded-full bg-sky-400/70" />
                        <span className="w-1 h-1 rounded-full bg-sky-400/40" />
                      </span>
                      <span>{opponentLabel} is searching the record books...</span>
                    </div>
                  )}

                  <div className="flex items-stretch gap-2">
                    <div className="relative flex-1 min-w-0 group">
                      <div
                        className="absolute -inset-[1px] rb-chamfer opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{ background: 'linear-gradient(90deg, rgba(255,159,28,0.8), rgba(251,191,36,0.6))' }}
                      />
                      <div className="relative rb-chamfer bg-[#07090e] h-full">
                        <Search className="w-4 h-4 text-neutral-500 group-focus-within:text-[#ff9f1c] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" />
                        <input
                          ref={inputRef}
                          type="text"
                          value={query}
                          onChange={(e) => {
                            soundFX.playTypingTick();
                            setQuery(e.target.value);
                            setDuplicateWarning(null);
                            setShowDropdown(true);
                            // Throttled: the opponent's indicator stays lit for 2s per ping
                            const now = Date.now();
                            if (isMultiplayer && now - lastTypingSentAtRef.current >= TYPING_PING_INTERVAL_MS) {
                              lastTypingSentAtRef.current = now;
                              sendAction('player_typing', { isTyping: true });
                            }
                          }}
                          onFocus={() => setShowDropdown(true)}
                          onKeyDown={handleKeyDown}
                          placeholder={`Search ${currentClub.name} league scorers...`}
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          className="w-full h-12 md:h-[52px] pl-10 pr-14 bg-transparent border border-white/10 focus:outline-none text-base sm:text-[15px] font-semibold text-white placeholder:text-neutral-500 caret-[#ff9f1c]"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-[0.2em] pointer-events-none">
                          {query.trim().length >= 3 ? (
                            <span className="text-[#ff9f1c]">{suggestions.length} HITS</span>
                          ) : query.trim().length > 0 ? (
                            <span className="text-neutral-500">{3 - query.trim().length} MORE</span>
                          ) : null}
                        </span>
                      </div>

                      {/* Instant Fuzzy Autocomplete Dropdown */}
                      {showDropdown && suggestions.length > 0 && (
                        <div className="rb-drop-in rb-chamfer absolute left-0 right-0 bottom-full mb-2 bg-[#0b0e15]/95 border border-[#fbbf24]/25 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(251,191,36,0.06)] z-40">
                          <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-white/[0.06] font-mono text-[9px] tracking-[0.3em] text-neutral-500">
                            <span>ARCHIVE SEARCH • {suggestions.length} LEGENDS</span>
                            <span className="hidden sm:inline">↑↓ BROWSE • ↵ LOCK</span>
                          </div>
                          <div ref={listRef} className="relative overflow-y-auto max-h-48 sm:max-h-60">
                            <div
                              className="absolute left-0 right-0 top-0 h-11 pointer-events-none transition-transform duration-200"
                              style={{
                                transform: `translate3d(0, ${selectedIndex * 44}px, 0)`,
                                transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
                                background: 'linear-gradient(90deg, rgba(255,159,28,0.2), rgba(255,159,28,0.03))',
                                boxShadow: `inset 3px 0 0 ${BLAZE}`,
                              }}
                            />
                            {suggestions.map((item, idx) => {
                              const isSelected = idx === selectedIndex;
                              const isTakenByOpponent =
                                opponentEval !== null &&
                                isSameRecordBooksPlayer(item.name, opponentEval.playerName, currentClub, config.metric);
                              const posColor = (item.position && POSITION_TAG[item.position]) || '#94a3b8';

                              return (
                                <button
                                  key={item.name}
                                  data-row={idx}
                                  type="button"
                                  disabled={isTakenByOpponent}
                                  onMouseEnter={() => setSelectedIndex(idx)}
                                  onClick={() => {
                                    if (isTakenByOpponent) return;
                                    setQuery(item.name);
                                    handleLockIn(item.name, false);
                                  }}
                                  className={`rb-row-in relative w-full h-11 px-4 text-left flex items-center justify-between gap-3 border-b border-white/[0.04] ${
                                    isTakenByOpponent ? 'bg-rose-500/10 text-neutral-500 cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'
                                  }`}
                                  style={{ animationDelay: `${Math.min(idx, 6) * 35}ms` }}
                                >
                                  <span
                                    className={`font-athletic italic text-base font-black tracking-wide uppercase truncate transition-transform duration-200 ${
                                      isTakenByOpponent ? 'line-through text-neutral-500' : isSelected ? 'text-white translate-x-1' : 'text-white/80'
                                    }`}
                                  >
                                    {item.name}
                                  </span>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {isTakenByOpponent ? (
                                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400">
                                        TAKEN BY {opponentLabel}
                                      </span>
                                    ) : (
                                      <>
                                        {item.position && (
                                          <span
                                            className="text-[10px] font-mono font-black px-1.5 py-0.5 border shrink-0 -skew-x-12"
                                            style={{ color: posColor, borderColor: `${posColor}66`, background: `${posColor}1a` }}
                                          >
                                            {item.position}
                                          </span>
                                        )}
                                        <span
                                          className={`text-[10px] font-mono font-black uppercase tracking-widest px-2 py-0.5 transition-colors duration-200 ${
                                            isSelected ? 'bg-[#ff9f1c] text-black' : 'text-[#ff9f1c]'
                                          }`}
                                        >
                                          LOCK IN{isSelected ? ' ↵' : ''}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLockIn(query, false)}
                      disabled={query.trim().length === 0}
                      className="rb-press rb-sheen rb-chamfer px-4 sm:px-6 bg-gradient-to-b from-[#ffc46b] via-[#ff9f1c] to-[#d97706] disabled:opacity-40 disabled:grayscale disabled:pointer-events-none text-black font-athletic italic text-base sm:text-lg font-black uppercase tracking-widest shadow-[0_0_24px_rgba(255,159,28,0.3)] flex items-center gap-1.5 cursor-pointer hover:brightness-110 shrink-0"
                    >
                      <Lock className="w-4 h-4" />
                      LOCK IN
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLockIn('', true)}
                      className="rb-press rb-chamfer px-3 sm:px-4 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-neutral-300 hover:text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
                      title="Skip this round"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">SKIP</span>
                    </button>
                  </div>
                </div>
              ) : stage === 'round-done' ? (
                <div className="rb-panel rb-rise px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {userLeads ? (
                      <Crown className="w-5 h-5 text-[#fbbf24] shrink-0" style={{ filter: 'drop-shadow(0 0 8px rgba(251,191,36,0.8))' }} />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[#ff9f1c] shrink-0" />
                    )}
                    <span
                      className={`font-athletic italic text-lg sm:text-xl font-black uppercase tracking-wide ${
                        userLeads ? 'rb-gold-text' : oppLeads ? 'text-sky-300' : 'text-neutral-200'
                      }`}
                    >
                      {(userEval?.statCount ?? 0) > (opponentEval?.statCount ?? 0)
                        ? 'YOU TOOK THE ROUND LEAD'
                        : (userEval?.statCount ?? 0) === (opponentEval?.statCount ?? 0)
                        ? 'ROUND TIED'
                        : `${opponentLabel} TOOK THE ROUND`}
                    </span>
                  </div>

                  {isMultiplayer ? (
                    <div className="rb-chamfer relative overflow-hidden w-full sm:w-auto px-5 py-3 kb:py-2.5 bg-white/[0.06] kb:bg-[#0b0d12] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border border-white/15 shrink-0 kb:!sticky kb:bottom-1 kb:z-20">
                      <div
                        className="absolute left-0 bottom-0 h-[2px] bg-[#ff9f1c] transition-[width] duration-1000 ease-linear"
                        style={{ width: `${(autoAdvanceSeconds / 4) * 100}%`, boxShadow: '0 0 8px #ff9f1c' }}
                      />
                      <Clock className="w-3.5 h-3.5 text-[#ff9f1c] animate-spin" />
                      <span>
                        {roundIdx + 1 >= config.totalRounds
                          ? `FINAL SCOREBOARD IN ${autoAdvanceSeconds}S...`
                          : `NEXT CLUB IN ${autoAdvanceSeconds}S...`}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleNextRound()}
                      className="rb-press rb-sheen rb-chamfer w-full sm:w-auto px-6 py-3 kb:py-2.5 kb:!sticky kb:bottom-1 kb:z-20 bg-gradient-to-b from-[#ffc46b] via-[#ff9f1c] to-[#d97706] text-black font-athletic italic text-base font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(255,159,28,0.3)] cursor-pointer shrink-0 hover:brightness-110"
                    >
                      <span>{roundIdx + 1 >= config.totalRounds ? 'FINAL SCOREBOARD' : 'NEXT CLUB'}</span>
                      <span className="px-1.5 py-0.5 bg-black/20 text-[10px] font-mono font-bold not-italic tracking-tight">ENTER</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="rb-panel px-4 py-3 flex items-center justify-center gap-2 font-mono text-[10px] sm:text-[11px] tracking-[0.3em] text-neutral-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24] shadow-[0_0_6px_#fbbf24]" />
                  {stage === 'playing'
                    ? `${opponentLabel.toUpperCase()} IS STILL DECIDING...`
                    : stage === 'both-locked'
                    ? 'BOTH PICKS SEALED • OPENING THE ARCHIVE'
                    : 'TALLYING THE RECORD BOOKS...'}
                </div>
              )}
            </>
          )}
        </main>
      </div>

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

/* ============================================================================
 * VAULT BACKDROP — slate hall, colonnade, floor reflections, gold floodlights.
 * Transform/opacity-only motion.
 * ==========================================================================*/

const VaultBackdrop: React.FC = () => (
  <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 70% 50% at 50% 12%, rgba(255,159,28,0.12), transparent 62%), radial-gradient(ellipse 50% 40% at 85% 90%, rgba(56,189,248,0.07), transparent 60%), linear-gradient(180deg, #0a0d15 0%, #06080d 60%, #040509 100%)',
      }}
    />
    {/* Colonnade */}
    <div
      className="absolute inset-x-0 top-0 h-[70%] opacity-[0.35]"
      style={{
        background:
          'repeating-linear-gradient(90deg, transparent 0px, transparent 70px, rgba(251,191,36,0.05) 70px, rgba(251,191,36,0.09) 86px, rgba(0,0,0,0.25) 102px, transparent 102px, transparent 160px)',
        maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent)',
        WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), transparent)',
      }}
    />
    {/* Polished floor with gold grid */}
    <div className="absolute inset-x-[-30%] bottom-0 h-[42%] overflow-hidden" style={{ perspective: '600px', perspectiveOrigin: '50% 0%' }}>
      <div
        className="absolute inset-0 origin-top"
        style={{
          transform: 'rotateX(66deg)',
          backgroundImage:
            'linear-gradient(rgba(251,191,36,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.08) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #06080d 0%, transparent 40%, rgba(6,8,13,0.5) 80%, #06080d 100%)' }} />
    </div>
    {/* Gold floodlights */}
    <div
      className="rb-beam-l absolute -top-[calc(8vh/var(--zoom,1))] left-[16%] w-[calc(24vw/var(--zoom,1))] h-[calc(115vh/var(--zoom,1))] opacity-60"
      style={{ background: 'linear-gradient(180deg, rgba(251,191,36,0.14), transparent 70%)', clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)' }}
    />
    <div
      className="rb-beam-r absolute -top-[calc(8vh/var(--zoom,1))] right-[16%] w-[calc(24vw/var(--zoom,1))] h-[calc(115vh/var(--zoom,1))] opacity-50"
      style={{ background: 'linear-gradient(180deg, rgba(255,159,28,0.12), transparent 70%)', clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)' }}
    />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.75) 100%)' }} />
  </div>
);

// Twin spotlights + plinth glow framing the crest monument.
const MonumentLights: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <div
      className="absolute top-0 h-full w-[60%] opacity-70"
      style={{
        left: compact ? '-12%' : '-6%',
        background: 'linear-gradient(160deg, rgba(251,191,36,0.16), transparent 55%)',
        clipPath: 'polygon(20% 0, 40% 0, 100% 100%, 55% 100%)',
      }}
    />
    <div
      className="absolute top-0 h-full w-[60%] opacity-60"
      style={{
        right: compact ? '-12%' : '-6%',
        background: 'linear-gradient(200deg, rgba(255,159,28,0.14), transparent 55%)',
        clipPath: 'polygon(60% 0, 80% 0, 45% 100%, 0 100%)',
      }}
    />
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[70%] h-1/2"
      style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,0.12), transparent 65%)' }}
    />
    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#fbbf24]/40 to-transparent" />
  </div>
);
