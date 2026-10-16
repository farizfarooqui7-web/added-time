import React, { useState, useEffect, useRef } from 'react';
import type {
  LinkUpClue,
  LinkUpMatchConfig,
  LinkUpPlayerEvaluation,
  LinkUpPlayerRecord,
  LinkUpPuzzle,
  LinkUpRoundResult,
  LinkUpSlotType,
} from './types';
import {
  evaluatePlayerSubmission,
  generateLinkUpPuzzle,
  generateOpponentSubmission,
  randomizeSlotConfiguration,
  searchPlayersAutocomplete,
} from './puzzleEngine';
import { POSITION_META } from './clubAssets';
import { soundFX } from '../../utils/audio';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import { useKeyboardKeeper, keepTypingFocus } from '../../hooks/useKeyboardKeeper';
import {
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Globe2,
  Home,
  RotateCcw,
  Search,
  SkipForward,
  Sparkles,
  Trophy,
  User,
  Users,
  XCircle,
  Zap,
  Radio,
} from 'lucide-react';

/* ============================================================================
 * SCOUTING TERMINAL — palette & helpers
 * ==========================================================================*/

const VOLT = '#ccff00';
const VOLT_RGB = '204,255,0';
const CYAN = '#00f0ff';
const CYAN_RGB = '0,240,255';
const RED_RGB = '255,59,48';
const TAU = Math.PI * 2;

const SLOT_ACCENT: Record<LinkUpSlotType, { hex: string; rgb: string }> = {
  Club: { hex: '#22d3ee', rgb: '34,211,238' },
  Nation: { hex: '#34d399', rgb: '52,211,153' },
  Position: { hex: '#fbbf24', rgb: '251,191,36' },
};

const POS_CHIP: Record<string, string> = {
  GK: '#fbbf24',
  DEF: '#60a5fa',
  MID: '#ccff00',
  FWD: '#f87171',
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
 * FX ENGINE — transparent canvas overlay for sparks, shockwaves, electric
 * arcs and confetti. Sleeps (no rAF) whenever nothing is alive.
 * ==========================================================================*/

interface LuParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  css: string;
  kind: number; // 0 spark, 1 confetti
  rot: number;
  vr: number;
}

interface LuRing {
  x: number;
  y: number;
  r1: number;
  t0: number;
  dur: number;
  rgb: string;
  w: number;
}

interface LuBolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t0: number;
  dur: number;
  rgb: string;
}

interface LuFlash {
  x: number;
  y: number;
  r: number;
  t0: number;
  dur: number;
  rgb: string;
}

interface LuFxEngine {
  burst: (x: number, y: number, rgb: string, n: number, speed?: number) => void;
  confetti: (x: number, y: number, n: number, palette: string[]) => void;
  shockwave: (x: number, y: number, rgb: string, radius: number, dur?: number, width?: number) => void;
  flash: (x: number, y: number, rgb: string, radius: number, dur?: number) => void;
  bolt: (x1: number, y1: number, x2: number, y2: number, rgb: string, dur?: number) => void;
  destroy: () => void;
}

function createLuFxEngine(canvas: HTMLCanvasElement): LuFxEngine {
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
  const parts: LuParticle[] = [];
  const rings: LuRing[] = [];
  const bolts: LuBolt[] = [];
  const flashes: LuFlash[] = [];
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

  function burst(x: number, y: number, rgb: string, n: number, speed = 480) {
    const css = rgbCss(rgb);
    const count = Math.round(n * density);
    for (let i = 0; i < count && parts.length < MAX; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.85);
      const life = 0.4 + Math.random() * 0.55;
      parts.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.2,
        life, max: life,
        size: 1.2 + Math.random() * 2,
        css, kind: 0, rot: 0, vr: 0,
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

  function bolt(x1: number, y1: number, x2: number, y2: number, rgb: string, dur = 0.32) {
    if (bolts.length < 24) bolts.push({ x1, y1, x2, y2, t0: now(), dur, rgb });
    kick();
  }

  function drawBolt(b: LuBolt, t: number) {
    const age = (t - b.t0) / b.dur;
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = Math.max(7, Math.round(len / 20));
    const amp = Math.min(30, len * 0.07);
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const off = (Math.random() - 0.5) * 2 * amp * Math.sin(Math.PI * f);
      ctx.lineTo(b.x1 + dx * f + nx * off, b.y1 + dy * f + ny * off);
    }
    ctx.lineTo(b.x2, b.y2);
    const a = Math.max(0, 1 - age) * (Math.random() < 0.15 ? 0.45 : 1);
    ctx.strokeStyle = `rgba(${b.rgb},${0.3 * a})`;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${b.rgb},${0.75 * a})`;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
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
    ctx.lineJoin = 'round';

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = (t - f.t0) / f.dur;
      if (age >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const r = Math.max(1, f.r * (0.6 + age * 0.6));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.8 * (1 - age)})`);
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
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - age) * 0.22})`;
      ctx.lineWidth = r.w * 4 * (1 - age) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad * 0.86, 0, TAU);
      ctx.stroke();
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      if ((t - b.t0) / b.dur >= 1) {
        bolts.splice(i, 1);
        continue;
      }
      drawBolt(b, t);
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
      if (p.kind === 0) {
        p.vy += 760 * dt;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.8);
        ctx.strokeStyle = p.css;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
        ctx.stroke();
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

    if (parts.length || rings.length || bolts.length || flashes.length) {
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
    confetti,
    shockwave,
    flash,
    bolt,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}

const LuFxCanvas: React.FC<{ engineRef: React.RefObject<LuFxEngine | null> }> = ({ engineRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createLuFxEngine(canvasRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef]);
  return <canvas ref={canvasRef} className="hidden fixed inset-0 z-[45] w-full h-full pointer-events-none" aria-hidden="true" />;
};

/* ============================================================================
 * BROADCAST WIDGETS
 * ==========================================================================*/

// Eased integer score readout with a floating "+N" chip on every gain.
const ScoreCounter: React.FC<{ value: number; className?: string; style?: React.CSSProperties; chipClass: string }> = ({
  value,
  className = '',
  style,
  chipClass,
}) => {
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
      const p = Math.min(1, (nowMs - t0) / 520);
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
    <span className={`relative inline-block tabular-nums ${className}`} style={style}>
      {Math.round(shown)}
      {deltas.map((x) => (
        <span key={x.id} className={`lu-delta absolute left-1/2 -top-4 -translate-x-1/2 font-mono text-[10px] font-black px-1.5 pointer-events-none ${chipClass}`}>
          +{x.d}
        </span>
      ))}
    </span>
  );
};

// Ticking pressure dial: 30 notches, sweeping arc and a needle.
const PressureDial: React.FC<{ seconds: number; urgent: boolean; size?: number }> = ({ seconds, urgent, size = 58 }) => {
  const frac = Math.max(0, Math.min(1, seconds / 30));
  const r = 23;
  const circ = 2 * Math.PI * r;
  const color = urgent ? '#ff3b30' : CYAN;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 60 60" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <circle cx="30" cy="30" r="29" fill="rgba(4,6,10,0.95)" stroke="rgba(255,255,255,0.08)" />
        {Array.from({ length: 30 }).map((_, i) => {
          const a = (i / 30) * TAU - Math.PI / 2;
          const lit = i / 30 < frac;
          return (
            <line
              key={i}
              x1={30 + Math.cos(a) * 26}
              y1={30 + Math.sin(a) * 26}
              x2={30 + Math.cos(a) * (i % 5 === 0 ? 21.5 : 23.5)}
              y2={30 + Math.sin(a) * (i % 5 === 0 ? 21.5 : 23.5)}
              stroke={lit ? color : 'rgba(255,255,255,0.12)'}
              strokeWidth={i % 5 === 0 ? 1.6 : 1}
            />
          );
        })}
        <circle
          cx="30"
          cy="30"
          r={r - 5}
          fill="none"
          stroke={color}
          strokeOpacity="0.85"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          transform="rotate(-90 30 30)"
          style={{ transition: 'stroke-dashoffset 0.1s linear', filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <g style={{ transform: `rotate(${frac * 360}deg)`, transformOrigin: '30px 30px', transition: 'transform 0.1s linear' }}>
          <line x1="30" y1="30" x2="30" y2="11" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <circle cx="30" cy="30" r="2.4" fill={color} />
      </svg>
      <span
        className="absolute inset-x-0 bottom-[9px] text-center font-athletic font-black text-[13px] tabular-nums leading-none"
        style={{ color, textShadow: `0 0 8px ${color}` }}
      >
        {seconds.toFixed(1)}
      </span>
    </div>
  );
};

const SCRAMBLE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/<>';

// Decrypting placeholder text while a clue node is still being acquired.
const ScrambleText: React.FC<{ length: number; className?: string }> = ({ length, className }) => {
  const make = () =>
    Array.from({ length }, () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]).join('');
  const [txt, setTxt] = useState(make);
  useEffect(() => {
    const id = window.setInterval(() => setTxt(make()), 70);
    return () => window.clearInterval(id);
  }, [length]);
  return <span className={className}>{txt}</span>;
};

const LU_CSS = `
  @keyframes luSnap {
    0% { transform: scale(1.14); filter: brightness(2.6); opacity: 0; }
    35% { transform: scale(0.97); filter: brightness(1.5); opacity: 1; }
    65% { transform: scale(1.02); }
    100% { transform: none; filter: none; opacity: 1; }
  }
  .lu-snap { animation: luSnap 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

  @keyframes luBracketIn { from { transform: translate3d(var(--bx), var(--by), 0) scale(1.4); opacity: 0; } to { transform: none; opacity: 1; } }
  .lu-bracket { animation: luBracketIn 0.42s cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }

  @keyframes luSpin { to { transform: rotate(360deg); } }
  @keyframes luSpinRev { to { transform: rotate(-360deg); } }
  .lu-spin { animation: luSpin 18s linear infinite; will-change: transform; }
  .lu-spin-fast { animation: luSpin 2.2s linear infinite; will-change: transform; }
  .lu-spin-rev { animation: luSpinRev 26s linear infinite; will-change: transform; }

  @keyframes luScanY { from { transform: translate3d(0, -100%, 0); } to { transform: translate3d(0, 400%, 0); } }
  .lu-scan-y { animation: luScanY 2.6s ease-in-out infinite; will-change: transform; }

  @keyframes luRadar { to { transform: translate(-50%, -50%) rotate(360deg); } }
  .lu-radar { animation: luRadar 16s linear infinite; will-change: transform; }

  @keyframes luFlow { to { stroke-dashoffset: -24; } }
  .lu-flow { animation: luFlow 1.4s linear infinite; }

  @keyframes luStamp {
    0% { transform: translate(-50%, -50%) rotate(-7deg) scale(2.6); opacity: 0; }
    18% { transform: translate(-50%, -50%) rotate(-7deg) scale(0.92); opacity: 1; }
    30% { transform: translate(-50%, -50%) rotate(-7deg) scale(1.04); }
    40% { transform: translate(-50%, -50%) rotate(-7deg) scale(1); opacity: 1; }
    82% { transform: translate(-50%, -50%) rotate(-7deg) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -58%) rotate(-7deg) scale(0.9); opacity: 0; }
  }
  .lu-stamp { animation: luStamp 2.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
  /* Verdict pizazz: one-shot only. Text settles in from a soft blur, a single glint crosses the stamp,
     a miss gives a small nudge, and result-card status pills pop in. */
  @keyframes luVerdictIn { from { opacity: 0; filter: blur(5px); letter-spacing: 0.22em; } to { opacity: 1; filter: none; letter-spacing: 0.025em; } }
  .lu-verdict-in { animation: luVerdictIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both; }
  @keyframes luVerdictGlint { from { transform: translate3d(-130%, 0, 0) skewX(-20deg); } to { transform: translate3d(330%, 0, 0) skewX(-20deg); } }
  .lu-verdict-glint { position: absolute; top: 0; bottom: 0; left: 0; width: 34%; pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--glint, rgba(255,255,255,0.32)), transparent);
    animation: luVerdictGlint 0.85s cubic-bezier(0.4, 0, 0.2, 1) 0.55s both; }
  @keyframes luVerdictNudge { 0%, 100% { transform: none; } 30% { transform: translate3d(-5px, 0, 0); } 60% { transform: translate3d(3px, 0, 0); } }
  .lu-verdict-nudge { animation: luVerdictNudge 0.36s ease-out 0.45s both; }
  @keyframes luPillPop { 0% { opacity: 0; transform: scale(0.7); } 70% { opacity: 1; transform: scale(1.06); } 100% { transform: none; } }
  .lu-pill-pop { animation: luPillPop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both; }

  @keyframes luHolo { 0% { transform: translate3d(-140%, 0, 0) skewX(-18deg); } 100% { transform: translate3d(260%, 0, 0) skewX(-18deg); } }
  .lu-holo { position: absolute; top: 0; bottom: 0; left: 0; width: 45%; pointer-events: none; mix-blend-mode: screen;
    background: linear-gradient(90deg, transparent, rgba(0,240,255,0.3), rgba(204,255,0,0.4), rgba(255,0,200,0.25), transparent);
    animation: luHolo 1.2s cubic-bezier(0.4, 0, 0.2, 1) both; }

  @keyframes luRowIn { from { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.98); } to { opacity: 1; transform: none; } }
  .lu-row-in { animation: luRowIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

  @keyframes luDropIn { from { opacity: 0; transform: translate3d(0, 14px, 0) scaleY(0.94); } to { opacity: 1; transform: none; } }
  .lu-drop-in { animation: luDropIn 0.3s cubic-bezier(0.34, 1.4, 0.64, 1) both; transform-origin: bottom center; }

  @keyframes luRise { from { opacity: 0; transform: translate3d(0, 12px, 0); } to { opacity: 1; transform: none; } }
  .lu-rise { animation: luRise 0.42s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes luShake {
    0%, 100% { transform: none; }
    15% { transform: translate3d(-8px, 0, 0); }
    30% { transform: translate3d(7px, 0, 0); }
    45% { transform: translate3d(-5px, 0, 0); }
    60% { transform: translate3d(3px, 0, 0); }
    80% { transform: translate3d(-1px, 0, 0); }
  }
  .lu-shake { animation: luShake 0.45s cubic-bezier(0.2, 0.8, 0.3, 1); }

  @keyframes luPressure { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.75; } }
  .lu-pressure { animation: luPressure 2.2s ease-in-out infinite; }
  .lu-pressure-hot { animation-duration: 1.1s; }

  @keyframes luCount {
    0% { transform: scale(2.6); opacity: 0; filter: blur(10px); }
    30% { transform: scale(0.94); opacity: 1; filter: none; }
    55% { transform: scale(1.04); }
    100% { transform: scale(1); opacity: 1; }
  }
  .lu-count { animation: luCount 0.85s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes luBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  .lu-bar { animation: luBar 1s cubic-bezier(0.4, 0, 0.2, 1) both; transform-origin: left center; }

  @keyframes luDelta {
    0% { opacity: 0; transform: translate3d(-50%, 6px, 0) scale(0.8); }
    15% { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1.15); }
    100% { opacity: 0; transform: translate3d(-50%, -22px, 0) scale(1); }
  }
  .lu-delta { animation: luDelta 1.25s cubic-bezier(0.2, 0.8, 0.3, 1) both; }

  @keyframes luCaret { 50% { opacity: 0; } }
  .lu-caret { animation: luCaret 1s steps(1) infinite; }

  @keyframes luSheen { 0% { transform: translateX(-160%) skewX(-20deg); } 55%, 100% { transform: translateX(380%) skewX(-20deg); } }
  .lu-sheen { position: relative; overflow: hidden; }
  .lu-sheen::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 30%; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent); animation: luSheen 3s ease-in-out infinite; }

  @keyframes luSoftPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  .lu-soft-pulse { animation: luSoftPulse 2.4s ease-in-out infinite; }

  .lu-panel {
    position: relative;
    background: linear-gradient(180deg, rgba(10,14,22,0.94), rgba(5,7,12,0.96));
    border: 1px solid rgba(255,255,255,0.08);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  }
  .lu-panel::before {
    content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--lu-accent, rgba(0,240,255,0.75)), transparent);
  }
  .lu-chamfer { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }
  .lu-press { transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.15s, background-color 0.15s, border-color 0.15s, color 0.15s; }
  .lu-press:active { transform: scale(0.94); transition-duration: 0.08s; }

  @media (prefers-reduced-motion: reduce) {
    .lu-spin, .lu-spin-rev, .lu-spin-fast, .lu-scan-y, .lu-radar, .lu-flow, .lu-pressure, .lu-sheen::after, .lu-soft-pulse, .lu-caret { animation: none !important; }
    .lu-shake, .lu-verdict-nudge, .lu-verdict-glint { animation: none !important; }
    .lu-verdict-glint { display: none; }
  }
`;

interface LinkUpArenaProps {
  config: LinkUpMatchConfig;
  onExitArena: () => void;
}

// How long a guest waits for the host's round transition before advancing on its own
const HOST_FALLBACK_MS = 2500;
// Minimum gap between outgoing "typing" pings (the receiver shows the indicator for 2s)
const TYPING_PING_INTERVAL_MS = 1000;

export const LinkUpArena: React.FC<LinkUpArenaProps> = ({ config, onExitArena }) => {
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
  } = useGameSync('link-up');

  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [activeSlots] = useState<[LinkUpSlotType, LinkUpSlotType, LinkUpSlotType]>(
    config.slotTypes
  );

  // Synchronized round transition curtain & rematch readiness
  const [roundTransitionCount, setRoundTransitionCount] = useState<number | null>(null);
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);

  const usedSeedIdsRef = useRef<Set<string>>(new Set());

  // Multiplayer round bookkeeping: the host drives transitions, guests only fall back if it goes
  // quiet, and a lock-in from an opponent who is already a round ahead is held until we get there.
  const roundNumberRef = useRef<number>(1);
  const pendingOpponentLocksRef = useRef<Record<number, LinkUpPlayerEvaluation>>({});

  const [currentPuzzle, setCurrentPuzzle] = useState<LinkUpPuzzle>(() => {
    if (gameInitData?.sharedData?.puzzles && gameInitData.sharedData.puzzles.length > 0) {
      return gameInitData.sharedData.puzzles[0];
    }
    const initialSlots = config.randomizeSlotsEachRound
      ? randomizeSlotConfiguration()
      : config.slotTypes;
    const p = generateLinkUpPuzzle(1, config.difficulty, initialSlots, usedSeedIdsRef.current);
    usedSeedIdsRef.current.add(p.seedPlayer.id);
    return p;
  });

  // Synchronize authoritative puzzle sequence from server gameInitData
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.puzzles && gameInitData.sharedData.puzzles.length > 0) {
      const p = gameInitData.sharedData.puzzles[roundNumber - 1];
      if (p) {
        setCurrentPuzzle(p);
      }
    }
  }, [isMultiplayer, gameInitData, roundNumber]);

  // Match & Round State
  const [phase, setPhase] = useState<'opening-countdown' | 'playing' | 'round-result' | 'match-over'>('opening-countdown');
  const [countdownValue, setCountdownValue] = useState<number>(3);
  const [userScore, setUserScore] = useState<number>(0);
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const [roundHistory, setRoundHistory] = useState<LinkUpRoundResult[]>([]);

  // 30s Pressure Timer State (triggers ONLY after opponent locks in an answer)
  const [opponentLockedIn, setOpponentLockedIn] = useState<boolean>(false);
  const [opponentLockedEval, setOpponentLockedEval] = useState<LinkUpPlayerEvaluation | null>(null);
  const [pressureTimeLeft, setPressureTimeLeft] = useState<number | null>(null);
  const [takenWarningMessage, setTakenWarningMessage] = useState<string | null>(null);
  const [userSubmittedEval, setUserSubmittedEval] = useState<LinkUpPlayerEvaluation | null>(null);
  const [isOpponentTyping, setIsOpponentTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const roundResultEnteredAtRef = useRef<number>(0);

  // Input & Autocomplete State
  const [searchInput, setSearchInput] = useState<string>('');
  const [suggestions, setSuggestions] = useState<LinkUpPlayerRecord[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [lastRoundResult, setLastRoundResult] = useState<LinkUpRoundResult | null>(null);

  // Room Code State
  const [isMasked, setIsMasked] = useState<boolean>(config.isRoomCodeMasked);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showForfeitModal, setShowForfeitModal] = useState<boolean>(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver: phase === 'match-over',
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena: onExitArena,
    arenaKey: 'link-up',
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Phones: keep the keyboard up across rounds (see useKeyboardKeeper)
  const { hold: holdKeyboard, keeper: keyboardKeeper } = useKeyboardKeeper();
  const opponentLabel = isMultiplayer && opponent?.name ? opponent.name : (config.lobbyMode === 'solo' ? 'AI SCOUT' : 'OPPONENT');

  // Slot machine rolling reveal animation: 0 -> 1 -> 2 -> 3
  const [revealedSlotCount, setRevealedSlotCount] = useState<number>(0);

  // Opening 3-2-1 countdown on match start
  useEffect(() => {
    if (phase !== 'opening-countdown') return;

    setCountdownValue(3);
    soundFX.playClick(600);

    const t1 = setTimeout(() => {
      setCountdownValue(2);
      soundFX.playClick(750);
    }, 1000);

    const t2 = setTimeout(() => {
      setCountdownValue(1);
      soundFX.playClick(900);
    }, 2000);

    const t3 = setTimeout(() => {
      soundFX.playPhaseShift();
      setPhase('playing');
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  // Trigger staggered slot-machine roll on each new puzzle once playing begins
  useEffect(() => {
    if (phase !== 'playing') {
      setRevealedSlotCount(0);
      return;
    }

    setRevealedSlotCount(0);

    const t1 = setTimeout(() => {
      soundFX.playSlotReveal();
      setRevealedSlotCount(1);
    }, 400);

    const t2 = setTimeout(() => {
      soundFX.playSlotReveal();
      setRevealedSlotCount(2);
    }, 900);

    const t3 = setTimeout(() => {
      soundFX.playHammer();
      setRevealedSlotCount(3);
    }, 1450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase, currentPuzzle.id]);

  // Focus input at the start of each playing round
  useEffect(() => {
    if (phase === 'playing') {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [phase, currentPuzzle.id]);

  // Simulate Opponent locking in their answer after 5-8 seconds (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (phase !== 'playing') {
      setOpponentLockedIn(false);
      setOpponentLockedEval(null);
      setPressureTimeLeft(null);
      return;
    }

    setOpponentLockedIn(false);
    setOpponentLockedEval(null);
    setPressureTimeLeft(null);

    const delayMs = 5000 + Math.floor(Math.random() * 3500);
    const lockTimer = setTimeout(() => {
      soundFX.playClick(620);
      const preLockedOpponent = generateOpponentSubmission(currentPuzzle);
      setOpponentLockedEval(preLockedOpponent);
      setOpponentLockedIn(true);
      setPressureTimeLeft(30.0);
    }, delayMs);

    return () => clearTimeout(lockTimer);
  }, [isMultiplayer, phase, currentPuzzle.id]);

  const lastProcessedEventIdRef = useRef<number | string | null>(null);
  // Round whose own lock-in the server has echoed back. The match room stamps events in one order for both
  // players, so "their lock arrived before our echo" means they claimed first on both screens.
  const ownLockEchoedRoundRef = useRef<number | null>(null);

  // Synchronize incoming multiplayer events
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) {
      if (lastGameEvent.event === 'player_lock_in' && lastGameEvent.data?.roundNumber === roundNumber) {
        ownLockEchoedRoundRef.current = roundNumber;
      }
      return;
    }

    // Process each relayed event exactly once (guards StrictMode double effects & re-deliveries)
    if (lastGameEvent._eventId && lastProcessedEventIdRef.current === lastGameEvent._eventId) return;
    lastProcessedEventIdRef.current = lastGameEvent._eventId ?? null;

    if (lastGameEvent.event === 'player_typing') {
      setIsOpponentTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsOpponentTyping(false), 2000);
    } else if (lastGameEvent.event === 'player_lock_in') {
      const { roundNumber: evRound, evaluation } = lastGameEvent.data || {};
      if (evRound === roundNumber && evaluation) {
        soundFX.playClick(620);
        setOpponentLockedEval(evaluation);
        setOpponentLockedIn(true);
        setIsOpponentTyping(false);

        if (userSubmittedEval) {
          // Both locked the same player at once: the later lock in server order loses it
          const sameAnswer =
            userSubmittedEval.matchedPlayer &&
            evaluation.matchedPlayer &&
            userSubmittedEval.matchedPlayer.id === evaluation.matchedPlayer.id;
          if (sameAnswer && ownLockEchoedRoundRef.current !== roundNumber) {
            finalizeRound(voidClaimedAnswer(userSubmittedEval), evaluation);
          } else if (sameAnswer) {
            finalizeRound(userSubmittedEval, voidClaimedAnswer(evaluation));
          } else {
            finalizeRound(userSubmittedEval, evaluation);
          }
        } else {
          setPressureTimeLeft(30.0);
        }
      } else if (typeof evRound === 'number' && evRound > roundNumber && evaluation) {
        pendingOpponentLocksRef.current[evRound] = evaluation;
      }
    } else if (lastGameEvent.event === 'next_round_request') {
      const { nextRound } = lastGameEvent.data || {};
      if (nextRound && nextRound > roundNumber) {
        handleNextRound(nextRound);
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handleRestartMatch();
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, roundNumber, userSubmittedEval]);

  // Apply a lock-in that arrived while we were still finishing the previous round
  useEffect(() => {
    if (!isMultiplayer || phase !== 'playing') return;
    const buffered = pendingOpponentLocksRef.current[roundNumber];
    if (!buffered) return;
    delete pendingOpponentLocksRef.current[roundNumber];
    setOpponentLockedEval(buffered);
    setOpponentLockedIn(true);
    setPressureTimeLeft((prev) => prev ?? 30.0);
  }, [isMultiplayer, phase, roundNumber]);

  // 30s Countdown once either player has locked in
  useEffect(() => {
    if (phase !== 'playing' || pressureTimeLeft === null) return;

    const interval = setInterval(() => {
      setPressureTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 0.1) {
          clearInterval(interval);
          return 0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase, pressureTimeLeft]);

  // Auto-skip or finalize if the 30s post-opponent timer hits 0
  useEffect(() => {
    if (phase === 'playing' && pressureTimeLeft === 0) {
      if (userSubmittedEval) {
        // User already submitted, opponent timed out
        const timedOutOpponent: LinkUpPlayerEvaluation = {
          skipped: true,
          playerName: 'TIMED OUT',
          criteriaMetCount: 0,
          matchedSlotIndices: [],
          pointsAwarded: 0,
          isLinkVerified: false,
        };
        finalizeRound(userSubmittedEval, timedOutOpponent);
      } else if (opponentLockedIn) {
        // Opponent locked in first and user timed out
        soundFX.playVoltBuzz();
        handleSkipRound();
      }
    }
  }, [pressureTimeLeft, phase, opponentLockedIn, userSubmittedEval]);

  // Update autocomplete suggestions as user types (requires at least 3 characters)
  useEffect(() => {
    if (searchInput.trim().length >= 3 && phase === 'playing') {
      const hits = searchPlayersAutocomplete(searchInput, 7);
      setSuggestions(hits);
      setHighlightedIndex(0);
    } else {
      setSuggestions([]);
    }
  }, [searchInput, phase]);

  const finalizeRound = (userEval: LinkUpPlayerEvaluation, forcedOpponentEval?: LinkUpPlayerEvaluation) => {
    // If opponent already locked in a player, use that locked submission (excluding the user's player if matched);
    // otherwise generate opponent's pick now, ensuring they cannot pick the user's player.
    const opponentEval = forcedOpponentEval
      ? forcedOpponentEval
      : opponentLockedEval
      ? opponentLockedEval
      : generateOpponentSubmission(currentPuzzle, userEval, userEval.matchedPlayer?.id);

    if (userEval.pointsAwarded > 0) {
      setUserScore((prev) => prev + userEval.pointsAwarded);
    }
    if (opponentEval.pointsAwarded > 0) {
      setOpponentScore((prev) => prev + opponentEval.pointsAwarded);
    }

    const result: LinkUpRoundResult = {
      roundNumber,
      puzzle: currentPuzzle,
      userEval,
      opponentEval,
    };

    setSuggestions([]);
    setTakenWarningMessage(null);
    setLastRoundResult(result);
    setRoundHistory((prev) => [...prev, result]);
    setUserSubmittedEval(null);
    setOpponentLockedIn(false);
    setOpponentLockedEval(null);
    setPressureTimeLeft(null);
    roundResultEnteredAtRef.current = Date.now();
    setPhase('round-result');
  };

  const submitUserChoice = (userEval: LinkUpPlayerEvaluation) => {
    if (isMultiplayer) {
      sendAction('player_lock_in', { roundNumber, evaluation: userEval });
      setUserSubmittedEval(userEval);

      if (opponentLockedEval) {
        finalizeRound(userEval, opponentLockedEval);
      } else {
        setPressureTimeLeft(30.0);
      }
    } else {
      finalizeRound(userEval);
    }
  };

  const handleSkipRound = () => {
    if (phase !== 'playing') return;
    soundFX.playClick(500);

    const skippedEval: LinkUpPlayerEvaluation = {
      skipped: true,
      playerName: 'PASSED',
      criteriaMetCount: 0,
      matchedSlotIndices: [],
      pointsAwarded: 0,
      isLinkVerified: false,
    };

    holdKeyboard();
    submitUserChoice(skippedEval);
  };

  // An answer the other side claimed first scores nothing
  const voidClaimedAnswer = (ev: LinkUpPlayerEvaluation): LinkUpPlayerEvaluation => ({
    ...ev,
    playerName: `${ev.playerName} (CLAIMED)`,
    criteriaMetCount: 0,
    matchedSlotIndices: [],
    pointsAwarded: 0,
    isLinkVerified: false,
  });

  const isPlayerLockedByOpponent = (playerOrName: LinkUpPlayerRecord | string): boolean => {
    if (!opponentLockedIn || !opponentLockedEval || !opponentLockedEval.matchedPlayer) {
      return false;
    }
    const lockedId = opponentLockedEval.matchedPlayer.id;
    const lockedName = opponentLockedEval.matchedPlayer.name.toLowerCase().trim();

    if (typeof playerOrName === 'string') {
      const q = playerOrName.toLowerCase().trim();
      return (
        q === lockedName ||
        (opponentLockedEval.matchedPlayer.commonName &&
          q === opponentLockedEval.matchedPlayer.commonName.toLowerCase().trim()) ||
        opponentLockedEval.matchedPlayer.aliases.some((a) => a.toLowerCase().trim() === q)
      );
    }

    return playerOrName.id === lockedId;
  };

  const handleSubmitGuess = (explicitPlayer?: LinkUpPlayerRecord) => {
    if (phase !== 'playing') return;
    if (!explicitPlayer && !searchInput.trim()) return;

    // Check if the selected/typed player is already locked in by the opponent
    if (explicitPlayer && isPlayerLockedByOpponent(explicitPlayer)) {
      soundFX.playVoltBuzz();
      setTakenWarningMessage(`"${explicitPlayer.name}": answer claimed by ${opponentLabel} — find an alternative!`);
      setTimeout(() => setTakenWarningMessage(null), 3500);
      return;
    }

    if (!explicitPlayer && searchInput.trim() && isPlayerLockedByOpponent(searchInput.trim())) {
      soundFX.playVoltBuzz();
      setTakenWarningMessage(`Answer claimed by ${opponentLabel} — find an alternative!`);
      setTimeout(() => setTakenWarningMessage(null), 3500);
      return;
    }

    const userEval = evaluatePlayerSubmission(searchInput, currentPuzzle, explicitPlayer);

    // If evaluated player resolved to the opponent's locked player
    if (userEval.matchedPlayer && isPlayerLockedByOpponent(userEval.matchedPlayer)) {
      soundFX.playVoltBuzz();
      setTakenWarningMessage(`"${userEval.matchedPlayer.name}": answer claimed by ${opponentLabel} — find an alternative!`);
      setTimeout(() => setTakenWarningMessage(null), 3500);
      return;
    }

    if (userEval.isLinkVerified) {
      soundFX.playSuccess();
    } else if (userEval.criteriaMetCount > 0) {
      soundFX.playClick(750);
    } else {
      soundFX.playVoltBuzz();
    }

    setSearchInput(userEval.playerName);
    holdKeyboard();
    submitUserChoice(userEval);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        soundFX.playClick(850);
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        soundFX.playClick(850);
        setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (suggestions.length > 0 && suggestions[highlightedIndex]) {
        handleSubmitGuess(suggestions[highlightedIndex]);
      } else if (searchInput.trim()) {
        handleSubmitGuess();
      }
    }
  };

  const handleNextRound = (targetRound?: number) => {
    if (isMultiplayer && !targetRound && !isHost) {
      return; // Guests cannot advance round unilaterally
    }
    const nextRoundNum = targetRound || roundNumber + 1;
    // Idempotent: a late host request or a guest fallback for a round we already reached is a no-op
    if (isMultiplayer && targetRound && targetRound <= roundNumberRef.current) return;
    if (isMultiplayer && !targetRound) {
      sendAction('next_round_request', { nextRound: nextRoundNum });
    }
    roundNumberRef.current = nextRoundNum;
    if (nextRoundNum > config.totalRounds) {
      soundFX.playVictoryFanfare();
      setPhase('match-over');
      return;
    }
    soundFX.playCardFlip();

    let nextPuzzle: LinkUpPuzzle;
    if (isMultiplayer && gameInitData?.sharedData?.puzzles?.[nextRoundNum - 1]) {
      nextPuzzle = gameInitData.sharedData.puzzles[nextRoundNum - 1];
    } else {
      nextPuzzle = generateLinkUpPuzzle(
        nextRoundNum,
        config.difficulty,
        activeSlots,
        usedSeedIdsRef.current
      );
      usedSeedIdsRef.current.add(nextPuzzle.seedPlayer.id);
    }

    setRoundNumber(nextRoundNum);
    setCurrentPuzzle(nextPuzzle);
    setSearchInput('');
    setSuggestions([]);
    setTakenWarningMessage(null);
    setLastRoundResult(null);
    setUserSubmittedEval(null);
    setOpponentLockedIn(false);
    setOpponentLockedEval(null);
    setPressureTimeLeft(null);
    setPhase('playing');
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }, 1000);
  };

  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number>(5);

  // Multiplayer auto-advance timer for round-result screen (5s auto transition)
  useEffect(() => {
    if (phase !== 'round-result' || !isMultiplayer) return;

    // The host advances; a guest only advances itself if the host's request never shows up
    let left = 5;
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
        fallbackTimer = setTimeout(() => handleNextRound(roundNumber + 1), HOST_FALLBACK_MS);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [phase, isMultiplayer, isHost, roundNumber]);

  // Keyboard shortcut listener: Second Enter on round-result explicitly advances to the next round (Solo mode only)
  useEffect(() => {
    if (phase !== 'round-result' || isMultiplayer) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        // Enforce 2-step Enter flow: ignore Enter if the round-result phase was just entered (< 450ms ago)
        if (Date.now() - roundResultEnteredAtRef.current < 450) {
          return;
        }
        e.preventDefault();
        handleNextRound();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [phase, roundNumber, config.totalRounds, activeSlots, isMultiplayer]);

  const handleRestartMatch = () => {
    soundFX.playClick(900);
    usedSeedIdsRef.current.clear();
    roundNumberRef.current = 1;
    pendingOpponentLocksRef.current = {};
    // Multiplayer rematches replay the server's freshly seeded puzzle set
    const seededPuzzle = isMultiplayer ? gameInitData?.sharedData?.puzzles?.[0] : undefined;
    const firstPuzzle =
      seededPuzzle ||
      generateLinkUpPuzzle(1, config.difficulty, config.slotTypes, usedSeedIdsRef.current);
    usedSeedIdsRef.current.add(firstPuzzle.seedPlayer.id);

    setRoundNumber(1);
    setCurrentPuzzle(firstPuzzle);
    setUserScore(0);
    setOpponentScore(0);
    setRoundHistory([]);
    setSearchInput('');
    setSuggestions([]);
    setLastRoundResult(null);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setPhase('playing');
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setTimeout(() => inputRef.current?.focus(), 60);
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
    handleRestartMatch();
  };

  const handleCopyCode = async () => {
    soundFX.playClick(800);
    try {
      await navigator.clipboard.writeText(config.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  /* ======================================================================
   * VISUAL CHOREOGRAPHY LAYER
   * Presentation-only refs, state & effects. They react to the game state
   * above and never feed back into it.
   * ====================================================================*/
  const fxRef = useRef<LuFxEngine | null>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([null, null, null]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const oppScoreRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fxTimersRef = useRef<number[]>([]);
  const prevRevealRef = useRef<number>(0);

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

  const nodeCenters = () => nodeRefs.current.map((el) => centerOf(el));

  // Sequential node acquisition: snap flash + spark ring per revealed criterion.
  useEffect(() => {
    const prev = prevRevealRef.current;
    prevRevealRef.current = revealedSlotCount;
    if (revealedSlotCount <= prev || revealedSlotCount === 0) return;
    const idx = revealedSlotCount - 1;
    const clueType = currentPuzzle.clues[idx]?.type ?? 'Club';
    const acc = SLOT_ACCENT[clueType].rgb;
    scheduleFx(() => {
      const fx = fxRef.current;
      const cs = nodeCenters();
      const c = cs[idx];
      if (!fx || !c) return;
      fx.flash(c.x, c.y, acc, Math.max(c.w, c.h) * 0.55, 0.4);
      fx.shockwave(c.x, c.y, acc, Math.max(c.w, c.h) * 0.6, 0.55, 3);
      fx.burst(c.x, c.y, acc, 22, 360);
      if (revealedSlotCount === 3) {
        if (cs[0] && cs[1]) fx.bolt(cs[0].x, cs[0].y, cs[1].x, cs[1].y, CYAN_RGB, 0.22);
        if (cs[1] && cs[2]) fx.bolt(cs[1].x, cs[1].y, cs[2].x, cs[2].y, CYAN_RGB, 0.22);
      }
    }, 30);
  }, [revealedSlotCount]);

  // Opponent lock-on: shockwave out of their scoreboard slot and across the console.
  useEffect(() => {
    if (!opponentLockedIn || phase !== 'playing') return;
    scheduleFx(() => {
      const fx = fxRef.current;
      if (!fx) return;
      const o = centerOf(oppScoreRef.current);
      if (o) {
        fx.shockwave(o.x, o.y, CYAN_RGB, 70, 0.6, 3);
        fx.burst(o.x, o.y, CYAN_RGB, 16, 300);
      }
      const con = centerOf(consoleRef.current);
      if (con) fx.shockwave(con.x, con.y, CYAN_RGB, con.w * 0.55, 0.8, 3);
    }, 20);
  }, [opponentLockedIn]);

  // Taken-player rejection: console shake + red flash.
  useEffect(() => {
    if (!takenWarningMessage) return;
    restartClass(consoleRef.current, 'lu-shake');
    const c = centerOf(consoleRef.current);
    if (c) fxRef.current?.flash(c.x, c.y, RED_RGB, c.w * 0.4, 0.35);
  }, [takenWarningMessage]);

  // Multiplayer lock while waiting on the opponent.
  useEffect(() => {
    if (!userSubmittedEval) return;
    const c = centerOf(consoleRef.current);
    if (!c) return;
    fxRef.current?.flash(c.x, c.y, VOLT_RGB, c.w * 0.45, 0.4);
    fxRef.current?.burst(c.x, c.y, VOLT_RGB, 24, 380);
  }, [userSubmittedEval]);

  // Round resolution: electric link verification, partial arcs, or a dead-link flash.
  useEffect(() => {
    if (phase !== 'round-result' || !lastRoundResult) return;
    const ue = lastRoundResult.userEval;
    scheduleFx(() => {
      const fx = fxRef.current;
      if (!fx) return;
      const cs = nodeCenters();
      const con = centerOf(consoleRef.current);
      const tone = ue.isLinkVerified ? VOLT_RGB : ue.criteriaMetCount > 0 ? CYAN_RGB : RED_RGB;
      if (con) fx.flash(con.x, con.y, tone, con.w * 0.4, 0.35);

      ue.matchedSlotIndices.forEach((i) => {
        const c = cs[i];
        if (!c) return;
        fx.flash(c.x, c.y, ue.isLinkVerified ? VOLT_RGB : CYAN_RGB, Math.max(c.w, c.h) * 0.5, 0.45);
        fx.shockwave(c.x, c.y, ue.isLinkVerified ? VOLT_RGB : CYAN_RGB, Math.max(c.w, c.h) * 0.65, 0.6, 3);
        fx.burst(c.x, c.y, ue.isLinkVerified ? VOLT_RGB : CYAN_RGB, 18, 360);
      });

      if (ue.isLinkVerified) {
        const pairs: Array<[number, number]> = [[0, 1], [1, 2], [0, 2]];
        for (let k = 0; k < 7; k++) {
          scheduleFx(() => {
            const live = nodeCenters();
            pairs.forEach(([a, b]) => {
              const pa = live[a];
              const pb = live[b];
              if (pa && pb) fxRef.current?.bolt(pa.x, pa.y, pb.x, pb.y, k % 2 ? CYAN_RGB : VOLT_RGB, 0.3);
            });
          }, k * 160);
        }
        const mid = cs[1];
        if (mid) {
          fx.confetti(mid.x, mid.y, 150, [VOLT_RGB, CYAN_RGB, '255,255,255', '52,211,153']);
          fx.shockwave(mid.x, mid.y, VOLT_RGB, Math.max(window.innerWidth, window.innerHeight) * 0.6, 1.1, 8);
        }
        restartClass(stageRef.current, 'lu-shake');
      } else if (ue.matchedSlotIndices.length >= 2) {
        const [a, b] = ue.matchedSlotIndices;
        for (let k = 0; k < 3; k++) {
          scheduleFx(() => {
            const live = nodeCenters();
            const pa = live[a];
            const pb = live[b];
            if (pa && pb) fxRef.current?.bolt(pa.x, pa.y, pb.x, pb.y, CYAN_RGB, 0.28);
          }, k * 180);
        }
      } else if (!ue.skipped && ue.criteriaMetCount === 0) {
        cs.forEach((c) => {
          if (c) fx.flash(c.x, c.y, RED_RGB, Math.max(c.w, c.h) * 0.45, 0.3);
        });
      }
    }, 60);
  }, [phase, lastRoundResult]);

  // Full-time confetti for the winner.
  useEffect(() => {
    if (phase !== 'match-over' || userScore < opponentScore) return;
    scheduleFx(() => {
      const fx = fxRef.current;
      if (!fx) return;
      const x = window.innerWidth / 2;
      fx.confetti(x, window.innerHeight * 0.3, 180, [VOLT_RGB, CYAN_RGB, '255,255,255', '251,191,36']);
      fx.shockwave(x, window.innerHeight * 0.3, VOLT_RGB, Math.max(window.innerWidth, window.innerHeight) * 0.55, 1.1, 7);
    }, 250);
  }, [phase]);

  // Keep the keyboard-highlighted suggestion in view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-row="${highlightedIndex}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, suggestions]);

  const underPressure = phase === 'playing' && opponentLockedIn && pressureTimeLeft !== null && !userSubmittedEval;
  const pressureHot = underPressure && pressureTimeLeft !== null && pressureTimeLeft <= 10;
  const resultEval = phase === 'round-result' && lastRoundResult ? lastRoundResult.userEval : null;
  const allRevealed = phase === 'round-result' || revealedSlotCount >= 3;
  const busLit = (i: number) =>
    phase === 'round-result' && lastRoundResult ? lastRoundResult.userEval.matchedSlotIndices.includes(i) : false;
  const busColor = resultEval?.isLinkVerified ? VOLT : CYAN;

  // ================= MATCH OVER SUMMARY SCREEN =================
  if (phase === 'match-over') {
    const userWon = userScore >= opponentScore;
    const verifiedCount = roundHistory.filter((r) => r.userEval.isLinkVerified).length;

    return (
      <div className="relative h-screen w-full bg-[#03050a] text-neutral-100 flex flex-col justify-between p-3 md:p-6 overflow-y-auto select-none font-sans">
        <style>{LU_CSS}</style>
        <TerminalBackdrop pressure={false} hot={false} />
        <LuFxCanvas engineRef={fxRef} />

        <div
          className="lu-panel lu-rise relative z-10 max-w-4xl w-full mx-auto my-auto p-5 md:p-8 flex flex-col gap-5"
          style={{ ['--lu-accent' as string]: userWon ? 'rgba(204,255,0,0.85)' : 'rgba(248,113,113,0.85)' } as React.CSSProperties}
        >
          <div className="text-center space-y-2 pb-4 border-b border-white/10">
            <div className="relative w-16 h-16 mx-auto mb-1 flex items-center justify-center">
              <div className="lu-spin absolute inset-0 rounded-full border border-dashed" style={{ borderColor: userWon ? 'rgba(204,255,0,0.4)' : 'rgba(248,113,113,0.4)' }} />
              <div className="absolute inset-2 rounded-full" style={{ background: `radial-gradient(circle, ${userWon ? 'rgba(204,255,0,0.3)' : 'rgba(248,113,113,0.25)'}, transparent 70%)` }} />
              <Trophy className="relative w-8 h-8" style={{ color: userWon ? VOLT : '#f87171', filter: `drop-shadow(0 0 10px ${userWon ? VOLT : '#f87171'})` }} />
            </div>
            <div className="lu-chamfer inline-flex items-center gap-2 px-3.5 py-1 bg-[#ccff00]/10 border border-[#ccff00]/40 text-[#ccff00] font-mono text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5" />
              <span>
                THE LINK-UP COMPLETE • {verifiedCount} / {config.totalRounds} LINKS VERIFIED
              </span>
            </div>
            <h1
              className={`lu-count font-athletic italic font-black text-5xl md:text-7xl uppercase tracking-wide leading-[0.9] ${
                userWon ? 'text-[#ccff00]' : 'text-red-400'
              }`}
              style={{ textShadow: userWon ? '0 0 40px rgba(204,255,0,0.45)' : '0 0 40px rgba(248,113,113,0.35)' }}
            >
              {userWon ? 'MASTER SCOUT VICTORY' : `${opponentLabel} PREVAILS`}
            </h1>
            <div className="flex items-center justify-center gap-6 sm:gap-10 pt-2">
              <div className="text-center">
                <span className="text-[10px] font-mono text-slate-400 uppercase block tracking-[0.2em]">YOUR SCORE</span>
                <span className="font-athletic font-black text-5xl text-[#ccff00] tabular-nums leading-none">{userScore}</span>
              </div>
              <span className="font-athletic italic text-slate-600 text-2xl font-black">VS</span>
              <div className="text-center">
                <span className="text-[10px] font-mono text-slate-400 uppercase block tracking-[0.2em]">{opponentLabel}</span>
                <span className="font-athletic font-black text-5xl text-[#00f0ff] tabular-nums leading-none">{opponentScore}</span>
              </div>
            </div>
          </div>

          {/* Round-by-Round Head-to-Head Recap */}
          <div className="grid grid-cols-1 gap-2 max-h-[calc(42vh/var(--zoom,1))] overflow-y-auto pr-1">
            {roundHistory.map((item, i) => {
              const wasSkipped = item.userEval.skipped;
              const wasVerified = item.userEval.isLinkVerified;
              return (
                <div
                  key={item.roundNumber}
                  className={`lu-rise lu-chamfer relative p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    wasSkipped
                      ? 'bg-gradient-to-r from-red-950/35 via-[#0c0f17] to-[#0c0f17] border-red-500/45'
                      : wasVerified
                      ? 'bg-gradient-to-r from-[#ccff00]/10 via-[#0c0f17] to-[#0c0f17] border-[#ccff00]/40'
                      : 'bg-[#0c0f17] border-white/10'
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: wasSkipped ? '#ef4444' : wasVerified ? VOLT : 'rgba(255,255,255,0.15)' }}
                  />
                  <div className="flex items-center gap-2.5 min-w-0 pl-1">
                    <span
                      className={`px-2 py-1 font-mono text-xs font-black shrink-0 ${
                        wasSkipped ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-white/5 text-white border border-white/10'
                      }`}
                    >
                      R{item.roundNumber}
                    </span>
                    <span className="font-mono text-[11px] text-slate-300 truncate">
                      {item.puzzle.clues.map((c) => c.value).join(' + ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {/* USER RESULT (Shows PASSED stamp in red if skipped, no player or missed text) */}
                    <div className="text-right flex items-center justify-end min-w-[120px] sm:min-w-[140px]">
                      {wasSkipped ? (
                        <span className="inline-flex items-center px-3 py-0.5 border-2 border-red-500/80 bg-red-500/15 font-mono font-black text-[11px] text-red-400 uppercase tracking-[0.18em] -rotate-2">
                          PASSED
                        </span>
                      ) : (
                        <div>
                          <span className="text-[9px] font-mono text-slate-400 uppercase flex items-center justify-end gap-1">
                            YOU ({item.userEval.criteriaMetCount}/3)
                            <CriteriaDots matched={item.userEval.matchedSlotIndices} color={VOLT} />
                          </span>
                          <span className="font-sans font-black text-xs text-[#ccff00] uppercase">
                            {item.userEval.playerName} (+{item.userEval.pointsAwarded})
                          </span>
                        </div>
                      )}
                    </div>

                    <span className="text-slate-600 font-athletic italic font-black text-sm">VS</span>

                    {/* OPPONENT RESULT */}
                    <div className="text-right min-w-[120px] sm:min-w-[140px]">
                      <span className="text-[9px] font-mono text-slate-400 uppercase flex items-center justify-end gap-1">
                        {opponentLabel} ({item.opponentEval.criteriaMetCount}/3)
                        <CriteriaDots matched={item.opponentEval.matchedSlotIndices} color={CYAN} />
                      </span>
                      <span className="font-sans font-black text-xs text-[#00f0ff] uppercase">
                        {item.opponentEval.playerName} (+{item.opponentEval.pointsAwarded})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              disabled={isMultiplayer && !isHost && hasRequestedRematch}
              onClick={handleRequestOrExecuteRematch}
              className={`lu-press lu-chamfer px-7 py-3 font-athletic italic font-black text-base md:text-lg uppercase tracking-wider flex items-center gap-2 ${
                isMultiplayer && !isHost && hasRequestedRematch
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                  : isMultiplayer && isHost && isOpponentRematchReady
                  ? 'lu-sheen bg-[#ccff00] hover:bg-[#d8ff33] text-black shadow-[0_0_25px_rgba(204,255,0,0.5)] cursor-pointer'
                  : 'lu-sheen bg-[#ccff00] hover:bg-[#d8ff33] text-black cursor-pointer'
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
            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                if (isMultiplayer) sendGameLeave();
                if (party.roomCode?.startsWith('match_')) {
                  leaveParty();
                }
                handleCleanExit();
              }}
              className="lu-press lu-chamfer px-7 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-athletic italic font-black text-base md:text-lg uppercase tracking-wider flex items-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>RETURN TO HUB</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#03050a] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
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

  return (
    <div className="relative min-h-screen min-h-[calc(100dvh/var(--zoom,1))] max-md:min-h-0 max-md:h-[var(--app-h,calc(100dvh/var(--zoom,1)))] w-full bg-[#03050a] text-neutral-100 flex flex-col overflow-x-hidden overflow-y-auto md:overflow-hidden select-none font-sans">
      {keyboardKeeper}
      <style>{LU_CSS}</style>
      <TerminalBackdrop pressure={underPressure} hot={pressureHot} />
      <LuFxCanvas engineRef={fxRef} />

      {/* ================= 0. OPENING 3-2-1 COUNTDOWN OVERLAY ================= */}
      {phase === 'opening-countdown' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#03050a]/95 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(88vw,560px)] aspect-square pointer-events-none">
            <div className="lu-spin absolute inset-0 rounded-full border border-dashed border-[#00f0ff]/20" />
            <div className="lu-spin-rev absolute inset-[12%] rounded-full border border-[#ccff00]/15" />
            <div className="absolute inset-[24%] rounded-full" style={{ background: 'radial-gradient(circle, rgba(204,255,0,0.14), transparent 65%)' }} />
          </div>
          <div className="relative text-center flex flex-col items-center">
            <span className="font-mono text-[11px] sm:text-xs uppercase tracking-[0.4em] text-[#ccff00] font-bold mb-1">
              GET READY TO LINK
            </span>
            <span className="font-athletic italic font-black text-2xl sm:text-4xl text-white/90 tracking-wide leading-none">
              SCOUTING <span className="text-[#00f0ff]">NETWORK</span> ONLINE
            </span>
            <div
              key={countdownValue}
              className="lu-count font-athletic italic font-black text-[140px] md:text-[200px] leading-[0.9] text-[#ccff00] mt-1"
              style={{ textShadow: '0 0 60px rgba(204,255,0,0.65)' }}
            >
              {countdownValue}
            </div>
            <p className="mt-3 text-[11px] font-mono text-slate-400 uppercase tracking-[0.35em]">
              MATCH STARTING...
            </p>
          </div>
        </div>
      )}

      {/* Synchronized Round Transition Curtain */}
      {roundTransitionCount !== null && (
        <div className="fixed inset-0 z-50 bg-[#03050a]/95 flex flex-col items-center justify-center">
          <div className="text-center space-y-3 px-6">
            <span className="font-mono text-[11px] tracking-[0.4em] text-[#00f0ff] uppercase block">
              ROUND {roundNumber} OF {config.totalRounds}
            </span>
            <h2 className="lu-count font-athletic italic font-black text-5xl md:text-7xl text-white uppercase tracking-wide leading-none">
              REVEALING CLUES...
            </h2>
            <div className="w-48 h-[3px] bg-white/10 mx-auto overflow-hidden">
              <div className="lu-bar h-full bg-gradient-to-r from-[#00f0ff] to-[#ccff00]" />
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 min-h-0 w-full max-w-6xl mx-auto flex flex-col gap-2.5 p-2.5 pb-16 sm:p-3 sm:pb-16 md:p-5">
        {/* ================= 1. TOP BROADCAST HUD BAR ================= */}
        <header className="lu-panel w-full flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-2 shrink-0">
          {/* Left: Round Pill + Static Difficulty Indicator */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="lu-chamfer flex items-center gap-2 bg-black/60 border border-[#00f0ff]/30 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]" />
              <span className="font-athletic italic font-black text-base sm:text-lg text-white tracking-wide leading-none whitespace-nowrap">
                <span className="hidden sm:inline">ROUND </span>
                <span className="sm:hidden">R</span>
                <span className="text-[#00f0ff]">{String(roundNumber).padStart(2, '0')}</span>
                <span className="text-slate-500"> / {config.totalRounds}</span>
              </span>
            </div>

            <div className="hidden md:block leading-none pl-1">
              <span className="font-athletic italic font-black text-lg text-white tracking-wide">
                THE <span className="text-[#ccff00]">LINK-UP</span>
              </span>
              <span className="block font-mono text-[8px] tracking-[0.35em] text-slate-500 mt-0.5">SCOUTING TERMINAL</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 lu-chamfer bg-black/50 border border-white/10 font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">
              <span className="text-slate-500">DIFF:</span>
              <span className="text-[#00f0ff] font-black">
                {config.difficultyCurve === 'rising' ? currentPuzzle.difficulty : config.difficulty}
              </span>
            </div>
          </div>

          {/* Center: Scoreboard & Lobby Badge */}
          <div className="lu-chamfer flex items-center gap-2.5 sm:gap-3 bg-black/60 border border-white/10 px-2.5 sm:px-3.5 py-1">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#ccff00]" />
              <span className="hidden sm:inline font-mono text-[10px] font-bold text-slate-400">YOU:</span>
              <ScoreCounter
                value={userScore}
                className="font-athletic font-black text-xl text-[#ccff00] leading-none"
                chipClass="bg-[#ccff00] text-black"
              />
            </div>

            <span className="text-slate-600 font-athletic italic font-black text-xs">VS</span>

            <div ref={oppScoreRef} className="flex items-center gap-1.5">
              {config.lobbyMode === 'solo' ? (
                <Bot className="w-3.5 h-3.5 text-[#00f0ff]" />
              ) : (
                <Users className="w-3.5 h-3.5 text-[#00f0ff]" />
              )}
              <span className="hidden sm:inline font-mono text-[10px] font-bold text-slate-400 truncate max-w-[110px]">{opponentLabel}:</span>
              <ScoreCounter
                value={opponentScore}
                className="font-athletic font-black text-xl text-white leading-none"
                chipClass="bg-[#00f0ff] text-black"
              />
              {phase === 'playing' && (opponentLockedIn || isOpponentTyping) && (
                <span
                  className={`hidden min-[400px]:inline px-1.5 py-[1px] font-mono text-[8px] font-black tracking-wider ${
                    opponentLockedIn ? 'bg-[#00f0ff] text-black' : 'border border-[#00f0ff]/50 text-[#00f0ff] lu-soft-pulse'
                  }`}
                >
                  {opponentLockedIn ? 'LOCKED' : 'TYPING'}
                </span>
              )}
            </div>

            {config.lobbyMode !== 'solo' && (
              <>
                <span className="hidden md:inline text-slate-600 font-mono">•</span>
                <div className="hidden md:flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-400">ROOM:</span>
                  <span className="font-bold text-[#ccff00] tracking-widest">
                    {isMasked ? '••••' : config.roomCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMasked(!isMasked)}
                    className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {isMasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right: Active Slot Strip + Exit */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center lu-chamfer bg-black/50 border border-white/10 px-2.5 py-1 gap-1" title="Current 3-Slot Link Formula">
              {currentPuzzle.slotTypes.map((slotType, sIdx) => (
                <React.Fragment key={sIdx}>
                  <span
                    className="px-1.5 py-[1px] border font-mono text-[9px] font-black uppercase tracking-wider"
                    style={{
                      color: SLOT_ACCENT[slotType].hex,
                      borderColor: `rgba(${SLOT_ACCENT[slotType].rgb},0.4)`,
                      background: `rgba(${SLOT_ACCENT[slotType].rgb},0.1)`,
                    }}
                  >
                    {slotType}
                  </span>
                  {sIdx < 2 && <span className="text-slate-600 font-mono text-[10px]">+</span>}
                </React.Fragment>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                setShowForfeitModal(true);
              }}
              className="lu-press lu-chamfer min-h-[40px] px-3.5 py-1.5 bg-white/5 hover:bg-red-950/50 border border-white/10 hover:border-red-500/40 text-slate-300 hover:text-red-300 text-xs font-mono font-bold tracking-wider cursor-pointer flex items-center justify-center"
            >
              EXIT
            </button>
          </div>
        </header>

        {/* ================= 2. CRITERION NODE STAGE ================= */}
        <main className="relative flex-1 min-h-0 w-full flex flex-col justify-between gap-2.5">
          <div ref={stageRef} className="relative my-auto w-full">
            <div className="flex items-center justify-between px-1 mb-2 font-mono text-[9px] sm:text-[10px] tracking-[0.3em] text-slate-500">
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3 h-3 text-[#00f0ff]" />
                {allRevealed ? 'TARGET NODES LOCKED' : 'ACQUIRING TARGET NODES'}
              </span>
              <span className={allRevealed ? 'text-[#ccff00]' : ''}>
                {phase === 'round-result' ? 'LINK ANALYSIS' : `${Math.min(3, revealedSlotCount)}/3 ONLINE`}
              </span>
            </div>

            {/* 3 Criterion Nodes with sequential snap reveal */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3.5 md:gap-5 items-stretch relative">
              {currentPuzzle.clues.map((clue, idx) => {
                const isSlotMatched =
                  phase === 'round-result' &&
                  lastRoundResult?.userEval.matchedSlotIndices.includes(idx);
                const isRevealed = phase === 'round-result' || idx < revealedSlotCount;
                return (
                  <div
                    key={`${currentPuzzle.id}-slot-${idx}`}
                    ref={(el) => {
                      nodeRefs.current[idx] = el;
                    }}
                    className="relative"
                  >
                    <ClueSlotCard
                      clue={clue}
                      isMatched={Boolean(isSlotMatched)}
                      showResultState={phase === 'round-result'}
                      isRevealed={isRevealed}
                      slotNumber={idx + 1}
                      opponentMatched={
                        phase === 'round-result' && lastRoundResult
                          ? lastRoundResult.opponentEval.matchedSlotIndices.includes(idx)
                          : undefined
                      }
                      celebrate={Boolean(resultEval?.isLinkVerified)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Circuit bus wiring the nodes into the console */}
            <svg className="w-full h-7 sm:h-9 block" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true">
              {[50, 150, 250].map((x, i) => (
                <line
                  key={`stub-${x}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={15}
                  stroke={busLit(i) ? busColor : 'rgba(0,240,255,0.22)'}
                  strokeWidth={busLit(i) ? 2.2 : 1}
                  vectorEffect="non-scaling-stroke"
                  style={busLit(i) ? { filter: `drop-shadow(0 0 4px ${busColor})` } : undefined}
                />
              ))}
              <line x1={50} y1={15} x2={250} y2={15} stroke="rgba(0,240,255,0.18)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line
                className="lu-flow"
                x1={50}
                y1={15}
                x2={250}
                y2={15}
                stroke={resultEval?.isLinkVerified ? VOLT : CYAN}
                strokeOpacity={resultEval?.isLinkVerified ? 0.9 : 0.45}
                strokeWidth={resultEval?.isLinkVerified ? 2.4 : 1.2}
                strokeDasharray="4 8"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={150}
                y1={15}
                x2={150}
                y2={30}
                stroke={resultEval?.isLinkVerified ? VOLT : 'rgba(0,240,255,0.3)'}
                strokeWidth={resultEval?.isLinkVerified ? 2.2 : 1}
                vectorEffect="non-scaling-stroke"
              />
              {[50, 150, 250].map((x, i) => (
                <rect
                  key={`via-${x}`}
                  x={x - 2.5}
                  y={12.5}
                  width={5}
                  height={5}
                  fill={busLit(i) ? busColor : '#03050a'}
                  stroke={busLit(i) ? busColor : 'rgba(0,240,255,0.5)'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {/* LINK VERDICT STAMP */}
            {resultEval && (
              <div
                key={`stamp-${roundNumber}`}
                className="lu-stamp absolute left-1/2 top-[44%] z-30 pointer-events-none"
              >
                <div
                  className={`relative overflow-hidden px-5 sm:px-8 py-2 sm:py-3 border-[3px] text-center whitespace-nowrap ${
                    !resultEval.isLinkVerified && !resultEval.skipped && resultEval.criteriaMetCount === 0 ? 'lu-verdict-nudge' : ''
                  }`}
                  style={{
                    borderColor: resultEval.isLinkVerified
                      ? VOLT
                      : resultEval.skipped
                      ? '#ef4444'
                      : resultEval.criteriaMetCount > 0
                      ? CYAN
                      : '#ef4444',
                    background: 'rgba(3,5,10,0.88)',
                    boxShadow: resultEval.isLinkVerified
                      ? '0 0 50px rgba(204,255,0,0.5), inset 0 0 24px rgba(204,255,0,0.2)'
                      : '0 0 30px rgba(0,0,0,0.8)',
                  }}
                >
                  {!resultEval.skipped && (resultEval.isLinkVerified || resultEval.criteriaMetCount > 0) && (
                    <div
                      className="lu-verdict-glint"
                      style={{ ['--glint' as string]: resultEval.isLinkVerified ? 'rgba(204,255,0,0.35)' : 'rgba(0,240,255,0.22)' } as React.CSSProperties}
                    />
                  )}
                  <div
                    className="lu-verdict-in font-athletic italic font-black text-4xl sm:text-6xl md:text-7xl leading-[0.9] tracking-wide"
                    style={{
                      color: resultEval.isLinkVerified
                        ? VOLT
                        : resultEval.skipped
                        ? '#f87171'
                        : resultEval.criteriaMetCount > 0
                        ? CYAN
                        : '#f87171',
                      textShadow: resultEval.isLinkVerified ? '0 0 30px rgba(204,255,0,0.75)' : 'none',
                    }}
                  >
                    {resultEval.isLinkVerified
                      ? 'LINK VERIFIED'
                      : resultEval.skipped
                      ? 'PASSED'
                      : resultEval.criteriaMetCount > 0
                      ? 'PARTIAL LINK'
                      : 'NO LINK'}
                  </div>
                  <div className="font-mono text-[10px] sm:text-xs font-black tracking-[0.35em] text-white/80 mt-1">
                    {resultEval.skipped
                      ? 'ROUND FORFEITED'
                      : `${resultEval.criteriaMetCount}/3 CRITERIA • +${resultEval.pointsAwarded} PTS`}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= 3. BOTTOM ANSWER CONSOLE OR HEAD-TO-HEAD RESULT BOARD ================= */}
          {phase === 'playing' ? (
            <div
              ref={consoleRef}
              onPointerDown={keepTypingFocus}
              onMouseDown={keepTypingFocus}
              className="w-full max-w-3xl mx-auto flex flex-col gap-2 shrink-0 pb-[max(4px,env(safe-area-inset-bottom))] kb:pb-1"
            >
              {/* Warning banner when attempting to pick opponent's locked player */}
              {takenWarningMessage && (
                <div className="lu-rise lu-chamfer px-4 py-2 bg-rose-950/85 border border-rose-500/70 text-rose-300 font-mono text-xs font-bold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{takenWarningMessage}</span>
                </div>
              )}

              {/* Rival's locked answer, revealed the moment it lands (it is now claimed for this round) */}
              {opponentLockedIn && opponentLockedEval && (
                <div className="lu-rise lu-chamfer px-3 py-2 bg-[#00f0ff]/[0.07] border border-[#00f0ff]/45 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block font-mono text-[9px] font-black tracking-[0.25em] text-[#00f0ff]/80 uppercase">
                      {opponentLabel} locked in
                    </span>
                    <span className="block font-athletic italic font-black text-lg sm:text-xl text-white uppercase leading-tight truncate">
                      {opponentLockedEval.skipped ? 'Skipped' : opponentLockedEval.matchedPlayer?.name ?? opponentLockedEval.playerName}
                    </span>
                  </div>
                  {!opponentLockedEval.skipped && (
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-slate-300">
                        {opponentLockedEval.criteriaMetCount}/3
                      </span>
                      {opponentLockedEval.matchedPlayer && (
                        <span className="px-1.5 py-0.5 bg-[#00f0ff] text-black font-mono text-[9px] font-black tracking-wider">
                          CLAIMED
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 30s Pressure Countdown Banner (Appears once Opponent locks in their answer) */}
              {opponentLockedIn && pressureTimeLeft !== null && (
                <div
                  className={`lu-rise lu-chamfer pl-3 pr-2 py-1.5 border flex items-center justify-between gap-3 ${
                    pressureTimeLeft <= 10
                      ? 'bg-red-950/70 border-red-500/60 text-red-300'
                      : 'bg-[#071018]/95 border-[#00f0ff]/40 text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${pressureTimeLeft <= 10 ? 'bg-red-400' : 'bg-[#00f0ff]'}`}
                        style={{ boxShadow: `0 0 6px ${pressureTimeLeft <= 10 ? '#f87171' : CYAN}` }}
                      />
                      <span className="truncate">{opponentLabel} LOCKED IN AN ANSWER!</span>
                    </div>
                    <div className="mt-1 h-[3px] bg-white/10 overflow-hidden">
                      <div
                        className="h-full transition-[width] duration-100 ease-linear"
                        style={{
                          width: `${(pressureTimeLeft / 30) * 100}%`,
                          background: pressureTimeLeft <= 10 ? '#ff3b30' : CYAN,
                          boxShadow: `0 0 8px ${pressureTimeLeft <= 10 ? '#ff3b30' : CYAN}`,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    className={`flex items-center gap-2 font-mono font-black text-sm tracking-widest ${
                      pressureTimeLeft <= 10 ? 'text-red-400' : 'text-[#00f0ff]'
                    }`}
                  >
                    <Clock className="hidden sm:block w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{pressureTimeLeft.toFixed(1)}s</span>
                    <PressureDial seconds={pressureTimeLeft} urgent={pressureTimeLeft <= 10} size={50} />
                  </div>
                </div>
              )}

              {/* Autocomplete Floating Dropdown (Renders cleanly above the input bar) */}
              <div className="relative w-full">
                {suggestions.length > 0 && (
                  <div className="lu-drop-in lu-chamfer absolute bottom-full mb-2 inset-x-0 bg-[#070b13]/95 border border-[#00f0ff]/25 shadow-[0_20px_60px_rgba(0,0,0,0.95),0_0_30px_rgba(0,240,255,0.08)] z-40">
                    <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-white/[0.06] font-mono text-[9px] tracking-[0.3em] text-slate-500">
                      <span>SCOUT DATABASE • {suggestions.length} MATCHES</span>
                      <span className="hidden sm:inline">↑↓ NAVIGATE • ↵ LOCK</span>
                    </div>
                    <div ref={listRef} className="relative overflow-y-auto max-h-48 sm:max-h-60">
                      <div
                        className="absolute left-0 right-0 top-0 h-11 pointer-events-none transition-transform duration-200"
                        style={{
                          transform: `translate3d(0, ${highlightedIndex * 44}px, 0)`,
                          transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
                          background: 'linear-gradient(90deg, rgba(204,255,0,0.16), rgba(204,255,0,0.03))',
                          boxShadow: `inset 3px 0 0 ${VOLT}`,
                          opacity: suggestions[highlightedIndex] && !isPlayerLockedByOpponent(suggestions[highlightedIndex]) ? 1 : 0,
                        }}
                      />
                      {suggestions.map((player, sIdx) => {
                        const isHighlighted = sIdx === highlightedIndex;
                        const isTaken = isPlayerLockedByOpponent(player);
                        const posColor = POS_CHIP[player.position] || '#94a3b8';
                        return (
                          <button
                            key={player.id}
                            data-row={sIdx}
                            type="button"
                            disabled={isTaken}
                            onMouseEnter={() => setHighlightedIndex(sIdx)}
                            onClick={() => {
                              if (isTaken) {
                                soundFX.playVoltBuzz();
                                setTakenWarningMessage(`"${player.name}" was already taken by ${opponentLabel}! Choose another player.`);
                                setTimeout(() => setTakenWarningMessage(null), 3500);
                                return;
                              }
                              handleSubmitGuess(player);
                            }}
                            className={`lu-row-in relative w-full h-11 px-4 text-left flex items-center justify-between gap-3 border-b border-white/[0.04] ${
                              isTaken
                                ? 'bg-rose-500/10 text-neutral-500 cursor-not-allowed opacity-75'
                                : 'text-slate-200 cursor-pointer active:scale-[0.99]'
                            }`}
                            style={{ animationDelay: `${Math.min(sIdx, 6) * 35}ms` }}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`font-sans font-black text-sm uppercase truncate transition-transform duration-200 ${
                                  isTaken ? 'line-through text-neutral-500' : isHighlighted ? 'text-white translate-x-1' : 'text-white/85'
                                }`}
                              >
                                {player.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isTaken ? (
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400 bg-rose-500/15 px-2 py-0.5 border border-rose-500/30">
                                  TAKEN BY {opponentLabel}
                                </span>
                              ) : (
                                <>
                                  <span
                                    className="text-[10px] font-mono font-black px-1.5 py-0.5 border shrink-0"
                                    style={{ color: posColor, borderColor: `${posColor}66`, background: `${posColor}1a` }}
                                  >
                                    {player.position}
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono font-black px-2 py-0.5 transition-all duration-200 ${
                                      isHighlighted ? 'bg-[#ccff00] text-black' : 'bg-white/5 text-[#ccff00]'
                                    }`}
                                  >
                                    LOCK IN{isHighlighted ? ' ↵' : ''}
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

                {/* Opponent typing indicator */}
                {isOpponentTyping && !opponentLockedIn && (
                  <div className="text-[11px] font-mono text-[#00f0ff] flex items-center gap-1.5 lu-soft-pulse pl-2 mb-1">
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-[#00f0ff]" />
                      <span className="w-1 h-1 rounded-full bg-[#00f0ff]/70" />
                      <span className="w-1 h-1 rounded-full bg-[#00f0ff]/40" />
                    </span>
                    <span>{opponentLabel} is typing a player...</span>
                  </div>
                )}

                {/* Waiting for opponent banner OR Search Input */}
                {userSubmittedEval ? (
                  <div className="lu-rise lu-chamfer w-full min-h-12 bg-[#0a120a]/95 border-2 border-[#ccff00]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-4 py-2 text-xs font-mono shadow-[0_0_24px_rgba(204,255,0,0.15)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#ccff00] shrink-0" />
                      <span className="text-white font-bold uppercase tracking-wider truncate">
                        LOCKED IN: <span className="text-[#ccff00]">{userSubmittedEval.playerName}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-[#00f0ff] animate-spin" />
                      <span className="font-bold text-[#00f0ff]">
                        WAITING FOR {opponentLabel.toUpperCase()} ({pressureTimeLeft !== null ? pressureTimeLeft.toFixed(1) : '30.0'}s)...
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Search Input & Submit Row */
                  <div className="flex items-stretch gap-2">
                    <div className="relative flex-1 min-w-0 group">
                      <div
                        className="absolute -inset-[1px] lu-chamfer opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{ background: 'linear-gradient(90deg, rgba(204,255,0,0.7), rgba(0,240,255,0.6))' }}
                      />
                      <div className="relative lu-chamfer bg-[#070b13] h-full">
                        <Search className="w-4 h-4 text-slate-500 group-focus-within:text-[#ccff00] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" />
                        <span className="absolute left-9 top-1/2 -translate-y-1/2 font-mono text-[#00f0ff] text-sm pointer-events-none">›</span>
                        <input
                          ref={inputRef}
                          type="text"
                          value={searchInput}
                          onChange={(e) => {
                            soundFX.playTypingTick();
                            setSearchInput(e.target.value);
                            // Throttled: the opponent's indicator stays lit for 2s per ping
                            const now = Date.now();
                            if (isMultiplayer && now - lastTypingSentAtRef.current >= TYPING_PING_INTERVAL_MS) {
                              lastTypingSentAtRef.current = now;
                              sendAction('player_typing', { isTyping: true });
                            }
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="Type a player name..."
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          className="w-full h-12 md:h-[52px] pl-12 pr-16 bg-transparent border border-white/10 text-white font-sans font-bold text-base sm:text-[15px] placeholder:text-slate-500 placeholder:font-medium focus:outline-none caret-[#ccff00]"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-[0.2em] pointer-events-none">
                          {opponentLockedIn && pressureTimeLeft !== null && suggestions.length > 0 ? (
                            <span className={`font-black ${pressureTimeLeft <= 10 ? 'text-red-400' : 'text-[#00f0ff]'}`}>
                              ⏱ {pressureTimeLeft.toFixed(1)}s
                            </span>
                          ) : searchInput.trim().length >= 3 ? (
                            <span className="text-[#ccff00]">{suggestions.length} HITS</span>
                          ) : searchInput.trim().length > 0 ? (
                            <span className="text-slate-500">{3 - searchInput.trim().length} MORE</span>
                          ) : (
                            <span className="text-slate-600 lu-caret">█</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (suggestions.length > 0 && suggestions[highlightedIndex]) {
                          handleSubmitGuess(suggestions[highlightedIndex]);
                        } else if (searchInput.trim()) {
                          handleSubmitGuess();
                        }
                      }}
                      className="lu-press lu-sheen lu-chamfer h-12 md:h-[52px] px-4 sm:px-6 bg-gradient-to-b from-[#e2ff4d] via-[#ccff00] to-[#9fd400] text-black font-athletic italic font-black text-base md:text-lg uppercase tracking-wider shadow-[0_0_22px_rgba(204,255,0,0.3)] flex items-center gap-1.5 shrink-0 cursor-pointer hover:brightness-110"
                    >
                      <Zap className="w-4 h-4 fill-black" />
                      <span>LOCK<span className="hidden min-[400px]:inline"> LINK</span></span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSkipRound}
                      className="lu-press lu-chamfer h-12 md:h-[52px] px-3 sm:px-4 bg-white/5 hover:bg-red-950/40 border border-white/10 hover:border-red-500/40 text-slate-300 hover:text-red-300 font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0 cursor-pointer"
                      title="Skip Round"
                    >
                      <SkipForward className="w-4 h-4" />
                      <span className="hidden sm:inline">SKIP</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= HEAD-TO-HEAD BROADCAST SCOREBOARD ================= */
            lastRoundResult && (
              <div
                ref={consoleRef}
                className="lu-rise lu-panel w-full max-w-5xl mx-auto px-3 sm:px-4 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0"
                style={{ ['--lu-accent' as string]: lastRoundResult.userEval.isLinkVerified ? 'rgba(204,255,0,0.85)' : 'rgba(0,240,255,0.7)' } as React.CSSProperties}
              >
                {/* Both Players' Submitted Answers Side-by-Side */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <SubmissionSummaryPill
                    title="YOUR ANSWER"
                    evaluation={lastRoundResult.userEval}
                    isPrimaryUser={true}
                    clues={lastRoundResult.puzzle.clues}
                  />
                  <SubmissionSummaryPill
                    title={`${opponentLabel} ANSWER`}
                    evaluation={lastRoundResult.opponentEval}
                    isPrimaryUser={false}
                    clues={lastRoundResult.puzzle.clues}
                  />
                </div>

                {/* Next Round Action */}
                {isMultiplayer ? (
                  <div className="lu-chamfer relative overflow-hidden px-5 py-3.5 kb:py-2.5 bg-white/[0.06] kb:bg-[#0b0f17] text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 border border-white/15 kb:!sticky kb:bottom-1 kb:z-20">
                    <div
                      className="absolute left-0 bottom-0 h-[2px] bg-[#ccff00] transition-[width] duration-1000 ease-linear"
                      style={{ width: `${(autoAdvanceSeconds / 5) * 100}%` }}
                    />
                    <Clock className="w-3.5 h-3.5 text-[#ccff00] animate-spin" />
                    <span>
                      {roundNumber >= config.totalRounds
                        ? `FINAL SCOREBOARD IN ${autoAdvanceSeconds}S...`
                        : `NEXT QUESTION IN ${autoAdvanceSeconds}S...`}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleNextRound()}
                    className="lu-press lu-sheen lu-chamfer px-6 py-3.5 kb:py-2.5 kb:!sticky kb:bottom-1 kb:z-20 bg-gradient-to-b from-[#e2ff4d] via-[#ccff00] to-[#9fd400] text-black font-athletic italic font-black text-base uppercase tracking-wider shadow-[0_0_22px_rgba(204,255,0,0.3)] flex items-center justify-center gap-2 shrink-0 cursor-pointer hover:brightness-110"
                  >
                    <span>{roundNumber >= config.totalRounds ? 'FINAL SCOREBOARD' : 'NEXT ROUND'}</span>
                    <span className="px-1.5 py-0.5 bg-black/20 text-[10px] font-mono font-bold not-italic tracking-tight">
                      ENTER
                    </span>
                  </button>
                )}
              </div>
            )
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
 * TERMINAL BACKDROP — pitch schematics, radar sweep, pressure vignette.
 * All motion is transform/opacity only.
 * ==========================================================================*/

const TerminalBackdrop: React.FC<{ pressure: boolean; hot: boolean }> = ({ pressure, hot }) => (
  <>
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 35%, rgba(0,240,255,0.07), transparent 62%), radial-gradient(ellipse 55% 45% at 50% 110%, rgba(204,255,0,0.07), transparent 60%), #03050a',
        }}
      />
      <div className="absolute inset-0 pitch-grid-bg opacity-40" />
      <svg className="absolute inset-0 w-full h-full opacity-[0.07]" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice">
        <g fill="none" stroke="#00f0ff" strokeWidth="1.5">
          <rect x="40" y="40" width="920" height="560" />
          <line x1="500" y1="40" x2="500" y2="600" />
          <circle cx="500" cy="320" r="90" />
          <circle cx="500" cy="320" r="3" fill="#00f0ff" />
          <rect x="40" y="170" width="150" height="300" />
          <rect x="40" y="245" width="55" height="150" />
          <rect x="810" y="170" width="150" height="300" />
          <rect x="905" y="245" width="55" height="150" />
          <path d="M190 260 A 80 80 0 0 1 190 380" />
          <path d="M810 260 A 80 80 0 0 0 810 380" />
        </g>
      </svg>
      <div
        className="lu-radar absolute top-1/2 left-1/2 w-[160vmax] h-[160vmax] rounded-full opacity-[0.18]"
        style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0,240,255,0.22) 28deg, transparent 52deg)' }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.78) 100%)' }} />
    </div>
    {pressure && (
      <div
        className={`lu-pressure ${hot ? 'lu-pressure-hot' : ''} pointer-events-none fixed inset-0 z-30`}
        style={{
          boxShadow: hot
            ? 'inset 0 0 0 2px rgba(255,59,48,0.55), inset 0 0 140px rgba(255,59,48,0.38)'
            : 'inset 0 0 0 1px rgba(0,240,255,0.35), inset 0 0 120px rgba(0,240,255,0.16)',
        }}
        aria-hidden="true"
      />
    )}
  </>
);

const CriteriaDots: React.FC<{ matched: number[]; color: string }> = ({ matched, color }) => (
  <span className="inline-flex gap-[3px] ml-1">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1.5 h-1.5"
        style={{
          background: matched.includes(i) ? color : 'rgba(255,255,255,0.12)',
          boxShadow: matched.includes(i) ? `0 0 4px ${color}` : 'none',
        }}
      />
    ))}
  </span>
);

interface SubmissionSummaryPillProps {
  title: string;
  evaluation: LinkUpPlayerEvaluation;
  isPrimaryUser: boolean;
  clues?: LinkUpClue[];
}

const SubmissionSummaryPill: React.FC<SubmissionSummaryPillProps> = ({
  title,
  evaluation,
  isPrimaryUser,
  clues = [],
}) => {
  const accent = isPrimaryUser ? VOLT : CYAN;
  const accentRgb = isPrimaryUser ? VOLT_RGB : CYAN_RGB;

  // Special red stamp layout when the round was skipped/passed
  if (evaluation.skipped) {
    return (
      <div className="lu-chamfer relative border border-red-500/45 bg-gradient-to-r from-red-950/40 via-black/50 to-red-950/20 px-4 py-2.5 flex items-center justify-between gap-3 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500" />
        <div className="min-w-0">
          <span className="text-[10px] font-mono font-bold text-red-300/80 uppercase tracking-wider block">
            {title}
          </span>
          <div className="font-athletic italic font-black text-xl md:text-2xl text-red-200 uppercase tracking-wide leading-tight">
            ROUND PASSED
          </div>
        </div>

        <div className="px-3.5 py-1 border-2 border-red-500/80 bg-red-500/15 text-red-400 font-mono font-black text-xs md:text-sm uppercase tracking-[0.2em] -rotate-3 shrink-0">
          SKIPPED
        </div>
      </div>
    );
  }

  const statusText = evaluation.isLinkVerified
    ? 'LINK VERIFIED'
    : evaluation.criteriaMetCount > 0
    ? 'PARTIAL LINK'
    : 'NO LINK';

  const statusColor = evaluation.isLinkVerified ? VOLT : evaluation.criteriaMetCount > 0 ? CYAN : '#f87171';

  return (
    <div
      className="lu-chamfer relative border px-3.5 py-2.5 flex flex-col gap-2 overflow-hidden"
      style={{
        background: evaluation.isLinkVerified
          ? `linear-gradient(90deg, rgba(${accentRgb},0.14), rgba(5,7,12,0.85))`
          : 'rgba(5,7,12,0.8)',
        borderColor: evaluation.isLinkVerified ? `rgba(${accentRgb},0.5)` : 'rgba(255,255,255,0.1)',
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent, boxShadow: `0 0 10px ${accent}` }} />
      {evaluation.isLinkVerified && <div className="lu-holo" />}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">{title}</span>
            <span
              className="lu-pill-pop px-1.5 py-[1px] border font-mono text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
              style={{ color: statusColor, borderColor: `${statusColor}66`, background: `${statusColor}1a` }}
            >
              {evaluation.isLinkVerified ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
              <span>{statusText}</span>
            </span>
          </div>
          <div className="font-athletic italic font-black text-xl md:text-2xl text-white uppercase truncate leading-tight mt-0.5">
            {evaluation.playerName}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-athletic font-black text-2xl leading-none tabular-nums" style={{ color: accent }}>
            +{evaluation.pointsAwarded} <span className="text-xs font-mono">PTS</span>
          </div>
          <div className="font-mono text-[10px] font-bold text-slate-300 uppercase mt-0.5">
            {evaluation.criteriaMetCount}/3 CRITERIA MET
          </div>
        </div>
      </div>

      {/* Per-criterion hit matrix */}
      {clues.length === 3 && (
        <div className="grid grid-cols-3 gap-1.5">
          {clues.map((c, i) => {
            const hit = evaluation.matchedSlotIndices.includes(i);
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 px-1.5 py-1 border min-w-0"
                style={{
                  borderColor: hit ? `rgba(${accentRgb},0.5)` : 'rgba(255,255,255,0.06)',
                  background: hit ? `rgba(${accentRgb},0.1)` : 'rgba(255,255,255,0.02)',
                }}
              >
                {hit ? (
                  <Check className="w-3 h-3 shrink-0" style={{ color: accent }} />
                ) : (
                  <XCircle className="w-3 h-3 shrink-0 text-slate-600" />
                )}
                <span className={`font-mono text-[9px] font-bold uppercase truncate ${hit ? 'text-white' : 'text-slate-500'}`}>
                  {c.value}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface ClueSlotCardProps {
  clue: LinkUpClue;
  isMatched: boolean;
  showResultState: boolean;
  isRevealed?: boolean;
  slotNumber?: number;
  opponentMatched?: boolean;
  celebrate?: boolean;
}

const ClueSlotCard: React.FC<ClueSlotCardProps> = ({
  clue,
  isMatched,
  showResultState,
  isRevealed = true,
  slotNumber = 1,
  opponentMatched,
  celebrate = false,
}) => {
  const isClub = clue.type === 'Club';
  const isNation = clue.type === 'Nation';
  const posMeta =
    clue.type === 'Position' ? POSITION_META[clue.value as keyof typeof POSITION_META] : null;
  const acc = SLOT_ACCENT[clue.type];

  const brackets = (color: string, animate: boolean) => (
    <>
      {[
        { cls: 'top-1.5 left-1.5 border-t-2 border-l-2', bx: '-8px', by: '-8px' },
        { cls: 'top-1.5 right-1.5 border-t-2 border-r-2', bx: '8px', by: '-8px' },
        { cls: 'bottom-1.5 left-1.5 border-b-2 border-l-2', bx: '-8px', by: '8px' },
        { cls: 'bottom-1.5 right-1.5 border-b-2 border-r-2', bx: '8px', by: '8px' },
      ].map((b) => (
        <span
          key={b.cls}
          className={`absolute w-3 h-3 sm:w-4 sm:h-4 pointer-events-none z-20 ${b.cls} ${animate ? 'lu-bracket' : ''}`}
          style={{ borderColor: color, ['--bx' as string]: b.bx, ['--by' as string]: b.by } as React.CSSProperties}
        />
      ))}
    </>
  );

  // Not yet acquired: radar spinner + decrypting text
  if (!isRevealed) {
    return (
      <div className="lu-chamfer relative h-full bg-[#060910] border border-white/10 px-2 sm:px-5 py-3 sm:py-5 flex flex-col items-center justify-between text-center overflow-hidden min-h-[172px] sm:min-h-[220px] md:min-h-[250px]">
        {brackets('rgba(148,163,184,0.35)', false)}
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 4px)' }}
        />
        <div className="lu-scan-y absolute inset-x-0 top-0 h-1/4 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(0,240,255,0.12), transparent)' }} />

        <div className="w-full flex items-center justify-between font-mono text-[8px] sm:text-[10px] uppercase tracking-wider text-slate-500 z-10">
          <span className="font-bold">NODE 0{slotNumber}</span>
          <span className="hidden sm:inline px-1.5 py-0.5 bg-white/5 border border-white/10 text-[9px] font-black text-slate-400">SCANNING</span>
        </div>

        <div className="my-auto py-2 flex flex-col items-center justify-center z-10">
          <div className="relative w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 mb-2 flex items-center justify-center">
            <div className="lu-spin-fast absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent, rgba(0,240,255,0.5), transparent 30%)' }} />
            <div className="absolute inset-[3px] rounded-full bg-[#060910] border border-white/10" />
            <Sparkles className="relative w-5 h-5 sm:w-7 sm:h-7 text-slate-500" />
          </div>
          <ScrambleText length={7} className="font-mono text-[10px] sm:text-xs font-black tracking-[0.2em] text-[#00f0ff]/70" />
          <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.3em] text-slate-600 mt-1">ACQUIRING</span>
        </div>

        <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>
    );
  }

  const borderColor = showResultState
    ? isMatched
      ? celebrate
        ? VOLT
        : CYAN
      : 'rgba(248,113,113,0.35)'
    : `rgba(${acc.rgb},0.45)`;
  const glow = showResultState && isMatched
    ? `0 0 30px rgba(${celebrate ? VOLT_RGB : CYAN_RGB},0.35), inset 0 0 30px rgba(${celebrate ? VOLT_RGB : CYAN_RGB},0.1)`
    : '0 18px 40px rgba(0,0,0,0.7)';

  return (
    <div
      className={`lu-chamfer lu-snap relative h-full border px-2 sm:px-5 py-3 sm:py-5 flex flex-col items-center justify-between text-center overflow-hidden min-h-[172px] sm:min-h-[220px] md:min-h-[250px] transition-[opacity,filter] duration-500 ${
        showResultState && !isMatched ? 'opacity-70 saturate-50' : ''
      }`}
      style={{
        background: `linear-gradient(180deg, rgba(${acc.rgb},0.09), rgba(6,9,16,0.96) 45%)`,
        borderColor,
        boxShadow: glow,
      }}
    >
      {brackets(showResultState && isMatched ? (celebrate ? VOLT : CYAN) : acc.hex, true)}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px)' }}
      />
      {showResultState && isMatched && celebrate && <div className="lu-holo" />}

      {/* Top Slot Type Header */}
      <div className="w-full flex items-center justify-between font-mono text-[8px] sm:text-[10px] uppercase tracking-wider text-slate-400 z-10 gap-1">
        <span className="flex items-center gap-1 font-bold text-slate-300 min-w-0">
          {isClub ? (
            <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color: acc.hex }} />
          ) : isNation ? (
            <Globe2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color: acc.hex }} />
          ) : (
            <Crosshair className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color: acc.hex }} />
          )}
          <span className="truncate">
            <span className="hidden sm:inline">SLOT 0{clue.slotIndex + 1} • </span>
            {clue.type}
          </span>
        </span>

        <span className="hidden md:inline px-1.5 py-0.5 bg-white/5 border border-white/10 text-[9px] font-black text-slate-300 truncate">
          {clue.subLabel}
        </span>
      </div>

      {/* Center Emblem / Club Crest / Nation Flag / Position Badge inside a target reticle */}
      <div className="my-auto py-2 flex flex-col items-center justify-center z-10 w-full">
        <div className="relative w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 mb-2 sm:mb-3 flex items-center justify-center">
          <div className="lu-spin absolute inset-0 rounded-full border border-dashed" style={{ borderColor: `rgba(${acc.rgb},0.35)` }} />
          <div className="lu-spin-rev absolute inset-[7%] rounded-full border" style={{ borderColor: `rgba(${acc.rgb},0.15)`, borderTopColor: `rgba(${acc.rgb},0.6)` }} />
          <div className="absolute inset-[14%] rounded-full" style={{ background: `radial-gradient(circle, rgba(${acc.rgb},0.22), transparent 70%)` }} />
          {isClub && clue.crestUrl ? (
            <img
              src={clue.crestUrl}
              alt={clue.value}
              className="relative w-[62%] h-[62%] object-contain"
              style={{ filter: `drop-shadow(0 0 10px rgba(${acc.rgb},0.45))` }}
            />
          ) : isNation && clue.flagUrl ? (
            <div className="relative w-[78%] h-[52%] border border-white/25 overflow-hidden shadow-[0_6px_18px_rgba(0,0,0,0.7)]">
              <img src={clue.flagUrl} alt={clue.value} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/30" />
            </div>
          ) : (
            <div
              className="relative w-[64%] h-[64%] lu-chamfer flex items-center justify-center border-2"
              style={{ borderColor: `rgba(${acc.rgb},0.6)`, background: 'linear-gradient(180deg, #2b2210, #120e07)' }}
            >
              <span className="font-athletic font-black text-xl sm:text-3xl md:text-4xl tracking-wider" style={{ color: acc.hex }}>
                {clue.value}
              </span>
            </div>
          )}
        </div>

        {/* Primary Clue Value Title */}
        <h3 className="font-athletic italic font-black text-[15px] leading-[1.05] sm:text-2xl md:text-[28px] text-white uppercase tracking-wide break-words w-full">
          {clue.type === 'Position' && posMeta ? posMeta.fullName : clue.value}
        </h3>
      </div>

      {/* Result chips: who hit this criterion */}
      {showResultState ? (
        <div className="w-full flex items-center justify-center gap-1 z-10 flex-wrap">
          <span
            className="px-1.5 py-[2px] font-mono text-[8px] sm:text-[9px] font-black tracking-wider border"
            style={{
              color: isMatched ? '#000' : '#f87171',
              background: isMatched ? (celebrate ? VOLT : CYAN) : 'rgba(248,113,113,0.1)',
              borderColor: isMatched ? 'transparent' : 'rgba(248,113,113,0.4)',
            }}
          >
            YOU {isMatched ? '✓' : '✗'}
          </span>
          {opponentMatched !== undefined && (
            <span
              className="px-1.5 py-[2px] font-mono text-[8px] sm:text-[9px] font-black tracking-wider border"
              style={{
                color: opponentMatched ? CYAN : '#64748b',
                borderColor: opponentMatched ? 'rgba(0,240,255,0.5)' : 'rgba(100,116,139,0.35)',
                background: opponentMatched ? 'rgba(0,240,255,0.1)' : 'transparent',
              }}
            >
              OPP {opponentMatched ? '✓' : '✗'}
            </span>
          )}
        </div>
      ) : (
        <div className="w-full h-[2px]" style={{ background: `linear-gradient(90deg, transparent, rgba(${acc.rgb},0.7), transparent)` }} />
      )}
    </div>
  );
};
