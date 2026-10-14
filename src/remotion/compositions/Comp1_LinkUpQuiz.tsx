import React from 'react';
import {
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';
import { HeaderBar } from '../components/HeaderBar';
import { CountdownRing } from '../components/CountdownRing';
import { ParticleExplosion } from '../components/ParticleExplosion';
import { Outro } from '../components/Outro';

export const Comp1_LinkUpQuiz: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance hook animation (Frames 0-45)
  const hookScale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 140 },
  });

  // Criteria badges spring entrances (Frames 45, 75, 105)
  const badge1Spring = spring({
    frame: frame - 45,
    fps,
    config: { damping: 12, stiffness: 160 },
  });
  const badge2Spring = spring({
    frame: frame - 75,
    fps,
    config: { damping: 12, stiffness: 160 },
  });
  const badge3Spring = spring({
    frame: frame - 105,
    fps,
    config: { damping: 12, stiffness: 160 },
  });

  // Typing animation for answer "JUDE BELLINGHAM" (Frames 270 - 320)
  const fullAnswer = 'JUDE BELLINGHAM';
  const typingProgress = Math.max(0, Math.min(1, (frame - 270) / 45));
  const charsShown = Math.floor(typingProgress * fullAnswer.length);
  const currentTyped = fullAnswer.slice(0, charsShown);

  // Lock-in / celebration flash (Frame 315)
  const lockInScale = spring({
    frame: frame - 315,
    fps,
    config: { damping: 9, stiffness: 200 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Ambience */}
      <div className="absolute inset-0 pitch-grid-bg opacity-30" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-cyan-500/15 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Main Gameplay Video Sequence (0 - 390 frames = 13.0s) */}
      <Sequence from={0} durationInFrames={390}>
        <div className="w-full h-full flex flex-col justify-between pb-16 relative">
          <HeaderBar modeTitle="THE LINK-UP" themeColor="cyan" />

          {/* Top Hook Banner */}
          <div className="px-10 text-center">
            <div
              style={{ transform: `scale(${hookScale})` }}
              className="inline-block px-8 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black text-2xl uppercase tracking-wider shadow-[0_0_30px_rgba(0,240,255,0.4)]"
            >
              ⚽ 99% OF FANS CAN'T SOLVE THIS LINK-UP!
            </div>
            <h1 className="mt-6 text-5xl font-black uppercase tracking-tight text-white drop-shadow-md">
              NAME THE MYSTERY BALLER
            </h1>
            <p className="mt-2 text-xl font-mono text-gray-400">
              Matches all 3 criteria below • 5s on the clock
            </p>
          </div>

          {/* 3 Criteria Badges */}
          <div className="px-12 flex flex-col gap-5 my-6">
            {/* Criteria 1: Nation */}
            <div
              style={{
                transform: `scale(${frame >= 45 ? badge1Spring : 0})`,
                opacity: frame >= 45 ? 1 : 0,
              }}
              className="p-6 rounded-3xl bg-[#12151e] border-2 border-cyan-400/50 flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center gap-5">
                <span className="text-5xl">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>
                <div className="flex flex-col">
                  <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold">
                    CRITERION 01 • NATION
                  </span>
                  <span className="text-4xl font-black tracking-tight text-white uppercase">
                    ENGLAND
                  </span>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-cyan-400/20 text-cyan-300 font-mono font-bold text-sm">
                LOCKED
              </span>
            </div>

            {/* Criteria 2: Club */}
            <div
              style={{
                transform: `scale(${frame >= 75 ? badge2Spring : 0})`,
                opacity: frame >= 75 ? 1 : 0,
              }}
              className="p-6 rounded-3xl bg-[#12151e] border-2 border-amber-400/50 flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center gap-5">
                <span className="text-5xl">👑</span>
                <div className="flex flex-col">
                  <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
                    CRITERION 02 • CLUB
                  </span>
                  <span className="text-4xl font-black tracking-tight text-white uppercase">
                    REAL MADRID
                  </span>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-amber-400/20 text-amber-300 font-mono font-bold text-sm">
                LOCKED
              </span>
            </div>

            {/* Criteria 3: Position */}
            <div
              style={{
                transform: `scale(${frame >= 105 ? badge3Spring : 0})`,
                opacity: frame >= 105 ? 1 : 0,
              }}
              className="p-6 rounded-3xl bg-[#12151e] border-2 border-[#ccff00]/50 flex items-center justify-between shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center gap-5">
                <span className="text-5xl">⚡</span>
                <div className="flex flex-col">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#ccff00] font-bold">
                    CRITERION 03 • POSITION
                  </span>
                  <span className="text-4xl font-black tracking-tight text-white uppercase">
                    MIDFIELDER (#5)
                  </span>
                </div>
              </div>
              <span className="px-4 py-2 rounded-xl bg-[#ccff00]/20 text-[#ccff00] font-mono font-bold text-sm">
                LOCKED
              </span>
            </div>
          </div>

          {/* Timer Ring Section (Frames 135 - 285) */}
          <div className="flex flex-col items-center justify-center my-4">
            {frame >= 135 && frame < 315 ? (
              <CountdownRing
                startFrame={135}
                durationFrames={150}
                size={220}
              />
            ) : frame >= 315 ? (
              /* Success Card Reveal */
              <div
                style={{ transform: `scale(${lockInScale})` }}
                className="px-12 py-5 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/30 to-emerald-500/20 border-2 border-emerald-400 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.5)]"
              >
                <span className="text-sm font-mono text-emerald-400 font-bold uppercase tracking-widest">
                  ✨ LINK-UP SOLVED! +2,450 PTS
                </span>
                <span className="text-5xl font-black text-white tracking-tight mt-1">
                  JUDE BELLINGHAM
                </span>
              </div>
            ) : null}
          </div>

          {/* Virtual Typing Input Bar */}
          <div className="px-10">
            <div className="p-6 rounded-3xl bg-[#181c28] border-2 border-cyan-400/80 shadow-[0_0_30px_rgba(0,240,255,0.25)] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-cyan-400 font-mono text-2xl font-bold">
                  ANSWER:
                </span>
                <span className="text-3xl font-mono font-black text-white tracking-wider">
                  {frame >= 270 ? currentTyped : ''}
                  {frame >= 270 && frame < 315 && (
                    <span className="animate-pulse text-cyan-400">_</span>
                  )}
                  {frame < 270 && (
                    <span className="text-gray-500 text-2xl font-normal">
                      Who links all 3...?
                    </span>
                  )}
                </span>
              </div>

              <div
                className={`px-6 py-2.5 rounded-2xl font-black text-sm uppercase tracking-wider font-mono ${
                  frame >= 315
                    ? 'bg-emerald-400 text-black shadow-[0_0_20px_rgba(52,211,153,0.8)]'
                    : 'bg-cyan-400 text-black'
                }`}
              >
                {frame >= 315 ? 'CORRECT ✓' : 'ENTER ↵'}
              </div>
            </div>
          </div>

          {/* Celebration Particle Blast */}
          {frame >= 315 && <ParticleExplosion startFrame={315} />}
        </div>
      </Sequence>

      {/* Outro Sequence (Frames 390 - 480 = 3.0s) */}
      <Sequence from={390} durationInFrames={90}>
        <Outro
          headline="SOLVE DAILY LINK-UPS FREE"
          subheadline="PLAY SOLO OR 1V1 LIVE AGAINST YOUR MATES"
        />
      </Sequence>
    </div>
  );
};
