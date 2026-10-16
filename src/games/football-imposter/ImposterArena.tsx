import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Eye,
  Fingerprint,
  Flame,
  Gavel,
  Lock,
  MessageSquare,
  X as CloseIcon,
  Mic,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  UserCheck,
  UserX,
  Radio,
} from 'lucide-react';
import type {
  FloatingReaction,
  ImposterChatMessage,
  ImposterClueEntry,
  ImposterMatchConfig,
  ImposterParticipant,
  ImposterSecretPlayer,
} from './types';
import {
  BOT_DISCUSSION_LINES,
  findDidYouMeanPlayer,
  generateBotClue,
  generateBotLastStandGuess,
  generateSquadParticipants,
  isCorrectImposterGuess,
  pickSecretPlayer,
} from './imposterEngine';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import { useIsPhone } from '../../utils/viewport';
import { soundFX } from '../../utils/audio';

/* ============================================================================
 * CLASSIFIED TRIBUNAL — palette & helpers
 * ==========================================================================*/

const HAZARD = '#ef4444';
const HAZARD_RGB = '239,68,68';
const CLEAR = '#10b981';
const CLEAR_RGB = '16,185,129';
const DETECT = '#06b6d4';
const DETECT_RGB = '6,182,212';
const TAU = Math.PI * 2;

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
 * FX ENGINE — transparent canvas overlay for sparks, shockwaves, flashes and
 * confetti. The rAF loop sleeps whenever nothing is alive.
 * ==========================================================================*/

interface ImParticle {
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

interface ImRing {
  x: number;
  y: number;
  r1: number;
  t0: number;
  dur: number;
  rgb: string;
  w: number;
}

interface ImFlash {
  x: number;
  y: number;
  r: number;
  t0: number;
  dur: number;
  rgb: string;
}

interface ImFxEngine {
  burst: (x: number, y: number, rgb: string, n: number, speed?: number) => void;
  confetti: (x: number, y: number, n: number, palette: string[]) => void;
  shockwave: (x: number, y: number, rgb: string, radius: number, dur?: number, width?: number) => void;
  flash: (x: number, y: number, rgb: string, radius: number, dur?: number) => void;
  destroy: () => void;
}

function createImFxEngine(canvas: HTMLCanvasElement): ImFxEngine {
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
  const parts: ImParticle[] = [];
  const rings: ImRing[] = [];
  const flashes: ImFlash[] = [];
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
      const life = 0.4 + Math.random() * 0.6;
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
      g.addColorStop(0, `rgba(255,255,255,${0.75 * (1 - age)})`);
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

const ImFxCanvas: React.FC<{ engineRef: React.RefObject<ImFxEngine | null> }> = ({ engineRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = createImFxEngine(canvasRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef]);
  return <canvas ref={canvasRef} className="fixed inset-0 z-[45] w-full h-full pointer-events-none" aria-hidden="true" />;
};

/* ============================================================================
 * TRIBUNAL WIDGETS
 * ==========================================================================*/

// Ring-framed avatar plate: participant colour ring around a dark core so initials stay legible.
const SuspectAvatar: React.FC<{ p: ImposterParticipant; size?: number; className?: string; style?: React.CSSProperties }> = ({
  p,
  size = 48,
  className = '',
  style,
}) => (
  <div
    className={`relative shrink-0 rounded-xl border-2 p-[3px] ${p.avatarBg} ${className}`}
    style={{ width: size, height: size, ...style }}
  >
    <div className="w-full h-full rounded-lg bg-[#05070b]/85 flex items-center justify-center">
      <span className={`font-athletic font-black leading-none ${p.avatarText}`} style={{ fontSize: Math.round(size * 0.38) }}>
        {p.initials}
      </span>
    </div>
  </div>
);

// Interrogation dial used in the header for the clue / debate clocks.
const TimerDial: React.FC<{ seconds: number; total: number; urgent: boolean }> = ({ seconds, total, urgent }) => {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / Math.max(1, total)));
  const color = urgent ? HAZARD : DETECT;
  return (
    <div
      className={`im-chamfer relative flex items-center gap-1.5 p-1 sm:pr-3 border ${
        urgent ? 'bg-red-500/15 border-red-500/60 im-urgent' : 'bg-cyan-500/10 border-cyan-500/40'
      }`}
    >
      <span className="relative w-9 h-9 shrink-0">
        <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90" aria-hidden="true">
          <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - frac)}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s', filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-athletic font-black text-[13px] tabular-nums" style={{ color }}>
          {seconds}
        </span>
      </span>
      <span className="hidden sm:inline font-athletic font-black text-lg tracking-wider tabular-nums text-white">
        {seconds}s
      </span>
    </div>
  );
};

// Slammed numeric vote stamp — re-keys on every count change so the slam replays.
const VoteStamp: React.FC<{ count: number; tone: 'hazard' | 'detect'; delayMs?: number }> = ({ count, tone, delayMs = 0 }) => {
  const color = tone === 'hazard' ? HAZARD : DETECT;
  const rgb = tone === 'hazard' ? HAZARD_RGB : DETECT_RGB;
  return (
    <div
      key={count}
      className="im-vote-stamp absolute -top-3.5 -right-3.5 z-20 w-11 h-11 flex items-center justify-center font-athletic text-xl font-black tabular-nums border-2 rotate-[-8deg]"
      style={{
        animationDelay: `${delayMs}ms`,
        background: count > 0 ? color : '#0b0f17',
        borderColor: count > 0 ? '#ffffff' : 'rgba(255,255,255,0.2)',
        color: count > 0 ? '#ffffff' : '#737373',
        boxShadow: count > 0 ? `0 0 24px rgba(${rgb},0.7)` : 'none',
      }}
    >
      {count}
    </div>
  );
};

const IM_CSS = `
  @keyframes imposterReactionFloat {
    0% { opacity: 0; transform: translateY(14px) scale(0.85); }
    15% { opacity: 1; transform: translateY(0px) scale(1.05); }
    30% { transform: translateY(-4px) scale(1.0); }
    80% { opacity: 1; transform: translateY(-10px) scale(1.0); }
    100% { opacity: 0; transform: translateY(-24px) scale(0.92); }
  }

  @keyframes imRise { from { opacity: 0; transform: translate3d(0, 14px, 0); } to { opacity: 1; transform: none; } }
  .im-rise { animation: imRise 0.42s cubic-bezier(0.2, 0.9, 0.25, 1) both; }

  @keyframes imPop {
    0% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.86); }
    60% { opacity: 1; transform: translate3d(0, -2px, 0) scale(1.04); }
    100% { opacity: 1; transform: none; }
  }
  .im-pop { animation: imPop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both; }

  @keyframes imCount {
    0% { transform: scale(2.6); opacity: 0; filter: blur(10px); }
    30% { transform: scale(0.94); opacity: 1; filter: none; }
    55% { transform: scale(1.04); }
    100% { transform: scale(1); opacity: 1; }
  }
  .im-count { animation: imCount 0.85s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes imFlap {
    0% { transform: perspective(1200px) rotateX(0deg); opacity: 1; }
    70% { opacity: 1; }
    100% { transform: perspective(1200px) rotateX(-112deg); opacity: 0; }
  }
  .im-flap { animation: imFlap 0.75s cubic-bezier(0.55, 0, 0.3, 1) 0.15s both; transform-origin: 50% 0%; backface-visibility: hidden; }

  @keyframes imUnseal { from { opacity: 0; transform: translate3d(0, 18px, 0) scale(0.97); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
  .im-unseal { animation: imUnseal 0.55s cubic-bezier(0.2, 0.9, 0.25, 1) 0.5s both; }

  @keyframes imStamp {
    0% { opacity: 0; transform: rotate(-12deg) scale(2.6); }
    55% { opacity: 1; transform: rotate(-12deg) scale(0.9); }
    75% { transform: rotate(-12deg) scale(1.05); }
    100% { opacity: 1; transform: rotate(-12deg) scale(1); }
  }
  .im-stamp { animation: imStamp 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

  @keyframes imVoteStamp {
    0% { opacity: 0; transform: rotate(-8deg) scale(2.4); }
    55% { opacity: 1; transform: rotate(-8deg) scale(0.88); }
    100% { opacity: 1; transform: rotate(-8deg) scale(1); }
  }
  .im-vote-stamp { animation: imVoteStamp 0.42s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }

  @keyframes imVerdict {
    0% { opacity: 0; transform: rotate(-6deg) scale(2.8); letter-spacing: 0.3em; }
    40% { opacity: 1; transform: rotate(-6deg) scale(0.92); letter-spacing: 0.02em; }
    65% { transform: rotate(-6deg) scale(1.04); }
    100% { opacity: 1; transform: rotate(-6deg) scale(1); letter-spacing: 0.02em; }
  }
  .im-verdict { animation: imVerdict 0.75s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both; }

  @keyframes imBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.25; } }
  .im-blink { animation: imBlink 1s steps(1) infinite; }

  @keyframes imHazardScroll { from { background-position: 0 0; } to { background-position: 40px 0; } }
  .im-hazard {
    background-image: repeating-linear-gradient(-45deg, rgba(239,68,68,0.9) 0 10px, rgba(10,10,12,0.95) 10px 20px);
    background-size: 28px 28px;
    animation: imHazardScroll 1.6s linear infinite;
  }

  @keyframes imSirenL { 0%, 100% { opacity: 0.7; } 50% { opacity: 0.08; } }
  @keyframes imSirenR { 0%, 100% { opacity: 0.08; } 50% { opacity: 0.6; } }
  .im-siren-l { animation: imSirenL 0.55s steps(2, jump-none) infinite; }
  .im-siren-r { animation: imSirenR 0.55s steps(2, jump-none) infinite; }

  @keyframes imHeartbeat { 0%, 100% { transform: scale(1); } 14% { transform: scale(1.08); } 28% { transform: scale(1); } 42% { transform: scale(1.05); } 70% { transform: scale(1); } }
  .im-heartbeat { animation: imHeartbeat 1.1s ease-in-out infinite; }

  @keyframes imScan { from { transform: translate3d(0, -120%, 0); } to { transform: translate3d(0, 520%, 0); } }
  .im-scan { animation: imScan 3.2s ease-in-out infinite; will-change: transform; }

  @keyframes imShake {
    0%, 100% { transform: none; }
    15% { transform: translate3d(-8px, 2px, 0); }
    30% { transform: translate3d(7px, -2px, 0); }
    45% { transform: translate3d(-5px, 1px, 0); }
    60% { transform: translate3d(3px, -1px, 0); }
    80% { transform: translate3d(-1px, 0, 0); }
  }
  .im-shake { animation: imShake 0.5s cubic-bezier(0.2, 0.8, 0.3, 1); }

  @keyframes imUrgent { 0%, 100% { box-shadow: inset 0 0 0 1px rgba(239,68,68,0.45); } 50% { box-shadow: inset 0 0 0 1px rgba(239,68,68,1), inset 0 0 16px rgba(239,68,68,0.45); } }
  .im-urgent { animation: imUrgent 1s ease-in-out infinite; }

  @keyframes imSoftPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  .im-soft-pulse { animation: imSoftPulse 2.2s ease-in-out infinite; }

  @keyframes imDot { 0%, 80%, 100% { transform: translateY(0); opacity: 0.35; } 40% { transform: translateY(-3px); opacity: 1; } }
  .im-dot { animation: imDot 1.1s ease-in-out infinite; }

  @keyframes imSheen { 0% { transform: translateX(-160%) skewX(-20deg); } 55%, 100% { transform: translateX(380%) skewX(-20deg); } }
  .im-sheen { position: relative; overflow: hidden; }
  .im-sheen::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 30%; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent); animation: imSheen 3.2s ease-in-out infinite; }

  .im-panel {
    position: relative;
    background: linear-gradient(180deg, rgba(14,17,24,0.95), rgba(6,8,12,0.96));
    border: 1px solid rgba(255,255,255,0.08);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  }
  .im-panel::before {
    content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; pointer-events: none;
    background: linear-gradient(90deg, transparent, var(--im-accent, rgba(239,68,68,0.75)), transparent);
  }
  .im-chamfer { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }
  .im-press { transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.15s, background-color 0.15s, border-color 0.15s, color 0.15s; }
  .im-press:active { transform: scale(0.95); transition-duration: 0.08s; }

  @media (prefers-reduced-motion: reduce) {
    .im-siren-l, .im-siren-r, .im-heartbeat, .im-scan, .im-hazard, .im-sheen::after, .im-soft-pulse, .im-dot, .im-urgent, .im-blink { animation: none !important; }
    .im-shake { animation: none !important; }
  }
`;

interface ImposterArenaProps {
  config: ImposterMatchConfig;
  onExitArena: () => void;
}

type ImposterStage =
  | 'opening-countdown'
  | 'role-reveal'
  | 'clue-turn'
  | 'discussion'
  | 'intermission'
  | 'voting'
  | 'vote-reveal'
  | 'vote-skipped'
  | 'verdict-suspense'
  | 'imposter-last-stand'
  | 'game-over';

const CLUE_TURN_SECONDS = 60;
const DISCUSSION_SECONDS = 30;
const VOTE_SECONDS = 30; // Tribunal ballot window; anyone who hasn't voted auto-skips
const VOTE_GRACE_MS = 2500; // Wait for late ballots before filling missing voters with SKIP
const REVEAL_SECONDS = 10; // Auto-trigger the identity reveal after the tally
const PUSH_PENALTY_SECONDS = 10; // Clock cut when the whole squad pushes the active speaker
const MAX_CLUE_ROUNDS = 4; // Hard cap so repeated skip votes can't loop forever
const SKIP_VOTE = '__skip__';
const ROLE_REVEAL_SECONDS = 15; // Auto-enter the clue phase if a player idles on their dossier
const INTERMISSION_SECONDS = 20; // Squad decision window; no vote counts as "proceed to round 2"
const LAST_STAND_SECONDS = 30; // Imposter's final guess window; no guess = failed steal
const HOST_FALLBACK_MS = 4000; // Guests settle a tally themselves only if the host's ruling never arrives

const REACTION_PILLS = [
  'SUS 👀',
  'Hmm 🤔',
  'I get it 💡',
  'Cap 🧢',
  'Cold 🥶',
] as const;

export const ImposterArena: React.FC<ImposterArenaProps> = ({
  config,
  onExitArena,
}) => {
  const {
    isMultiplayer,
    isHost,
    partyMembers,
    myPlayerId,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
    party,
    leaveParty,
  } = useGameSync('football-imposter');

  const [secretPlayer, setSecretPlayer] = useState<ImposterSecretPlayer>(() => {
    if (gameInitData?.assignedRole?.secretPlayer) {
      return gameInitData.assignedRole.secretPlayer;
    }
    return pickSecretPlayer(config.category, [], { wellKnownOnly: config.wellKnownOnly });
  });
  const [usedSecretIds, setUsedSecretIds] = useState<string[]>([]);
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);
  const [participants, setParticipants] = useState<ImposterParticipant[]>(() => {
    if (isMultiplayer && partyMembers && partyMembers.length > 1) {
      const colors = [
        { bg: 'bg-[#ccff00]', text: 'text-black', avatarText: 'text-[#ccff00]', badge: 'border-[#ccff00] text-[#ccff00] bg-[#ccff00]/20' },
        { bg: 'bg-[#00f0ff]', text: 'text-black', avatarText: 'text-[#00f0ff]', badge: 'border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/20' },
        { bg: 'bg-[#ff0055]', text: 'text-white', avatarText: 'text-[#ff0055]', badge: 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/20' },
        { bg: 'bg-[#a855f7]', text: 'text-white', avatarText: 'text-[#a855f7]', badge: 'border-[#a855f7] text-[#a855f7] bg-[#a855f7]/20' },
      ];
      return partyMembers.map((m, idx) => {
        const color = colors[idx % colors.length];
        const isUser = m.id === myPlayerId;
        const isImposter = isUser ? Boolean(gameInitData?.assignedRole?.isImposter) : false;
        return {
          id: m.id,
          name: m.name,
          initials: m.name.slice(0, 2).toUpperCase(),
          avatarBg: color.bg,
          avatarText: color.avatarText,
          reactionBadgeClass: color.badge,
          isUser,
          isImposter,
          title: isUser ? 'Squad Captain' : 'Squad Scout',
        };
      });
    }
    return generateSquadParticipants(config.botCount, config.rolePreference);
  });

  // Synchronize role and secret player from authoritative server gameInitData
  useEffect(() => {
    if (!isMultiplayer || !gameInitData) return;

    if (gameInitData.assignedRole?.secretPlayer) {
      setSecretPlayer(gameInitData.assignedRole.secretPlayer);
    }

    if (partyMembers && partyMembers.length > 1) {
      const colors = [
        { bg: 'bg-[#ccff00]', text: 'text-black', avatarText: 'text-[#ccff00]', badge: 'border-[#ccff00] text-[#ccff00] bg-[#ccff00]/20' },
        { bg: 'bg-[#00f0ff]', text: 'text-black', avatarText: 'text-[#00f0ff]', badge: 'border-[#00f0ff] text-[#00f0ff] bg-[#00f0ff]/20' },
        { bg: 'bg-[#ff0055]', text: 'text-white', avatarText: 'text-[#ff0055]', badge: 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/20' },
        { bg: 'bg-[#a855f7]', text: 'text-white', avatarText: 'text-[#a855f7]', badge: 'border-[#a855f7] text-[#a855f7] bg-[#a855f7]/20' },
      ];
      setParticipants(
        partyMembers.map((m, idx) => {
          const color = colors[idx % colors.length];
          const isUser = m.id === myPlayerId;
          const isImposter = isUser ? Boolean(gameInitData?.assignedRole?.isImposter) : false;
          return {
            id: m.id,
            name: m.name,
            initials: m.name.slice(0, 2).toUpperCase(),
            avatarBg: color.bg,
            avatarText: color.avatarText,
            reactionBadgeClass: color.badge,
            isUser,
            isImposter,
            title: isUser ? 'Squad Captain' : 'Squad Scout',
          };
        })
      );
    }
  }, [isMultiplayer, gameInitData, partyMembers, myPlayerId]);

  const [stage, setStage] = useState<ImposterStage>('opening-countdown');
  const [openingCountdown, setOpeningCountdown] = useState<number>(3);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [activeSpeakerIdx, setActiveSpeakerIdx] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(CLUE_TURN_SECONDS);

  // Hold-to-Peek HUD state (Top Right)
  const [isPeeking, setIsPeeking] = useState<boolean>(false);

  // Clues & Global Discussion Chat
  const [clues, setClues] = useState<ImposterClueEntry[]>([]);
  const [clueInput, setClueInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ImposterChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  // Phones: the locker-room chat is a slide-up sheet so the clue feed stays on screen
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const isPhone = useIsPhone();
  const [chatSeenCount, setChatSeenCount] = useState(0);
  // Phones: the debate is the chat phase, so the sheet opens itself then and closes after
  useEffect(() => {
    const isPhone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
    if (stage === 'discussion' && isPhone) setMobileChatOpen(true);
    else if (stage !== 'clue-turn' && stage !== 'discussion') setMobileChatOpen(false);
  }, [stage]);

  // Floating Quick Reactions
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Voting & Last-Stand Redemption state
  const [selectedVoteTargetId, setSelectedVoteTargetId] = useState<string | null>(null);
  const [votesByVoterId, setVotesByVoterId] = useState<Record<string, string>>({});
  const [eliminatedPlayerId, setEliminatedPlayerId] = useState<string | null>(null);

  // Tribunal ballot clock, identity-reveal clock & push-for-time pressure
  const [voteSecondsLeft, setVoteSecondsLeft] = useState<number>(VOTE_SECONDS);
  const [revealSecondsLeft, setRevealSecondsLeft] = useState<number>(REVEAL_SECONDS);
  const [pushVotes, setPushVotes] = useState<string[]>([]);
  const [pushImpactKey, setPushImpactKey] = useState<number>(0);
  const [pushedSpeakerId, setPushedSpeakerId] = useState<string | null>(null);
  const votesRef = useRef<Record<string, string>>({});
  const [roleRevealSecondsLeft, setRoleRevealSecondsLeft] = useState<number>(ROLE_REVEAL_SECONDS);
  const [intermissionSecondsLeft, setIntermissionSecondsLeft] = useState<number>(INTERMISSION_SECONDS);
  const [lastStandSecondsLeft, setLastStandSecondsLeft] = useState<number>(LAST_STAND_SECONDS);
  const intermissionVotesRef = useRef<Record<string, 'vote-out' | 'continue'>>({});
  const intermissionWinnerRef = useRef<'vote-out' | 'continue' | null>(null);
  const botPushedTurnRef = useRef<string>('');

  // Discussion early skip voting (players vote to proceed to decision screen early)
  const [discussionSkipVotes, setDiscussionSkipVotes] = useState<string[]>([]);

  // Intermission voting (vote out imposter vs continue to round 2)
  const [intermissionVotes, setIntermissionVotes] = useState<Record<string, 'vote-out' | 'continue'>>({});
  const [intermissionWinner, setIntermissionWinner] = useState<'vote-out' | 'continue' | null>(null);

  const [imposterGuessInput, setImposterGuessInput] = useState<string>('');
  const [didYouMeanSuggestion, setDidYouMeanSuggestion] = useState<string | null>(null);
  const [imposterFinalGuessText, setImposterFinalGuessText] = useState<string>('');
  const [imposterStolenWin, setImposterStolenWin] = useState<boolean>(false);
  // Multiplayer: the server alone knows the imposter + secret footballer and rules on verdicts
  const [lastStandSubmitted, setLastStandSubmitted] = useState<boolean>(false);
  const suspenseStartedAtRef = useRef<number>(0);
  // Multiplayer: the host rules on each tally (one ruling per round) and broadcasts it
  const resolvedVoteRoundRef = useRef<number>(0);
  const intermissionSettledRoundRef = useRef<number>(0);
  const [showForfeitModal, setShowForfeitModal] = useState<boolean>(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver: stage === 'game-over',
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena,
    arenaKey: 'football-imposter',
  });

  const usedCluesSetRef = useRef<Set<string>>(new Set());
  const clueInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastStandInputRef = useRef<HTMLInputElement>(null);
  const leftStripSlotRef = useRef<number>(0);
  const rightStripSlotRef = useRef<number>(0);

  const userParticipant = participants.find((p) => p.isUser) || participants[0];
  const imposterParticipant =
    participants.find((p) => p.isImposter) || participants[participants.length - 1];
  const activeSpeaker = participants[activeSpeakerIdx] || participants[0];

  const eliminatedParticipant = participants.find(
    (p) => p.id === eliminatedPlayerId
  );
  const imposterCaught = eliminatedParticipant?.isImposter ?? false;
  const isTimerActive = stage === 'clue-turn' || stage === 'discussion';

  // Highlight any participant's name appearing in text using their distinct avatarText color
  const renderTextWithPlayerColors = (text: string) => {
    if (!text || participants.length === 0) return text;

    const sortedParticipants = [...participants].sort(
      (a, b) => b.name.length - a.name.length
    );
    const escapedNames = sortedParticipants.map((p) =>
      p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const regex = new RegExp(`(${escapedNames.join('|')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;

    return parts.map((part, index) => {
      const matched = participants.find(
        (p) => p.name.toLowerCase() === part.toLowerCase()
      );
      if (matched) {
        return (
          <span key={index} className={`font-bold ${matched.avatarText}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Auto-scroll global chat to bottom whenever a new message arrives
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Suspenseful 3 - 2 - 1 Opening Countdown before revealing secret player / imposter role
  useEffect(() => {
    if (stage !== 'opening-countdown') return;
    if (openingCountdown <= 1) {
      soundFX.playClick(900);
      const timer = window.setTimeout(() => {
        soundFX.playPhaseShift();
        setStage('role-reveal');
      }, 900);
      return () => window.clearTimeout(timer);
    }
    soundFX.playClick(600 + (3 - openingCountdown) * 150);
    const timer = window.setTimeout(() => {
      setOpeningCountdown((prev) => prev - 1);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [stage, openingCountdown]);

  // Trigger a floating reaction pill spread out in a vertical strip on Left or Right margin
  const triggerReaction = (label: string, participant: ImposterParticipant, broadcast = true) => {
    soundFX.playReactionPop();
    const id = `react_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const spawnOnLeft = Math.random() < 0.5;
    const STRIP_SLOTS = [14, 25, 36, 47, 58, 69, 80];

    let leftPercent: number;
    let topPercent: number;

    if (spawnOnLeft) {
      // Left strip gutter: 1.5% - 6% from left edge
      leftPercent = 1.5 + Math.floor(Math.random() * 5);
      const slot = STRIP_SLOTS[leftStripSlotRef.current % STRIP_SLOTS.length];
      leftStripSlotRef.current += 1;
      topPercent = Math.min(84, Math.max(12, slot + (Math.floor(Math.random() * 6) - 3)));
    } else {
      // Right strip gutter: 84% - 89% from left edge
      leftPercent = 84 + Math.floor(Math.random() * 6);
      const slot = STRIP_SLOTS[rightStripSlotRef.current % STRIP_SLOTS.length];
      rightStripSlotRef.current += 1;
      topPercent = Math.min(84, Math.max(12, slot + (Math.floor(Math.random() * 6) - 3)));
    }

    setFloatingReactions((prev) => [
      ...prev,
      {
        id,
        label,
        senderName: participant.initials,
        badgeClass: participant.reactionBadgeClass,
        textColorClass: participant.avatarText,
        leftPercent,
        topPercent,
      },
    ]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2600);

    if (broadcast && isMultiplayer && participant.isUser) {
      sendAction('imposter_reaction', { label, participantId: participant.id });
    }
  };

  const lastProcessedEventIdRef = useRef<number | string | null>(null);

  // Synchronize incoming multiplayer events
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    // Process each relayed event exactly once (guards StrictMode double effects & re-deliveries)
    if (lastGameEvent._eventId && lastProcessedEventIdRef.current === lastGameEvent._eventId) return;
    lastProcessedEventIdRef.current = lastGameEvent._eventId ?? null;

    if (lastGameEvent.event === 'imposter_chat') {
      const { message } = lastGameEvent.data || {};
      if (message) {
        setChatMessages((prev) => [...prev, message]);
      }
    } else if (lastGameEvent.event === 'imposter_reaction') {
      const { label, participantId } = lastGameEvent.data || {};
      const sender = participants.find((p) => p.id === participantId);
      if (label && sender) {
        triggerReaction(label, sender, false);
      }
    } else if (lastGameEvent.event === 'imposter_clue') {
      const { clueEntry } = lastGameEvent.data || {};
      const speaker = clueEntry ? participants.find((p) => p.id === clueEntry.participantId) : undefined;
      if (clueEntry && speaker) {
        const alreadyLogged = clues.some(
          (c) => c.participantId === clueEntry.participantId && c.round === clueEntry.round
        );
        if (alreadyLogged) {
          // A placeholder was posted when their clock ran out; swap in the real clue
          setClues((prev) =>
            prev.map((c) =>
              c.participantId === clueEntry.participantId && c.round === clueEntry.round
                ? { ...c, text: clueEntry.text }
                : c
            )
          );
        } else if (stage === 'clue-turn' && clueEntry.round === currentRound) {
          // Attribute by participant id, never by whoever this client thinks is speaking
          handleSubmitClue(clueEntry.text, false, speaker);
        }
      }
    } else if (lastGameEvent.event === 'imposter_vote_result') {
      const { votes, round } = lastGameEvent.data || {};
      if (votes && round === currentRound) {
        settleVotes(votes, true);
      }
    } else if (lastGameEvent.event === 'imposter_intermission_result') {
      const { votes, winner, round } = lastGameEvent.data || {};
      if (winner && round === currentRound && intermissionSettledRoundRef.current !== round) {
        intermissionSettledRoundRef.current = round;
        if (votes) setIntermissionVotes(votes);
        setIntermissionWinner(winner);
      }
    } else if (lastGameEvent.event === 'imposter_verdict') {
      const { eliminatedId, caught, imposterId, secretPlayer: revealed } = lastGameEvent.data || {};
      applyImposterReveal(imposterId, revealed);
      setEliminatedPlayerId(eliminatedId ?? null);
      if (!eliminatedId) {
        setStage('game-over');
      } else if (stage !== 'game-over') {
        if (stage !== 'verdict-suspense') {
          soundFX.playHammer();
          setStage('verdict-suspense');
          suspenseStartedAtRef.current = Date.now();
        }
        const wait = Math.max(0, 2200 - (Date.now() - suspenseStartedAtRef.current));
        window.setTimeout(() => {
          if (caught) {
            soundFX.playSuccess();
            setStage('imposter-last-stand');
          } else {
            soundFX.playVoltBuzz();
            setStage('game-over');
          }
        }, wait);
      }
    } else if (lastGameEvent.event === 'imposter_last_stand_result') {
      const { guess, correct, secretPlayer: revealed } = lastGameEvent.data || {};
      if (revealed) setSecretPlayer(revealed);
      setImposterFinalGuessText(guess || 'NO GUESS');
      setImposterStolenWin(Boolean(correct));
      setDidYouMeanSuggestion(null);
      if (correct) {
        soundFX.playVictoryFanfare();
      } else if (guess && guess !== 'NO GUESS') {
        soundFX.playSuccess();
      } else {
        soundFX.playVoltBuzz();
      }
      setStage('game-over');
    } else if (lastGameEvent.event === 'imposter_skip_vote') {
      const { voterId } = lastGameEvent.data || {};
      if (voterId) {
        setDiscussionSkipVotes((prev) => {
          const updated = prev.includes(voterId) ? prev : [...prev, voterId];
          if (updated.length >= participants.length) {
            handleEndDiscussion();
          }
          return updated;
        });
      }
    } else if (lastGameEvent.event === 'imposter_intermission_vote') {
      const { voterId, choice } = lastGameEvent.data || {};
      if (voterId && choice) {
        setIntermissionVotes((prev) => {
          const updated = { ...prev, [voterId]: choice };
          if (Object.keys(updated).length >= participants.length) {
            settleIntermission(updated);
          }
          return updated;
        });
      }
    } else if (lastGameEvent.event === 'imposter_final_vote') {
      const { voterId, targetId } = lastGameEvent.data || {};
      if (voterId && targetId) {
        setVotesByVoterId((prev) => {
          const updated = { ...prev, [voterId]: targetId };
          if (Object.keys(updated).length >= participants.length) {
            settleVotes(updated);
          }
          return updated;
        });
      }
    } else if (lastGameEvent.event === 'imposter_push_time') {
      const { voterId, speakerId, round } = lastGameEvent.data || {};
      if (voterId && speakerId === activeSpeaker.id && round === currentRound && stage === 'clue-turn') {
        setPushVotes((prev) => (prev.includes(voterId) ? prev : [...prev, voterId]));
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handlePlayAgain();
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, participants]);

  // Countdown timer for Clue Turn (60s) & Discussion (30s)
  useEffect(() => {
    if (stage !== 'clue-turn' && stage !== 'discussion') return;

    if (secondsLeft <= 0) {
      if (stage === 'clue-turn') {
        if (isMultiplayer && !activeSpeaker.isUser) {
          // The speaker's own client submits on time-out; only fill in if it never arrives
          const speaker = activeSpeaker;
          const graceTimer = window.setTimeout(() => handleSubmitClue('', false, speaker), VOTE_GRACE_MS);
          return () => window.clearTimeout(graceTimer);
        }
        handleSubmitClue(
          activeSpeaker.isUser ? clueInput.trim() || 'Big game player' : ''
        );
      } else if (stage === 'discussion') {
        handleEndDiscussion();
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
  }, [stage, secondsLeft, activeSpeaker, clueInput]);

  // Focus input when it is the User's turn to submit a clue
  useEffect(() => {
    if (stage === 'clue-turn' && activeSpeaker.isUser) {
      window.setTimeout(() => clueInputRef.current?.focus(), 60);
    }
  }, [stage, activeSpeakerIdx, activeSpeaker.isUser]);

  // Focus input or simulate bot guess during 'imposter-last-stand'
  useEffect(() => {
    if (stage !== 'imposter-last-stand') return;

    if (imposterParticipant.isUser) {
      window.setTimeout(() => lastStandInputRef.current?.focus(), 80);
      return;
    }

    // Simulated Bot Imposter attempting last-stand guess (solo mode only)
    if (isMultiplayer) return;

    const timer = window.setTimeout(() => {
      const botAttempt = generateBotLastStandGuess(secretPlayer);
      setImposterFinalGuessText(botAttempt.guessName);
      setImposterStolenWin(botAttempt.isCorrect);
      setStage('game-over');
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, stage, imposterParticipant.isUser, secretPlayer]);

  // Simulated Bot Clue Turn (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'clue-turn' || activeSpeaker.isUser) return;

    const delay = 1900 + Math.floor(Math.random() * 1100);
    const timer = window.setTimeout(() => {
      const botClue = generateBotClue(
        activeSpeaker,
        secretPlayer,
        usedCluesSetRef.current
      );
      usedCluesSetRef.current.add(botClue);
      handleSubmitClue(botClue);

      // Occasionally float a color-matched bot reaction after a clue
      if (Math.random() < 0.6) {
        const otherBots = participants.filter(
          (p) => !p.isUser && p.id !== activeSpeaker.id
        );
        const randomOtherBot =
          otherBots[Math.floor(Math.random() * otherBots.length)];
        const randomPill =
          REACTION_PILLS[Math.floor(Math.random() * REACTION_PILLS.length)];
        if (randomOtherBot) {
          window.setTimeout(
            () => triggerReaction(randomPill, randomOtherBot),
            450
          );
        }
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, stage, activeSpeakerIdx, activeSpeaker, secretPlayer, participants]);

  // Simulated Bot Discussion Chat & Reactions during the 30s Discussion phase (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'discussion') return;

    const bots = participants.filter((p) => !p.isUser);
    const t1 = window.setTimeout(() => {
      const b1 = bots[Math.floor(Math.random() * bots.length)];
      if (b1) {
        const msg =
          BOT_DISCUSSION_LINES[
            Math.floor(Math.random() * BOT_DISCUSSION_LINES.length)
          ];
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_1`,
            senderId: b1.id,
            senderName: b1.name,
            senderColorClass: b1.avatarText,
            text: msg,
          },
        ]);
        triggerReaction('SUS 👀', b1);
      }
    }, 1800);

    const t2 = window.setTimeout(() => {
      const b2 = bots[Math.floor(Math.random() * bots.length)];
      if (b2) {
        const suspect =
          participants[Math.floor(Math.random() * participants.length)];
        const line =
          suspect.id === b2.id
            ? 'My clue was spot on if you know ball 💡'
            : `Not gonna lie, ${suspect.name}'s clue sounded mad vague 🤔`;
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg_${Date.now()}_2`,
            senderId: b2.id,
            senderName: b2.name,
            senderColorClass: b2.avatarText,
            text: line,
          },
        ]);
        triggerReaction('Hmm 🤔', b2);
      }
    }, 5200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isMultiplayer, stage, currentRound, participants]);

  const handleStartCluePhase = () => {
    soundFX.playPhaseShift();
    setStage('clue-turn');
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setChatMessages([
      {
        id: `sys_r1_${Date.now()}`,
        senderId: 'system',
        senderName: '',
        text: 'ROUND 1',
        isSystem: true,
      },
    ]);
  };

  const handleSubmitClue = (rawText: string, broadcast = true, speakerOverride?: ImposterParticipant) => {
    const speaker = speakerOverride ?? activeSpeaker;
    const speakerIdx = Math.max(0, participants.findIndex((p) => p.id === speaker.id));
    soundFX.playLockIn();
    const cleanText = rawText.trim() || 'Top tier baller';
    const newEntry: ImposterClueEntry = {
      id: `clue_${currentRound}_${speaker.id}_${Date.now()}`,
      participantId: speaker.id,
      participantName: speaker.name,
      round: currentRound,
      text: cleanText,
    };

    setClues((prev) =>
      prev.some((c) => c.participantId === speaker.id && c.round === currentRound) ? prev : [...prev, newEntry]
    );
    if (speaker.isUser) {
      setClueInput('');
    }

    if (broadcast && isMultiplayer && speaker.isUser) {
      sendAction('imposter_clue', { clueEntry: newEntry });
    }

    // Advance to next speaker or transition to 30s Discussion phase
    if (speakerIdx + 1 < participants.length) {
      setActiveSpeakerIdx(speakerIdx + 1);
      setSecondsLeft(CLUE_TURN_SECONDS);
    } else {
      setStage('discussion');
      setSecondsLeft(DISCUSSION_SECONDS);
      setDiscussionSkipVotes([]);
      setIntermissionVotes({});
      setIntermissionWinner(null);
    }
  };

  // Staggered bot skip-votes during discussion phase (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'discussion') return;

    // If user has voted to skip to decision, quickly gather remaining bot votes so squad advances
    if (discussionSkipVotes.includes(userParticipant.id)) {
      const remainingBots = participants.filter(
        (p) => !discussionSkipVotes.includes(p.id)
      );
      if (remainingBots.length > 0) {
        const timer = window.setTimeout(() => {
          setDiscussionSkipVotes(participants.map((p) => p.id));
        }, 350);
        return () => window.clearTimeout(timer);
      } else {
        // All participants have voted to proceed! Advance immediately
        const timer = window.setTimeout(() => {
          handleEndDiscussion();
        }, 400);
        return () => window.clearTimeout(timer);
      }
    }

    // While user has not voted yet, simulate occasional bots voting ready over time
    const unvotedBots = participants.filter(
      (p) => !p.isUser && !discussionSkipVotes.includes(p.id)
    );
    if (unvotedBots.length > 0) {
      const delay = 4000 + Math.floor(Math.random() * 4000);
      const timer = window.setTimeout(() => {
        const nextBot = unvotedBots[0];
        setDiscussionSkipVotes((prev) =>
          prev.includes(nextBot.id) ? prev : [...prev, nextBot.id]
        );
      }, delay);
      return () => window.clearTimeout(timer);
    }
  }, [isMultiplayer, stage, discussionSkipVotes, participants, userParticipant.id]);

  // Auto-advance once squad votes in intermission
  useEffect(() => {
    if (stage !== 'intermission' || !intermissionWinner) return;

    const timer = window.setTimeout(() => {
      if (intermissionWinner === 'vote-out') {
        setStage('voting');
      } else {
        handleProceedToRound2();
      }
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [stage, intermissionWinner]);

  const handleUserVoteSkipDiscussion = () => {
    if (!discussionSkipVotes.includes(userParticipant.id)) {
      soundFX.playClick(750);
      setDiscussionSkipVotes((prev) => {
        const updated = [...prev, userParticipant.id];
        if (isMultiplayer && updated.length >= participants.length) {
          handleEndDiscussion();
        }
        return updated;
      });
      if (isMultiplayer) {
        sendAction('imposter_skip_vote', { voterId: userParticipant.id });
      }
    }
  };

  const handleCastIntermissionVote = (choice: 'vote-out' | 'continue') => {
    if (intermissionWinner) return;
    soundFX.playLockIn();

    if (isMultiplayer) {
      setIntermissionVotes((prev) => {
        const nextVotes = { ...prev, [userParticipant.id]: choice };
        if (Object.keys(nextVotes).length >= participants.length) {
          settleIntermission(nextVotes);
        }
        return nextVotes;
      });
      sendAction('imposter_intermission_vote', { voterId: userParticipant.id, choice });
    } else {
      const userVote = { [userParticipant.id]: choice };
      const simulatedVotes: Record<string, 'vote-out' | 'continue'> = { ...userVote };

      for (const bot of participants) {
        if (bot.isUser) continue;
        if (bot.isImposter) {
          // Imposter usually wants round 2 to keep hiding
          simulatedVotes[bot.id] = Math.random() < 0.8 ? 'continue' : 'vote-out';
        } else {
          // Innocents split based on clue confidence
          simulatedVotes[bot.id] = Math.random() < 0.5 ? 'vote-out' : 'continue';
        }
      }

      setIntermissionVotes(simulatedVotes);

      const voteOutCount = Object.values(simulatedVotes).filter((v) => v === 'vote-out').length;
      const continueCount = Object.values(simulatedVotes).filter((v) => v === 'continue').length;
      const winner = voteOutCount >= continueCount ? 'vote-out' : 'continue';
      setIntermissionWinner(winner);
    }
  };

  const handleEndDiscussion = () => {
    if (currentRound === 1 && config.clueRounds === 2) {
      setStage('intermission');
    } else {
      setStage('voting');
    }
  };

  const handleProceedToRound2 = () => {
    soundFX.playPhaseShift();
    setCurrentRound(2);
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setDiscussionSkipVotes([]);
    setIntermissionVotes({});
    setIntermissionWinner(null);
    setStage('clue-turn');
    setChatMessages((prev) => [
      ...prev,
      {
        id: `sys_r2_${Date.now()}`,
        senderId: 'system',
        senderName: '',
        text: 'ROUND 2',
        isSystem: true,
      },
    ]);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    soundFX.playClick(900);
    const newMsg: ImposterChatMessage = {
      id: `chat_${Date.now()}`,
      senderId: userParticipant.id,
      senderName: userParticipant.name,
      senderColorClass: userParticipant.avatarText,
      text: trimmed,
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setChatInput('');
    if (isMultiplayer) {
      sendAction('imposter_chat', { message: newMsg });
    }
  };

  // Multiplayer tallies are ruled on by the host, which broadcasts its ruling, so every client
  // lands on the same outcome. Guests settle locally only when the ruling comes from the host
  // (or as a fallback once the host has gone quiet).
  const settleVotes = (allVotes: Record<string, string>, authoritative = false) => {
    if (resolvedVoteRoundRef.current === currentRound) return;
    if (isMultiplayer && !isHost && !authoritative) return;
    resolvedVoteRoundRef.current = currentRound;
    if (isMultiplayer && isHost) {
      sendAction('imposter_vote_result', { votes: allVotes, round: currentRound });
    }
    resolveVotingTallies(allVotes);
  };

  const settleIntermission = (votes: Record<string, 'vote-out' | 'continue'>, authoritative = false) => {
    if (intermissionSettledRoundRef.current === currentRound) return;
    if (isMultiplayer && !isHost && !authoritative) return;
    intermissionSettledRoundRef.current = currentRound;
    const voteOutCount = Object.values(votes).filter((v) => v === 'vote-out').length;
    const continueCount = Object.values(votes).filter((v) => v === 'continue').length;
    const winner = voteOutCount >= continueCount ? 'vote-out' : 'continue';
    if (isMultiplayer && isHost) {
      sendAction('imposter_intermission_result', { votes, winner, round: currentRound });
    }
    setIntermissionWinner(winner);
  };

  const resolveVotingTallies = (allVotes: Record<string, string>) => {
    const tally: Record<string, number> = {};
    let skipCount = 0;
    for (const targetId of Object.values(allVotes)) {
      if (targetId === SKIP_VOTE) {
        skipCount += 1;
        continue;
      }
      tally[targetId] = (tally[targetId] || 0) + 1;
    }

    setVotesByVoterId(allVotes);
    votesRef.current = allVotes;

    // Strict majority of the squad chose to skip (or nobody accused anyone) -> no ejection this round
    const noAccusations = Object.keys(tally).length === 0;
    if (skipCount > participants.length / 2 || noAccusations) {
      if (currentRound < MAX_CLUE_ROUNDS) {
        soundFX.playPhaseShift();
        setStage('vote-skipped');
      } else {
        // Final round reached without a conviction: the imposter walks free
        soundFX.playVoltBuzz();
        setEliminatedPlayerId(null);
        setStage('game-over');
        if (isMultiplayer) sendAction('imposter_verdict_request', { eliminatedId: null });
      }
      return;
    }

    // Ties go to whoever sits first at the table, so every client convicts the same suspect
    let topSuspectId = selectedVoteTargetId || participants[0]?.id;
    let maxVotes = -1;
    for (const p of participants) {
      const count = tally[p.id] || 0;
      if (count > maxVotes) {
        maxVotes = count;
        topSuspectId = p.id;
      }
    }

    setEliminatedPlayerId(topSuspectId);
    setRevealSecondsLeft(REVEAL_SECONDS);
    setStage('vote-reveal');
  };

  // Skip-majority outcome: run another full clue round, then re-vote
  const handleStartExtraRound = () => {
    const nextRound = currentRound + 1;
    soundFX.playPhaseShift();
    setCurrentRound(nextRound);
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setDiscussionSkipVotes([]);
    setIntermissionVotes({});
    setIntermissionWinner(null);
    setVotesByVoterId({});
    votesRef.current = {};
    setSelectedVoteTargetId(null);
    setPushVotes([]);
    setVoteSecondsLeft(VOTE_SECONDS);
    setRevealSecondsLeft(REVEAL_SECONDS);
    setStage('clue-turn');
    setChatMessages((prev) => [
      ...prev,
      {
        id: `sys_r${nextRound}_${Date.now()}`,
        senderId: 'system',
        senderName: '',
        text: `ROUND ${nextRound} • VOTE SKIPPED`,
        isSystem: true,
      },
    ]);
  };

  const handleLockVote = (forcedTargetId?: string) => {
    const voteTarget = forcedTargetId ?? selectedVoteTargetId;
    if (!voteTarget) return;
    if (votesRef.current[userParticipant.id] !== undefined) return; // one ballot per player
    soundFX.playLockIn();

    if (isMultiplayer) {
      votesRef.current = { ...votesRef.current, [userParticipant.id]: voteTarget };
      setVotesByVoterId((prev) => {
        const nextVotes = { ...prev, [userParticipant.id]: voteTarget };
        if (Object.keys(nextVotes).length >= participants.length) {
          settleVotes(nextVotes);
        }
        return nextVotes;
      });
      sendAction('imposter_final_vote', { voterId: userParticipant.id, targetId: voteTarget });
    } else {
      const allVotes: Record<string, string> = {
        [userParticipant.id]: voteTarget,
      };
      const skipAllowed = currentRound < MAX_CLUE_ROUNDS;

      for (const bot of participants) {
        if (bot.isUser) continue;

        // When the captain skips, bots may follow: the imposter loves a skip, innocents are split
        if (voteTarget === SKIP_VOTE && skipAllowed) {
          const skipChance = bot.isImposter ? 0.7 : 0.55;
          if (Math.random() < skipChance) {
            allVotes[bot.id] = SKIP_VOTE;
            continue;
          }
        }

        if (bot.isImposter) {
          const innocents = participants.filter((p) => p.id !== bot.id);
          const target = innocents[Math.floor(Math.random() * innocents.length)];
          allVotes[bot.id] = target.id;
        } else {
          const spotsImposter = Math.random() < 0.62;
          if (spotsImposter) {
            allVotes[bot.id] = imposterParticipant.id;
          } else {
            const others = participants.filter((p) => p.id !== bot.id);
            const target = others[Math.floor(Math.random() * others.length)];
            allVotes[bot.id] = target.id;
          }
        }
      }

      resolveVotingTallies(allVotes);
    }
  };

  // Server reveal: mark the real imposter and (when safe) the true secret footballer
  const applyImposterReveal = (imposterId?: string, revealed?: ImposterSecretPlayer) => {
    if (imposterId) {
      setParticipants((prev) => prev.map((p) => ({ ...p, isImposter: p.id === imposterId })));
    }
    if (revealed) setSecretPlayer(revealed);
  };

  const handleTriggerVerdictSuspense = () => {
    soundFX.playHammer();
    setStage('verdict-suspense');
    suspenseStartedAtRef.current = Date.now();
    if (isMultiplayer) {
      // Only the server knows the imposter: its imposter_verdict event decides what's next
      sendAction('imposter_verdict_request', { eliminatedId: eliminatedPlayerId });
      return;
    }
    const caught =
      participants.find((p) => p.id === eliminatedPlayerId)?.isImposter ?? false;

    window.setTimeout(() => {
      if (caught) {
        soundFX.playSuccess();
        setStage('imposter-last-stand');
      } else {
        soundFX.playVoltBuzz();
        setStage('game-over');
      }
    }, 2200);
  };

  const handleImposterLastStandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = imposterGuessInput.trim();
    if (!trimmed) return;

    // If we have not yet suggested a spelling correction for this input, check if one applies
    const check = findDidYouMeanPlayer(trimmed, secretPlayer);
    if (
      check.hasCorrection &&
      check.suggestedName &&
      didYouMeanSuggestion !== check.suggestedName
    ) {
      soundFX.playClick(750);
      setImposterGuessInput(check.suggestedName);
      setDidYouMeanSuggestion(check.suggestedName);
      return;
    }

    // Multiplayer: the imposter's client never holds the answer, so the server judges it
    if (isMultiplayer) {
      if (lastStandSubmitted) return;
      soundFX.playLockIn();
      setLastStandSubmitted(true);
      setImposterFinalGuessText(trimmed);
      setDidYouMeanSuggestion(null);
      sendAction('imposter_last_stand_guess', { guess: trimmed });
      return;
    }

    // Confirmed or exact -> evaluate final guess
    const won = isCorrectImposterGuess(trimmed, secretPlayer);
    setImposterFinalGuessText(trimmed);
    setImposterStolenWin(won);
    setDidYouMeanSuggestion(null);
    if (won) {
      soundFX.playVictoryFanfare();
    } else {
      soundFX.playSuccess();
    }
    setStage('game-over');
  };

  const handlePlayAgain = () => {
    soundFX.playLobbyReady();
    if (!isMultiplayer) {
      const nextUsed = [...usedSecretIds, secretPlayer.id];
      setUsedSecretIds(nextUsed);
      const nextSecret = pickSecretPlayer(config.category, nextUsed, { wellKnownOnly: config.wellKnownOnly });
      setSecretPlayer(nextSecret);
      setParticipants(
        generateSquadParticipants(config.botCount, config.rolePreference)
      );
    }
    // Multiplayer: the server re-seeded the match; the gameInitData sync effect installs the
    // new role, secret footballer and table.
    resolvedVoteRoundRef.current = 0;
    intermissionSettledRoundRef.current = 0;
    usedCluesSetRef.current = new Set();
    setClues([]);
    setClueInput('');
    setChatMessages([]);
    setChatInput('');
    setSelectedVoteTargetId(null);
    setVotesByVoterId({});
    setEliminatedPlayerId(null);
    votesRef.current = {};
    setPushVotes([]);
    setVoteSecondsLeft(VOTE_SECONDS);
    setRevealSecondsLeft(REVEAL_SECONDS);
    setImposterGuessInput('');
    setDidYouMeanSuggestion(null);
    setImposterFinalGuessText('');
    setImposterStolenWin(false);
    setLastStandSubmitted(false);
    setDiscussionSkipVotes([]);
    setIntermissionVotes({});
    setIntermissionWinner(null);
    setCurrentRound(1);
    setActiveSpeakerIdx(0);
    setSecondsLeft(CLUE_TURN_SECONDS);
    setOpeningCountdown(3);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setStage('opening-countdown');
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
    handlePlayAgain();
  };

  // ================= TRIBUNAL CLOCKS & ANTI-AFK SAFEGUARDS =================

  // Keep the ballot ref in sync with ballots that arrive over the network
  useEffect(() => {
    votesRef.current = votesByVoterId;
  }, [votesByVoterId]);

  // 30s ballot window while the tribunal votes
  useEffect(() => {
    if (stage !== 'voting') return;
    setVoteSecondsLeft(VOTE_SECONDS);
    const id = window.setInterval(() => {
      setVoteSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 5 && next > 0) {
          soundFX.playCountdownTick(next <= 2 ? 3 : 2);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, currentRound]);

  // Ballot window expired: auto-skip for the local player, then (multiplayer) fill any
  // missing / AFK / dropped ballots with SKIP after a short grace period so nobody is stuck.
  useEffect(() => {
    if (stage !== 'voting' || voteSecondsLeft > 0) return;
    if (votesRef.current[userParticipant.id] === undefined) {
      handleLockVote(SKIP_VOTE);
    }
    if (!isMultiplayer) return;
    let fallbackTimer = 0;
    const timer = window.setTimeout(() => {
      const filled: Record<string, string> = { ...votesRef.current };
      participants.forEach((p) => {
        if (filled[p.id] === undefined) filled[p.id] = SKIP_VOTE;
      });
      if (isHost) {
        settleVotes(filled);
      } else {
        fallbackTimer = window.setTimeout(() => settleVotes(filled, true), HOST_FALLBACK_MS);
      }
    }, VOTE_GRACE_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallbackTimer);
    };
  }, [stage, voteSecondsLeft]);

  // 10s identity-reveal clock after the tally
  useEffect(() => {
    if (stage !== 'vote-reveal') return;
    const id = window.setInterval(() => {
      setRevealSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage === 'vote-reveal' && revealSecondsLeft === 0) {
      handleTriggerVerdictSuspense();
    }
  }, [stage, revealSecondsLeft]);

  // Skip-majority: show the outcome briefly, then start another clue round
  useEffect(() => {
    if (stage !== 'vote-skipped') return;
    const timer = window.setTimeout(() => handleStartExtraRound(), 2800);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // ---------- AFK SAFEGUARDS: role reveal, intermission, last stand ----------

  // Role reveal: auto-enter the clue phase after 15s
  useEffect(() => {
    if (stage !== 'role-reveal') return;
    let left = ROLE_REVEAL_SECONDS;
    setRoleRevealSecondsLeft(left);
    const id = window.setInterval(() => {
      left -= 1;
      setRoleRevealSecondsLeft(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(id);
        handleStartCluePhase();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    intermissionVotesRef.current = intermissionVotes;
  }, [intermissionVotes]);

  useEffect(() => {
    intermissionWinnerRef.current = intermissionWinner;
  }, [intermissionWinner]);

  // Intermission: 20s decision window. No vote = "continue"; in multiplayer, missing /
  // AFK / dropped ballots are filled with "continue" after a short grace period.
  useEffect(() => {
    if (stage !== 'intermission') return;
    let left = INTERMISSION_SECONDS;
    let graceTimer = 0;
    let fallbackTimer = 0;
    setIntermissionSecondsLeft(left);
    const id = window.setInterval(() => {
      if (intermissionWinnerRef.current) {
        window.clearInterval(id);
        return;
      }
      left -= 1;
      setIntermissionSecondsLeft(Math.max(0, left));
      if (left > 0) return;
      window.clearInterval(id);
      if (intermissionVotesRef.current[userParticipant.id] === undefined) {
        handleCastIntermissionVote('continue');
      }
      if (!isMultiplayer) return;
      graceTimer = window.setTimeout(() => {
        if (intermissionWinnerRef.current) return;
        const filled: Record<string, 'vote-out' | 'continue'> = { ...intermissionVotesRef.current };
        participants.forEach((p) => {
          if (filled[p.id] === undefined) filled[p.id] = 'continue';
        });
        const settle = (authoritative: boolean) => {
          if (intermissionWinnerRef.current) return;
          setIntermissionVotes(filled);
          settleIntermission(filled, authoritative);
        };
        if (isHost) {
          settle(false);
        } else {
          fallbackTimer = window.setTimeout(() => settle(true), HOST_FALLBACK_MS);
        }
      }, VOTE_GRACE_MS);
    }, 1000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(graceTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [stage]);

  // Last stand: 30s for the imposter's final guess, otherwise it counts as a failed steal
  useEffect(() => {
    if (stage !== 'imposter-last-stand') return;
    let left = LAST_STAND_SECONDS;
    setLastStandSecondsLeft(left);
    const id = window.setInterval(() => {
      left -= 1;
      setLastStandSecondsLeft(Math.max(0, left));
      if (left > 0) return;
      window.clearInterval(id);
      if (isMultiplayer) return; // server times out the steal and broadcasts the result
      soundFX.playVoltBuzz();
      setImposterFinalGuessText('NO GUESS');
      setImposterStolenWin(false);
      setDidYouMeanSuggestion(null);
      setStage('game-over');
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  // ================= PUSH FOR TIME =================
  const pushSpeakerRef = useRef<string>(activeSpeaker.id);
  pushSpeakerRef.current = activeSpeaker.id;
  const pushVotersNeeded = Math.max(0, participants.length - 1);

  // Push ballots reset whenever the mic moves on
  useEffect(() => {
    setPushVotes([]);
    setPushedSpeakerId(null);
  }, [activeSpeakerIdx, currentRound, stage]);

  // Whole squad (everyone except the speaker) pushed -> cut the speaker's clock
  useEffect(() => {
    if (stage !== 'clue-turn') return;
    if (pushVotersNeeded <= 0 || pushVotes.length < pushVotersNeeded) return;
    soundFX.playVoltBuzz();
    setSecondsLeft((prev) => Math.max(1, prev - PUSH_PENALTY_SECONDS));
    setPushVotes([]);
    setPushImpactKey((k) => k + 1);
    setPushedSpeakerId(activeSpeaker.id);
  }, [pushVotes, stage, pushVotersNeeded]);

  const addBotPushVotes = (speakerId: string) => {
    participants
      .filter((p) => !p.isUser && p.id !== speakerId)
      .forEach((bot, i) => {
        window.setTimeout(() => {
          if (pushSpeakerRef.current !== speakerId) return;
          setPushVotes((prev) => (prev.includes(bot.id) ? prev : [...prev, bot.id]));
        }, 380 + i * 300);
      });
  };

  const handlePushForTime = () => {
    if (stage !== 'clue-turn' || activeSpeaker.isUser) return;
    if (pushVotes.includes(userParticipant.id) || secondsLeft <= PUSH_PENALTY_SECONDS) return;
    soundFX.playClick(820);
    setPushVotes((prev) => (prev.includes(userParticipant.id) ? prev : [...prev, userParticipant.id]));
    if (isMultiplayer) {
      sendAction('imposter_push_time', {
        voterId: userParticipant.id,
        speakerId: activeSpeaker.id,
        round: currentRound,
      });
    } else {
      // Solo sandbox: the bot squad backs your push
      addBotPushVotes(activeSpeaker.id);
    }
  };

  // Solo sandbox: bots push YOU if you're still drafting at the halfway mark
  useEffect(() => {
    if (isMultiplayer || stage !== 'clue-turn' || !activeSpeaker.isUser) return;
    const turnKey = `${currentRound}-${activeSpeakerIdx}`;
    if (secondsLeft !== Math.floor(CLUE_TURN_SECONDS / 2) || botPushedTurnRef.current === turnKey) return;
    botPushedTurnRef.current = turnKey;
    addBotPushVotes(activeSpeaker.id);
  }, [isMultiplayer, stage, activeSpeaker.id, activeSpeaker.isUser, secondsLeft, currentRound, activeSpeakerIdx]);

  const crewWonMatch = imposterCaught && !imposterStolenWin;

  /* ======================================================================
   * VISUAL CHOREOGRAPHY LAYER
   * Presentation-only refs, state & effects. They react to the tribunal
   * state machine above and never feed back into it.
   * ====================================================================*/
  const fxRef = useRef<ImFxEngine | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dossierRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const fxTimersRef = useRef<number[]>([]);
  const prevClueCountRef = useRef<number>(0);

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

  // Stage-entry choreography.
  useEffect(() => {
    const fx = fxRef.current;
    if (stage === 'role-reveal') {
      scheduleFx(() => {
        const c = centerOf(dossierRef.current);
        const f = fxRef.current;
        if (!c || !f) return;
        if (userParticipant.isImposter) {
          f.flash(c.x, c.y, HAZARD_RGB, Math.max(c.w, c.h) * 0.7, 0.5);
          f.shockwave(c.x, c.y, HAZARD_RGB, Math.max(c.w, c.h) * 0.75, 0.7, 5);
          f.burst(c.x, c.y - c.h * 0.25, HAZARD_RGB, 36, 460);
          restartClass(dossierRef.current, 'im-shake');
        } else {
          f.flash(c.x, c.y, CLEAR_RGB, Math.max(c.w, c.h) * 0.6, 0.5);
          f.shockwave(c.x, c.y, CLEAR_RGB, Math.max(c.w, c.h) * 0.7, 0.7, 4);
          f.burst(c.x, c.y - c.h * 0.25, DETECT_RGB, 28, 400);
        }
      }, 720);
    } else if (stage === 'vote-reveal') {
      const counts: Record<string, number> = {};
      Object.values(votesByVoterId).forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      });
      participants.forEach((p, i) => {
        if (!counts[p.id]) return;
        scheduleFx(() => {
          const c = centerOf(document.querySelector(`[data-suspect="${p.id}"]`));
          if (c) fxRef.current?.burst(c.x + c.w / 2 - 14, c.y - c.h / 2 + 8, HAZARD_RGB, 10 + counts[p.id] * 4, 320);
        }, 140 + i * 120);
      });
      scheduleFx(() => {
        const c = centerOf(document.querySelector(`[data-suspect="${eliminatedPlayerId}"]`));
        if (!c || !fxRef.current) return;
        fxRef.current.flash(c.x, c.y, HAZARD_RGB, Math.max(c.w, c.h) * 0.6, 0.5);
        fxRef.current.shockwave(c.x, c.y, HAZARD_RGB, Math.max(c.w, c.h) * 0.7, 0.7, 4);
      }, 160 + participants.length * 120);
    } else if (stage === 'verdict-suspense') {
      scheduleFx(() => {
        const c = centerOf(spotlightRef.current);
        if (c) fxRef.current?.shockwave(c.x, c.y, HAZARD_RGB, c.w * 1.4, 0.9, 3);
      }, 120);
    } else if (stage === 'imposter-last-stand') {
      const c = centerOf(stageRef.current);
      if (fx && c) fx.flash(c.x, c.y * 0.8, HAZARD_RGB, c.w * 0.4, 0.45);
    } else if (stage === 'game-over') {
      const userWonMatch = userParticipant.isImposter ? !crewWonMatch : crewWonMatch;
      scheduleFx(() => {
        const f = fxRef.current;
        const c = centerOf(verdictRef.current);
        if (!f || !c) return;
        const rgb = crewWonMatch ? CLEAR_RGB : HAZARD_RGB;
        f.flash(c.x, c.y, rgb, Math.max(c.w, c.h) * 0.8, 0.5);
        f.shockwave(c.x, c.y, rgb, Math.max(c.w, c.h) * 0.9, 0.8, 6);
        f.burst(c.x, c.y, rgb, 50, 560);
        if (userWonMatch) {
          f.confetti(c.x, c.y, 170, crewWonMatch ? [CLEAR_RGB, DETECT_RGB, '255,255,255'] : [HAZARD_RGB, '255,255,255', '251,191,36']);
        }
        restartClass(verdictRef.current, 'im-shake');
      }, 520);
    }
  }, [stage]);

  // A freshly locked clue pops a small spark burst on its owner's row.
  useEffect(() => {
    const prev = prevClueCountRef.current;
    prevClueCountRef.current = clues.length;
    if (clues.length <= prev || clues.length === 0) return;
    const last = clues[clues.length - 1];
    scheduleFx(() => {
      const c = centerOf(document.querySelector(`[data-clue-owner="${last.participantId}"]`));
      if (c) {
        fxRef.current?.flash(c.x, c.y, DETECT_RGB, c.w * 0.35, 0.35);
        fxRef.current?.burst(c.x - c.w * 0.3, c.y, DETECT_RGB, 14, 300);
      }
    }, 40);
  }, [clues]);

  const userSideWon = userParticipant.isImposter ? !crewWonMatch : crewWonMatch;
  const verdictStamp =
    imposterCaught && imposterStolenWin
      ? 'IMPOSTER STOLE THE WIN'
      : crewWonMatch
      ? 'IMPOSTER APPREHENDED'
      : 'IMPOSTER EVADED CAPTURE';
  const sirenActive = stage === 'verdict-suspense';
  const userBallot = votesByVoterId[userParticipant.id];
  const userHasVoted = userBallot !== undefined;
  const ballotsCast = Object.keys(votesByVoterId).length;
  const skipVoteCount = Object.values(votesByVoterId).filter((v) => v === SKIP_VOTE).length;
  const skipAllowed = currentRound < MAX_CLUE_ROUNDS;
  const isExtraRound = currentRound > config.clueRounds;

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#05070b] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="pointer-events-none absolute w-[520px] h-[520px] rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #ef4444 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/40 flex items-center justify-center text-red-400 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
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
            <div className="h-full bg-red-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[calc(100dvh/var(--zoom,1))] max-md:min-h-0 max-md:h-[var(--app-h,calc(100dvh/var(--zoom,1)))] w-full bg-[#05070b] text-white flex flex-col relative overflow-x-hidden overflow-y-auto select-none">
      <style>{IM_CSS}</style>

      {/* ================= CLASSIFIED ROOM BACKDROP ================= */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(239,68,68,0.12), transparent 62%), radial-gradient(ellipse 55% 45% at 10% 100%, rgba(6,182,212,0.08), transparent 60%), radial-gradient(ellipse 50% 40% at 95% 85%, rgba(16,185,129,0.06), transparent 60%), #05070b',
          }}
        />
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="absolute -inset-[20%] opacity-[0.022] flex flex-wrap content-start gap-x-24 gap-y-16 rotate-[-18deg] font-athletic italic font-black text-6xl text-white"
        >
          {Array.from({ length: 60 }).map((_, i) => (
            <span key={i}>{i % 3 === 0 ? 'CLASSIFIED' : i % 3 === 1 ? 'TOP SECRET' : 'EYES ONLY'}</span>
          ))}
        </div>
        <div
          className="absolute inset-0 opacity-[0.22]"
          style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)' }}
        />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,0.8) 100%)' }} />
      </div>

      {/* Emergency siren strobe during the verdict */}
      {sirenActive && (
        <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
          <div className="im-siren-l absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 70% at 0% 50%, rgba(239,68,68,0.55), transparent 70%)' }} />
          <div className="im-siren-r absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 70% at 100% 50%, rgba(6,182,212,0.4), transparent 70%)' }} />
          <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 0 3px rgba(239,68,68,0.6), inset 0 0 140px rgba(239,68,68,0.35)' }} />
        </div>
      )}

      <ImFxCanvas engineRef={fxRef} />

      {/* FLOATING COLOR-MATCHED REACTION BADGES SPREAD OUT IN VERTICAL STRIPS ALONG LEFT & RIGHT MARGINS */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            style={{
              left: `${r.leftPercent}%`,
              top: `${r.topPercent}%`,
              animation: 'imposterReactionFloat 2.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
            className="absolute flex flex-col items-center"
          >
            <div className={`im-chamfer px-3.5 py-1.5 border-2 flex items-center gap-2 shadow-2xl ${r.badgeClass}`}>
              <span className="font-athletic italic text-base font-black text-white">{r.label}</span>
              <span className={`text-[10px] font-mono font-black uppercase tracking-widest px-1.5 py-0.5 bg-black/60 ${r.textColorClass}`}>
                {r.senderName}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10 flex-1 w-full max-w-[1400px] mx-auto flex flex-col gap-3 p-2.5 pb-16 sm:p-4 sm:pb-16 lg:p-5">
        {/* TOP BROADCAST HUD + HOLD TO PEEK BUTTON */}
        <header className="im-panel relative z-30 w-full flex items-center justify-between gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 shrink-0" style={{ clipPath: 'none' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                setShowForfeitModal(true);
              }}
              className="im-press im-chamfer min-h-[42px] min-w-[42px] w-[42px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white cursor-pointer"
              title="Exit to Hub"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0 leading-none">
              <div className="flex items-center gap-2 min-w-0">
                <Fingerprint className="hidden sm:block w-4 h-4 text-red-400 shrink-0" />
                <span className="font-athletic italic text-[15px] sm:text-xl font-black uppercase tracking-wide text-white whitespace-nowrap">
                  FOOTBALL <span className="text-red-500">IMPOSTER</span>
                </span>
                <span className="hidden sm:inline px-1.5 py-[2px] text-[9px] font-mono font-bold uppercase tracking-widest bg-red-500/15 text-red-400 border border-red-500/30">
                  {config.category.toUpperCase()}
                </span>
                {config.lobbyMode === 'sandbox' && (
                  <span className="hidden md:inline px-1.5 py-[2px] text-[9px] font-mono font-bold uppercase tracking-widest bg-[#ccff00]/15 text-[#ccff00] border border-[#ccff00]/30">
                    DEV SANDBOX
                  </span>
                )}
              </div>
              <p className="text-[9px] sm:text-[10px] font-mono text-neutral-400 mt-1 truncate tracking-wider">
                {isExtraRound ? `ROUND ${currentRound} • EXTRA` : `ROUND ${currentRound} OF ${config.clueRounds}`} • {participants.length} SQUAD MEMBERS
              </p>
            </div>
          </div>

          {/* Right Side: Top Header Timer + HOLD TO PEEK Button */}
          <div className="flex items-center gap-2 relative shrink-0">
            {isTimerActive && (
              <TimerDial
                seconds={secondsLeft}
                total={stage === 'clue-turn' ? CLUE_TURN_SECONDS : DISCUSSION_SECONDS}
                urgent={secondsLeft <= 10}
              />
            )}

            {/* HOLD TO PEEK BUTTON (Active only while held down) */}
            <button
              type="button"
              onMouseDown={() => setIsPeeking(true)}
              onMouseUp={() => setIsPeeking(false)}
              onMouseLeave={() => setIsPeeking(false)}
              onTouchStart={(e) => {
                e.preventDefault();
                setIsPeeking(true);
              }}
              onTouchEnd={() => setIsPeeking(false)}
              onTouchCancel={() => setIsPeeking(false)}
              className={`im-chamfer px-3 sm:px-4 py-2.5 border font-athletic italic text-sm font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer select-none ${
                isPeeking
                  ? 'bg-red-500 text-white border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.5)] scale-[0.97]'
                  : 'bg-white/[0.05] hover:bg-white/[0.09] text-neutral-200 border-white/15'
              }`}
            >
              {isPeeking ? <Eye className="w-4 h-4" /> : <Lock className="w-4 h-4 text-red-500" />}
              <span>
                HOLD<span className="hidden min-[400px]:inline"> TO PEEK</span>
              </span>
            </button>

            {/* HOLD-TO-PEEK SECRET POPOVER */}
            {isPeeking && (
              <div className="im-pop im-chamfer absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw/var(--zoom,1)-1.5rem))] bg-[#0a0d14] border border-white/20 p-4 shadow-[0_28px_70px_rgba(0,0,0,0.95)] z-50 pointer-events-none">
                <div
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: userParticipant.isImposter ? HAZARD : CLEAR }}
                />
                {userParticipant.isImposter ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="im-blink px-2 py-0.5 bg-red-500/20 border border-red-500/50 text-[10px] font-mono font-black uppercase tracking-widest text-red-400">
                        YOU ARE THE IMPOSTER
                      </span>
                      <ShieldAlert className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="bg-white/[0.03] border border-white/10 p-3">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-red-400 block mb-1">
                        {config.imposterClueEnabled ? 'VAGUE HINT:' : 'CLUE STATUS:'}
                      </span>
                      <p className="text-xs font-semibold text-neutral-200 leading-relaxed">
                        {config.imposterClueEnabled
                          ? secretPlayer.imposterVagueClue
                          : 'Clues disabled for Imposters in this lobby.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-mono font-black uppercase tracking-widest text-emerald-300">
                        CREW SECRET TARGET
                      </span>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </div>

                    <div className="flex items-center gap-3 bg-white/[0.04] border border-white/10 p-3">
                      <div className="w-12 h-12 bg-black/50 border border-white/15 flex items-center justify-center p-2 shrink-0">
                        <img src={secretPlayer.crestUrl} alt={secretPlayer.primaryClub} className="w-full h-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-athletic italic text-xl font-black uppercase tracking-wide text-white truncate leading-none">
                          {secretPlayer.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <img src={secretPlayer.flagUrl} alt={secretPlayer.nationality} className="w-4 h-3 object-cover rounded-sm" />
                          <span className="text-[10px] font-mono text-neutral-300 truncate">{secretPlayer.primaryClub}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-white/10 text-[#ccff00]">{secretPlayer.position}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* MAIN CONTENT STAGE */}
        <main ref={stageRef} className="relative w-full flex-1 flex flex-col justify-center py-1 sm:py-3">
          {/* PHASE 0: SEALED DOSSIER COUNTDOWN */}
          {stage === 'opening-countdown' && (
            <div className="im-panel im-rise max-w-lg w-full mx-auto p-8 sm:p-10 text-center flex flex-col items-center justify-center min-h-[380px] overflow-hidden">
              <div className="im-scan absolute inset-x-0 top-0 h-1/5 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(239,68,68,0.1), transparent)' }} />
              <div className="relative im-chamfer inline-flex items-center gap-2 px-3.5 py-1 bg-red-500/10 border border-red-500/40 mb-5">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span className="text-[10px] sm:text-[11px] font-mono font-black uppercase tracking-[0.25em] text-red-400">
                  ASSIGNING SECRET IDENTITIES
                </span>
              </div>

              <div className="relative h-36 flex items-center justify-center my-1">
                <span
                  key={openingCountdown}
                  className="im-count font-athletic italic text-[130px] sm:text-[160px] leading-none font-black text-white tabular-nums"
                  style={{ textShadow: '0 0 50px rgba(239,68,68,0.7)' }}
                >
                  {openingCountdown}
                </span>
              </div>

              <h2 className="relative font-athletic italic text-3xl sm:text-4xl font-black uppercase tracking-wide text-white leading-none">
                KEEP YOUR SCREEN PRIVATE
              </h2>
              <p className="relative text-[11px] font-mono uppercase tracking-[0.3em] text-neutral-400 mt-3">
                ONE IMPOSTER IS HIDING IN THE SQUAD...
              </p>
            </div>
          )}

          {/* PHASE 1: CLASSIFIED DOSSIER UNSEALING */}
          {stage === 'role-reveal' && (
            <div ref={dossierRef} className="relative max-w-xl w-full mx-auto">
              <div
                className="im-panel relative p-6 sm:p-8 text-center flex flex-col items-center overflow-hidden"
                style={{ ['--im-accent' as string]: userParticipant.isImposter ? 'rgba(239,68,68,0.9)' : 'rgba(16,185,129,0.9)' } as React.CSSProperties}
              >
                {userParticipant.isImposter && <div className="im-hazard absolute inset-x-0 top-0 h-2.5" />}

                <div className="im-unseal w-full flex flex-col items-center">
                  <span className="mb-3 px-2.5 py-1 bg-white/[0.05] border border-white/15 text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-neutral-300">
                    CATEGORY • <span className="text-white">{config.category}</span>
                  </span>
                  {userParticipant.isImposter ? (
                    <>
                      <div className="relative w-20 h-20 mb-4 flex items-center justify-center">
                        <div className="absolute inset-0 im-chamfer bg-red-500/15 border-2 border-red-500 shadow-[0_0_45px_rgba(239,68,68,0.45)]" />
                        <ShieldAlert className="relative w-10 h-10 text-red-500" />
                      </div>

                      <span className="im-chamfer px-3.5 py-1 bg-red-500/15 border border-red-500/45 text-[10px] sm:text-[11px] font-mono font-black uppercase tracking-[0.22em] text-red-400 mb-2">
                        CLASSIFIED ROLE REVEAL
                      </span>

                      <h1
                        className="font-athletic italic text-5xl sm:text-6xl font-black uppercase tracking-wide text-red-500 leading-[0.9]"
                        style={{ textShadow: '0 0 34px rgba(239,68,68,0.55)' }}
                      >
                        YOU ARE THE IMPOSTER
                      </h1>

                      <div className="im-blink mt-3 inline-flex items-center gap-2 px-3 py-1 bg-red-500 text-black font-mono text-[10px] sm:text-[11px] font-black tracking-[0.25em]">
                        <Siren className="w-3.5 h-3.5" />
                        STAY HIDDEN • BLUFF YOUR SQUAD
                      </div>

                      <p className="text-sm text-neutral-300 mt-3 max-w-md">
                        Every other squad member sees the secret footballer. Blend in with your clue and survive the tribunal vote.
                      </p>

                      <div className="im-chamfer w-full bg-red-500/10 border border-red-500/35 p-5 my-6 text-left">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Sparkles className="w-4 h-4 text-red-400" />
                          <span className="text-[11px] font-mono font-black uppercase tracking-widest text-red-400">
                            {config.imposterClueEnabled ? 'SINGLE VAGUE CLUE' : 'IMPOSTER CLUES DISABLED'}
                          </span>
                        </div>
                        <p className="text-base font-bold text-white leading-relaxed">
                          {config.imposterClueEnabled
                            ? secretPlayer.imposterVagueClue
                            : 'No clue provided. Listen closely to the Crew clues to bluff your way through!'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="im-chamfer inline-flex items-center gap-2 px-3.5 py-1 bg-emerald-500/15 border border-emerald-400/40 text-[10px] sm:text-[11px] font-mono font-black uppercase tracking-[0.22em] text-emerald-300 mb-1">
                        <ShieldCheck className="w-4 h-4" />
                        YOU ARE IN THE CREW
                      </div>
                      <span className="font-mono text-[9px] tracking-[0.35em] text-cyan-400/80 mb-2">CLEARANCE GRANTED • DETECTIVE</span>

                      <h1 className="font-athletic italic text-3xl sm:text-4xl font-black uppercase tracking-wide text-white mb-4 leading-none">
                        SECRET SQUAD FOOTBALLER
                      </h1>

                      <div className="im-chamfer relative w-full bg-gradient-to-b from-[#0f1a1a] to-[#070a0e] border border-emerald-400/30 p-6 mb-5 flex flex-col items-center overflow-hidden">
                        <div className="im-scan absolute inset-x-0 top-0 h-1/4 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(6,182,212,0.12), transparent)' }} />
                        <div className="relative w-24 h-24 bg-white/[0.05] border border-white/15 flex items-center justify-center p-4 mb-4 shadow-lg">
                          <img
                            src={secretPlayer.crestUrl}
                            alt={secretPlayer.primaryClub}
                            className="w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)]"
                          />
                          {['top-0 left-0 border-t-2 border-l-2', 'top-0 right-0 border-t-2 border-r-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'].map((c) => (
                            <span key={c} className={`absolute w-3 h-3 border-cyan-400 ${c}`} />
                          ))}
                        </div>

                        <h2 className="relative font-athletic italic text-4xl sm:text-5xl font-black uppercase tracking-wide text-white leading-none">
                          {secretPlayer.name}
                        </h2>

                        <div className="relative flex flex-wrap items-center justify-center gap-2 mt-3">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] border border-white/10">
                            <img src={secretPlayer.flagUrl} alt={secretPlayer.nationality} className="w-4 h-3 object-cover rounded-sm" />
                            <span className="text-xs font-mono font-bold uppercase text-neutral-200">{secretPlayer.nationality}</span>
                          </div>

                          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.06] border border-white/10">
                            <img src={secretPlayer.crestUrl} alt={secretPlayer.primaryClub} className="w-4 h-4 object-contain" />
                            <span className="text-xs font-mono font-bold uppercase text-neutral-200">{secretPlayer.primaryClub}</span>
                          </div>

                          <span className="px-3 py-1.5 bg-[#ccff00]/15 border border-[#ccff00]/35 text-xs font-mono font-black text-[#ccff00]">
                            {secretPlayer.position}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-neutral-400 mb-5 max-w-md">
                        Give a subtle clue that proves to the Crew you know the player without giving the name away to the Imposter!
                      </p>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleStartCluePhase}
                    className={`im-press im-sheen im-chamfer w-full py-4 font-athletic italic text-lg font-black uppercase tracking-widest cursor-pointer hover:brightness-110 ${
                      userParticipant.isImposter
                        ? 'bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] text-white shadow-[0_10px_28px_rgba(239,68,68,0.35)]'
                        : 'bg-gradient-to-b from-[#34d399] via-[#10b981] to-[#047857] text-black shadow-[0_10px_28px_rgba(16,185,129,0.35)]'
                    }`}
                  >
                    ENTER CLUE PHASE ({roleRevealSecondsLeft}s)
                  </button>
                </div>

                {/* Folder flap that swings open to unseal the dossier */}
                <div
                  className="im-flap absolute inset-x-0 top-0 h-[55%] z-20 flex flex-col items-center justify-end pb-6 pointer-events-none"
                  style={{ background: 'linear-gradient(180deg, #2a2216, #17130c)', borderBottom: '2px dashed rgba(251,191,36,0.35)' }}
                >
                  <span className="font-athletic italic font-black text-3xl tracking-[0.2em] text-[#fbbf24]/70">DOSSIER</span>
                  <span className="font-mono text-[9px] tracking-[0.4em] text-[#fbbf24]/50 mt-1">SEALED BY ORDER OF THE TRIBUNAL</span>
                </div>
              </div>

              {/* Confidential stamp */}
              <div
                className="im-stamp absolute -top-3 -right-1 sm:-right-4 z-30 px-3 py-1 border-[3px] font-athletic italic font-black text-lg sm:text-xl tracking-widest pointer-events-none"
                style={{
                  animationDelay: '0.75s',
                  color: userParticipant.isImposter ? HAZARD : CLEAR,
                  borderColor: userParticipant.isImposter ? HAZARD : CLEAR,
                  background: 'rgba(5,7,11,0.9)',
                }}
              >
                {userParticipant.isImposter ? 'TOP SECRET' : 'CLEARED'}
              </div>
            </div>
          )}

          {/* PHASE 2: TURN-BY-TURN CLUES & DEBATE TERMINAL */}
          {(stage === 'clue-turn' || stage === 'discussion') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 lg:gap-4 items-stretch">
              {/* ROUNDTABLE CLUE FEED */}
              <div className="im-panel order-2 lg:order-none lg:col-start-1 lg:col-span-5 lg:row-start-1 lg:row-span-3 p-3 sm:p-5 flex flex-col gap-2 sm:gap-3" style={{ ['--im-accent' as string]: 'rgba(6,182,212,0.7)' } as React.CSSProperties}>
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-cyan-400" />
                    <span className="font-athletic italic text-lg font-black uppercase tracking-wide text-white">SQUAD CLUE FEED</span>
                  </div>
                  <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-300">
                    ROUND {currentRound}
                  </span>
                </div>

                <div className="space-y-2 sm:space-y-3 my-auto">
                  {participants.map((p, idx) => {
                    const isSpeaking = stage === 'clue-turn' && idx === activeSpeakerIdx;
                    const playerRoundClue = clues.find((c) => c.participantId === p.id && c.round === currentRound);
                    const prevRoundClue =
                      currentRound > 1 ? clues.find((c) => c.participantId === p.id && c.round === currentRound - 1) : undefined;

                    return (
                      <div key={p.id} data-clue-owner={p.id} className="flex items-start gap-2.5 sm:gap-3">
                        <div className="relative shrink-0 mt-0.5">
                          <SuspectAvatar
                            p={p}
                            size={isPhone ? 34 : 48}
                            className={`transition-all duration-300 ${isSpeaking ? 'scale-105' : ''}`}
                            style={isSpeaking ? { boxShadow: '0 0 0 2px #06b6d4, 0 0 22px rgba(6,182,212,0.55)' } : undefined}
                          />
                          {isSpeaking && (
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 bg-cyan-400 text-black font-mono text-[7px] font-black tracking-wider">
                              MIC
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                            <span className={`font-athletic italic text-[15px] sm:text-base font-black uppercase tracking-wide truncate leading-none ${p.avatarText}`}>
                              {p.name}
                            </span>
                            <span className="max-sm:hidden text-[8px] font-mono uppercase tracking-widest text-neutral-500 truncate">{p.title}</span>
                            {isSpeaking && (
                              <span className="px-1.5 py-0.5 bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 text-[8px] font-mono font-black uppercase tracking-widest shrink-0">
                                {isPhone ? 'LIVE' : 'SPEAKING NOW'}
                              </span>
                            )}
                          </div>

                          {playerRoundClue ? (
                            <div
                              key={playerRoundClue.id}
                              className="im-pop relative im-chamfer bg-gradient-to-r from-cyan-500/[0.12] to-white/[0.04] border border-cyan-400/30 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 shadow-[0_0_18px_rgba(6,182,212,0.12)]"
                            >
                              <p className="font-sans text-sm sm:text-base font-extrabold text-white leading-snug">
                                "{playerRoundClue.text}"
                              </p>
                              {prevRoundClue && (
                                <p className="text-[11px] font-mono text-neutral-400 mt-1">R{currentRound - 1}: "{prevRoundClue.text}"</p>
                              )}
                            </div>
                          ) : isSpeaking ? (
                            <div className="im-chamfer bg-cyan-500/[0.08] border border-cyan-400/30 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 flex items-center gap-2">
                              <span className="flex gap-1">
                                <span className="im-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                <span className="im-dot w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animationDelay: '0.15s' }} />
                                <span className="im-dot w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animationDelay: '0.3s' }} />
                              </span>
                              <p className="text-xs font-mono font-bold text-cyan-300">
                                {p.isUser ? 'Waiting for you to lock in your clue...' : 'Crafting a tactical clue...'}
                              </p>
                            </div>
                          ) : (
                            <div className="im-chamfer max-sm:!bg-transparent max-sm:!border-0 max-sm:p-0 bg-white/[0.02] border border-white/[0.07] px-3.5 py-2.5">
                              <p className="text-[11px] sm:text-xs font-mono text-neutral-500">Waiting for turn...</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ACTIVE TERMINAL: CLUE INPUT OR DEBATE CONTROLS */}
              <div
                ref={terminalRef}
                className="im-panel order-1 lg:order-none lg:col-start-6 lg:col-span-7 lg:row-start-1 p-3 sm:p-5"
                style={{ ['--im-accent' as string]: stage === 'clue-turn' ? 'rgba(6,182,212,0.8)' : 'rgba(239,68,68,0.8)' } as React.CSSProperties}
              >
                {stage === 'clue-turn' ? (
                  <div className="space-y-3.5">
                    <div>
                      <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-cyan-400 block">
                        ROUND {currentRound} CLUE SUBMISSION
                      </span>
                      <h2 className="font-athletic italic text-3xl sm:text-4xl font-black uppercase tracking-wide text-white mt-0.5 leading-none">
                        {activeSpeaker.isUser ? (
                          'YOUR TURN TO DROP A CLUE'
                        ) : (
                          <>
                            <span className={activeSpeaker.avatarText}>{activeSpeaker.name}</span> IS ON THE MIC
                          </>
                        )}
                      </h2>
                    </div>

                    {activeSpeaker.isUser ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (clueInput.trim()) {
                            handleSubmitClue(clueInput);
                          }
                        }}
                        className="flex flex-col sm:flex-row gap-2.5"
                      >
                        <div className="relative flex-1 group">
                          <div
                            className="absolute -inset-[1px] im-chamfer opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
                            style={{ background: 'linear-gradient(90deg, rgba(6,182,212,0.8), rgba(16,185,129,0.6))' }}
                          />
                          <div className="relative im-chamfer bg-[#05070b] h-full">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-cyan-400 text-sm pointer-events-none">›</span>
                            <input
                              ref={clueInputRef}
                              type="text"
                              maxLength={48}
                              value={clueInput}
                              onChange={(e) => setClueInput(e.target.value)}
                              placeholder="Type a short, subtle football clue..."
                              autoComplete="off"
                              spellCheck={false}
                              className="w-full h-[52px] pl-8 pr-16 bg-transparent border border-white/10 focus:outline-none text-base font-semibold text-white placeholder:text-neutral-500 caret-cyan-400"
                            />
                            <span
                              className={`absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold tabular-nums pointer-events-none ${
                                clueInput.length >= 44 ? 'text-red-400' : clueInput.length >= 36 ? 'text-amber-300' : 'text-neutral-500'
                              }`}
                            >
                              {clueInput.length}/48
                            </span>
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={!clueInput.trim()}
                          className="im-press im-sheen im-chamfer h-[52px] px-7 bg-gradient-to-b from-[#22d3ee] via-[#06b6d4] to-[#0e7490] disabled:opacity-40 disabled:grayscale disabled:pointer-events-none text-black font-athletic italic text-lg font-black uppercase tracking-widest shadow-[0_8px_24px_rgba(6,182,212,0.3)] cursor-pointer shrink-0 hover:brightness-110"
                        >
                          LOCK CLUE
                        </button>
                      </form>
                    ) : (
                      <div className="im-chamfer px-4 py-3.5 bg-black/50 border border-white/10 flex items-center justify-between gap-3">
                        <span className="text-sm font-mono text-neutral-300 flex items-center gap-2 min-w-0">
                          <span className="flex gap-1 shrink-0">
                            <span className="im-dot w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            <span className="im-dot w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animationDelay: '0.15s' }} />
                            <span className="im-dot w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animationDelay: '0.3s' }} />
                          </span>
                          <span className="truncate">
                            <span className={`font-bold ${activeSpeaker.avatarText}`}>{activeSpeaker.name}</span> is locking in their clue...
                          </span>
                        </span>
                        <span className="im-soft-pulse text-[10px] font-mono font-black uppercase tracking-widest text-red-400 shrink-0">
                          LIVE TURN
                        </span>
                      </div>
                    )}

                    {/* PUSH FOR TIME: if every other player pushes, the speaker loses 10s */}
                    {!activeSpeaker.isUser ? (
                      <div className="relative flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={handlePushForTime}
                          disabled={pushVotes.includes(userParticipant.id) || secondsLeft <= PUSH_PENALTY_SECONDS}
                          className="im-press im-chamfer flex-1 h-11 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/50 disabled:opacity-50 disabled:cursor-not-allowed text-amber-300 font-athletic italic text-base font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Clock className="w-4 h-4" />
                          {secondsLeft <= PUSH_PENALTY_SECONDS
                            ? 'TOO LATE TO PUSH'
                            : pushVotes.includes(userParticipant.id)
                            ? `PUSHED • WAITING SQUAD (${pushVotes.length}/${pushVotersNeeded})`
                            : `PUSH FOR TIME (-${PUSH_PENALTY_SECONDS}s) • ${pushVotes.length}/${pushVotersNeeded}`}
                        </button>
                        {pushImpactKey > 0 && pushedSpeakerId === activeSpeaker.id && (
                          <span
                            key={pushImpactKey}
                            className="im-stamp absolute -top-3 right-2 px-2 py-0.5 bg-amber-400 text-black font-mono text-[10px] font-black tracking-widest pointer-events-none"
                          >
                            -{PUSH_PENALTY_SECONDS}s PUSHED!
                          </span>
                        )}
                      </div>
                    ) : pushVotes.length > 0 || pushedSpeakerId === activeSpeaker.id ? (
                      <div className="im-chamfer px-3 py-2 bg-amber-500/10 border border-amber-400/40 flex items-center justify-between gap-2 font-mono text-[11px] font-bold text-amber-300">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          SQUAD IS PUSHING YOU FOR TIME
                        </span>
                        <span>{pushVotes.length}/{pushVotersNeeded}</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  /* 30-SECOND DISCUSSION INTERVAL HEADER WITH VOTING SYSTEM */
                  <div className="flex flex-col gap-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="im-chamfer inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 border border-red-500/35 mb-1.5">
                          <Flame className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                            30s DEBATE & REACTION INTERVAL
                          </span>
                        </div>
                        <h2 className="font-athletic italic text-3xl font-black uppercase tracking-wide text-white leading-none">
                          DEBATE THE CLUES ({secondsLeft}s LEFT)
                        </h2>
                        <p className="text-xs text-neutral-400 mt-1">
                          Question suspicious clues in locker room chat or vote to advance early!
                        </p>
                      </div>

                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={handleUserVoteSkipDiscussion}
                          disabled={discussionSkipVotes.includes(userParticipant.id)}
                          className={`im-press im-chamfer px-5 py-3.5 font-athletic italic text-base font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer ${
                            discussionSkipVotes.includes(userParticipant.id)
                              ? 'bg-emerald-600/80 border border-emerald-400/50 text-white cursor-default'
                              : 'im-sheen bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] text-white shadow-[0_8px_24px_rgba(239,68,68,0.3)] hover:brightness-110'
                          }`}
                        >
                          <span>
                            {discussionSkipVotes.includes(userParticipant.id)
                              ? discussionSkipVotes.length === participants.length
                                ? 'ALL READY • ADVANCING...'
                                : 'VOTED READY • WAITING SQUAD'
                              : currentRound === 1 && config.clueRounds === 2
                              ? 'VOTE TO PROCEED TO DECISION'
                              : 'VOTE TO PROCEED TO VOTE'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </button>

                        {/* VOTE COUNT STAMP */}
                        <div
                          key={discussionSkipVotes.length}
                          className="im-vote-stamp absolute -top-3 -right-3 min-w-[38px] h-8 px-1 border-2 border-white bg-red-500 text-white flex items-center justify-center font-athletic text-sm font-black shadow-[0_0_16px_rgba(239,68,68,0.6)] rotate-[-8deg]"
                        >
                          {discussionSkipVotes.length}/{participants.length}
                        </div>
                      </div>
                    </div>

                    {/* VOTED READY AVATAR PILLS ROW */}
                    {discussionSkipVotes.length > 0 && (
                      <div className="pt-2 border-t border-white/[0.07] flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono uppercase text-neutral-400">
                          VOTED TO ADVANCE ({discussionSkipVotes.length}/{participants.length}):
                        </span>
                        {discussionSkipVotes.map((voterId) => {
                          const p = participants.find((part) => part.id === voterId);
                          if (!p) return null;
                          return (
                            <span key={p.id} className={`im-pop px-2 py-0.5 text-[10px] font-athletic italic font-black border ${p.reactionBadgeClass}`}>
                              {p.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Phone: chat button with unread count + sheet backdrop */}
              {(() => {
                const userMessages = chatMessages.filter((m) => !m.isSystem).length;
                const unread = mobileChatOpen ? 0 : Math.max(0, userMessages - chatSeenCount);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick(700);
                        setChatSeenCount(userMessages);
                        setMobileChatOpen(true);
                      }}
                      aria-label={unread ? `Open chat, ${unread} unread` : 'Open chat'}
                      className={`md:hidden im-press fixed right-4 bottom-[calc(var(--kb-offset,0px)+max(1rem,env(safe-area-inset-bottom)))] z-40 w-14 h-14 rounded-full bg-cyan-400 text-black flex items-center justify-center shadow-[0_10px_30px_rgba(6,182,212,0.45)] cursor-pointer transition-opacity ${
                        mobileChatOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
                      }`}
                    >
                      <MessageSquare className="w-6 h-6" />
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white font-mono text-[10px] font-black flex items-center justify-center">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </button>
                    <div
                      onClick={() => {
                        setChatSeenCount(userMessages);
                        setMobileChatOpen(false);
                      }}
                      className={`md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
                        mobileChatOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    />
                  </>
                );
              })()}

              {/* GLOBAL LOCKER ROOM CHAT (a bottom sheet on phones) */}
              <div
                className={`im-panel order-3 lg:order-none lg:col-start-6 lg:col-span-7 lg:row-start-2 p-4 sm:p-5 flex flex-col max-md:!fixed max-md:inset-x-0 max-md:bottom-[var(--kb-offset,0px)] max-md:z-50 max-md:!bg-[#080a0f] max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:transition-transform max-md:duration-300 max-md:ease-out ${
                  mobileChatOpen ? 'max-md:translate-y-0' : 'max-md:translate-y-[110%]'
                }`}
                style={{ ['--im-accent' as string]: 'rgba(6,182,212,0.6)' } as React.CSSProperties}
              >
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-cyan-400" />
                    <span className="font-athletic italic text-lg font-black uppercase tracking-wide text-white">
                      <span className="max-md:hidden">GLOBAL </span>LOCKER ROOM CHAT
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                    <span className="max-md:hidden">LIVE FEED</span>
                    <button
                      type="button"
                      onClick={() => {
                        setChatSeenCount(chatMessages.filter((m) => !m.isSystem).length);
                        setMobileChatOpen(false);
                      }}
                      aria-label="Close chat"
                      className="md:hidden im-press ml-2 w-9 h-9 flex items-center justify-center border border-white/15 bg-white/[0.04] text-neutral-300 cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </span>
                </div>

                <div ref={chatScrollRef} className="space-y-2 h-[calc(var(--app-h,calc(100dvh/var(--zoom,1)))*0.42)] kb:h-[calc(var(--app-h,calc(100dvh/var(--zoom,1)))*0.3)] sm:h-[240px] overflow-y-auto pr-1.5">
                  {chatMessages.map((m) =>
                    m.isSystem ? (
                      <div key={m.id} className="im-pop flex items-center gap-3 py-1">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-red-500/40" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-red-400/80">{m.text}</span>
                        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-red-500/40" />
                      </div>
                    ) : (
                      <div key={m.id} className="im-pop im-chamfer px-3.5 py-2 text-sm bg-black/50 border border-white/[0.07] text-neutral-100">
                        <span className={`font-athletic italic font-black uppercase mr-2 ${m.senderColorClass || 'text-cyan-400'}`}>
                          {m.senderName}:
                        </span>
                        <span className="text-neutral-100">{renderTextWithPlayerColors(m.text)}</span>
                      </div>
                    )
                  )}
                </div>

                {/* Phone: quick reactions live in the chat sheet */}
                <div className="md:hidden flex flex-wrap gap-1.5 mt-2.5">
                  {REACTION_PILLS.map((pill) => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => triggerReaction(pill, userParticipant)}
                      className="im-press im-chamfer px-3 py-2 bg-white/[0.06] border border-white/15 text-xs font-athletic italic font-black text-white cursor-pointer"
                    >
                      {pill}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendChat} className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-white/[0.07]">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Send a message to the locker room..."
                    className="im-chamfer flex-1 min-w-0 px-4 py-3 bg-black/60 border border-white/10 focus:border-cyan-400 focus:outline-none text-base sm:text-sm text-white placeholder:text-neutral-500"
                  />
                  <button
                    type="submit"
                    className="im-press im-chamfer px-4 py-3 bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-white text-sm font-athletic italic font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    SEND
                  </button>
                </form>
              </div>

              {/* QUICK-ACTION REACTION PILLS BAR */}
              <div className="im-panel order-4 lg:order-none lg:col-start-6 lg:col-span-7 lg:row-start-3 px-4 py-3 max-md:hidden flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400">QUICK REACTIONS:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {REACTION_PILLS.map((pill) => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => triggerReaction(pill, userParticipant)}
                      className="im-press im-chamfer px-3 py-2 bg-white/[0.06] hover:bg-cyan-400/15 border border-white/15 hover:border-cyan-400/50 text-xs font-athletic italic font-black text-white cursor-pointer"
                    >
                      {pill}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PHASE 3: INTERMISSION AFTER ROUND 1 (SQUAD DECISION VOTING) */}
          {stage === 'intermission' && (
            <div className="im-panel im-rise max-w-2xl w-full mx-auto p-6 sm:p-8 text-center">
              <div className="relative w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <div className="absolute inset-0 im-chamfer bg-red-500/10 border border-red-500/40" />
                <Gavel className="relative w-8 h-8 text-red-500" />
              </div>

              <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-red-400">
                ROUND 1 INTERMISSION • SQUAD VOTE
              </span>
              <h2 className="font-athletic italic text-3xl sm:text-4xl font-black uppercase tracking-wide text-white mt-1 leading-none">
                VOTE OUT IMPOSTER OR PLAY ROUND 2?
              </h2>
              <p className="text-sm text-neutral-400 mt-2">
                Does the squad already have enough evidence to convict, or do you want a second round of clues first?
              </p>
              <div className="flex items-center justify-center gap-3 mt-3 mb-6">
                {!intermissionWinner && (
                  <TimerDial seconds={intermissionSecondsLeft} total={INTERMISSION_SECONDS} urgent={intermissionSecondsLeft <= 5} />
                )}
                <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">
                  {intermissionWinner ? 'SQUAD DECISION LOCKED' : 'NO VOTE = PROCEED TO ROUND 2'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-left mb-6">
                {/* OPTION 1: VOTE OUT IMPOSTER NOW */}
                {(() => {
                  const votersForVoteOut = Object.entries(intermissionVotes)
                    .filter(([, v]) => v === 'vote-out')
                    .map(([voterId]) => participants.find((p) => p.id === voterId))
                    .filter(Boolean) as ImposterParticipant[];
                  const voteCount = votersForVoteOut.length;
                  const isSelected = intermissionVotes[userParticipant.id] === 'vote-out';
                  const isWinner = intermissionWinner === 'vote-out';

                  return (
                    <button
                      key="vote-out"
                      type="button"
                      disabled={!!intermissionWinner}
                      onClick={() => handleCastIntermissionVote('vote-out')}
                      className={`im-press relative p-5 border transition-colors flex flex-col justify-between gap-4 cursor-pointer text-left ${
                        isWinner
                          ? 'bg-red-500/20 border-red-500 shadow-[0_0_35px_rgba(239,68,68,0.4)]'
                          : isSelected
                          ? 'bg-red-500/10 border-red-500'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      <VoteStamp count={voteCount} tone="hazard" />

                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">OPTION 1</span>
                          {isSelected && (
                            <span className="px-2 py-0.5 bg-red-500/25 text-red-300 text-[9px] font-mono font-black uppercase tracking-wider border border-red-500/40">
                              YOUR VOTE
                            </span>
                          )}
                          {isWinner && (
                            <span className="im-stamp px-2 py-0.5 bg-red-500 text-white text-[9px] font-mono font-black uppercase tracking-wider">
                              DECISION WON
                            </span>
                          )}
                        </div>
                        <h3 className="font-athletic italic text-2xl font-black uppercase text-white leading-none">VOTE OUT IMPOSTER NOW</h3>
                        <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                          Skip round 2 clues and proceed straight to the Tribunal voting screen to convict the imposter.
                        </p>
                      </div>

                      {/* VOTED BY AVATAR PILLS ROW */}
                      {votersForVoteOut.length > 0 && (
                        <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono uppercase text-neutral-400 mr-1">VOTED BY:</span>
                          {votersForVoteOut.map((voter) => (
                            <span key={voter.id} className={`im-pop px-2 py-0.5 text-[10px] font-athletic italic font-black border ${voter.reactionBadgeClass}`}>
                              {voter.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })()}

                {/* OPTION 2: PROCEED TO ROUND 2 CLUES */}
                {(() => {
                  const votersForContinue = Object.entries(intermissionVotes)
                    .filter(([, v]) => v === 'continue')
                    .map(([voterId]) => participants.find((p) => p.id === voterId))
                    .filter(Boolean) as ImposterParticipant[];
                  const voteCount = votersForContinue.length;
                  const isSelected = intermissionVotes[userParticipant.id] === 'continue';
                  const isWinner = intermissionWinner === 'continue';

                  return (
                    <button
                      key="continue"
                      type="button"
                      disabled={!!intermissionWinner}
                      onClick={() => handleCastIntermissionVote('continue')}
                      className={`im-press relative p-5 border transition-colors flex flex-col justify-between gap-4 cursor-pointer text-left ${
                        isWinner
                          ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_35px_rgba(6,182,212,0.4)]'
                          : isSelected
                          ? 'bg-cyan-500/10 border-cyan-400'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      <VoteStamp count={voteCount} tone="detect" />

                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">OPTION 2</span>
                          {isSelected && (
                            <span className="px-2 py-0.5 bg-cyan-400/25 text-cyan-300 text-[9px] font-mono font-black uppercase tracking-wider border border-cyan-400/40">
                              YOUR VOTE
                            </span>
                          )}
                          {isWinner && (
                            <span className="im-stamp px-2 py-0.5 bg-cyan-500 text-black text-[9px] font-mono font-black uppercase tracking-wider">
                              DECISION WON
                            </span>
                          )}
                        </div>
                        <h3 className="font-athletic italic text-2xl font-black uppercase text-white leading-none">PROCEED TO ROUND 2</h3>
                        <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                          Need more information. Hear one additional tactical clue from each player before voting.
                        </p>
                      </div>

                      {/* VOTED BY AVATAR PILLS ROW */}
                      {votersForContinue.length > 0 && (
                        <div className="pt-2 border-t border-white/10 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono uppercase text-neutral-400 mr-1">VOTED BY:</span>
                          {votersForContinue.map((voter) => (
                            <span key={voter.id} className={`im-pop px-2 py-0.5 text-[10px] font-athletic italic font-black border ${voter.reactionBadgeClass}`}>
                              {voter.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })()}
              </div>

              {intermissionWinner && (
                <div className="flex items-center justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (intermissionWinner === 'vote-out') {
                        setStage('voting');
                      } else {
                        handleProceedToRound2();
                      }
                    }}
                    className="im-press im-chamfer im-rise px-8 py-3.5 bg-white text-black font-athletic italic text-lg font-black uppercase tracking-widest hover:bg-neutral-200 shadow-[0_8px_24px_rgba(255,255,255,0.2)] flex items-center gap-2 cursor-pointer"
                  >
                    <span>{intermissionWinner === 'vote-out' ? 'PROCEED TO TRIBUNAL NOW' : 'PROCEED TO ROUND 2 NOW'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PHASE 4: THE TRIBUNAL — VOTING & VOTE REVEAL */}
          {(stage === 'voting' || stage === 'vote-reveal') && (
            <div className="im-panel im-rise p-4 sm:p-6" style={{ ['--im-accent' as string]: 'rgba(239,68,68,0.85)' } as React.CSSProperties}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.07] pb-4 mb-6">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-red-400">
                    {stage === 'voting'
                      ? `TRIBUNAL VOTING PHASE • ${VOTE_SECONDS}s BALLOT${isExtraRound ? ' • EXTRA ROUND' : ''}`
                      : `ALL VOTES LOCKED • TRIBUNAL TALLY${skipVoteCount > 0 ? ` • ${skipVoteCount} SKIPPED` : ''}`}
                  </span>
                  <h2 className="font-athletic italic text-3xl sm:text-4xl font-black uppercase tracking-wide text-white leading-none mt-0.5">
                    {stage === 'voting' ? (
                      'SELECT A PLAYER TO EJECT'
                    ) : (
                      <>
                        <span className={eliminatedParticipant?.avatarText}>{eliminatedParticipant?.name}</span> RECEIVED THE MOST VOTES
                      </>
                    )}
                  </h2>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {stage === 'voting' && (
                    <TimerDial seconds={voteSecondsLeft} total={VOTE_SECONDS} urgent={voteSecondsLeft <= 10} />
                  )}
                  {stage === 'voting' ? (
                    <>
                      <button
                        type="button"
                        disabled={userHasVoted || !skipAllowed}
                        onClick={() => handleLockVote(SKIP_VOTE)}
                        title={skipAllowed ? 'Majority skip = another clue round' : 'Final round: skipping is disabled'}
                        className="im-press im-chamfer px-4 py-3.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 disabled:opacity-40 disabled:pointer-events-none text-neutral-200 font-athletic italic text-lg font-black uppercase tracking-wider cursor-pointer"
                      >
                        {skipAllowed ? 'SKIP VOTE' : 'NO SKIPS'}
                      </button>
                      <button
                        type="button"
                        disabled={!selectedVoteTargetId || userHasVoted}
                        onClick={() => handleLockVote()}
                        className="im-press im-sheen im-chamfer px-6 py-3.5 bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] disabled:opacity-40 disabled:grayscale disabled:pointer-events-none text-white font-athletic italic text-lg font-black uppercase tracking-widest shadow-[0_10px_28px_rgba(239,68,68,0.35)] cursor-pointer flex items-center gap-2 hover:brightness-110"
                      >
                        <Gavel className="w-4 h-4" />
                        LOCK IN VOTE
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleTriggerVerdictSuspense}
                      className="im-press im-sheen im-chamfer relative overflow-hidden px-6 py-3.5 bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] text-white font-athletic italic text-lg font-black uppercase tracking-widest flex items-center gap-2 shadow-[0_0_30px_rgba(239,68,68,0.45)] cursor-pointer hover:brightness-110"
                    >
                      <span
                        className="absolute left-0 bottom-0 h-[3px] bg-white/80 transition-[width] duration-1000 ease-linear"
                        style={{ width: `${(revealSecondsLeft / REVEAL_SECONDS) * 100}%` }}
                      />
                      <span>REVEAL TRUE IDENTITY ({revealSecondsLeft}s)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {stage === 'voting' && (
                <div className="im-chamfer -mt-3 mb-5 px-3 py-2 bg-black/50 border border-white/[0.07] flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tracking-wider">
                  <span className={userHasVoted ? 'text-emerald-300 font-black' : 'text-neutral-400'}>
                    {userHasVoted
                      ? userBallot === SKIP_VOTE
                        ? 'YOUR BALLOT: SKIP • LOCKED'
                        : `YOUR BALLOT: ${participants.find((x) => x.id === userBallot)?.name ?? '-'} • LOCKED`
                      : 'PICK A SUSPECT OR SKIP • NO BALLOT = AUTO-SKIP'}
                  </span>
                  <span className="text-neutral-500">
                    BALLOTS {ballotsCast}/{participants.length} • MAJORITY SKIP ({Math.floor(participants.length / 2) + 1}+) = {skipAllowed ? 'NEW CLUE ROUND' : 'IMPOSTER WALKS'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
                {participants.map((p, idx) => {
                  const playerClues = clues.filter((c) => c.participantId === p.id);
                  const isSelected = selectedVoteTargetId === p.id;
                  const votersForThisPlayer = Object.entries(votesByVoterId)
                    .filter(([, targetId]) => targetId === p.id)
                    .map(([voterId]) => participants.find((part) => part.id === voterId))
                    .filter(Boolean) as ImposterParticipant[];

                  const voteCount = votersForThisPlayer.length;
                  const isEliminated = stage === 'vote-reveal' && eliminatedPlayerId === p.id;
                  const dimmed = stage === 'vote-reveal' && !isEliminated;

                  return (
                    <button
                      key={p.id}
                      data-suspect={p.id}
                      type="button"
                      disabled={stage !== 'voting' || userHasVoted}
                      onClick={() => setSelectedVoteTargetId(p.id)}
                      className={`im-press im-rise relative p-4 sm:p-5 border text-left flex flex-col justify-between gap-3.5 cursor-pointer transition-[background-color,border-color,opacity,box-shadow] duration-300 ${
                        isEliminated
                          ? 'bg-red-500/15 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.45)]'
                          : isSelected
                          ? 'bg-red-500/10 border-red-500 shadow-[0_0_24px_rgba(239,68,68,0.2)]'
                          : 'bg-white/[0.025] border-white/10 hover:bg-white/[0.05]'
                      } ${dimmed ? 'opacity-60' : ''}`}
                      style={{ animationDelay: `${idx * 70}ms` }}
                    >
                      {/* Target reticle when selected / accused */}
                      {(isSelected || isEliminated) && (
                        <>
                          {['top-1 left-1 border-t-2 border-l-2', 'top-1 right-1 border-t-2 border-r-2', 'bottom-1 left-1 border-b-2 border-l-2', 'bottom-1 right-1 border-b-2 border-r-2'].map((c) => (
                            <span key={c} className={`absolute w-4 h-4 border-red-500 pointer-events-none ${c}`} />
                          ))}
                        </>
                      )}

                      {/* TOP-RIGHT VOTE COUNT STAMP */}
                      {stage === 'vote-reveal' && <VoteStamp count={voteCount} tone="hazard" delayMs={140 + idx * 120} />}

                      {isEliminated && (
                        <div className="im-stamp absolute left-1/2 -translate-x-1/2 -top-3 z-20 px-2 py-0.5 bg-red-500 text-white font-mono text-[9px] font-black tracking-widest whitespace-nowrap" style={{ animationDelay: `${200 + participants.length * 120}ms` }}>
                          MOST VOTES • ACCUSED
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <SuspectAvatar p={p} size={48} />
                            <div className="min-w-0">
                              <p className={`font-athletic italic text-lg font-black uppercase leading-none truncate ${p.avatarText}`}>{p.name}</p>
                              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">{p.title}</span>
                            </div>
                          </div>

                          {stage === 'voting' && isSelected && (
                            <span className="im-stamp px-2 py-1 bg-red-500 text-white text-[10px] font-mono font-black uppercase shrink-0">SELECTED</span>
                          )}
                        </div>

                        {/* Clues submitted by this player */}
                        <div className="space-y-1.5">
                          {playerClues.map((c) => (
                            <div key={c.id} className="im-chamfer px-3 py-2 bg-black/50 border border-white/[0.07] text-sm text-neutral-100">
                              <span className="text-[9px] font-mono text-neutral-500 mr-2">ROUND {c.round}:</span>
                              <span className="font-bold">"{c.text}"</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Full Names of Voters in Vote Reveal */}
                      {stage === 'vote-reveal' && (
                        <div className="pt-3 border-t border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">VOTED BY:</span>
                            <span className="font-mono text-xs font-black text-red-400">
                              {voteCount} {voteCount === 1 ? 'VOTE' : 'VOTES'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {votersForThisPlayer.length > 0 ? (
                              votersForThisPlayer.map((voter, vIdx) => (
                                <span
                                  key={voter.id}
                                  className={`im-pop px-2 py-0.5 bg-black/60 border border-white/15 text-[11px] font-athletic italic font-black uppercase ${voter.avatarText}`}
                                  style={{ animationDelay: `${200 + idx * 120 + vIdx * 60}ms` }}
                                >
                                  {voter.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs font-mono text-neutral-500">No votes cast against this player</span>
                            )}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PHASE 4.2: SQUAD SKIPPED THE VOTE -> ANOTHER CLUE ROUND */}
          {stage === 'vote-skipped' && (
            <div className="im-panel im-rise max-w-lg w-full mx-auto p-8 text-center flex flex-col items-center" style={{ ['--im-accent' as string]: 'rgba(6,182,212,0.85)' } as React.CSSProperties}>
              <div className="im-stamp px-5 py-2 border-[3px] border-cyan-400 text-cyan-300 font-athletic italic font-black text-4xl sm:text-5xl tracking-wide leading-none bg-black/60">
                VOTE SKIPPED
              </div>
              <span className="mt-4 font-mono text-[11px] tracking-[0.3em] text-neutral-400">
                {skipVoteCount}/{participants.length} BALLOTS SKIPPED • NO EJECTION
              </span>
              <h2 className="font-athletic italic text-3xl font-black uppercase tracking-wide text-white mt-2 leading-none">
                ROUND {currentRound + 1} CLUES INCOMING
              </h2>
              <p className="text-xs text-neutral-400 mt-2 max-w-sm">
                The squad wants more evidence. Everyone drops one more clue before the tribunal re-convenes.
              </p>
            </div>
          )}

          {/* PHASE 4.5: VERDICT SUSPENSE — SPOTLIGHT INTERROGATION */}
          {stage === 'verdict-suspense' && (
            <div className="relative max-w-lg w-full mx-auto flex flex-col items-center justify-center text-center min-h-[420px] px-6">
              <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-[calc(30vh/var(--zoom,1))] w-[min(560px,calc(120vw/var(--zoom,1)))] h-[calc(100%+calc(30vh/var(--zoom,1)))]"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.05) 60%, transparent)',
                  clipPath: 'polygon(42% 0, 58% 0, 88% 100%, 12% 100%)',
                }}
              />
              <div
                className="pointer-events-none absolute left-1/2 top-[44%] -translate-x-1/2 w-72 h-16 rounded-[100%]"
                style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.18), transparent 70%)' }}
              />

              <div ref={spotlightRef} className="im-heartbeat relative mb-9">
                {eliminatedParticipant ? (
                  <SuspectAvatar p={eliminatedParticipant} size={120} style={{ boxShadow: '0 0 60px rgba(239,68,68,0.45)' }} />
                ) : (
                  <div className="w-[120px] h-[120px] im-chamfer bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
                    <ShieldAlert className="w-12 h-12 text-red-500" />
                  </div>
                )}
                <ShieldAlert className="absolute -bottom-3 -right-3 w-9 h-9 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
              </div>

              <span className="relative im-blink text-[11px] font-mono font-black uppercase tracking-[0.3em] text-red-400">
                INTERROGATING EJECTED SUSPECT...
              </span>
              <h2 className="relative font-athletic italic text-4xl sm:text-5xl font-black uppercase tracking-wide text-white mt-2 leading-none">
                WAS{' '}
                <span className={eliminatedParticipant?.avatarText || 'text-red-500'}>{eliminatedParticipant?.name}</span>{' '}
                THE IMPOSTER?
              </h2>
            </div>
          )}

          {/* PHASE 4.8: IMPOSTER CAUGHT -> LAST-STAND SECRET PLAYER GUESS */}
          {stage === 'imposter-last-stand' && (
            <div className="im-panel im-rise max-w-xl w-full mx-auto p-6 sm:p-8 text-center overflow-hidden" style={{ ['--im-accent' as string]: 'rgba(239,68,68,0.95)' } as React.CSSProperties}>
              <div className="im-hazard absolute inset-x-0 top-0 h-2" />
              <div className="relative w-16 h-16 mx-auto mb-4 mt-2 flex items-center justify-center">
                <div className="absolute inset-0 im-chamfer bg-red-500/15 border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]" />
                <ShieldAlert className="relative w-8 h-8 text-red-500" />
              </div>

              <span className="im-chamfer px-3.5 py-1 bg-red-500/15 border border-red-500/50 text-[10px] sm:text-xs font-mono font-black uppercase tracking-[0.2em] text-red-400">
                IMPOSTER CAUGHT • LAST STAND CHANCE
              </span>

              <h2 className="font-athletic italic text-3xl sm:text-5xl font-black uppercase tracking-wide text-white mt-3 leading-[0.95]">
                {imposterParticipant.isUser ? (
                  'GUESS THE SECRET PLAYER TO STEAL THE WIN'
                ) : (
                  <>
                    <span className={imposterParticipant.avatarText}>{imposterParticipant.name}</span> IS GUESSING THE SECRET PLAYER...
                  </>
                )}
              </h2>

              <p className="text-sm text-neutral-300 mt-2">
                {imposterParticipant.isUser
                  ? 'You were voted out! Name the secret footballer from the Crew clues to steal victory.'
                  : 'The Imposter was caught, but gets one final shot to name the secret footballer and steal the win!'}
              </p>
              <div className="flex items-center justify-center gap-3 mt-3 mb-6">
                <TimerDial seconds={lastStandSecondsLeft} total={LAST_STAND_SECONDS} urgent={lastStandSecondsLeft <= 10} />
                <span className="font-mono text-[10px] tracking-[0.25em] text-neutral-500">NO GUESS = STEAL FAILS</span>
              </div>

              {imposterParticipant.isUser ? (
                <form onSubmit={handleImposterLastStandSubmit} className="space-y-3 text-left">
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      ref={lastStandInputRef}
                      type="text"
                      value={imposterGuessInput}
                      onChange={(e) => {
                        setImposterGuessInput(e.target.value);
                        setDidYouMeanSuggestion(null);
                      }}
                      placeholder="Type the secret footballer's name..."
                      autoComplete="off"
                      spellCheck={false}
                      disabled={lastStandSubmitted}
                      className="im-chamfer flex-1 h-[52px] px-4 bg-black/65 border border-white/20 focus:border-red-500 focus:outline-none text-base font-semibold text-white placeholder:text-neutral-500 caret-red-500"
                    />
                    <button
                      type="submit"
                      disabled={!imposterGuessInput.trim() || lastStandSubmitted}
                      className="im-press im-sheen im-chamfer h-[52px] px-6 bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] disabled:opacity-40 disabled:grayscale disabled:pointer-events-none text-white font-athletic italic text-lg font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(239,68,68,0.4)] cursor-pointer shrink-0 hover:brightness-110"
                    >
                      <span>{lastStandSubmitted ? 'VERIFYING...' : didYouMeanSuggestion ? 'CONFIRM & SEND' : 'SEND GUESS'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {didYouMeanSuggestion && (
                    <div className="im-pop im-chamfer px-4 py-3 bg-amber-500/15 border border-amber-400/50 flex items-center justify-between gap-3">
                      <span className="text-xs font-mono text-amber-200">
                        Did you mean <strong className="text-white font-bold">{didYouMeanSuggestion}</strong>? Click{' '}
                        <strong className="text-white">CONFIRM &amp; SEND</strong> again to lock it in.
                      </span>
                    </div>
                  )}
                </form>
              ) : (
                <div className="im-chamfer px-5 py-4 bg-black/55 border border-white/10 text-sm font-mono text-neutral-300 flex items-center justify-center gap-2">
                  <span className="flex gap-1">
                    <span className="im-dot w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span className="im-dot w-1.5 h-1.5 rounded-full bg-red-400" style={{ animationDelay: '0.15s' }} />
                    <span className="im-dot w-1.5 h-1.5 rounded-full bg-red-400" style={{ animationDelay: '0.3s' }} />
                  </span>
                  <span>
                    <span className={`font-bold ${imposterParticipant.avatarText}`}>{imposterParticipant.name}</span> is locking in their final guess...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* PHASE 5: ENDGAME VERDICT & SECRET PLAYER REVEAL */}
          {stage === 'game-over' && (
            <div
              ref={verdictRef}
              className="im-panel im-rise relative max-w-2xl w-full mx-auto p-6 sm:p-8 text-center"
              style={{ ['--im-accent' as string]: crewWonMatch ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)' } as React.CSSProperties}
            >
              {/* High-impact verdict stamp */}
              <div className="flex justify-center mb-5">
                <div
                  className="im-verdict px-5 sm:px-7 py-2 sm:py-3 border-[4px] font-athletic italic font-black text-3xl sm:text-5xl leading-none tracking-wide whitespace-nowrap"
                  style={{
                    color: crewWonMatch ? CLEAR : HAZARD,
                    borderColor: crewWonMatch ? CLEAR : HAZARD,
                    background: 'rgba(5,7,11,0.9)',
                    boxShadow: crewWonMatch ? '0 0 40px rgba(16,185,129,0.35)' : '0 0 40px rgba(239,68,68,0.35)',
                    textShadow: crewWonMatch ? '0 0 22px rgba(16,185,129,0.5)' : '0 0 22px rgba(239,68,68,0.5)',
                  }}
                >
                  {verdictStamp}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 mb-3">
                <div
                  className={`w-14 h-14 im-chamfer border-2 flex items-center justify-center ${
                    crewWonMatch ? 'bg-emerald-500/15 border-emerald-400' : 'bg-red-500/15 border-red-500'
                  }`}
                >
                  {crewWonMatch ? <UserCheck className="w-7 h-7 text-emerald-400" /> : <UserX className="w-7 h-7 text-red-500" />}
                </div>
                <span
                  className={`im-chamfer px-3.5 py-1 text-xs font-mono font-black uppercase tracking-[0.2em] border ${
                    crewWonMatch ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' : 'bg-red-500/15 border-red-500/40 text-red-400'
                  }`}
                >
                  {imposterCaught && imposterStolenWin
                    ? 'LAST-STAND HEIST!'
                    : imposterCaught
                    ? 'IMPOSTER CAUGHT!'
                    : !eliminatedParticipant
                    ? 'NO CONVICTION!'
                    : 'INNOCENT ELIMINATED!'}
                </span>
              </div>

              <h1 className="font-athletic italic text-3xl sm:text-4xl font-black uppercase tracking-wide text-white leading-none">
                {imposterCaught && imposterStolenWin
                  ? 'IMPOSTER VICTORY! GUESSED THE SECRET PLAYER'
                  : crewWonMatch
                  ? 'CREW VICTORY! THE SPY WAS EXPOSED'
                  : !eliminatedParticipant
                  ? 'IMPOSTER VICTORY! THE SQUAD NEVER CONVICTED'
                  : 'IMPOSTER VICTORY! THE BLUFF WORKED'}
              </h1>
              <span className={`block mt-2 font-mono text-[10px] tracking-[0.3em] ${userSideWon ? 'text-emerald-300' : 'text-red-400'}`}>
                {userSideWon ? 'YOUR SIDE WINS THE CASE' : 'YOUR SIDE LOSES THE CASE'}
              </span>

              <p className="text-sm text-neutral-300 mt-3 mb-5">
                Eliminated by Vote:{' '}
                <strong className={`font-bold ${eliminatedParticipant?.avatarText || 'text-white'}`}>{eliminatedParticipant?.name ?? 'NOBODY'}</strong>{' '}
                • True Imposter:{' '}
                <strong className={`font-bold ${imposterParticipant.avatarText || 'text-red-500'}`}>{imposterParticipant.name}</strong>
                {imposterCaught && imposterFinalGuessText ? (
                  <>
                    {' '}
                    • Imposter Guessed:{' '}
                    <strong className={imposterStolenWin ? 'text-[#ccff00] font-bold' : 'text-rose-400 font-bold'}>
                      "{imposterFinalGuessText}"
                    </strong>
                  </>
                ) : null}
              </p>

              {/* Mugshot of the true imposter */}
              <div className="im-chamfer relative flex items-center gap-4 bg-red-500/[0.06] border border-red-500/30 p-4 mb-4 text-left overflow-hidden">
                <div
                  className="absolute inset-y-0 right-0 w-1/2 opacity-[0.08] pointer-events-none"
                  style={{ background: 'repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 14px)' }}
                />
                <SuspectAvatar p={imposterParticipant} size={64} style={{ boxShadow: '0 0 30px rgba(239,68,68,0.35)' }} />
                <div className="min-w-0 relative">
                  <span className="text-[9px] font-mono font-black uppercase tracking-[0.3em] text-red-400 block">TRUE IMPOSTER • CASE FILE</span>
                  <p className={`font-athletic italic text-3xl font-black uppercase leading-none truncate ${imposterParticipant.avatarText}`}>
                    {imposterParticipant.name}
                  </p>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">{imposterParticipant.title}</span>
                </div>
              </div>

              {/* True Secret Player Identity Card */}
              <div className="im-chamfer bg-gradient-to-b from-[#0f1a1a] to-[#070a0e] border border-white/15 p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-black/50 border border-white/15 flex items-center justify-center p-3 shrink-0">
                    <img src={secretPlayer.crestUrl} alt={secretPlayer.primaryClub} className="w-full h-full object-contain" />
                  </div>

                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#ccff00] block">TRUE SECRET FOOTBALLER</span>
                    <h3 className="font-athletic italic text-3xl sm:text-4xl font-black uppercase text-white leading-none">{secretPlayer.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.06] border border-white/10">
                        <img src={secretPlayer.flagUrl} alt={secretPlayer.nationality} className="w-4 h-3 object-cover rounded-sm" />
                        <span className="text-xs font-mono text-neutral-200">{secretPlayer.nationality}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.06] border border-white/10">
                        <img src={secretPlayer.crestUrl} alt={secretPlayer.primaryClub} className="w-4 h-4 object-contain" />
                        <span className="text-xs font-mono text-neutral-200">{secretPlayer.primaryClub}</span>
                      </div>
                      <span className="px-2.5 py-1 bg-[#ccff00]/15 border border-[#ccff00]/35 text-xs font-mono font-black text-[#ccff00]">
                        {secretPlayer.position}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white/[0.04] border border-white/10 p-3.5 max-w-xs">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-red-400 block mb-1">IMPOSTER CLUE WAS:</span>
                  <p className="text-xs font-semibold text-neutral-200">
                    {config.imposterClueEnabled ? secretPlayer.imposterVagueClue : 'Disabled (Zero Clues Mode)'}
                  </p>
                </div>
              </div>

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
                  className="im-press im-chamfer flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 text-sm font-athletic italic font-black uppercase tracking-widest text-neutral-300 cursor-pointer"
                >
                  RETURN TO HUB
                </button>
                <button
                  type="button"
                  disabled={isMultiplayer && !isHost && hasRequestedRematch}
                  onClick={handleRequestOrExecuteRematch}
                  className={`im-press im-chamfer flex-1 py-4 font-athletic italic font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 ${
                    isMultiplayer && !isHost && hasRequestedRematch
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                      : isMultiplayer && isHost && isOpponentRematchReady
                      ? 'im-sheen bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] text-white shadow-[0_0_25px_rgba(239,68,68,0.5)] cursor-pointer'
                      : 'im-sheen bg-gradient-to-b from-[#f87171] via-[#ef4444] to-[#b91c1c] text-white shadow-[0_10px_28px_rgba(239,68,68,0.35)] cursor-pointer'
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
