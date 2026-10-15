import React, { useState, useEffect, useRef } from 'react';
import type { PlayerEraCardExtended } from '../../types';
import type { MatchConfig, ManagerState, AuctionPhase, SquadSlot, FormationId, LeagueDeckId } from './types';
import {
  FORMATION_PRESETS,
  buildEmptySquad,
  canManagerAcceptCard,
  assignCardToSlot,
  isSquadFull,
  findFirstEligibleSlotIndex,
} from './formations';
import { drawNextWeightedCard } from './draftEngine';
import { evaluateBotBid } from './botEngine';
import { EraPlayerCard } from '../../components/EraPlayerCard';
import { SquadShowdown } from './SquadShowdown';
import { soundFX } from '../../utils/audio';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Gavel,
  Shield,
  Bot,
  User,
  Radio,
} from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onExitMatch?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AuctionErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AuctionErrorBoundary] Caught arena runtime exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full bg-[#050608] text-neutral-100 flex flex-col items-center justify-center p-6 text-center space-y-4 select-none font-sans">
          <div
            className="relative p-6 bg-[#0c0f15] border border-red-500/40 max-w-md w-full space-y-4 shadow-[0_0_60px_rgba(239,68,68,0.15)]"
            style={{ clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))' }}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center mx-auto border border-red-500/40">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-athletic italic font-black text-3xl text-white uppercase tracking-wide leading-none">
                ARENA VIEW RECOVERED
              </h2>
              <p className="text-xs font-mono text-slate-400 mt-2">
                A rendering issue was intercepted safely. Your match state is preserved.
              </p>
            </div>
            <div className="p-3 bg-black/60 border border-white/5 font-mono text-[11px] text-red-300 text-left overflow-x-auto max-h-24">
              {this.state.error?.message || 'Unknown render error'}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#d8ff33] text-black font-athletic italic font-black text-base uppercase tracking-wider transition-all cursor-pointer shadow-[0_0_24px_rgba(204,255,0,0.35)]"
              >
                RELOAD ARENA
              </button>
              {this.props.onExitMatch && (
                <button
                  type="button"
                  onClick={this.props.onExitMatch}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-mono font-bold text-xs uppercase transition-all cursor-pointer"
                >
                  RETURN TO HUB
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface AuctionArenaProps {
  config: MatchConfig;
  onExitMatch: () => void;
}

/* ============================================================================
 * VISUAL SYSTEM — palette
 * ==========================================================================*/

const VOLT = '#ccff00';
const VOLT_RGB = '204,255,0';
const RIVAL = '#ff4d2e';
const RIVAL_RGB = '255,77,46';
const GOLD_RGB = '251,191,36';
const CYAN_RGB = '0,240,255';
const TAU = Math.PI * 2;

const POS_COLOR: Record<string, string> = {
  GK: '#fbbf24',
  DEF: '#38bdf8',
  MID: '#ccff00',
  ATK: '#ff4d2e',
};

const centerOf = (el: Element | null | undefined) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
};

/* ============================================================================
 * FX ENGINE — a single transparent canvas overlay for sparks, shockwaves,
 * lightning, flight trails and confetti. The rAF loop only runs while
 * something is alive, so the idle auction floor costs zero frames.
 * ==========================================================================*/

interface FxParticle {
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

interface FxRing {
  x: number;
  y: number;
  r1: number;
  t0: number;
  dur: number;
  rgb: string;
  w: number;
}

interface FxSeg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t0: number;
  dur: number;
  rgb: string;
}

interface FxFlash {
  x: number;
  y: number;
  r: number;
  t0: number;
  dur: number;
  rgb: string;
}

interface FxEngine {
  burst: (x: number, y: number, rgb: string, n: number, speed?: number) => void;
  embers: (x: number, y: number, rgb: string, n: number, spread?: number) => void;
  confetti: (x: number, y: number, n: number, palette: string[]) => void;
  shockwave: (x: number, y: number, rgb: string, radius: number, dur?: number, width?: number) => void;
  flash: (x: number, y: number, rgb: string, radius: number, dur?: number) => void;
  bolt: (x1: number, y1: number, x2: number, y2: number, rgb: string, dur?: number) => void;
  trail: (x1: number, y1: number, x2: number, y2: number, rgb: string, dur: number) => void;
  destroy: () => void;
}

function createFxEngine(canvas: HTMLCanvasElement): FxEngine {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const density = reduce ? 0.3 : 1;
  const MAX = 900;
  let W = 1;
  let H = 1;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let alive = true;
  let last = performance.now();
  const parts: FxParticle[] = [];
  const rings: FxRing[] = [];
  const bolts: FxSeg[] = [];
  const trails: FxSeg[] = [];
  const flashes: FxFlash[] = [];
  const css = new Map<string, string>();
  const rgbCss = (rgb: string) => {
    let c = css.get(rgb);
    if (!c) {
      c = `rgb(${rgb})`;
      css.set(rgb, c);
    }
    return c;
  };

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

  function now() {
    return performance.now() / 1000;
  }

  function burst(x: number, y: number, rgb: string, n: number, speed = 520) {
    const c = rgbCss(rgb);
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
        css: c, kind: 0, rot: 0, vr: 0,
      });
    }
    kick();
  }

  function embers(x: number, y: number, rgb: string, n: number, spread = 120) {
    const c = rgbCss(rgb);
    const count = Math.round(n * density);
    for (let i = 0; i < count && parts.length < MAX; i++) {
      const life = 0.9 + Math.random() * 1.1;
      parts.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread * 0.4,
        vx: (Math.random() - 0.5) * 40,
        vy: -40 - Math.random() * 120,
        life, max: life,
        size: 1.5 + Math.random() * 2.5,
        css: c, kind: 2, rot: Math.random() * TAU, vr: 0,
      });
    }
    kick();
  }

  function confetti(x: number, y: number, n: number, palette: string[]) {
    const count = Math.round(n * density);
    for (let i = 0; i < count && parts.length < MAX; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 280 + Math.random() * 520;
      const life = 1.4 + Math.random() * 1.2;
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
    if (flashes.length < 12) flashes.push({ x, y, r: radius, t0: now(), dur, rgb });
    kick();
  }

  function bolt(x1: number, y1: number, x2: number, y2: number, rgb: string, dur = 0.38) {
    if (bolts.length < 16) bolts.push({ x1, y1, x2, y2, t0: now(), dur, rgb });
    kick();
  }

  function trail(x1: number, y1: number, x2: number, y2: number, rgb: string, dur: number) {
    if (trails.length < 6) trails.push({ x1, y1, x2, y2, t0: now(), dur: dur / 1000, rgb });
    kick();
  }

  function drawBolt(b: FxSeg, t: number) {
    const age = (t - b.t0) / b.dur;
    const dx = b.x2 - b.x1;
    const dy = b.y2 - b.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = Math.max(6, Math.round(len / 22));
    const amp = Math.min(38, len * 0.08);
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const off = (Math.random() - 0.5) * 2 * amp * Math.sin(Math.PI * f);
      ctx.lineTo(b.x1 + dx * f + nx * off, b.y1 + dy * f + ny * off);
    }
    ctx.lineTo(b.x2, b.y2);
    const a = Math.max(0, 1 - age) * (Math.random() < 0.15 ? 0.4 : 1);
    ctx.strokeStyle = `rgba(${b.rgb},${0.28 * a})`;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.lineWidth = 1.6;
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

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = (t - f.t0) / f.dur;
      if (age >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const r = f.r * (0.6 + age * 0.6);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.85 * (1 - age)})`);
      g.addColorStop(0.25, `rgba(${f.rgb},${0.55 * (1 - age)})`);
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
      const e = 1 - Math.pow(1 - age, 3);
      const rad = Math.max(1, r.r1 * e);
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - age) * 0.95})`;
      ctx.lineWidth = Math.max(0.5, r.w * (1 - age) + 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - age) * 0.25})`;
      ctx.lineWidth = r.w * 4 * (1 - age) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad * 0.86, 0, TAU);
      ctx.stroke();
    }

    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i];
      const age = (t - tr.t0) / tr.dur;
      if (age >= 1) {
        trails.splice(i, 1);
        continue;
      }
      const e = age * age;
      const x = tr.x1 + (tr.x2 - tr.x1) * e;
      const y = tr.y1 + (tr.y2 - tr.y1) * e;
      const c = rgbCss(tr.rgb);
      for (let k = 0; k < 4 && parts.length < MAX; k++) {
        const life = 0.35 + Math.random() * 0.35;
        parts.push({
          x: x + (Math.random() - 0.5) * 18,
          y: y + (Math.random() - 0.5) * 18,
          vx: (Math.random() - 0.5) * 90,
          vy: (Math.random() - 0.5) * 90,
          life, max: life, size: 1.5 + Math.random() * 2.5, css: c, kind: 2, rot: 0, vr: 0,
        });
      }
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
        p.vy += 780 * dt;
        p.vx *= drag;
        p.vy *= drag;
      } else if (p.kind === 1) {
        p.vy += 520 * dt;
        p.vx = p.vx * dragConf + Math.sin(t * 4 + p.rot) * 24 * dt;
        p.vy *= dragConf;
        p.rot += p.vr * dt;
      } else {
        p.vx *= Math.pow(0.97, dt * 60);
        p.vx += Math.sin(t * 3 + p.rot) * 30 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.min(1, (p.life / p.max) * 1.8);
      if (p.kind === 0) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.css;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
        ctx.stroke();
      } else if (p.kind === 2) {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.css;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
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

    if (parts.length || rings.length || bolts.length || trails.length || flashes.length) {
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
    bolt,
    trail,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
  };
}

const FxCanvas: React.FC<{ engineRef: React.RefObject<FxEngine | null> }> = ({ engineRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createFxEngine(canvasRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef]);
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[45] w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
};

/* ============================================================================
 * LIVE COUNTERS & BROADCAST WIDGETS
 * ==========================================================================*/

// Eased numeric tween that only runs rAF while the value is moving.
function useTween(target: number, ms = 480) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  useEffect(() => {
    const from = valueRef.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (nowMs: number) => {
      const p = Math.min(1, (nowMs - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = from + (target - from) * e;
      valueRef.current = cur;
      setValue(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

interface MoneyCounterProps {
  value: number;
  decimals?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Rolling bankroll readout that spits out a floating +/- delta chip on every change.
const MoneyCounter: React.FC<MoneyCounterProps> = ({ value, decimals = 0, className = '', style }) => {
  const shown = useTween(value);
  const prevRef = useRef(value);
  const [deltas, setDeltas] = useState<Array<{ id: number; d: number }>>([]);

  useEffect(() => {
    const d = value - prevRef.current;
    prevRef.current = value;
    if (Math.abs(d) < 0.001) return;
    const id = performance.now() + Math.random();
    setDeltas((prev) => [...prev.slice(-2), { id, d }]);
    const timer = window.setTimeout(() => setDeltas((prev) => prev.filter((x) => x.id !== id)), 1300);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <span className={`relative inline-block tabular-nums ${className}`} style={style}>
      ${shown.toFixed(decimals)}
      {deltas.map((x) => (
        <span
          key={x.id}
          className={`ax-delta absolute right-0 -top-3 font-mono text-[11px] font-black px-1.5 py-[1px] pointer-events-none ${
            x.d < 0 ? 'bg-[#ff4d2e] text-white' : 'bg-[#ccff00] text-black'
          }`}
        >
          {x.d < 0 ? '−' : '+'}${Math.abs(x.d).toFixed(decimals)}
        </span>
      ))}
    </span>
  );
};

interface CountdownRingProps {
  seconds: number;
  cap: number;
  size?: number;
}

const CountdownRing: React.FC<CountdownRingProps> = ({ seconds, cap, size = 76 }) => {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / Math.max(0.1, cap)));
  const danger = seconds <= 3.0;
  const warn = seconds <= 5.0;
  const color = danger ? '#ff3b30' : warn ? '#fbbf24' : '#00f0ff';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {danger && (
        <>
          <span className="ax-ping ax-ping-urgent absolute inset-0 rounded-full border" style={{ borderColor: color }} />
        </>
      )}
      <svg viewBox="0 0 76 76" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="38" cy="38" r="36" fill="rgba(5,7,12,0.92)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.25s', filter: `drop-shadow(0 0 6px ${color})` }}
        />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * TAU;
          return (
            <line
              key={i}
              x1={38 + Math.cos(a) * 21}
              y1={38 + Math.sin(a) * 21}
              x2={38 + Math.cos(a) * (i % 6 === 0 ? 24.5 : 23)}
              y2={38 + Math.sin(a) * (i % 6 === 0 ? 24.5 : 23)}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-athletic font-black text-[22px] tabular-nums" style={{ color, textShadow: `0 0 12px ${color}` }}>
          {seconds.toFixed(1)}
        </span>
        <span className="font-mono text-[7px] tracking-[0.25em] text-slate-500 mt-0.5">SEC</span>
      </div>
    </div>
  );
};

interface BidderAvatarProps {
  isRival: boolean;
  isBot: boolean;
  active: boolean;
  leading: boolean;
  folded: boolean;
  size?: number;
}

const BidderAvatar: React.FC<BidderAvatarProps> = ({ isRival, isBot, active, leading, folded, size = 44 }) => {
  const color = isRival ? RIVAL : VOLT;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {active && !folded && (
        <>
          <span className="ax-ping absolute inset-0 rounded-full border" style={{ borderColor: color }} />
        </>
      )}
      <div
        className="absolute inset-0 rounded-full p-[2px]"
        style={{
          background: folded
            ? 'rgba(148,163,184,0.25)'
            : `conic-gradient(from 210deg, ${color}, rgba(255,255,255,0.15), ${color})`,
          boxShadow: leading ? `0 0 18px ${color}, 0 0 4px ${color}` : 'none',
        }}
      >
        <div className="w-full h-full rounded-full bg-[#07090e] flex items-center justify-center">
          {isBot ? (
            <Bot className="w-1/2 h-1/2" style={{ color: folded ? '#64748b' : color }} />
          ) : (
            <User className="w-1/2 h-1/2" style={{ color: folded ? '#64748b' : color }} />
          )}
        </div>
      </div>
      {leading && !folded && (
        <span
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1 font-mono text-[7px] font-black tracking-wider text-black"
          style={{ background: color }}
        >
          LEAD
        </span>
      )}
    </div>
  );
};

interface FormationBoardProps {
  slots: SquadSlot[];
  flashingSlotId: string | null;
  isRival: boolean;
}

const FORMATION_X: Record<string, number> = { GK: 9, DEF: 34, MID: 61, ATK: 87 };

// Tactical mini-pitch: each squad slot is a node that ignites when a signing slots in.
const FormationBoard: React.FC<FormationBoardProps> = ({ slots, flashingSlotId, isRival }) => {
  const accent = isRival ? RIVAL : VOLT;
  const groups: Record<string, SquadSlot[]> = {};
  slots.forEach((s) => {
    (groups[s.position] = groups[s.position] || []).push(s);
  });
  return (
    <div className="relative h-[62px] w-full overflow-hidden border border-white/[0.07] bg-[linear-gradient(90deg,rgba(16,40,26,0.55),rgba(10,28,18,0.55))]">
      <div className="absolute inset-0 opacity-40 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_14px,transparent_14px,transparent_28px)]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/15" />
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[13%] h-[64%] border border-l-0 border-white/15" />
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[13%] h-[64%] border border-r-0 border-white/15" />
      {slots.map((s) => {
        const group = groups[s.position] || [s];
        const i = group.indexOf(s);
        const y = ((i + 1) / (group.length + 1)) * 100;
        const x = FORMATION_X[s.position] ?? 50;
        const filled = Boolean(s.filledPlayer);
        const flashing = flashingSlotId === s.id;
        return (
          <div
            key={s.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {flashing && <span className="ax-ping absolute w-6 h-6 rounded-full border" style={{ borderColor: accent }} />}
            <span
              className={`relative w-[18px] h-[18px] rounded-full flex items-center justify-center font-mono text-[7px] font-black transition-all duration-300 ${
                flashing ? 'scale-125' : ''
              }`}
              style={{
                background: filled ? accent : 'rgba(5,7,12,0.85)',
                color: filled ? '#05070c' : POS_COLOR[s.position] || '#94a3b8',
                border: filled ? `1px solid ${accent}` : `1px dashed ${POS_COLOR[s.position] || '#475569'}`,
                boxShadow: filled ? `0 0 10px ${accent}` : 'none',
              }}
            >
              {filled ? `$${s.cost ?? 0}` : s.position[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const GavelSvg: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg viewBox="0 0 160 160" className={className} style={style} aria-hidden="true">
    <defs>
      <linearGradient id="axGavelHead" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff3c4" />
        <stop offset="40%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
      <linearGradient id="axGavelHandle" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#1f2937" />
        <stop offset="50%" stopColor="#4b5563" />
        <stop offset="100%" stopColor="#111827" />
      </linearGradient>
    </defs>
    <rect x="72" y="40" width="10" height="104" rx="4" fill="url(#axGavelHandle)" stroke="#ccff00" strokeOpacity="0.35" />
    <rect x="34" y="14" width="86" height="34" rx="8" fill="url(#axGavelHead)" />
    <rect x="30" y="18" width="10" height="26" rx="3" fill="#fde68a" />
    <rect x="114" y="18" width="10" height="26" rx="3" fill="#fde68a" />
    <rect x="44" y="20" width="64" height="5" rx="2.5" fill="#fff" fillOpacity="0.55" />
  </svg>
);

const AX_CSS = `
  @keyframes axFloat { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -7px, 0); } }
  .ax-float { animation: axFloat 4.2s ease-in-out infinite; will-change: transform; }

  @keyframes axDeal {
    0% { opacity: 0; transform: perspective(900px) translate3d(0, -70px, 0) rotateY(-80deg) scale(0.8); filter: brightness(2.4); }
    60% { opacity: 1; transform: perspective(900px) translate3d(0, 6px, 0) rotateY(10deg) scale(1.03); filter: brightness(1.35); }
    100% { opacity: 1; transform: none; filter: none; }
  }
  .ax-deal { animation: axDeal 0.75s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes axHoloSweep { 0% { transform: translate3d(-140%, 0, 0) skewX(-18deg); } 100% { transform: translate3d(260%, 0, 0) skewX(-18deg); } }
  .ax-holo { position: absolute; top: 0; bottom: 0; left: 0; width: 40%; pointer-events: none; mix-blend-mode: screen;
    background: linear-gradient(90deg, transparent, rgba(0,240,255,0.35), rgba(204,255,0,0.45), rgba(255,0,200,0.3), transparent);
    animation: axHoloSweep 1.1s cubic-bezier(0.4, 0, 0.2, 1) both; }

  @keyframes axSpin { to { transform: rotate(360deg); } }
  @keyframes axSpinRev { to { transform: rotate(-360deg); } }
  .ax-spin { animation: axSpin 22s linear infinite; }
  .ax-spin-rev { animation: axSpinRev 34s linear infinite; }

  @keyframes axBidSlam {
    0% { transform: scale(1.9) translate3d(0, -10px, 0); opacity: 0; }
    40% { transform: scale(0.9); opacity: 1; }
    65% { transform: scale(1.07); }
    100% { transform: scale(1); opacity: 1; }
  }
  .ax-bid-slam { animation: axBidSlam 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; transform-origin: left center; }

  @keyframes axPing { 0% { transform: scale(0.95); opacity: 0.38; } 100% { transform: scale(1.5); opacity: 0; } }
  .ax-ping { animation: axPing 2.6s cubic-bezier(0.25, 0.6, 0.35, 1) infinite; pointer-events: none; }
  .ax-ping-urgent { animation-duration: 1.6s; }

  @keyframes axGavel {
    0% { transform: rotate(-70deg); opacity: 0; }
    10% { opacity: 1; }
    38% { transform: rotate(12deg); }
    52% { transform: rotate(-9deg); }
    68% { transform: rotate(3deg); }
    82% { transform: rotate(0deg); opacity: 1; }
    100% { transform: rotate(-4deg); opacity: 0; }
  }
  .ax-gavel { animation: axGavel 1.05s cubic-bezier(0.3, 0.8, 0.3, 1) both; transform-origin: 80% 90%; }

  @keyframes axImpact { 0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; } }
  .ax-impact { animation: axImpact 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) 0.38s both; }

  @keyframes axShake {
    0%, 100% { transform: none; }
    12% { transform: translate3d(-7px, 4px, 0); }
    26% { transform: translate3d(6px, -4px, 0); }
    42% { transform: translate3d(-4px, 2px, 0); }
    58% { transform: translate3d(3px, -2px, 0); }
    78% { transform: translate3d(-1px, 1px, 0); }
  }
  .ax-shake { animation: axShake 0.5s cubic-bezier(0.2, 0.8, 0.3, 1); }

  @keyframes axOutbid {
    0% { transform: scale(2.4) skewX(-12deg); opacity: 0; letter-spacing: 0.3em; }
    22% { transform: scale(0.94) skewX(-12deg); opacity: 1; letter-spacing: 0.02em; }
    72% { transform: scale(1) skewX(-12deg); opacity: 1; }
    100% { transform: scale(1.08) skewX(-12deg); opacity: 0; }
  }
  .ax-outbid { animation: axOutbid 1.1s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes axEdge { 0% { opacity: 0; } 12% { opacity: 1; } 100% { opacity: 0; } }
  .ax-edge { animation: axEdge 0.9s ease-out both; }

  @keyframes axMarquee { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, 0, 0); } }
  .ax-marquee { animation: axMarquee 38s linear infinite; will-change: transform; }

  @keyframes axGrid { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, 56px, 0); } }
  .ax-grid-run { animation: axGrid 2.4s linear infinite; will-change: transform; }

  @keyframes axSweepL { 0%, 100% { transform: rotate(-24deg); } 50% { transform: rotate(8deg); } }
  @keyframes axSweepR { 0%, 100% { transform: rotate(24deg); } 50% { transform: rotate(-8deg); } }
  .ax-sweep-l { animation: axSweepL 11s ease-in-out infinite; transform-origin: 50% 0%; will-change: transform; }
  .ax-sweep-r { animation: axSweepR 13s ease-in-out infinite; transform-origin: 50% 0%; will-change: transform; }

  @keyframes axFlicker { 0%, 46%, 100% { opacity: 0.9; } 47% { opacity: 0.55; } 49% { opacity: 1; } 51% { opacity: 0.7; } }
  .ax-flicker { animation: axFlicker 11s steps(1) infinite; opacity: 0.8; }

  @keyframes axDelta {
    0% { opacity: 0; transform: translate3d(0, 6px, 0) scale(0.8); }
    15% { opacity: 1; transform: translate3d(0, 0, 0) scale(1.12); }
    100% { opacity: 0; transform: translate3d(0, -28px, 0) scale(1); }
  }
  .ax-delta { animation: axDelta 1.25s cubic-bezier(0.2, 0.8, 0.3, 1) both; }

  @keyframes axSlotLock {
    0% { transform: scale(1.12); filter: brightness(2.6) saturate(1.4); }
    40% { transform: scale(0.98); filter: brightness(1.5); }
    100% { transform: scale(1); filter: none; }
  }
  .ax-slot-lock { animation: axSlotLock 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

  @keyframes axScan { from { transform: translate3d(-100%, 0, 0); } to { transform: translate3d(250%, 0, 0); } }
  .ax-scan { animation: axScan 3.4s ease-in-out infinite; will-change: transform; }

  @keyframes axIntroNum {
    0% { transform: scale(2.8); opacity: 0; filter: blur(10px); }
    30% { transform: scale(0.94); opacity: 1; filter: none; }
    55% { transform: scale(1.04); }
    100% { transform: scale(1); opacity: 1; }
  }
  .ax-intro-num { animation: axIntroNum 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes axRise { from { opacity: 0; transform: translate3d(0, 12px, 0); } to { opacity: 1; transform: none; } }
  .ax-rise { animation: axRise 0.4s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes axGlowPulse { 0%, 100% { box-shadow: 0 0 14px rgba(204,255,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.35); } 50% { box-shadow: 0 0 24px rgba(204,255,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.45); } }
  .ax-glow-pulse { animation: axGlowPulse 2.8s ease-in-out infinite; }

  @keyframes axSheen { 0% { transform: translateX(-160%) skewX(-20deg); } 55%, 100% { transform: translateX(380%) skewX(-20deg); } }
  .ax-sheen { position: relative; overflow: hidden; }
  .ax-sheen::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 32%; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent); animation: axSheen 2.6s ease-in-out infinite; }

  .ax-carbon {
    background-color: #0a0c11;
    background-image:
      linear-gradient(27deg, #12151c 5px, transparent 5px),
      linear-gradient(207deg, #12151c 5px, transparent 5px),
      linear-gradient(27deg, #0d0f15 5px, transparent 5px),
      linear-gradient(207deg, #0d0f15 5px, transparent 5px),
      linear-gradient(90deg, #0b0d12 10px, transparent 10px),
      linear-gradient(#14171f 25%, #11141b 25%, #11141b 50%, transparent 50%, transparent 75%, #161922 75%, #161922);
    background-size: 20px 20px;
    background-position: 0 5px, 10px 0, 0 10px, 10px 5px, 0 0, 0 0;
  }

  .ax-panel {
    position: relative;
    background: linear-gradient(180deg, rgba(14,17,24,0.93), rgba(7,9,13,0.96));
    border: 1px solid rgba(255,255,255,0.08);
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
  }
  .ax-panel::before {
    content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--ax-accent, rgba(204,255,0,0.8)), transparent);
  }
  .ax-chamfer-sm { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }

  .ax-chip {
    transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.15s, box-shadow 0.2s, color 0.15s;
    will-change: transform;
  }
  .ax-chip:active { transform: scale(0.88) !important; transition-duration: 0.08s; }
  .ax-press { transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.15s; }
  .ax-press:active { transform: scale(0.95); transition-duration: 0.08s; }

  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { scrollbar-width: none; }

  @media (prefers-reduced-motion: reduce) {
    .ax-float, .ax-marquee, .ax-grid-run, .ax-sweep-l, .ax-sweep-r, .ax-spin, .ax-spin-rev, .ax-scan, .ax-flicker, .ax-ping, .ax-glow-pulse, .ax-sheen::after {
      animation: none !important;
    }
    .ax-shake { animation: none !important; }
  }
`;

const LEAGUE_DECK_LABELS: Record<LeagueDeckId, string> = {
  global: 'GLOBAL ALL-STARS',
  'premier-league': 'PREMIER LEAGUE',
  'la-liga': 'LA LIGA',
  'serie-a': 'SERIE A',
  bundesliga: 'BUNDESLIGA',
};

const AuctionArenaInner: React.FC<AuctionArenaProps> = ({ config, onExitMatch }) => {
  const {
    isMultiplayer,
    isHost,
    opponent,
    myPlayerId,
    myPlayerName,
    party,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
    leaveParty,
  } = useGameSync('auction-draft');

  // Multiplayer formations can differ: each side drafts into the formation its owner picked
  const formationsByPlayer: Record<string, FormationId> | undefined =
    gameInitData?.sharedData?.formationsByPlayer || config.formationsByPlayer;
  const formation =
    FORMATION_PRESETS[(isMultiplayer && myPlayerId && formationsByPlayer?.[myPlayerId]) || config.formationId] ||
    FORMATION_PRESETS['balanced-1-1-2-1'];
  const rivalFormationId =
    isMultiplayer && formationsByPlayer
      ? (opponent?.id && formationsByPlayer[opponent.id]) ||
        Object.entries(formationsByPlayer).find(([id]) => id !== myPlayerId)?.[1]
      : undefined;
  const rivalFormation = (rivalFormationId && FORMATION_PRESETS[rivalFormationId]) || formation;
  const isAsymmetric = rivalFormation.id !== formation.id;
  const deckLabel = LEAGUE_DECK_LABELS[config.deckId || 'global'] || 'GLOBAL ALL-STARS';

  // Match start 3-2-1 countdown overlay state
  const [matchIntroCount, setMatchIntroCount] = useState<number | null>(3);
  const lastTickRef = useRef<number>(-1);

  // Manager Dugout States
  const [userState, setUserState] = useState<ManagerState>(() => ({
    id: 'user',
    name: myPlayerName ? `${myPlayerName} / MGR` : 'YOU / MANAGER',
    isBot: false,
    bankroll: 20,
    slots: buildEmptySquad('user', formation),
    hasFolded: false,
  }));

  const [botState, setBotState] = useState<ManagerState>(() => ({
    id: 'gaffer',
    name: isMultiplayer && opponent ? `${opponent.name} [RIVAL]` : (config.mode === 'solo' ? 'THE GAFFER [AI]' : 'OPPONENT / MGR'),
    isBot: !isMultiplayer,
    bankroll: 20,
    slots: buildEmptySquad('gaffer', rivalFormation),
    hasFolded: false,
  }));

  // Formations can land after mount (late game_init): rebuild squads while they are still empty
  useEffect(() => {
    setUserState((prev) =>
      prev.slots.some((s) => s.filledPlayer) || prev.slots.map((s) => s.position).join() === formation.slots.join()
        ? prev
        : { ...prev, slots: buildEmptySquad('user', formation) }
    );
    setBotState((prev) =>
      prev.slots.some((s) => s.filledPlayer) || prev.slots.map((s) => s.position).join() === rivalFormation.slots.join()
        ? prev
        : { ...prev, slots: buildEmptySquad('gaffer', rivalFormation) }
    );
  }, [formation.id, rivalFormation.id]);

  // Sync opponent name in multiplayer if it updates
  useEffect(() => {
    if (isMultiplayer && opponent?.name) {
      setBotState((prev) => ({
        ...prev,
        name: `${opponent.name} [RIVAL]`,
        isBot: false,
      }));
    }
  }, [isMultiplayer, opponent?.name]);

  // Track drafted and discarded card IDs for dynamic weighted dealer
  const draftedCardIdsRef = useRef<Set<string>>(new Set());
  const discardedCardIdsRef = useRef<Set<string>>(new Set());

  // Current lot index & active card
  const [lotNumber, setLotNumber] = useState<number>(1);
  const [currentLot, setCurrentLot] = useState<PlayerEraCardExtended>(() => {
    if (gameInitData?.sharedData?.cards && gameInitData.sharedData.cards.length > 0) {
      return gameInitData.sharedData.cards[0];
    }
    return drawNextWeightedCard(
      new Set(),
      new Set(),
      buildEmptySquad('user', formation),
      buildEmptySquad('gaffer', rivalFormation),
      config.deckId
    );
  });

  // Sync currentLot when authoritative server gameInitData arrives
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.cards && gameInitData.sharedData.cards.length > 0) {
      const idx = lotNumber - 1;
      if (gameInitData.sharedData.cards[idx]) {
        setCurrentLot(gameInitData.sharedData.cards[idx]);
      }
    }
  }, [isMultiplayer, gameInitData, lotNumber]);

  const [currentBid, setCurrentBid] = useState(0);
  const [highBidderId, setHighBidderId] = useState<string | null>(null);
  const [roundTimer, setRoundTimer] = useState(15.0); // 15.0 seconds initial lot clock
  const [phase, setPhase] = useState<AuctionPhase>('bidding');
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver: phase === 'showdown',
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena: onExitMatch,
    arenaKey: 'auction-draft',
  });

  // Absolute Bidding Swipe Belt Selection
  const [selectedBidAmount, setSelectedBidAmount] = useState<number | null>(null);

  // Gavel Slam & Transfer Sweep Animation states
  const [stampText, setStampText] = useState<string | null>(null);
  const [stampColor, setStampColor] = useState<'volt' | 'red' | 'amber'>('volt');
  const [flyDirection, setFlyDirection] = useState<'left' | 'right' | null>(null);
  const [flashingSlotId, setFlashingSlotId] = useState<string | null>(null);

  // Streamer Code Privacy
  const [isMasked, setIsMasked] = useState(config.isRoomCodeMasked);
  const [codeCopied, setCodeCopied] = useState(false);

  // Refs for timeouts
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hammerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global unmount cleanup for all animation and bot timers
  useEffect(() => {
    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
      if (hammerTimeoutRef.current) clearTimeout(hammerTimeoutRef.current);
      if (flyTimeoutRef.current) clearTimeout(flyTimeoutRef.current);
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    };
  }, []);

  // ================= STRICT BANKROLL ACCOUNTING FORMULA =================
  // Total Initial Bankroll = $20.00
  const INITIAL_BANKROLL = 20;

  // 1. Permanent spent funds = sum of winning purchase prices for all players currently in roster
  const userSpent = userState.slots.reduce((sum, slot) => sum + (slot.cost ?? 0), 0);
  const botSpent = botState.slots.reduce((sum, slot) => sum + (slot.cost ?? 0), 0);

  // 2. Permanent unspent capital (remaining bankroll)
  const userRemainingCash = Math.max(0, INITIAL_BANKROLL - userSpent);
  const botRemainingCash = Math.max(0, INITIAL_BANKROLL - botSpent);

  // 3. Provisional Escrow: Active bid on table ONLY IF actively held by that player during bidding
  const isUserHighBidder = highBidderId === 'user';
  const isBotHighBidder = highBidderId === 'gaffer';
  const userEscrow = isUserHighBidder && phase === 'bidding' ? currentBid : 0;
  const botEscrow = isBotHighBidder && phase === 'bidding' ? currentBid : 0;

  // 4. Available Funds = $20 - spent - escrow (outbid recovery is instant)
  const userAvailableFunds = Math.max(0, userRemainingCash - userEscrow);
  const botAvailableFunds = Math.max(0, botRemainingCash - botEscrow);

  // 5. Squad completion flags
  const isUserFull = isSquadFull(userState.slots);
  const isBotFull = isSquadFull(botState.slots);

  // 6. Eligibility & Bankruptcy Calculations (defensive null guard)
  // The multiplayer deck re-deals unsold lots at its tail; a card already signed by either side is dead
  const isLotAlreadyDrafted = Boolean(
    currentLot && [...userState.slots, ...botState.slots].some((s) => s.filledPlayer?.id === currentLot.id)
  );
  const canUserAcceptCurrentLot =
    currentLot && !isUserFull && !isLotAlreadyDrafted ? canManagerAcceptCard(userState.slots, currentLot) : false;
  const canBotAcceptCurrentLot =
    currentLot && !isBotFull && !isLotAlreadyDrafted ? canManagerAcceptCard(botState.slots, currentLot) : false;

  // Uncontested lot detection: exactly one manager can legally roster this card
  const isUserUncontested = Boolean(currentLot && canUserAcceptCurrentLot && !canBotAcceptCurrentLot);
  const isBotUncontested = Boolean(currentLot && canBotAcceptCurrentLot && !canUserAcceptCurrentLot);
  // Dead lot: neither squad has a legal slot for this card (can happen with the fixed multiplayer deck)
  const isDeadLot = Boolean(
    currentLot && !canUserAcceptCurrentLot && !canBotAcceptCurrentLot && !(isUserFull && isBotFull)
  );

  // Auto-award uncontested signing instantly: no countdown timer and no forced bidding needed!
  // The hammer drops directly instead of going through the turn clock, which used to treat an
  // award on the winner's own turn as "no bids yet", re-open bidding at $1 and run the clock down.
  useEffect(() => {
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;

    if (isUserUncontested || isBotUncontested) {
      const winner = isUserUncontested ? 'user' : 'gaffer';
      const winnerIsBroke = (winner === 'user' ? userRemainingCash : botRemainingCash) <= 0;
      const timerId = setTimeout(() => {
        handleHammerDrop(winner, 0, winnerIsBroke);
      }, 600);
      return () => clearTimeout(timerId);
    }

    if (isDeadLot) {
      const timerId = setTimeout(() => withdrawDeadLot(), 600);
      return () => clearTimeout(timerId);
    }
  }, [phase, matchIntroCount, isTransitioning, currentLot, isUserUncontested, isBotUncontested, isDeadLot]);
  // Real Bankruptcy: only if unspent bankroll is 0
  const isUserBankrupt = userRemainingCash <= 0;
  // Next legal bid amount:
  const userMinNextBid = currentBid === 0 ? 1 : currentBid + 1;
  // Usable bidding capacity is userRemainingCash (since placing a bid replaces any prior escrow)
  const canUserAffordMinBid = userRemainingCash >= userMinNextBid;

  // Available bid options from next legal bid up to user's remaining bankroll
  const availableBidAmounts: number[] = [];
  if (
    canUserAffordMinBid &&
    canUserAcceptCurrentLot &&
    !isUserHighBidder &&
    phase === 'bidding' &&
    !isBotFull &&
    !isUserUncontested
  ) {
    for (let amt = userMinNextBid; amt <= userRemainingCash; amt++) {
      availableBidAmounts.push(amt);
    }
  }

  // Clear selected bid if current bid climbs higher than or equal to selected amount
  useEffect(() => {
    if (selectedBidAmount !== null && selectedBidAmount <= currentBid) {
      setSelectedBidAmount(null);
    }
  }, [currentBid, selectedBidAmount]);

  // 1. Initial 3-2-1 countdown sequence on arena mount
  useEffect(() => {
    if (matchIntroCount === null) return;

    if (matchIntroCount > 0) {
      soundFX.playClick(400 + (4 - matchIntroCount) * 200);
      const timer = setTimeout(() => {
        setMatchIntroCount(matchIntroCount - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (matchIntroCount === 0) {
      soundFX.playHammer();
      const timer = setTimeout(() => {
        setMatchIntroCount(null); // Dissolve overlay and begin draft
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [matchIntroCount]);

  // Turn-based bidding state: alternating turns between user and gaffer/opponent
  const [roundStarter, setRoundStarter] = useState<'user' | 'gaffer'>(() => {
    if (isMultiplayer && gameInitData?.sharedData?.startingBidderId) {
      return gameInitData.sharedData.startingBidderId === myPlayerId ? 'user' : 'gaffer';
    }
    return Math.random() < 0.5 ? 'user' : 'gaffer';
  });

  const [activeTurn, setActiveTurn] = useState<'user' | 'gaffer'>(() => {
    if (isMultiplayer && gameInitData?.sharedData?.startingBidderId) {
      return gameInitData.sharedData.startingBidderId === myPlayerId ? 'user' : 'gaffer';
    }
    return Math.random() < 0.5 ? 'user' : 'gaffer';
  });

  // Out of money on your own turn: pass straight away instead of letting the clock run down
  useEffect(() => {
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;
    if (activeTurn !== 'user' || isUserUncontested || isBotUncontested || isDeadLot) return;
    if (!canUserAcceptCurrentLot || isBotFull || isUserHighBidder || canUserAffordMinBid) return;

    const timerId = setTimeout(() => handleBankruptPass(), 700);
    return () => clearTimeout(timerId);
  }, [
    phase,
    matchIntroCount,
    isTransitioning,
    currentLot,
    activeTurn,
    isUserUncontested,
    isBotUncontested,
    isDeadLot,
    canUserAcceptCurrentLot,
    isBotFull,
    isUserHighBidder,
    canUserAffordMinBid,
  ]);

  // Rematch readiness sync
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);

  // Sync startingBidderId if gameInitData arrives asynchronously
  const hasSyncedStarterRef = useRef(false);
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.startingBidderId && !hasSyncedStarterRef.current) {
      hasSyncedStarterRef.current = true;
      const starter = gameInitData.sharedData.startingBidderId === myPlayerId ? 'user' : 'gaffer';
      setRoundStarter(starter);
      setActiveTurn(starter);
    }
  }, [isMultiplayer, gameInitData, myPlayerId]);

  const lastProcessedEventIdRef = useRef<number | string | null>(null);

  // Main High-Precision Auction Timer (100ms ticks)
  useEffect(() => {
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;
    lastTickRef.current = -1;

    const interval = setInterval(() => {
      setRoundTimer((prev) => {
        if (prev <= 0.1) {
          return 0;
        }
        // Audio tick strictly once per integer second under 3 seconds
        const intSec = Math.ceil(prev - 0.1);
        if (intSec <= 3 && intSec > 0 && lastTickRef.current !== intSec) {
          lastTickRef.current = intSec;
          soundFX.playCountdownTick();
        }
        return Math.max(0, parseFloat((prev - 0.1).toFixed(1)));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase, matchIntroCount, isTransitioning, currentLot]);

  // Turn Timeout Trigger when Round Timer hits 0
  useEffect(() => {
    if (roundTimer <= 0 && phase === 'bidding' && !isTransitioning && matchIntroCount === null && currentLot) {
      console.log(`[AuctionArena] Turn timer reached 0s for ${activeTurn}`);

      // The manager on the clock already holds the high bid (forced claim / auto-award): sold to them
      if (highBidderId === activeTurn) {
        handleHammerDrop(activeTurn, currentBid, false);
        return;
      }

      if (activeTurn === 'user') {
        // User ran out of time
        if (highBidderId === 'gaffer') {
          if (isMultiplayer) {
            sendAction('auction_pass', { lotNumber });
          }
          handleHammerDrop('gaffer', currentBid, false);
        } else {
          // No bids placed yet ($0): auto-bid $1 on behalf of user and flip turn
          executeBid('user', 1);
          if (isMultiplayer) {
            sendAction('auction_bid', { amount: 1, lotNumber });
          }
          setActiveTurn('gaffer');
          setRoundTimer(8.0);
        }
      } else {
        // Opponent / Gaffer ran out of time
        if (highBidderId === 'user') {
          handleHammerDrop('user', currentBid, false);
        } else {
          // No bids placed yet ($0): auto-bid $1 on behalf of gaffer and flip turn
          if (isMultiplayer) {
            // Their own client opens at $1 when their clock runs out. Only if that never
            // arrives does the host fill it in, credited to them, so it's never doubled or misattributed.
            if (!isHost) return;
            const fallbackTimer = window.setTimeout(() => {
              executeBid('gaffer', 1);
              sendAction('auction_bid', { amount: 1, lotNumber, bidderId: opponent?.id });
              setActiveTurn('user');
              setRoundTimer(8.0);
            }, TURN_TIMEOUT_GRACE_MS);
            return () => window.clearTimeout(fallbackTimer);
          }
          executeBid('gaffer', 1);
          setActiveTurn('user');
          setRoundTimer(8.0);
        }
      }
    }
  }, [roundTimer, phase, isTransitioning, matchIntroCount, currentLot, activeTurn, highBidderId, currentBid, botState.hasFolded, userState.hasFolded, isMultiplayer, isHost, lotNumber]);

  // Bot Autonomous Bidding Trigger (solo mode only, when activeTurn === 'gaffer')
  useEffect(() => {
    if (isMultiplayer) return;
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;
    if (activeTurn !== 'gaffer') return;
    if (botState.hasFolded) return;

    // Forced Slot Acquisition: Bot is already 100% full
    if (isBotFull) {
      return;
    }

    // Forced Slot Acquisition: User is full, Bot must acquire remaining vacant slot
    if (isUserFull && !isBotFull && canBotAcceptCurrentLot) {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
      const forcedBotCost = botRemainingCash > 0 ? 1 : 0;
      botTimeoutRef.current = setTimeout(() => {
        executeBid('gaffer', forcedBotCost);
        setActiveTurn('user');
      }, 800);
      return;
    }

    const decision = evaluateBotBid(botState, userState, currentLot, currentBid, highBidderId);

    if (decision.shouldBid && decision.bidAmount && decision.bidAmount > currentBid) {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);

      botTimeoutRef.current = setTimeout(() => {
        executeBid('gaffer', decision.bidAmount!);
        setActiveTurn('user');
      }, decision.delayMs || 1000);
    } else {
      // Bot folds
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = setTimeout(() => {
        if (highBidderId === 'user') {
          setBotState((prev) => ({ ...prev, hasFolded: true }));
          handleHammerDrop('user', currentBid, false);
        } else {
          // No high bidder yet ($0): bot auto-bids $1 and passes to user
          executeBid('gaffer', 1);
          setActiveTurn('user');
          setRoundTimer(8.0);
        }
      }, 700);
    }

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, [
    isMultiplayer,
    phase,
    matchIntroCount,
    isTransitioning,
    currentBid,
    highBidderId,
    activeTurn,
    botState.hasFolded,
    userState.hasFolded,
    currentLot,
    botRemainingCash,
    isUserFull,
    isBotFull,
    canBotAcceptCurrentLot,
  ]);

  // Synchronize incoming multiplayer events from opponent
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent._eventId && lastProcessedEventIdRef.current === lastGameEvent._eventId) {
      return;
    }
    lastProcessedEventIdRef.current = lastGameEvent._eventId || null;

    if (lastGameEvent.event === 'auction_bid') {
      const { amount, lotNumber: evLot, bidderId } = lastGameEvent.data || {};
      if (typeof amount === 'number' && (evLot === undefined || evLot === lotNumber)) {
        if (bidderId && bidderId === myPlayerId) {
          // Host opened at $1 for us after our clock ran out
          executeBid('user', amount);
          setActiveTurn('gaffer');
        } else {
          executeBid('gaffer', amount);
          setActiveTurn('user');
        }
      }
    } else if (lastGameEvent.event === 'auction_pass') {
      soundFX.playClick(400);
      setBotState((prev) => ({ ...prev, hasFolded: true }));
      if (highBidderId === 'user') {
        handleHammerDrop('user', currentBid, false);
      } else {
        // Passed at $0, turn flips to user
        setActiveTurn('user');
        setRoundTimer(8.0);
        if (userState.hasFolded && (!isMultiplayer || isHost)) {
          handleHammerDrop(null, 0, false);
        }
      }
    } else if (lastGameEvent.event === 'auction_hammer_outcome') {
      const { winnerPlayerId, finalCost: authCost, isBankruptFreeClaim: authFree, lotNumber: authLot } = lastGameEvent.data || {};
      if (!isHost && authLot === lotNumber && phase === 'bidding' && !isTransitioning) {
        const resolvedWinnerId = winnerPlayerId === myPlayerId ? 'user' : (winnerPlayerId ? 'gaffer' : null);
        handleHammerDrop(resolvedWinnerId, typeof authCost === 'number' ? authCost : 0, Boolean(authFree));
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handleRematch();
    }
  }, [isMultiplayer, isHost, lastGameEvent, myPlayerId, highBidderId, lotNumber, phase, isTransitioning, currentBid, userState.hasFolded]);

  // Execute a Provisional Bid
  const executeBid = (managerId: 'user' | 'gaffer', amount: number) => {
    soundFX.playBid();
    setCurrentBid(amount);
    setHighBidderId(managerId);

    // Each placed bid resets clock to 8.0 seconds for the next manager's turn
    setRoundTimer(8.0);

    if (managerId === 'user') {
      setUserState((prev) => ({ ...prev, hasFolded: false }));
    } else {
      setBotState((prev) => ({ ...prev, hasFolded: false }));
    }
  };

  // User Bidding Handlers
  const handleConfirmUserBid = () => {
    if (selectedBidAmount === null || !currentLot || isTransitioning || activeTurn !== 'user') return;
    if (selectedBidAmount > userRemainingCash) return;
    if (!canManagerAcceptCard(userState.slots, currentLot)) return;

    executeBid('user', selectedBidAmount);
    setActiveTurn('gaffer');
    if (isMultiplayer) {
      sendAction('auction_bid', { amount: selectedBidAmount, lotNumber });
    }
    setSelectedBidAmount(null);
  };

  const handleUserPass = () => {
    if (isTransitioning || phase !== 'bidding' || isBotFull || activeTurn !== 'user') return;
    soundFX.playClick(400);
    setUserState((prev) => ({ ...prev, hasFolded: true }));
    setSelectedBidAmount(null);

    if (isMultiplayer) {
      sendAction('auction_pass', { lotNumber });
    }

    if (highBidderId === 'gaffer') {
      // Opponent held high bid: pass immediately forfeits the lot to high bidder
      handleHammerDrop('gaffer', currentBid, false);
    } else {
      // User passed at $0: auto-bid $1 and pass turn
      executeBid('user', 1);
      if (isMultiplayer) {
        sendAction('auction_bid', { amount: 1, lotNumber });
      }
      setActiveTurn('gaffer');
      setRoundTimer(8.0);
    }
  };

  // Bankrupt pass: no money for the next legal bid, so fold without placing the $1 opener
  const handleBankruptPass = () => {
    if (isTransitioning || phase !== 'bidding' || activeTurn !== 'user') return;
    soundFX.playClick(400);
    setUserState((prev) => ({ ...prev, hasFolded: true }));
    setSelectedBidAmount(null);
    if (isMultiplayer) {
      sendAction('auction_pass', { lotNumber });
    }
    if (highBidderId === 'gaffer') {
      handleHammerDrop('gaffer', currentBid, false);
    } else {
      setActiveTurn('gaffer');
      setRoundTimer(8.0);
    }
  };

  // Neither manager can roster this card: withdraw it and deal the next lot
  const withdrawDeadLot = () => {
    if (isTransitioning || phase !== 'bidding' || !currentLot) return;
    console.log(`[AuctionArena] Lot ${lotNumber} withdrawn: no eligible slot for either manager.`);
    discardedCardIdsRef.current.add(currentLot.id);
    dealNextLot(userState.slots, botState.slots);
  };

  // User Forced Slot Claim: locks in remaining slot at min valid cost
  const handleForcedUserClaim = () => {
    if (isTransitioning || phase !== 'bidding' || !currentLot) return;
    const cost = userRemainingCash > 0 ? 1 : 0;
    executeBid('user', cost);
    setRoundTimer(0.1); // Immediate hammer drop
  };

  // Gavel Slam & Transfer Sweep Animation sequence
  const handleHammerDrop = (forcedWinnerId?: string | null, forcedCost?: number, forcedFreeClaim?: boolean) => {
    if (isTransitioning || phase !== 'bidding') return;
    console.log(`[AuctionArena] Hammer dropping for Lot ${lotNumber}:`, currentLot?.displayName || currentLot?.name);
    setIsTransitioning(true);
    setPhase('hammer');
    setSelectedBidAmount(null);

    // Clear any pending bot bidding timeout
    if (botTimeoutRef.current) {
      clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = null;
    }
    if (hammerTimeoutRef.current) clearTimeout(hammerTimeoutRef.current);
    if (flyTimeoutRef.current) clearTimeout(flyTimeoutRef.current);
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);

    const canUserTake = canUserAcceptCurrentLot;
    const canBotTake = canBotAcceptCurrentLot;

    let winnerId: string | null = forcedWinnerId !== undefined ? forcedWinnerId : highBidderId;
    let finalCost = forcedCost !== undefined ? forcedCost : currentBid;
    let isBankruptFreeClaim = forcedFreeClaim !== undefined ? forcedFreeClaim : false;

    if (forcedWinnerId === undefined) {
      // Forced Slot Acquisition: If one squad is full, the unfull squad must win the needed lot
      if (isBotFull && !isUserFull && canUserTake) {
        winnerId = 'user';
        finalCost = Math.max(currentBid, userRemainingCash > 0 ? 1 : 0);
        isBankruptFreeClaim = userRemainingCash <= 0;
      } else if (isUserFull && !isBotFull && canBotTake) {
        winnerId = 'gaffer';
        finalCost = Math.max(currentBid, botRemainingCash > 0 ? 1 : 0);
        isBankruptFreeClaim = botRemainingCash <= 0;
      } else if (!winnerId || currentBid === 0) {
        // Bankrupt or AFK $0 free drop check if nobody bid > 0
        if (canUserTake && (botState.hasFolded || !canBotTake || botRemainingCash <= 0)) {
          winnerId = 'user';
          finalCost = 0;
          isBankruptFreeClaim = true;
        } else if (canBotTake && (userState.hasFolded || !canUserTake || userRemainingCash <= 0)) {
          winnerId = 'gaffer';
          finalCost = 0;
          isBankruptFreeClaim = true;
        }
      }
    }

    if (isMultiplayer && isHost) {
      const winnerPlayerId = winnerId === 'user' ? myPlayerId : (winnerId === 'gaffer' ? (opponent?.id || 'opponent') : null);
      sendAction('auction_hammer_outcome', {
        lotNumber,
        winnerPlayerId,
        finalCost,
        isBankruptFreeClaim,
      });
    }

    const effectiveWinnerId = winnerId || (activeTurn === 'user' ? 'user' : 'gaffer');
    const effectiveFinalCost = winnerId ? finalCost : 1;

    console.log(`[AuctionArena] Lot ${lotNumber} outcome: winner=${effectiveWinnerId}, finalCost=$${effectiveFinalCost}, isFreeClaim=${isBankruptFreeClaim}`);

    // Step 1: Stamp bold diagonal watermark across center card (1.2s freeze)
    if (effectiveWinnerId === 'user') {
      soundFX.playHammer();
      window.setTimeout(() => soundFX.playSuccess(), 120);
      setStampText(isBankruptFreeClaim ? 'FREE DROP TO YOU! ($0)' : `SOLD TO YOU! ($${effectiveFinalCost})`);
      setStampColor('volt');
    } else {
      soundFX.playHammer();
      setStampText(isBankruptFreeClaim ? 'FREE DROP TO THE GAFFER! ($0)' : `SOLD TO THE GAFFER! ($${effectiveFinalCost})`);
      setStampColor('red');
    }

    // Step 2: At +1.2s: Card flies with CSS curve toward winner's dugout slot
    flyTimeoutRef.current = setTimeout(() => {
      if (effectiveWinnerId === 'user') {
        setFlyDirection('left');
      } else {
        setFlyDirection('right');
      }
    }, 1200);

    // Step 3: At +1.6s: Card lands in slot, target roster slot flashes with accent pulse
    lockTimeoutRef.current = setTimeout(() => {
      soundFX.playLockIn();
      let nextUserSlots = userState.slots;
      let nextBotSlots = botState.slots;

      // Permanent deduction happens strictly when won card is assigned to slot
      if (effectiveWinnerId === 'user' && currentLot) {
        const targetIdx = findFirstEligibleSlotIndex(userState.slots, currentLot);
        nextUserSlots = assignCardToSlot(userState.slots, currentLot, effectiveFinalCost);
        setUserState((prev) => ({
          ...prev,
          bankroll: Math.max(0, INITIAL_BANKROLL - (userSpent + effectiveFinalCost)),
          slots: nextUserSlots,
        }));
        draftedCardIdsRef.current.add(currentLot.id);

        if (targetIdx !== -1 && nextUserSlots[targetIdx]) {
          setFlashingSlotId(nextUserSlots[targetIdx].id);
        }
        soundFX.playCardFlip();
      } else if (effectiveWinnerId === 'gaffer' && currentLot) {
        const targetIdx = findFirstEligibleSlotIndex(botState.slots, currentLot);
        nextBotSlots = assignCardToSlot(botState.slots, currentLot, effectiveFinalCost);
        setBotState((prev) => ({
          ...prev,
          bankroll: Math.max(0, INITIAL_BANKROLL - (botSpent + effectiveFinalCost)),
          slots: nextBotSlots,
        }));
        draftedCardIdsRef.current.add(currentLot.id);

        if (targetIdx !== -1 && nextBotSlots[targetIdx]) {
          setFlashingSlotId(nextBotSlots[targetIdx].id);
        }
        soundFX.playCardFlip();
      }

      // Step 4: At +2.0s (0.4s pause after lock-in), drop next lot or transition to showdown
      hammerTimeoutRef.current = setTimeout(() => {
        setFlashingSlotId(null);
        setStampText(null);
        setFlyDirection(null);
        dealNextLot(nextUserSlots, nextBotSlots);
      }, 400);
    }, 1600);
  };

  // Deal the next lot (or finish the draft) given both squads' current slots
  const dealNextLot = (nextUserSlots: typeof userState.slots, nextBotSlots: typeof botState.slots) => {
        const userFull = isSquadFull(nextUserSlots);
        const botFull = isSquadFull(nextBotSlots);

        console.log(`[AuctionArena] Squad completion status: userFull=${userFull}, botFull=${botFull}`);

        if (userFull && botFull) {
          console.log('[AuctionArena] Both squads complete! Advancing to Squad Showdown.');
          setIsTransitioning(false);
          setPhase('showdown');
        } else {
          try {
            const nextCard =
              isMultiplayer && gameInitData?.sharedData?.cards?.[lotNumber]
                ? gameInitData.sharedData.cards[lotNumber]
                : drawNextWeightedCard(
                    draftedCardIdsRef.current,
                    discardedCardIdsRef.current,
                    nextUserSlots,
                    nextBotSlots,
                    config.deckId
                  );

            if (!nextCard || !nextCard.id) {
              console.error('[AuctionArena] drawNextWeightedCard returned empty or invalid card. Advancing to showdown.');
              setIsTransitioning(false);
              setPhase('showdown');
              return;
            }

            console.log(`[AuctionArena] Dealing Lot ${lotNumber + 1}: ${nextCard.displayName || nextCard.name}`);
            setLotNumber((prev) => prev + 1);
            setCurrentLot(nextCard);
            setCurrentBid(0);
            setHighBidderId(null);
            const nextStarter = roundStarter === 'user' ? 'gaffer' : 'user';
            setRoundStarter(nextStarter);
            setActiveTurn(nextStarter);
            setRoundTimer(10.0); // 10.0 seconds opening turn clock
            setSelectedBidAmount(null);
            setUserState((prev) => ({ ...prev, hasFolded: false }));
            setBotState((prev) => ({ ...prev, hasFolded: false }));
            setIsTransitioning(false);
            setPhase('bidding');
          } catch (err) {
            console.error('[AuctionArena] Exception in lot transition:', err);
            setIsTransitioning(false);
            setPhase('showdown');
          }
        }
  };

  // Rematch / Run It Back handler
  const handleRematch = () => {
    soundFX.playClick(900);
    setUserState({
      id: 'user',
      name: 'YOU / MANAGER',
      isBot: false,
      bankroll: 20,
      slots: buildEmptySquad('user', formation),
      hasFolded: false,
    });
    setBotState({
      id: 'gaffer',
      name: config.mode === 'solo' ? 'THE GAFFER [AI]' : 'OPPONENT / MGR',
      isBot: true,
      bankroll: 20,
      slots: buildEmptySquad('gaffer', rivalFormation),
      hasFolded: false,
    });
    draftedCardIdsRef.current.clear();
    discardedCardIdsRef.current.clear();
    setLotNumber(1);
    // Multiplayer rematches replay the server's freshly shuffled deck and starting bidder
    const seededCards = isMultiplayer ? gameInitData?.sharedData?.cards : undefined;
    const seededStarterId = isMultiplayer ? gameInitData?.sharedData?.startingBidderId : undefined;
    setCurrentLot(
      seededCards && seededCards.length > 0
        ? seededCards[0]
        : drawNextWeightedCard(
            new Set(),
            new Set(),
            buildEmptySquad('user', formation),
            buildEmptySquad('gaffer', rivalFormation),
            config.deckId
          )
    );
    setCurrentBid(0);
    setHighBidderId(null);
    const starter: 'user' | 'gaffer' = seededStarterId
      ? seededStarterId === myPlayerId
        ? 'user'
        : 'gaffer'
      : Math.random() < 0.5
      ? 'user'
      : 'gaffer';
    setRoundStarter(starter);
    setActiveTurn(starter);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setRoundTimer(10.0);
    setPhase('bidding');
    setSelectedBidAmount(null);
    setMatchIntroCount(3);
    setStampText(null);
    setFlyDirection(null);
    setFlashingSlotId(null);
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

  // Streamer Code Copy
  const handleCopyCode = async () => {
    soundFX.playClick(800);
    try {
      await navigator.clipboard.writeText(config.roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  /* ======================================================================
   * VISUAL CHOREOGRAPHY LAYER
   * Presentation-only state & effects. Everything below reacts to the
   * auction state above; none of it feeds back into gameplay.
   * ====================================================================*/
  const fxRef = useRef<FxEngine | null>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const bidValueRef = useRef<HTMLDivElement>(null);
  const cardWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const userDugoutRef = useRef<HTMLDivElement>(null);
  const rivalDugoutRef = useRef<HTMLDivElement>(null);
  const userAvatarRef = useRef<HTMLDivElement>(null);
  const rivalAvatarRef = useRef<HTMLDivElement>(null);
  const fxTimersRef = useRef<number[]>([]);
  const prevBidRef = useRef<{ bid: number; bidder: string | null; lot: number }>({
    bid: currentBid,
    bidder: highBidderId,
    lot: lotNumber,
  });
  const [bidPulse, setBidPulse] = useState(0);
  const [bidLog, setBidLog] = useState<Array<{ id: number; who: string; amount: number }>>([]);
  const [outbidFlash, setOutbidFlash] = useState(0);
  const [flyState, setFlyState] = useState<{ key: string; style: React.CSSProperties } | null>(null);

  const lotKey = String(currentLot?.id ?? lotNumber);
  const rivalShort = isMultiplayer && opponent?.name ? opponent.name.toUpperCase() : 'THE GAFFER';
  const timerCap = highBidderId ? 8 : lotNumber === 1 ? 15 : 10;
  const userFilledCount = userState.slots.filter((s) => s.filledPlayer).length;
  const botFilledCount = botState.slots.filter((s) => s.filledPlayer).length;

  const scheduleFx = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    fxTimersRef.current.push(id);
  };

  const shakeScreen = () => {
    const el = shakeRef.current;
    if (!el) return;
    el.classList.remove('ax-shake');
    void el.offsetWidth;
    el.classList.add('ax-shake');
  };

  useEffect(() => {
    const timers = fxTimersRef.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Bid impacts: slam the counter, fire a shockwave, arc a bolt from the bidder, detect outbids.
  useEffect(() => {
    const prev = prevBidRef.current;
    prevBidRef.current = { bid: currentBid, bidder: highBidderId, lot: lotNumber };
    if (prev.lot !== lotNumber) {
      setBidLog([]);
      return;
    }
    if (!highBidderId || (prev.bid === currentBid && prev.bidder === highBidderId)) return;

    setBidPulse((n) => n + 1);
    setBidLog((log) => [{ id: performance.now(), who: highBidderId, amount: currentBid }, ...log].slice(0, 5));

    const rgb = highBidderId === 'user' ? VOLT_RGB : RIVAL_RGB;
    scheduleFx(() => {
      const fx = fxRef.current;
      const c = centerOf(bidValueRef.current);
      if (!fx || !c) return;
      fx.flash(c.x, c.y, rgb, 110, 0.3);
      fx.shockwave(c.x, c.y, rgb, 130, 0.55, 4);
      fx.burst(c.x, c.y, rgb, 28, 440);
      const from = centerOf(highBidderId === 'user' ? userAvatarRef.current : rivalAvatarRef.current);
      if (from) fx.bolt(from.x, from.y, c.x, c.y, rgb, 0.32);

      if (prev.bidder === 'user' && highBidderId === 'gaffer') {
        const ua = centerOf(userAvatarRef.current);
        if (ua) {
          fx.bolt(c.x, c.y, ua.x, ua.y, RIVAL_RGB, 0.55);
          fx.bolt(c.x, c.y, ua.x, ua.y, '255,255,255', 0.3);
          fx.shockwave(ua.x, ua.y, RIVAL_RGB, 80, 0.6, 4);
        }
        const st = centerOf(stageRef.current);
        if (st) fx.shockwave(st.x, st.y, RIVAL_RGB, Math.max(st.w, st.h) * 0.75, 0.85, 7);
      }
    }, 16);

    if (prev.bidder === 'user' && highBidderId === 'gaffer') {
      setOutbidFlash((n) => n + 1);
      scheduleFx(() => setOutbidFlash(0), 1150);
      shakeScreen();
    }
  }, [currentBid, highBidderId, lotNumber]);

  // Gavel slam: impact lands ~0.4s into the swing.
  useEffect(() => {
    if (phase !== 'hammer') return;
    const rgb = stampColor === 'volt' ? VOLT_RGB : RIVAL_RGB;
    scheduleFx(() => {
      const fx = fxRef.current;
      const c = centerOf(cardWrapRef.current);
      if (fx && c) {
        const big = Math.max(c.w, c.h);
        fx.flash(c.x, c.y, GOLD_RGB, big * 0.85, 0.45);
        fx.shockwave(c.x, c.y, GOLD_RGB, big * 1.1, 0.75, 6);
        fx.shockwave(c.x, c.y, rgb, big * 0.75, 0.55, 3);
        fx.burst(c.x, c.y + c.h * 0.1, GOLD_RGB, 64, 680);
        fx.burst(c.x, c.y, rgb, 40, 520);
        fx.embers(c.x, c.y + c.h * 0.35, GOLD_RGB, 30, c.w);
      }
      shakeScreen();
    }, 400);
  }, [phase]);

  // Transfer sweep: fly the lot straight into the winner's target formation slot.
  useEffect(() => {
    if (!flyDirection) {
      setFlyState(null);
      return;
    }
    const card = cardWrapRef.current;
    if (!card || !currentLot) return;
    const winnerSlots = flyDirection === 'left' ? userState.slots : botState.slots;
    const idx = findFirstEligibleSlotIndex(winnerSlots, currentLot);
    const slotId = idx >= 0 ? winnerSlots[idx]?.id : null;
    const target =
      (slotId ? document.querySelector(`[data-slot-id="${slotId}"]`) : null) ||
      (flyDirection === 'left' ? userDugoutRef.current : rivalDugoutRef.current);
    const a = centerOf(card);
    const b = centerOf(target);
    if (!a || !b) return;
    const dir = flyDirection === 'left' ? -1 : 1;
    setFlyState({
      key: lotKey,
      style: {
        transform: `translate3d(${b.x - a.x}px, ${b.y - a.y}px, 0) scale(0.16) rotate(${dir * 16}deg)`,
        opacity: 0.2,
        filter: 'brightness(1.6)',
        transition: 'transform 0.4s cubic-bezier(0.55, 0, 0.75, 0.2), opacity 0.4s ease-in, filter 0.4s',
      },
    });
    fxRef.current?.trail(a.x, a.y, b.x, b.y, flyDirection === 'left' ? VOLT_RGB : RIVAL_RGB, 400);
  }, [flyDirection]);

  // Slot-in: holographic lock flash, spark ring, confetti for your own signings.
  useEffect(() => {
    if (!flashingSlotId) return;
    const isUserSlot = userState.slots.some((s) => s.id === flashingSlotId);
    const rgb = isUserSlot ? VOLT_RGB : RIVAL_RGB;
    scheduleFx(() => {
      const fx = fxRef.current;
      const c = centerOf(document.querySelector(`[data-slot-id="${flashingSlotId}"]`));
      if (!fx || !c) return;
      fx.flash(c.x, c.y, rgb, c.w * 0.55, 0.4);
      fx.shockwave(c.x, c.y, rgb, c.w * 0.7, 0.6, 3);
      fx.burst(c.x, c.y, rgb, 38, 480);
      if (isUserSlot) fx.confetti(c.x, c.y, 70, [VOLT_RGB, '255,255,255', CYAN_RGB, GOLD_RGB]);
    }, 30);
  }, [flashingSlotId]);

  // New lot dealt onto the podium.
  useEffect(() => {
    if (matchIntroCount !== null) return;
    scheduleFx(() => {
      const fx = fxRef.current;
      const c = centerOf(cardWrapRef.current);
      if (!fx || !c) return;
      fx.flash(c.x, c.y, CYAN_RGB, Math.max(c.w, c.h) * 0.6, 0.5);
      fx.embers(c.x, c.y + c.h * 0.45, VOLT_RGB, 22, c.w);
    }, 260);
  }, [lotKey, matchIntroCount]);

  // Market open: the 3-2-1 lands.
  useEffect(() => {
    if (matchIntroCount !== 0) return;
    const fx = fxRef.current;
    if (!fx) return;
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    fx.flash(x, y, VOLT_RGB, Math.max(x, y), 0.6);
    fx.shockwave(x, y, VOLT_RGB, Math.max(x, y) * 1.1, 0.9, 8);
    fx.confetti(x, y, 120, [VOLT_RGB, '255,255,255', CYAN_RGB]);
  }, [matchIntroCount]);

  const tickerItems: Array<{ text: string; color: string }> = [
    { text: `LOT ${String(lotNumber).padStart(2, '0')} ON THE BLOCK`, color: '#00f0ff' },
    {
      text: `${(currentLot?.displayName || currentLot?.name || 'TBC').toUpperCase()} • ${currentLot?.season ?? ''}`,
      color: '#ffffff',
    },
    { text: (currentLot?.positions ?? []).join(' / '), color: POS_COLOR[currentLot?.positions?.[0] ?? 'MID'] || '#ccff00' },
    { text: `BASE $${currentLot?.auctionBasePrice ?? currentLot?.basePrice ?? 4}`, color: '#fbbf24' },
    {
      text: `HIGH BID $${currentBid}${highBidderId ? ` • ${highBidderId === 'user' ? 'YOU' : rivalShort}` : ' • OPEN'}`,
      color: highBidderId === 'user' ? VOLT : highBidderId === 'gaffer' ? RIVAL : '#94a3b8',
    },
    ...bidLog.map((b) => ({
      text: `${b.who === 'user' ? 'YOU' : rivalShort} ▲ $${b.amount}`,
      color: b.who === 'user' ? VOLT : RIVAL,
    })),
    { text: `BANKROLLS • YOU $${userRemainingCash} • ${rivalShort} $${botRemainingCash}`, color: '#e2e8f0' },
    { text: `SQUADS ${userFilledCount}/5 — ${botFilledCount}/5`, color: '#94a3b8' },
    {
      text: isAsymmetric
        ? `YOU ${formation.formula} • ${rivalShort} ${rivalFormation.formula}`
        : `${formation.badge} ${formation.formula}`,
      color: '#00f0ff',
    },
  ];

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#040507] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="pointer-events-none absolute w-[520px] h-[520px] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #ccff00 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-[#ccff00]/10 border border-[#ccff00]/40 flex items-center justify-center text-[#ccff00] shadow-[0_0_30px_rgba(204,255,0,0.3)]">
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
            <div className="h-full bg-[#ccff00] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const bidColor = isUserHighBidder ? VOLT : highBidderId === 'gaffer' ? RIVAL : 'rgba(255,255,255,0.82)';
  const bidGlowRgb = isUserHighBidder ? VOLT_RGB : highBidderId === 'gaffer' ? RIVAL_RGB : '255,255,255';

  const renderDugout = (isRival: boolean) => {
    const st = isRival ? botState : userState;
    const remaining = isRival ? botRemainingCash : userRemainingCash;
    const available = isRival ? botAvailableFunds : userAvailableFunds;
    const isHigh = isRival ? isBotHighBidder : isUserHighBidder;
    const escrow = isRival ? botEscrow : userEscrow;
    const accent = isRival ? RIVAL : VOLT;
    const accentRgb = isRival ? RIVAL_RGB : VOLT_RGB;
    const filled = isRival ? botFilledCount : userFilledCount;
    return (
      <section
        ref={isRival ? rivalDugoutRef : userDugoutRef}
        className={`ax-panel flex flex-col p-2.5 sm:p-3 min-h-0 overflow-hidden ${
          isRival ? 'order-3 lg:order-3' : 'order-2 lg:order-1'
        } lg:col-span-3`}
        style={{ ['--ax-accent' as string]: `rgba(${accentRgb},0.85)` } as React.CSSProperties}
      >
        <div className="absolute inset-0 ax-carbon opacity-30 pointer-events-none" />
        <div
          className="absolute inset-x-0 top-0 h-28 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 0%, rgba(${accentRgb},0.12), transparent 70%)` }}
        />

        {/* Header & Bankroll HUD (Strict Escrow Release Formula) */}
        <div className="relative flex items-center gap-2.5 pb-2 border-b border-white/[0.06] shrink-0">
          <div className="hidden lg:block">
            <BidderAvatar
              isRival={isRival}
              isBot={isRival && botState.isBot}
              active={activeTurn === (isRival ? 'gaffer' : 'user') && phase === 'bidding' && matchIntroCount === null}
              leading={isHigh && phase === 'bidding'}
              folded={st.hasFolded}
              size={40}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isRival ? <Bot className="w-3.5 h-3.5 text-[#ff6b00] shrink-0" /> : <User className="w-3.5 h-3.5 text-[#ccff00] shrink-0" />}
              <span className="font-athletic italic font-black text-base sm:text-lg text-white uppercase tracking-wide leading-none truncate">
                {st.name}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 block mt-0.5 truncate">
              {isHigh ? `RESERVED: $${currentBid} • AVAIL: $${available}` : `AVAILABLE FUNDS: $${available}`}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[9px] font-mono text-slate-400 uppercase block tracking-[0.2em]">BANKROLL</span>
            <MoneyCounter
              value={remaining}
              decimals={2}
              className={`font-athletic font-black text-2xl sm:text-[28px] leading-none ${
                remaining <= 0 ? 'text-red-500 animate-pulse' : isRival ? 'text-slate-100' : 'text-[#ccff00]'
              }`}
              style={remaining > 0 && !isRival ? { textShadow: '0 0 16px rgba(204,255,0,0.45)' } : undefined}
            />
          </div>
        </div>

        {/* Budget gauge: spent / escrow / free */}
        <div className="relative mt-2 shrink-0">
          <div className="relative h-[6px] bg-white/[0.06] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
              style={{ width: `${(available / INITIAL_BANKROLL) * 100}%`, background: accent, boxShadow: `0 0 10px ${accent}` }}
            />
            <div
              className="absolute inset-y-0 transition-all duration-500 ease-out"
              style={{
                left: `${(available / INITIAL_BANKROLL) * 100}%`,
                width: `${(escrow / INITIAL_BANKROLL) * 100}%`,
                background: `repeating-linear-gradient(135deg, rgba(${accentRgb},0.75) 0 3px, rgba(${accentRgb},0.2) 3px 6px)`,
              }}
            />
          </div>
          <div className="flex justify-between font-mono text-[8px] tracking-[0.2em] text-slate-500 mt-1">
            <span>FREE ${available}</span>
            {escrow > 0 && <span style={{ color: accent }}>ESCROW ${escrow}</span>}
            <span>SPENT ${INITIAL_BANKROLL - remaining}</span>
          </div>
        </div>

        {/* Tactical formation board */}
        <div className="relative mt-1.5 shrink-0">
          <FormationBoard slots={st.slots} flashingSlotId={flashingSlotId} isRival={isRival} />
        </div>

        {/* 5 Horizontal Collector Slabs */}
        <div className="relative flex-1 min-h-0 mt-2 flex flex-col gap-1.5">
          {st.slots.map((slot, idx) => (
            <div key={slot.id} className="h-[74px] lg:h-auto lg:flex-1 lg:min-h-[50px] lg:max-h-[96px]">
              <HorizontalCollectorSlab
                slot={slot}
                index={idx}
                isFlashing={flashingSlotId === slot.id}
                isRival={isRival}
              />
            </div>
          ))}
        </div>

        {/* Status Indicator */}
        <div className="relative pt-2 mt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] font-mono shrink-0">
          <span className="text-slate-400">
            SQUAD: {filled} / 5
          </span>
          {isRival ? (
            botState.hasFolded ? (
              <span className="text-red-400 font-bold">[ FOLDED LOT ]</span>
            ) : botRemainingCash <= 0 ? (
              <span className="text-red-400 font-bold animate-pulse">[ BANKRUPT $0 ]</span>
            ) : highBidderId === 'gaffer' ? (
              <span className="text-[#ff6b00] font-bold">[ HIGH BIDDER ]</span>
            ) : (
              <span className="text-slate-500">[ EVALUATING ]</span>
            )
          ) : userState.hasFolded ? (
            <span className="text-red-400 font-bold">[ FOLDED LOT ]</span>
          ) : isUserBankrupt ? (
            <span className="text-red-400 font-bold animate-pulse">[ BANKRUPT $0 ]</span>
          ) : isUserHighBidder ? (
            <span className="text-[#ccff00] font-bold">[ HIGH BIDDER ]</span>
          ) : (
            <span className="text-slate-500">[ READY ]</span>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="relative min-h-screen min-h-[100dvh] lg:h-[100dvh] w-full bg-[#040507] text-neutral-100 flex flex-col overflow-x-hidden overflow-y-auto lg:overflow-hidden select-none font-sans">
      <style>{AX_CSS}</style>

      {/* ================= AMBIENT TRADING FLOOR (GPU-only transforms) ================= */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 ax-carbon opacity-50" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 50% 40%, rgba(204,255,0,0.07), transparent 62%), radial-gradient(ellipse 55% 45% at 0% 100%, rgba(0,240,255,0.07), transparent 60%), radial-gradient(ellipse 55% 45% at 100% 100%, rgba(255,77,46,0.08), transparent 60%), linear-gradient(180deg, rgba(4,5,7,0.6), rgba(4,5,7,0.9))',
          }}
        />
        <div className="absolute inset-x-[-25%] bottom-0 h-[52%] overflow-hidden" style={{ perspective: '700px', perspectiveOrigin: '50% 0%' }}>
          <div className="absolute inset-0 origin-top" style={{ transform: 'rotateX(64deg)' }}>
            <div
              className="ax-grid-run absolute inset-x-0 -top-[56px] -bottom-[56px]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(204,255,0,0.17) 1px, transparent 1px), linear-gradient(90deg, rgba(204,255,0,0.1) 1px, transparent 1px)',
                backgroundSize: '56px 56px',
              }}
            />
          </div>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #040507 0%, rgba(4,5,7,0.2) 40%, rgba(4,5,7,0.4) 75%, #040507 100%)' }} />
        </div>
        <div
          className="ax-sweep-l absolute -top-[10vh] left-[14%] w-[26vw] h-[125vh] opacity-60"
          style={{ background: 'linear-gradient(180deg, rgba(204,255,0,0.13), transparent 72%)', clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)' }}
        />
        <div
          className="ax-sweep-r absolute -top-[10vh] right-[14%] w-[26vw] h-[125vh] opacity-50"
          style={{ background: 'linear-gradient(180deg, rgba(0,240,255,0.12), transparent 72%)', clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)' }}
        />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)' }} />
      </div>

      <FxCanvas engineRef={fxRef} />

      {/* Electric outbid edge flash */}
      {outbidFlash > 0 && (
        <div
          key={`edge-${outbidFlash}`}
          className="ax-edge pointer-events-none fixed inset-0 z-40"
          style={{ boxShadow: 'inset 0 0 0 3px rgba(255,77,46,0.9), inset 0 0 120px rgba(255,77,46,0.45)' }}
        />
      )}

      {/* ================= 3-2-1 DRAFT INTRO COUNTDOWN OVERLAY ================= */}
      {matchIntroCount !== null && (
        <div className="fixed inset-0 z-50 bg-[#040507]/95 flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute inset-0 ax-carbon opacity-40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,620px)] aspect-square">
            <div className="ax-spin absolute inset-0 rounded-full border border-dashed border-[#ccff00]/15" />
            <div className="ax-spin-rev absolute inset-[9%] rounded-full border border-[#00f0ff]/10" />
            <div
              className="absolute inset-[18%] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(204,255,0,0.16), transparent 65%)' }}
            />
          </div>
          <div className="relative text-center">
            <span className="font-mono text-[11px] sm:text-sm tracking-[0.4em] text-[#ccff00] uppercase block">
              INITIALIZING AUCTION ARENA
            </span>
            <span className="font-athletic italic font-black text-3xl sm:text-5xl text-white/90 tracking-wide block mt-2 leading-none">
              DEADLINE <span className="text-[#ccff00]">DAY</span>
            </span>
            <div
              key={`intro-${matchIntroCount}`}
              className="ax-intro-num font-athletic italic font-black text-[132px] sm:text-[200px] leading-[0.9] tracking-tight mt-2"
              style={{
                color: matchIntroCount === 0 ? VOLT : '#ffffff',
                textShadow: matchIntroCount === 0 ? '0 0 60px rgba(204,255,0,0.75)' : '0 0 40px rgba(204,255,0,0.45)',
              }}
            >
              {matchIntroCount === 0 ? 'DRAFT!' : matchIntroCount}
            </div>
            <span className="font-mono text-[10px] sm:text-xs tracking-[0.3em] text-slate-400 uppercase block mt-3">
              {formation.badge} {formation.formula} • ${INITIAL_BANKROLL} BANKROLL • {config.mode === 'solo' ? 'VS THE GAFFER' : `VS ${rivalShort}`}
            </span>
            {isMultiplayer && (
              <span className="font-mono text-[10px] sm:text-xs tracking-[0.25em] text-[#00f0ff] uppercase block mt-2">
                {deckLabel} DECK • YOU {formation.formula} vs {rivalShort} {rivalFormation.formula}
              </span>
            )}
          </div>
        </div>
      )}

      <div ref={shakeRef} className="relative z-10 flex-1 min-h-0 w-full max-w-[1880px] mx-auto flex flex-col gap-2 p-2 sm:p-3 lg:p-3.5">
        {/* ================= 1. TOP STATUS BAR ================= */}
        <header className="ax-panel w-full flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-2 shrink-0">
          {/* Left: Round & Formation Counter */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="ax-chamfer-sm flex items-center gap-2 bg-black/60 border border-[#ccff00]/30 px-2.5 py-1">
              <span className="relative w-2 h-2 rounded-full bg-[#ccff00] shadow-[0_0_8px_#ccff00]">
              </span>
              <span className="font-athletic italic font-black text-base sm:text-lg text-white tracking-wide leading-none">
                LOT <span className="text-[#ccff00]">{String(lotNumber).padStart(2, '0')}</span>
              </span>
            </div>

            <div className="hidden xl:block leading-none pl-1">
              <span className="font-athletic italic font-black text-xl text-white tracking-wide">
                DEADLINE <span className="text-[#ccff00]">DAY</span>
              </span>
              <span className="block font-mono text-[8px] tracking-[0.35em] text-slate-500 mt-0.5">MIDNIGHT AUCTION HOUSE</span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/10 text-xs font-mono text-slate-300 ax-chamfer-sm">
              <Shield className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span className="font-bold text-white">{formation.badge}</span>
              <span className="text-slate-400">({formation.formula})</span>
            </div>
          </div>

          {/* Compact Mobile Live Bankroll Bar */}
          <div className="flex sm:hidden items-center gap-1.5 px-2.5 py-1 bg-black/60 border border-white/10 text-[10px] font-mono">
            <span className="text-[#ccff00] font-bold">${userRemainingCash.toFixed(1)}</span>
            <span className="text-neutral-500">•</span>
            <span className="text-slate-400">${botRemainingCash.toFixed(1)}</span>
          </div>

          {/* Center: Streamer-Safe Room Code or Matchroom Badge */}
          <div className="hidden min-[420px]:flex items-center gap-2 bg-black/60 border border-white/10 px-3 py-1.5 ax-chamfer-sm">
            {config.mode === 'solo' ? (
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                <Bot className="w-3.5 h-3.5 text-[#ff6b00]" />
                <span className="font-bold text-white">SOLO MATCH</span>
                <span className="hidden md:inline text-slate-500">•</span>
                <span className="hidden md:inline text-[#ff6b00]">THE GAFFER</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">ROOM:</span>
                <span className="font-bold text-[#ccff00] tracking-widest">
                  {isMasked ? '••••' : config.roomCode}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick(600);
                    setIsMasked(!isMasked);
                  }}
                  className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  title={isMasked ? 'Reveal Room Code' : 'Hide Room Code'}
                >
                  {isMasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                  title="Copy Room Code"
                >
                  {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Right: Forfeit Button */}
          <div>
            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                setShowForfeitModal(true);
              }}
              className="ax-press ax-chamfer-sm px-3 sm:px-3.5 py-1.5 bg-red-950/50 hover:bg-red-900/70 border border-red-500/40 hover:border-red-500 text-red-400 text-xs font-mono font-bold tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">FORFEIT MATCH</span>
              <span className="sm:hidden">EXIT</span>
            </button>
          </div>
        </header>

        {/* ================= LIVE MARKET TICKER TAPE ================= */}
        <div className="relative h-7 shrink-0 flex items-stretch overflow-hidden border border-white/[0.06] bg-black/70">
          <div className="shrink-0 z-10 px-2.5 flex items-center gap-1.5 bg-[#ccff00] text-black font-mono text-[10px] font-black tracking-[0.2em]">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            LIVE<span className="hidden sm:inline"> MARKET</span>
          </div>
          <div className="relative flex-1 overflow-hidden">
            <div className="ax-marquee absolute left-0 top-0 h-full flex items-center whitespace-nowrap">
              {[0, 1].map((half) => (
                <div key={half} className="flex items-center shrink-0">
                  {[0, 1].map((rep) =>
                    tickerItems.map((t, i) => (
                      <span
                        key={`${half}-${rep}-${i}`}
                        className="px-4 font-mono text-[10px] sm:text-[11px] font-bold tracking-wider"
                        style={{ color: t.color }}
                      >
                        {t.text}
                        <span className="text-white/15 pl-4">◆</span>
                      </span>
                    ))
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================= 2. AUCTION FLOOR GRID (30% / 40% / 30%) ================= */}
        <main className="flex-1 min-h-0 w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-10 gap-2 lg:gap-3 items-stretch">
          {renderDugout(false)}

          {/* ================= CENTER AUCTION BLOCK ================= */}
          <section
            className="ax-panel order-1 md:col-span-2 lg:col-span-4 lg:order-2 flex flex-col p-2.5 sm:p-3 min-h-0 overflow-hidden"
            style={{ ['--ax-accent' as string]: `rgba(${bidGlowRgb},0.85)` } as React.CSSProperties}
          >
            <div className="absolute inset-0 ax-carbon opacity-25 pointer-events-none" />

            {/* Bid board: high bid + countdown ring */}
            <div className="relative flex items-center justify-between gap-2 pb-2 border-b border-white/[0.06] shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{
                      backgroundColor: isUserHighBidder ? '#ccff00' : highBidderId === 'gaffer' ? '#ef4444' : '#94a3b8',
                      boxShadow: `0 0 8px rgba(${bidGlowRgb},0.9)`,
                    }}
                  />
                  <span className="text-[10px] md:text-xs font-mono font-bold tracking-wider uppercase text-slate-400 truncate">
                    {isUserHighBidder
                      ? 'HIGH BID • HELD BY YOU'
                      : highBidderId === 'gaffer'
                      ? 'HIGH BID • THE GAFFER'
                      : 'OPENING LOT • BASE'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <div
                    ref={bidValueRef}
                    key={`bid-${bidPulse}`}
                    className={`font-athletic font-black text-[52px] sm:text-6xl xl:text-[72px] leading-[0.9] tracking-tight tabular-nums ${
                      bidPulse ? 'ax-bid-slam' : ''
                    }`}
                    style={{ color: bidColor, textShadow: `0 0 28px rgba(${bidGlowRgb},0.55)` }}
                  >
                    ${currentBid}
                  </div>
                  {currentBid === 0 && (
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">(OPEN)</span>
                  )}
                </div>
              </div>

              {/* Order book */}
              <div className="hidden sm:flex flex-col gap-1 flex-1 max-w-[150px] min-w-0 self-stretch justify-center">
                {bidLog.slice(0, 3).map((b, i) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between px-2 py-[3px] font-mono text-[10px] font-bold border-l-2 bg-black/50 ${i === 0 ? 'ax-rise' : ''}`}
                    style={{
                      borderColor: b.who === 'user' ? VOLT : RIVAL,
                      opacity: 1 - i * 0.28,
                    }}
                  >
                    <span className="truncate" style={{ color: b.who === 'user' ? VOLT : RIVAL }}>
                      {b.who === 'user' ? 'YOU' : rivalShort}
                    </span>
                    <span className="text-white">▲ ${b.amount}</span>
                  </div>
                ))}
                {bidLog.length === 0 && (
                  <span className="font-mono text-[9px] tracking-[0.25em] text-slate-600 text-center">ORDER BOOK EMPTY</span>
                )}
              </div>

              <CountdownRing seconds={roundTimer} cap={timerCap} />
            </div>

            {/* Live bidder strip with sliding turn indicator */}
            <div className="relative flex items-center gap-1.5 sm:gap-2 py-2 shrink-0">
              <div ref={userAvatarRef}>
                <BidderAvatar
                  isRival={false}
                  isBot={false}
                  active={activeTurn === 'user' && phase === 'bidding' && matchIntroCount === null}
                  leading={isUserHighBidder && phase === 'bidding'}
                  folded={userState.hasFolded}
                  size={38}
                />
              </div>
              <div className="min-w-0 leading-none">
                <span className="font-mono text-[8px] tracking-[0.25em] text-slate-500 block">YOU • AVAIL</span>
                <MoneyCounter value={userAvailableFunds} className="font-athletic font-black text-xl text-[#ccff00]" />
              </div>
              <div className="relative flex-1 min-w-[84px] h-7 sm:mx-1 bg-black/60 border border-white/[0.07] overflow-hidden">
                <div
                  className="absolute inset-y-0 w-1/2 transition-transform duration-500"
                  style={{
                    transform: activeTurn === 'user' ? 'translateX(0%)' : 'translateX(100%)',
                    transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                    background:
                      activeTurn === 'user'
                        ? 'linear-gradient(90deg, rgba(204,255,0,0.35), rgba(204,255,0,0.05))'
                        : 'linear-gradient(270deg, rgba(255,77,46,0.35), rgba(255,77,46,0.05))',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-1.5 sm:px-2 font-athletic italic font-black text-[12px] sm:text-[13px] tracking-wider whitespace-nowrap">
                  <span className={activeTurn === 'user' ? 'text-[#ccff00]' : 'text-slate-600'}>◀ YOU<span className="hidden sm:inline">R TURN</span></span>
                  <span className={activeTurn === 'gaffer' ? 'text-[#ff4d2e]' : 'text-slate-600'}>RIVAL ▶</span>
                </div>
              </div>
              <div className="min-w-0 leading-none text-right">
                <span className="font-mono text-[8px] tracking-[0.25em] text-slate-500 block truncate">{rivalShort}</span>
                <MoneyCounter value={botAvailableFunds} className="font-athletic font-black text-xl text-[#ff4d2e]" />
              </div>
              <div ref={rivalAvatarRef}>
                <BidderAvatar
                  isRival
                  isBot={botState.isBot}
                  active={activeTurn === 'gaffer' && phase === 'bidding' && matchIntroCount === null}
                  leading={isBotHighBidder && phase === 'bidding'}
                  folded={botState.hasFolded}
                  size={38}
                />
              </div>
            </div>

            {/* Center Stage: holographic podium, volumetric spotlight & the lot */}
            <div
              ref={stageRef}
              className="relative flex-1 min-h-[300px] sm:min-h-[380px] lg:min-h-0 flex flex-col items-center justify-center py-1"
            >
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <div
                  className="ax-flicker absolute left-1/2 -translate-x-1/2 top-0 w-[115%] max-w-[560px] h-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(240,255,200,0.16) 0%, rgba(204,255,0,0.06) 45%, transparent 85%)',
                    clipPath: 'polygon(41% 0, 59% 0, 100% 100%, 0 100%)',
                  }}
                />
                <div
                  className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 w-[380px] h-[440px] max-w-full rounded-full"
                  style={{ background: 'radial-gradient(ellipse, rgba(204,255,0,0.12) 0%, rgba(0,240,255,0.05) 45%, transparent 70%)' }}
                />
              </div>

              {!currentLot ? (
                <div className="flex flex-col items-center justify-center h-[280px] sm:h-[380px] text-zinc-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                  Dealing Next Lot...
                </div>
              ) : (
                <>
                  <div
                    ref={cardWrapRef}
                    key={lotKey}
                    className="relative z-20 w-[220px] sm:w-[270px] md:w-[290px] lg:w-[min(300px,24vh)] xl:w-[min(310px,30vh)] 2xl:w-[min(340px,32vh)] max-h-[40vh] sm:max-h-[48vh] lg:max-h-none"
                    style={flyState && flyState.key === lotKey ? flyState.style : undefined}
                  >
                    <div className="ax-deal">
                      <div className={phase === 'bidding' ? 'ax-float' : ''}>
                        <div className="relative">
                          <EraPlayerCard
                            key={currentLot?.id ?? lotNumber}
                            id={currentLot?.id ?? ''}
                            name={currentLot?.name ?? 'UNKNOWN'}
                            displayName={currentLot?.displayName ?? currentLot?.name ?? ''}
                            firstName={currentLot?.firstName ?? ''}
                            lastName={currentLot?.lastName ?? currentLot?.name ?? ''}
                            clubCode={currentLot?.clubCode ?? 'AT'}
                            clubAbbreviation={currentLot?.clubAbbreviation ?? currentLot?.clubCode}
                            season={currentLot?.season ?? '2024'}
                            positions={currentLot?.positions ?? ['ATK']}
                            club={currentLot?.club ?? 'Added Time'}
                            clubCrestUrl={currentLot?.clubCrestUrl}
                            crestPath={currentLot?.crestPath}
                            nation={currentLot?.nation}
                            nationFlagUrl={currentLot?.nationFlagUrl}
                            imageUrl={currentLot?.imageUrl}
                            imagePath={currentLot?.imagePath}
                            auctionBasePrice={currentLot?.auctionBasePrice ?? currentLot?.basePrice ?? 4}
                            ovr={currentLot?.ovr ?? 90}
                            showOvr={false}
                            stampText={stampText}
                            stampColor={stampColor}
                            eraStats={currentLot?.eraStats}
                            interactive={true}
                            className="w-full drop-shadow-[0_22px_32px_rgba(0,0,0,0.95)]"
                          />
                          <div className="absolute inset-0 rounded-[18px] overflow-hidden pointer-events-none z-30">
                            <div key={`holo-${lotKey}`} className="ax-holo" style={{ animationDelay: '0.45s' }} />
                            {phase === 'hammer' && <div key={`holo-h-${lotKey}`} className="ax-holo" style={{ animationDelay: '0.4s' }} />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Gavel slam */}
                    {phase === 'hammer' && !flyDirection && (
                      <div className="absolute -top-8 -right-6 sm:-right-10 z-50 pointer-events-none">
                        <span
                          className="ax-impact absolute left-[18%] top-[86%] w-24 h-24 rounded-full border-4"
                          style={{ borderColor: stampColor === 'volt' ? VOLT : RIVAL, boxShadow: `0 0 30px ${stampColor === 'volt' ? VOLT : RIVAL}` }}
                        />
                        <GavelSvg className="ax-gavel w-28 h-28 sm:w-36 sm:h-36 drop-shadow-[0_12px_20px_rgba(0,0,0,0.9)]" />
                      </div>
                    )}
                  </div>

                  {/* Holographic collector podium */}
                  <div className="relative w-[280px] md:w-[340px] h-14 -mt-2 z-10 pointer-events-none" aria-hidden="true">
                    <div className="absolute inset-x-10 top-1 h-3 rounded-full bg-black/90 blur-[6px]" />
                    <div className="absolute inset-0" style={{ perspective: '600px' }}>
                      <div className="absolute inset-0" style={{ transform: 'rotateX(74deg)' }}>
                        <div
                          className="ax-spin absolute inset-[-40%] rounded-full"
                          style={{
                            background: `conic-gradient(from 0deg, transparent 0deg, rgba(${bidGlowRgb},0.3) 40deg, transparent 90deg, rgba(0,240,255,0.22) 180deg, transparent 230deg, rgba(${bidGlowRgb},0.25) 300deg, transparent 360deg)`,
                            WebkitMask: 'radial-gradient(circle, transparent 52%, #000 54%, #000 60%, transparent 62%)',
                            mask: 'radial-gradient(circle, transparent 52%, #000 54%, #000 60%, transparent 62%)',
                          }}
                        />
                        <div className="ax-spin-rev absolute inset-[-18%] rounded-full border border-dashed border-[#ccff00]/15" />
                        <div
                          className="absolute inset-[2%] rounded-full"
                          style={{ background: 'radial-gradient(circle, rgba(204,255,0,0.22), rgba(0,240,255,0.06) 55%, transparent 70%)' }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* OUTBID slam */}
              {outbidFlash > 0 && (
                <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                  <span
                    key={`ob-${outbidFlash}`}
                    className="ax-outbid font-athletic italic font-black text-[64px] sm:text-[96px] leading-none text-[#ff4d2e]"
                    style={{ textShadow: '0 0 30px rgba(255,77,46,0.85), 0 0 80px rgba(255,77,46,0.45)', WebkitTextStroke: '1px rgba(255,255,255,0.35)' }}
                  >
                    OUTBID!
                  </span>
                </div>
              )}
            </div>

            {/* Bottom: Absolute-Bid Swipe Belt & 2-Step Misclick Confirmation */}
            <div className="relative w-full pt-2 border-t border-white/[0.06] flex flex-col gap-1.5 shrink-0">
              {/* Position Filled Alert, Forced Claim Notice, or Bankrupt Alert */}
              {isUserUncontested ? (
                <div className="ax-sheen ax-chamfer-sm py-2.5 px-3 bg-[#ccff00]/15 border border-[#ccff00]/50 text-center text-xs font-mono text-[#ccff00] font-black uppercase tracking-wider shadow-[0_0_24px_rgba(204,255,0,0.25)]">
                  UNCONTESTED SIGNING • OPPONENT HAS NO VACANT {(currentLot?.positions ?? []).join('/')} SLOT • SIGNING TO YOU FREE ($0)!
                </div>
              ) : isBotUncontested ? (
                <div className="ax-sheen ax-chamfer-sm py-2.5 px-3 bg-red-500/15 border border-red-500/50 text-center text-xs font-mono text-red-400 font-black uppercase tracking-wider">
                  UNCONTESTED SIGNING • YOU HAVE NO VACANT {(currentLot?.positions ?? []).join('/')} SLOT • SIGNING TO THE GAFFER!
                </div>
              ) : isUserFull ? (
                <div className="ax-chamfer-sm py-2 px-3 bg-white/5 border border-white/10 text-center text-xs font-mono text-slate-300">
                  [ SQUAD COMPLETE ] Your roster is full (5/5). Waiting for opponent to finalize remaining slots.
                </div>
              ) : isBotFull && canUserAcceptCurrentLot ? (
                <div className="ax-chamfer-sm py-2 px-3 bg-[#ccff00]/10 border border-[#ccff00]/30 text-center text-xs font-mono text-[#ccff00] font-bold">
                  OPPONENT ROSTER COMPLETE (5/5) • MANDATORY FORCED CLAIM FOR YOUR VACANT SLOT
                </div>
              ) : !canUserAcceptCurrentLot ? (
                <div className="ax-chamfer-sm py-1 px-2 bg-white/5 border border-white/10 text-center text-[11px] font-mono text-slate-400">
                  [ POSITION SLOTS FULL ] You cannot draft another {(currentLot?.positions ?? []).join('/')}.
                </div>
              ) : isUserBankrupt ? (
                <div className="ax-chamfer-sm py-1 px-2 bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-center text-[11px] font-mono text-[#fbbf24]">
                  BANKRUPT ($0) : Bidding disabled. If opponent passes, you claim for FREE ($0)!
                </div>
              ) : isUserHighBidder ? (
                <div className="ax-chamfer-sm py-1 px-2 bg-[#ccff00]/10 border border-[#ccff00]/30 text-center text-[11px] font-mono text-[#ccff00] font-bold">
                  YOU HOLD THE HIGH BID (${currentBid}) • WAITING ON CLOCK OR GAFFER
                </div>
              ) : !canUserAffordMinBid ? (
                <div className="ax-chamfer-sm py-1 px-2 bg-red-950/40 border border-red-500/30 text-center text-[11px] font-mono text-red-400">
                  INSUFFICIENT FUNDS (${userMinNextBid} needed, ${userRemainingCash} available).
                </div>
              ) : null}

              {/* Turn Status Banner */}
              {!isUserUncontested && !isBotUncontested && !isUserFull && !(isBotFull && canUserAcceptCurrentLot) && (
                activeTurn === 'user' ? (
                  <div className="ax-chamfer-sm py-1 px-2.5 bg-[#ccff00]/15 border border-[#ccff00]/40 text-center text-[11px] font-mono text-[#ccff00] font-black tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-[0_0_14px_rgba(204,255,0,0.18)]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00] shadow-[0_0_6px_#ccff00]" />
                    <span>YOUR TURN TO BID OR PASS ({roundTimer.toFixed(1)}s)</span>
                  </div>
                ) : (
                  <div className="ax-chamfer-sm py-1 px-2.5 bg-[#ff4d2e]/10 border border-[#ff4d2e]/35 text-center text-[11px] font-mono text-[#ff8a6e] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 animate-spin text-[#ff8a6e]" />
                    <span className="truncate">WAITING FOR {botState.name.toUpperCase()} TO BID... ({roundTimer.toFixed(1)}s)</span>
                  </div>
                )
              )}

              {/* Action Buttons Section */}
              {isUserUncontested || isBotUncontested ? (
                <div className="w-full py-3 flex items-center justify-center gap-2 text-xs font-mono text-[#ccff00] animate-pulse">
                  <Check className="w-4 h-4" />
                  <span>Awarding uncontested player to dugout...</span>
                </div>
              ) : isUserFull ? (
                <div className="w-full py-3 flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
                  <Clock className="w-4 h-4 animate-spin text-[#ccff00]" />
                  <span>The Gaffer is drafting final positions...</span>
                </div>
              ) : isBotFull && canUserAcceptCurrentLot ? (
                /* Forced Claim Button: PASS is completely hidden, only CLAIM ($1 or FREE $0) */
                <div className="w-full pt-1">
                  <button
                    type="button"
                    disabled={phase !== 'bidding'}
                    onClick={handleForcedUserClaim}
                    className="ax-press ax-sheen ax-glow-pulse ax-chamfer-sm w-full h-12 md:h-14 bg-gradient-to-b from-[#e2ff4d] via-[#ccff00] to-[#9fd400] text-black font-athletic italic font-black text-lg md:text-xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    <Gavel className="w-5 h-5" />
                    <span>CLAIM {userRemainingCash > 0 ? '($1)' : 'FREE ($0)'}</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Dynamic Absolute Number Track (Horizontal Swipe Belt) */}
                  {canUserAcceptCurrentLot && !isUserBankrupt && !isUserHighBidder && canUserAffordMinBid && (
                    <div className={`w-full flex flex-col gap-1 transition-opacity ${activeTurn !== 'user' ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                        <span className="uppercase tracking-wider">CHOOSE EXACT BID:</span>
                        <span>MAX BANKROLL: ${userRemainingCash}</span>
                      </div>

                      <div className="w-full flex items-center gap-1.5 overflow-x-auto py-1.5 px-0.5 no-scrollbar snap-x">
                        {availableBidAmounts.map((amount) => {
                          const isSelected = selectedBidAmount === amount;
                          const heat = Math.min(1, amount / Math.max(1, userRemainingCash));
                          return (
                            <button
                              key={amount}
                              type="button"
                              disabled={phase !== 'bidding' || activeTurn !== 'user'}
                              onClick={() => {
                                soundFX.playClick(600);
                                setSelectedBidAmount(amount);
                              }}
                              className={`ax-chip ax-chamfer-sm snap-start shrink-0 min-w-[52px] md:min-w-[58px] h-11 md:h-12 font-athletic font-black text-lg md:text-xl flex items-center justify-center cursor-pointer ${
                                isSelected
                                  ? 'bg-[#ccff00] text-black shadow-[0_0_20px_rgba(204,255,0,0.7)]'
                                  : 'bg-[#10131b] hover:bg-[#1a1f2c] text-white border border-white/10 hover:border-[#ccff00]/60'
                              }`}
                              style={{
                                transform: isSelected ? 'translate3d(0,-3px,0) scale(1.1)' : 'none',
                                boxShadow: isSelected ? undefined : `inset 0 -2px 0 rgba(204,255,0,${0.15 + heat * 0.55})`,
                              }}
                            >
                              <span>${amount}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2-Step Misclick Protection Actions: [ CONFIRM BID $X ] & Independent [ PASS ] */}
                  <div className="grid grid-cols-3 gap-2 pt-0.5">
                    {/* CONFIRM BID $X Button (2 cols) */}
                    <button
                      type="button"
                      disabled={phase !== 'bidding' || selectedBidAmount === null || activeTurn !== 'user'}
                      onClick={handleConfirmUserBid}
                      className={`ax-press ax-chamfer-sm col-span-2 h-12 md:h-[52px] font-athletic italic font-black text-base md:text-lg uppercase tracking-wider flex items-center justify-center gap-1.5 ${
                        selectedBidAmount !== null && phase === 'bidding' && activeTurn === 'user'
                          ? 'ax-sheen ax-glow-pulse bg-gradient-to-b from-[#e2ff4d] via-[#ccff00] to-[#9fd400] text-black cursor-pointer'
                          : 'bg-white/5 border border-white/10 text-slate-500 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <Gavel className="w-4 h-4" />
                      <span>
                        {selectedBidAmount !== null ? `CONFIRM BID $${selectedBidAmount}` : 'SELECT A BID ABOVE'}
                      </span>
                    </button>

                    {/* Independent PASS Button (1 col) */}
                    <button
                      type="button"
                      disabled={phase !== 'bidding' || userState.hasFolded || activeTurn !== 'user'}
                      onClick={handleUserPass}
                      className="ax-press ax-chamfer-sm col-span-1 h-12 md:h-[52px] bg-[#ff3b30]/15 hover:bg-[#ff3b30] border border-[#ff3b30]/70 text-[#ff5a50] hover:text-white font-athletic italic font-black text-base md:text-lg uppercase tracking-wider transition-colors flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                      <span>PASS</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {renderDugout(true)}
        </main>
      </div>

      {/* ================= 3. FORFEIT CONFIRMATION MODAL ================= */}
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

      {/* ================= 4. POST-MATCH SQUAD SHOWDOWN OVERLAY ================= */}
      {phase === 'showdown' && (
        <SquadShowdown
          userState={{
            ...userState,
            bankroll: userRemainingCash,
          }}
          botState={{
            ...botState,
            bankroll: botRemainingCash,
          }}
          onRematch={handleRequestOrExecuteRematch}
          isMultiplayer={isMultiplayer}
          isHost={isHost}
          isOpponentRematchReady={isOpponentRematchReady}
          hasRequestedRematch={hasRequestedRematch}
          positionOffsets={isMultiplayer ? gameInitData?.sharedData?.positionOffsets : undefined}
          onReturnToHub={() => {
            if (isMultiplayer) sendGameLeave();
            if (party.roomCode?.startsWith('match_')) {
              leaveParty();
            }
            handleCleanExit();
          }}
        />
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
    </div>
  );
};

// Opponent's turn timed out: how long the host waits for their own $1 opener before filling it in
const TURN_TIMEOUT_GRACE_MS = 2500;

export const AuctionArena: React.FC<AuctionArenaProps> = (props) => {
  return (
    <AuctionErrorBoundary onExitMatch={props.onExitMatch}>
      <AuctionArenaInner {...props} />
    </AuctionErrorBoundary>
  );
};

/**
 * Holographic Collector Slab for Dugout Formation Slots.
 * Carbon-fibre slab with position colour rail, photo cutout frame, surname,
 * club crest with image error safety nets (clean silhouette / clubCode badge)
 * and a winning price chip in the owner's accent. Strictly zero OVR during draft phase.
 */
interface HorizontalCollectorSlabProps {
  slot: SquadSlot;
  index: number;
  isFlashing?: boolean;
  isRival?: boolean;
}

const HorizontalCollectorSlab: React.FC<HorizontalCollectorSlabProps> = ({
  slot,
  index,
  isFlashing = false,
  isRival = false,
}) => {
  const p = slot.filledPlayer;
  const [avatarError, setAvatarError] = useState(false);
  const [crestError, setCrestError] = useState(false);
  const [activeCrest, setActiveCrest] = useState<string>('');

  const crestSrc = p ? (p.crestPath || p.clubCrestUrl || '') : '';

  useEffect(() => {
    setActiveCrest(crestSrc);
    setCrestError(false);
    setAvatarError(false);
  }, [p?.id, crestSrc]);

  const posColor = POS_COLOR[slot.position] || '#94a3b8';
  const accent = isRival ? RIVAL : VOLT;
  const accentRgb = isRival ? RIVAL_RGB : VOLT_RGB;

  // Format full season (e.g. "2018-2019")
  const formatSeason = (s: string = '') => {
    if (!s) return '';
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts[0]?.length === 4 && parts[1]?.length === 2) {
        return `${parts[0]}-${parts[0].slice(0, 2)}${parts[1]}`;
      }
      if (parts[0]?.length === 4 && parts[1]?.length === 4) {
        return `${parts[0]}-${parts[1]}`;
      }
    }
    return s;
  };

  // Vacant Slot State: dashed holographic frame with a slow scanning beam
  if (!p) {
    return (
      <div
        data-slot-id={slot.id}
        className={`ax-chamfer-sm relative h-full w-full flex items-center justify-between px-3 overflow-hidden border border-dashed transition-colors duration-300 ${
          isFlashing ? 'ax-slot-lock' : ''
        }`}
        style={{
          borderColor: isFlashing ? accent : 'rgba(100,116,139,0.35)',
          background: isFlashing ? `rgba(${accentRgb},0.12)` : 'rgba(6,8,12,0.72)',
          boxShadow: isFlashing ? `0 0 26px rgba(${accentRgb},0.6)` : 'none',
        }}
      >
        <div
          className="ax-scan absolute inset-y-0 left-0 w-1/3 pointer-events-none opacity-60"
          style={{ background: `linear-gradient(90deg, transparent, ${posColor}14, transparent)`, animationDelay: `${index * 0.45}s` }}
        />
        <div className="flex items-center gap-3 z-10 min-w-0 h-full py-1.5">
          <div className="h-full max-h-14 aspect-square bg-black/50 border border-dashed border-slate-700/80 flex items-center justify-center shrink-0">
            <User className="w-1/2 h-1/2 text-slate-700" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] md:text-xs font-mono font-black px-2 py-0.5 border"
                style={{ color: posColor, borderColor: `${posColor}99`, background: `${posColor}1f` }}
              >
                {slot.position}
              </span>
              <span className="text-[11px] md:text-xs font-mono font-bold text-slate-400 uppercase tracking-wider truncate">
                SLOT {index + 1} • {slot.position} •
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-600 block mt-1 uppercase tracking-[0.3em] font-bold">
              VACANT
            </span>
          </div>
        </div>
        <span className="font-athletic italic font-black text-3xl md:text-4xl text-white/[0.05] select-none pointer-events-none shrink-0">
          {slot.position}
        </span>
      </div>
    );
  }

  // Acquired Slot State
  const safeName = (p.displayName || p.name || 'UNKNOWN').trim();
  const nameParts = safeName ? safeName.split(' ') : [];
  const firstName = p.firstName || (nameParts.length > 1 ? nameParts[0] : '');
  const lastName = p.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : safeName);
  const imageSrc = p.imagePath || p.imageUrl || '';
  const clubCode = p.clubCode || p.clubAbbreviation || (p.club ? p.club.slice(0, 3).toUpperCase() : 'TB');

  return (
    <div
      data-slot-id={slot.id}
      className={`ax-chamfer-sm relative h-full w-full flex items-center justify-between pl-3.5 pr-2.5 overflow-hidden border transition-colors duration-300 ${
        isFlashing ? 'ax-slot-lock' : ''
      }`}
      style={{
        background: isFlashing
          ? `linear-gradient(90deg, rgba(${accentRgb},0.22), rgba(16,20,30,0.95))`
          : 'linear-gradient(90deg, rgba(20,24,34,0.95), rgba(11,13,19,0.95))',
        borderColor: isFlashing ? accent : 'rgba(255,255,255,0.09)',
        boxShadow: isFlashing ? `0 0 30px rgba(${accentRgb},0.75)` : 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div className="absolute inset-0 ax-carbon opacity-25 pointer-events-none" />
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: posColor, boxShadow: `0 0 10px ${posColor}` }} />
      {isFlashing && <div className="ax-holo" />}

      <div className="flex items-center gap-2.5 overflow-hidden z-10 min-w-0 h-full py-1.5">
        <div className="h-full max-h-16 aspect-square bg-black/75 border border-white/15 overflow-hidden flex items-center justify-center shrink-0 relative">
          {imageSrc && !avatarError ? (
            <img
              key={imageSrc}
              src={imageSrc}
              alt={p.name}
              className="w-full h-full object-cover object-center filter contrast-110"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#141824]">
              <User className="w-1/2 h-1/2 text-slate-600" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            <span
              className="text-[9px] font-mono font-black px-1.5 py-[2px] border"
              style={{ color: posColor, borderColor: `${posColor}99`, background: `${posColor}1f` }}
            >
              {slot.position}
            </span>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider truncate">
              {slot.position} • {firstName || 'STAR'}
            </span>
          </div>
          <span className="font-athletic italic font-black text-lg md:text-xl text-white uppercase truncate block leading-tight mt-0.5 tracking-wide">
            {lastName}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#fbbf24] font-bold leading-none truncate">
            <span>{formatSeason(p.season)}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 truncate">{p.club}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 z-10 ml-2">
        {activeCrest && !crestError ? (
          <img
            src={activeCrest}
            alt={p.club}
            className="w-7 h-7 md:w-8 md:h-8 object-contain filter drop-shadow"
            onError={() => {
              if (activeCrest.endsWith('.png')) {
                setActiveCrest(activeCrest.replace(/\.png$/, '.svg'));
              } else {
                setCrestError(true);
              }
            }}
          />
        ) : (
          <span className="font-mono text-[10px] font-black px-1.5 py-0.5 bg-white/10 text-white border border-white/20 uppercase tracking-wider">
            {clubCode}
          </span>
        )}
        <span
          className="ax-chamfer-sm font-athletic font-black text-lg md:text-xl px-3 py-1 leading-none tabular-nums"
          style={{
            background: accent,
            color: isRival ? '#ffffff' : '#000000',
            boxShadow: `0 0 16px rgba(${accentRgb},0.45)`,
          }}
        >
          ${slot.cost ?? p.auctionBasePrice ?? p.basePrice ?? 4}
        </span>
      </div>
    </div>
  );
};
