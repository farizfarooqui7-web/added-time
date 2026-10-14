import React from 'react';
import {
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';
import { HeaderBar } from '../components/HeaderBar';
import { ParticleExplosion } from '../components/ParticleExplosion';
import { Outro } from '../components/Outro';
import { User, Bot, Search, Zap, Check, Clock } from 'lucide-react';

export const Comp1_LinkUpQuiz: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slot reveals:
  // Slot 1 (Nation): Frame 35
  // Slot 2 (Club): Frame 70
  // Slot 3 (Position): Frame 105
  const slot1Spring = spring({ frame: frame - 35, fps, config: { damping: 12, stiffness: 160 } });
  const slot2Spring = spring({ frame: frame - 70, fps, config: { damping: 12, stiffness: 160 } });
  const slot3Spring = spring({ frame: frame - 105, fps, config: { damping: 12, stiffness: 160 } });

  // Autocomplete typing (Frame 210 - 280)
  const fullText = 'Jude Bellingham';
  const typeProgress = Math.max(0, Math.min(1, (frame - 210) / 40));
  const chars = Math.floor(typeProgress * fullText.length);
  const currentTyped = fullText.slice(0, chars);

  // Pressure timer count (5.0s down to 0.8s)
  const timerSec = frame < 120 ? 5.0 : Math.max(0.6, 5.0 - ((frame - 120) / 160) * 4.4);

  // Lock-in trigger at Frame 290
  const isLockedIn = frame >= 290;
  const lockInSpring = spring({ frame: frame - 290, fps, config: { damping: 10, stiffness: 200 } });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Stadium Grid from site */}
      <div className="absolute inset-0 pitch-grid-bg opacity-40 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(circle,rgba(168,85,247,0.15)_0%,transparent_70%)] pointer-events-none" />

      {/* Main Arena Sequence (Frames 0 - 390 = 13s) */}
      <Sequence from={0} durationInFrames={390}>
        <div className="w-full h-full flex flex-col justify-between pb-12 relative">
          <HeaderBar modeTitle="THE LINK-UP • SPEED DUEL" pillColor="#a855f7" />

          {/* TikTok Hook Header */}
          <div className="px-8 pt-4 text-center">
            <span className="inline-block px-5 py-2 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-base font-bold uppercase tracking-wider mb-3">
              ⚡ LIVE MULTIPLAYER ARENA
            </span>
            <h1 className="text-5xl font-black uppercase tracking-tight text-white font-athletic">
              CAN YOU SOLVE THIS LINK-UP IN 5 SECONDS?
            </h1>
          </div>

          {/* EXACT SITE BROADCAST HUD BAR (from LinkUpArena.tsx) */}
          <div className="mx-8 p-4 rounded-2xl bg-[#12151e] border border-white/10 flex items-center justify-between shadow-xl">
            {/* Left: Round Pill */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7] animate-pulse" />
              <span className="font-mono text-sm font-bold text-white tracking-wider">
                ROUND 01 / 05
              </span>
              <span className="text-slate-600 font-mono">•</span>
              <span className="text-xs font-mono text-slate-400">DIFF:</span>
              <span className="text-xs font-mono text-[#00f0ff] font-bold">NORMAL</span>
            </div>

            {/* Center: Live Scoreboard */}
            <div className="flex items-center gap-3 bg-[#0a0d14] px-4 py-2 rounded-xl border border-white/10">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#ccff00]" />
                <span className="font-mono text-xs font-bold text-slate-300">YOU:</span>
                <span className="font-mono text-base font-black text-[#ccff00]">
                  {isLockedIn ? '1' : '0'}
                </span>
              </div>
              <span className="text-slate-600 font-mono">•</span>
              <div className="flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#00f0ff]" />
                <span className="font-mono text-xs font-bold text-slate-300">OPPONENT:</span>
                <span className="font-mono text-base font-black text-white">0</span>
              </div>
            </div>

            {/* Right: Active Slot Formula */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold">
                NATION
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold">
                CLUB
              </span>
              <span className="text-slate-600">•</span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold">
                POS
              </span>
            </div>
          </div>

          {/* EXACT SITE 3 CLUE CARDS (from ClueSlotCard in LinkUpArena.tsx) */}
          <div className="px-8 flex flex-col gap-5 my-auto">
            {/* Slot 1: Nation */}
            <div
              style={{ transform: `scale(${frame >= 35 ? slot1Spring : 0})` }}
              className={`p-6 rounded-3xl bg-[#10141d] border-2 transition-all flex items-center justify-between shadow-2xl ${
                isLockedIn ? 'border-emerald-500/70 bg-emerald-950/20 shadow-[0_0_25px_rgba(16,185,129,0.3)]' : 'border-white/15'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-5xl shadow-inner">
                  🏴󠁧󠁢󠁥󠁮󠁧󠁿
                </div>
                <div>
                  <span className="text-xs font-mono text-cyan-400 font-bold tracking-widest uppercase">
                    CRITERION 01 • NATION
                  </span>
                  <h3 className="text-4xl font-black text-white uppercase tracking-tight mt-1">
                    ENGLAND
                  </h3>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono font-bold text-slate-300">
                {isLockedIn ? 'MATCHED ✓' : 'LOCKED'}
              </span>
            </div>

            {/* Slot 2: Club */}
            <div
              style={{ transform: `scale(${frame >= 70 ? slot2Spring : 0})` }}
              className={`p-6 rounded-3xl bg-[#10141d] border-2 transition-all flex items-center justify-between shadow-2xl ${
                isLockedIn ? 'border-emerald-500/70 bg-emerald-950/20 shadow-[0_0_25px_rgba(16,185,129,0.3)]' : 'border-white/15'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-5xl shadow-inner">
                  👑
                </div>
                <div>
                  <span className="text-xs font-mono text-amber-400 font-bold tracking-widest uppercase">
                    CRITERION 02 • CLUB
                  </span>
                  <h3 className="text-4xl font-black text-white uppercase tracking-tight mt-1">
                    REAL MADRID
                  </h3>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono font-bold text-slate-300">
                {isLockedIn ? 'MATCHED ✓' : 'LOCKED'}
              </span>
            </div>

            {/* Slot 3: Position */}
            <div
              style={{ transform: `scale(${frame >= 105 ? slot3Spring : 0})` }}
              className={`p-6 rounded-3xl bg-[#10141d] border-2 transition-all flex items-center justify-between shadow-2xl ${
                isLockedIn ? 'border-emerald-500/70 bg-emerald-950/20 shadow-[0_0_25px_rgba(16,185,129,0.3)]' : 'border-white/15'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-5xl shadow-inner">
                  ⚡
                </div>
                <div>
                  <span className="text-xs font-mono text-[#ccff00] font-bold tracking-widest uppercase">
                    CRITERION 03 • POSITION
                  </span>
                  <h3 className="text-4xl font-black text-white uppercase tracking-tight mt-1">
                    MIDFIELDER (#5)
                  </h3>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-mono font-bold text-slate-300">
                {isLockedIn ? 'MATCHED ✓' : 'LOCKED'}
              </span>
            </div>
          </div>

          {/* PRESSURE TIMER BAR (Exact site pressure timer) */}
          <div className="mx-8 p-4 rounded-2xl bg-[#12151e] border border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                PRESSURE TIMER
              </span>
              <span className={`font-black text-sm ${timerSec <= 1.5 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>
                {timerSec.toFixed(1)}s REMAINING
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-black/60 border border-white/10 overflow-hidden">
              <div
                style={{ width: `${(timerSec / 5.0) * 100}%` }}
                className={`h-full rounded-full transition-all ${
                  timerSec <= 1.5 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-gradient-to-r from-amber-400 to-[#ccff00]'
                }`}
              />
            </div>
          </div>

          {/* EXACT SITE INPUT + AUTOCOMPLETE DROPDOWN */}
          <div className="px-8 relative">
            {/* Real site Autocomplete popup dropdown */}
            {frame >= 230 && !isLockedIn && (
              <div className="absolute left-8 right-8 bottom-full mb-3 rounded-2xl bg-[#10141d] border-2 border-[#ccff00]/60 p-3 shadow-2xl flex flex-col gap-2 z-40">
                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 px-3">
                  SUGGESTIONS (1 MATCH)
                </div>
                <div className="p-3 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ccff00]" />
                    <span className="font-bold text-white text-lg font-sans">
                      Jude Bellingham
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      Real Madrid • England • MID
                    </span>
                  </div>
                  <span className="px-3 py-1 rounded bg-[#ccff00] text-black font-mono font-black text-xs">
                    LOCK IN ↵
                  </span>
                </div>
              </div>
            )}

            {/* Input Row */}
            {!isLockedIn ? (
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-5 h-5 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <div className="w-full h-16 pl-14 pr-4 rounded-2xl bg-[#12151e] border-2 border-white/20 text-white font-sans font-bold text-xl flex items-center">
                    <span>{currentTyped}</span>
                    <span className="animate-pulse text-[#ccff00] font-normal">|</span>
                  </div>
                </div>

                <div className="h-16 px-8 rounded-2xl bg-[#ccff00] text-black font-sans font-black text-base uppercase tracking-wider flex items-center gap-2 shadow-[0_0_25px_rgba(204,255,0,0.4)]">
                  <Zap className="w-5 h-5 fill-black" />
                  <span>LOCK LINK</span>
                </div>
              </div>
            ) : (
              /* Verified Locked-in Pill */
              <div
                style={{ transform: `scale(${lockInSpring})` }}
                className="w-full h-16 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-[#10141d] to-emerald-500/20 border-2 border-emerald-400 px-6 flex items-center justify-between shadow-[0_0_35px_rgba(52,211,153,0.5)]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-400 text-black flex items-center justify-center font-bold">
                    <Check className="w-5 h-5" />
                  </div>
                  <span className="font-sans font-black text-2xl text-white">
                    SOLVED: <span className="text-emerald-400">JUDE BELLINGHAM</span>
                  </span>
                </div>
                <span className="px-4 py-1.5 rounded-xl bg-emerald-400 text-black font-mono font-black text-sm">
                  +1,000 PTS
                </span>
              </div>
            )}
          </div>

          {isLockedIn && <ParticleExplosion startFrame={290} />}
        </div>
      </Sequence>

      {/* Outro (Frames 390 - 480) */}
      <Sequence from={390} durationInFrames={90}>
        <Outro
          headline="SOLVE DAILY LINK-UPS LIVE"
          subheadline="PLAY FREE IN BROWSER • 1V1 LIVE DUELS"
        />
      </Sequence>
    </div>
  );
};
