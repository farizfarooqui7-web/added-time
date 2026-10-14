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
import { Clock, Lock } from 'lucide-react';

export const Comp3_FootballImposter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Timeline:
  // Frame 0-60: Arena HUD + Clues reveal
  // Frame 60-180: Clues discussion cards from squad members
  // Frame 180-290: Siren alert & Timer ticking down (suspicious clue flagged)
  // Frame 290-420: Voting stage & Imposter Caught reveal banner
  // Frame 420-510: Outro

  const isVotingStage = frame >= 290;
  const isSiren = frame >= 180 && frame < 290;
  const sirenFlash = isSiren ? Math.sin(frame * 0.4) > 0 : false;

  const clue1Spring = spring({ frame: frame - 40, fps, config: { damping: 12, stiffness: 150 } });
  const clue2Spring = spring({ frame: frame - 80, fps, config: { damping: 12, stiffness: 150 } });
  const clue3Spring = spring({ frame: frame - 120, fps, config: { damping: 12, stiffness: 150 } });

  const verdictSpring = spring({
    frame: frame - 290,
    fps,
    config: { damping: 10, stiffness: 180 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Ambience / Tactical Grid */}
      <div className="absolute inset-0 pitch-grid-bg opacity-40 pointer-events-none" />
      <div
        className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${
          sirenFlash
            ? 'bg-red-600/20'
            : 'bg-[radial-gradient(circle,rgba(255,42,95,0.14)_0%,transparent_70%)]'
        }`}
      />

      {/* Main Arena Sequence (Frames 0 - 420 = 14s) */}
      <Sequence from={0} durationInFrames={420}>
        <div className="w-full h-full flex flex-col justify-between pb-12 relative">
          <HeaderBar modeTitle="FOOTBALL IMPOSTER" pillColor="#ff2a5f" />

          {/* TikTok Hook Header */}
          <div className="px-8 pt-4 text-center">
            <span className="inline-block px-5 py-2 rounded-full bg-[#ff2a5f]/20 border border-[#ff2a5f]/40 text-[#ff2a5f] font-mono text-base font-bold uppercase tracking-wider mb-2">
              🚨 SOCIAL DEDUCTION ARENA
            </span>
            <h1 className="text-5xl font-black uppercase tracking-tight text-white font-athletic">
              ONE SQUAD MEMBER DROPPED A FAKE STAT!
            </h1>
          </div>

          {/* EXACT SITE IMPOSTER BROADCAST HUD BAR (from ImposterArena.tsx) */}
          <div className="mx-8 p-4 rounded-2xl bg-[#10141d] border border-white/10 flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-athletic text-xl font-black uppercase text-white">
                    FOOTBALL IMPOSTER
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold uppercase bg-[#ff2a5f]/15 text-[#ff2a5f] border border-[#ff2a5f]/30">
                    LEGENDS
                  </span>
                </div>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">
                  ROUND 1 OF 3 • 4 SQUAD MEMBERS
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Timer Pill */}
              <div
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono font-bold text-sm ${
                  isSiren ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse' : 'bg-[#ff2a5f]/15 border-[#ff2a5f]/40 text-white'
                }`}
              >
                <Clock className="w-4 h-4 text-[#ff2a5f]" />
                <span>{isVotingStage ? 'VOTING' : '05s'}</span>
              </div>

              {/* Exact Hold to Peek Button */}
              <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/15 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 text-neutral-200">
                <Lock className="w-4 h-4 text-[#ff2a5f]" />
                <span>HOLD TO PEEK</span>
              </div>
            </div>
          </div>

          {/* SQUAD CLUE FEED (Exact Speech Cards from ImposterArena.tsx) */}
          <div className="px-8 flex flex-col gap-5 my-auto">
            {/* Clue 1: Marcus */}
            <div
              style={{ transform: `scale(${frame >= 40 ? clue1Spring : 0})` }}
              className="p-5 rounded-2xl bg-[#121622] border border-white/10 flex items-start gap-4 shadow-xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center font-bold text-cyan-300 text-xl shrink-0">
                M
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-cyan-400 text-base font-mono">
                    Marcus (Real Madrid Fan)
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded">
                    REAL STAT ✓
                  </span>
                </div>
                <p className="text-white text-2xl font-bold font-sans">
                  "Cristiano won 5 UEFA Champions Leagues."
                </p>
              </div>
            </div>

            {/* Clue 2: Elena */}
            <div
              style={{ transform: `scale(${frame >= 80 ? clue2Spring : 0})` }}
              className="p-5 rounded-2xl bg-[#121622] border border-white/10 flex items-start gap-4 shadow-xl"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center font-bold text-amber-300 text-xl shrink-0">
                E
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-400 text-base font-mono">
                    Elena (Tactician)
                  </span>
                  <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/15 px-2 py-0.5 rounded">
                    REAL STAT ✓
                  </span>
                </div>
                <p className="text-white text-2xl font-bold font-sans">
                  "Real Madrid's all-time top scorer with 450 goals."
                </p>
              </div>
            </div>

            {/* Clue 3: Tariq (THE IMPOSTER) */}
            <div
              style={{ transform: `scale(${frame >= 120 ? clue3Spring : 0})` }}
              className={`p-5 rounded-2xl transition-all flex items-start gap-4 shadow-2xl ${
                isVotingStage
                  ? 'bg-red-950/80 border-2 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.6)]'
                  : 'bg-[#121622] border border-white/10'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center font-bold text-rose-300 text-xl shrink-0">
                T
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-rose-400 text-base font-mono">
                    Tariq {isVotingStage && '• [IMPOSTER DETECTED]'}
                  </span>
                  {isVotingStage ? (
                    <span className="text-xs font-mono text-white font-black bg-red-600 px-3 py-0.5 rounded uppercase">
                      BUSTED ❌
                    </span>
                  ) : isSiren ? (
                    <span className="text-xs font-mono text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded animate-pulse">
                      SUSPICIOUS ⚠️
                    </span>
                  ) : null}
                </div>
                <p className="text-white text-2xl font-bold font-sans">
                  "He won the 2018 World Cup Golden Boot in Russia."
                </p>
              </div>
            </div>
          </div>

          {/* VERDICT STAGE (Frames 290 - 420) OR VOTING ACTION */}
          <div className="px-8">
            {isVotingStage ? (
              <div
                style={{ transform: `scale(${verdictSpring})` }}
                className="p-6 rounded-3xl bg-[#10141d] border-2 border-[#ff2a5f] shadow-[0_0_50px_rgba(255,42,95,0.4)] flex flex-col items-center text-center gap-2"
              >
                <div className="px-4 py-1 rounded-full bg-red-600 text-white font-mono text-xs font-black uppercase tracking-widest">
                  🚨 IMPOSTER ELIMINATED!
                </div>
                <h3 className="font-athletic font-black text-4xl text-white uppercase mt-1">
                  TARIQ WAS THE SPY!
                </h3>
                <p className="font-mono text-sm text-neutral-300">
                  Harry Kane won the 2018 Golden Boot with 6 goals!
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#121622] border border-white/10 flex items-center justify-between">
                <span className="font-mono text-sm text-slate-300">
                  {isSiren ? '⚠️ VOTING COMMENCING...' : 'SPOT THE FAKE STAT BEFORE TIME EXPIRES'}
                </span>
                <span className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-mono font-black text-xs uppercase tracking-wider shadow-lg">
                  VOTE TARIQ 🎯
                </span>
              </div>
            )}
          </div>

          {isVotingStage && <ParticleExplosion startFrame={290} />}
        </div>
      </Sequence>

      {/* Outro (Frames 420 - 510) */}
      <Sequence from={420} durationInFrames={90}>
        <Outro
          headline="PLAY FOOTBALL IMPOSTER WITH SQUAD"
          subheadline="SOCIAL DEDUCTION • SPOT THE SPY • PLAY FREE IN BROWSER"
        />
      </Sequence>
    </div>
  );
};
