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

export const Comp4_SideNettingFlex: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Guesses:
  // Guess 1 (Frames 45 - 135): "Cesc Fàbregas" -> Common (14% Obscurity, 150 pts)
  // Guess 2 (Frames 135 - 240): "Olivier Giroud" -> Semi-Pro (48% Obscurity, 720 pts)
  // Guess 3 (Frames 240 - 360): "Lassana Diarra" -> TOP BINS! (98.4% Obscurity, 4,920 pts)
  // Scorecard Showcase (Frames 360 - 420)
  // Outro (Frames 420 - 510)

  // Spring meters
  const meter1Progress = Math.min(1, Math.max(0, (frame - 60) / 25));
  const meter2Progress = Math.min(1, Math.max(0, (frame - 150) / 25));
  const meter3Progress = Math.min(1, Math.max(0, (frame - 255) / 25));

  const topBinsSpring = spring({
    frame: frame - 275,
    fps,
    config: { damping: 9, stiffness: 220 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Ambience / Deep Teal Glow */}
      <div className="absolute inset-0 pitch-grid-bg opacity-30" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[850px] bg-gradient-to-br from-cyan-500/20 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Main Gameplay Sequence (0 - 420 frames = 14.0s) */}
      <Sequence from={0} durationInFrames={420}>
        <div className="w-full h-full flex flex-col justify-between pb-16 relative">
          <HeaderBar modeTitle="SIDE NETTING" themeColor="cyan" />

          {/* Top Hook Banner */}
          <div className="px-10 text-center">
            <div className="inline-block px-8 py-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-black text-2xl uppercase tracking-wider shadow-[0_0_35px_rgba(0,240,255,0.4)]">
              🎯 THE RARER YOUR ANSWER, THE HIGHER YOU SCORE!
            </div>
            <h1 className="mt-4 text-5xl font-black uppercase tracking-tight text-white">
              PLAYED FOR ARSENAL & CHELSEA
            </h1>
            <p className="mt-1 text-xl font-mono text-gray-400">
              Only true ball knowers can hit the 90%+ Top Bins zone 🥅
            </p>
          </div>

          {/* 3 Sim Guesses & Obscurity Meters */}
          <div className="px-12 flex flex-col gap-6 my-2">
            {/* Guess 1: Common */}
            {frame >= 45 && (
              <div className="p-6 rounded-3xl bg-[#12151e] border-2 border-white/10 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black text-white uppercase">
                    1. Cesc Fàbregas
                  </span>
                  <span className="px-4 py-1.5 rounded-xl bg-gray-700/50 text-gray-300 font-mono text-xs font-bold uppercase">
                    CASUAL ANSWER
                  </span>
                </div>
                {/* Meter Bar */}
                <div className="w-full h-5 rounded-full bg-black/50 overflow-hidden border border-white/10 relative">
                  <div
                    style={{ width: `${meter1Progress * 14}%` }}
                    className="h-full bg-gray-400 rounded-full"
                  />
                </div>
                <div className="flex justify-between text-sm font-mono text-gray-400">
                  <span>OBSCURITY: 14%</span>
                  <span>150 PTS</span>
                </div>
              </div>
            )}

            {/* Guess 2: Semi-Pro */}
            {frame >= 135 && (
              <div className="p-6 rounded-3xl bg-[#12151e] border-2 border-amber-400/40 flex flex-col gap-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black text-white uppercase">
                    2. Olivier Giroud
                  </span>
                  <span className="px-4 py-1.5 rounded-xl bg-amber-400/20 text-amber-300 font-mono text-xs font-bold uppercase">
                    SEMI-PRO (48%)
                  </span>
                </div>
                {/* Meter Bar */}
                <div className="w-full h-5 rounded-full bg-black/50 overflow-hidden border border-amber-400/30 relative">
                  <div
                    style={{ width: `${meter2Progress * 48}%` }}
                    className="h-full bg-amber-400 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.6)]"
                  />
                </div>
                <div className="flex justify-between text-sm font-mono text-amber-300">
                  <span>OBSCURITY: 48%</span>
                  <span>720 PTS</span>
                </div>
              </div>
            )}

            {/* Guess 3: 98.4% TOP BINS SLAM */}
            {frame >= 240 && (
              <div
                style={{
                  transform: frame >= 275 ? `scale(${topBinsSpring})` : 'scale(1)',
                }}
                className={`p-7 rounded-3xl flex flex-col gap-4 shadow-2xl transition-all ${
                  frame >= 275
                    ? 'bg-gradient-to-r from-cyan-950 via-[#121f2d] to-[#0c1822] border-4 border-cyan-400 shadow-[0_0_60px_rgba(0,240,255,0.7)]'
                    : 'bg-[#12151e] border-2 border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-widest">
                      🔥 98.4% OBSCURITY • CERTIFIED BALL KNOWER
                    </span>
                    <h3 className="text-4xl font-black text-white uppercase mt-1">
                      3. Lassana Diarra
                    </h3>
                  </div>
                  {frame >= 275 && (
                    <span className="px-5 py-2.5 rounded-2xl bg-[#ccff00] text-black font-black text-base uppercase font-mono shadow-[0_0_20px_rgba(204,255,0,0.8)]">
                      TOP BINS 🚀
                    </span>
                  )}
                </div>

                {/* Meter Bar */}
                <div className="w-full h-7 rounded-full bg-black/60 overflow-hidden border-2 border-cyan-400/60 relative">
                  <div
                    style={{ width: `${meter3Progress * 98.4}%` }}
                    className="h-full bg-gradient-to-r from-cyan-400 to-[#ccff00] rounded-full shadow-[0_0_25px_rgba(0,240,255,0.9)]"
                  />
                </div>

                <div className="flex justify-between items-center text-lg font-mono">
                  <span className="text-cyan-300 font-bold">
                    DEPTH: 3,936m / 4,000m
                  </span>
                  <span className="text-3xl font-black text-[#ccff00]">
                    +4,920 PTS
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Callout */}
          <div className="px-10">
            <div className="p-6 rounded-3xl bg-[#181c28] border-2 border-cyan-400/50 flex items-center justify-between shadow-2xl">
              <span className="text-2xl font-black text-white uppercase tracking-wider">
                COULD YOU NAME A RARER BALLER?!
              </span>
              <span className="px-6 py-2 rounded-xl bg-cyan-400 text-black font-mono font-black text-sm uppercase">
                DROP IT BELOW 👇
              </span>
            </div>
          </div>

          {frame >= 275 && <ParticleExplosion startFrame={275} />}
        </div>
      </Sequence>

      {/* Outro Sequence (Frames 420 - 510 = 3.0s) */}
      <Sequence from={420} durationInFrames={90}>
        <Outro
          headline="PROVE YOUR OBSCURITY RANK"
          subheadline="SIDE NETTING • TRIVIA WHERE THE DEEPEST ANSWER WINS"
        />
      </Sequence>
    </div>
  );
};
