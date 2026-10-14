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

export const Comp3_FootballImposter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Clue entrance springs
  const clue1Spring = spring({ frame: frame - 40, fps, config: { damping: 12, stiffness: 150 } });
  const clue2Spring = spring({ frame: frame - 80, fps, config: { damping: 12, stiffness: 150 } });
  const clue3Spring = spring({ frame: frame - 120, fps, config: { damping: 12, stiffness: 150 } });
  const clue4Spring = spring({ frame: frame - 160, fps, config: { damping: 12, stiffness: 150 } });

  // Siren alert animation (Frames 200 - 300)
  const isSirenActive = frame >= 200 && frame < 300;
  const sirenFlash = isSirenActive ? Math.sin(frame * 0.4) > 0 : false;

  // Reveal spring (Frame 300)
  const revealSpring = spring({
    frame: frame - 300,
    fps,
    config: { damping: 10, stiffness: 160 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Ambience / Red Siren Lighting */}
      <div className="absolute inset-0 pitch-grid-bg opacity-30" />
      <div
        className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${
          sirenFlash
            ? 'bg-red-600/20'
            : 'bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.12)_0%,transparent_70%)]'
        }`}
      />

      {/* Main Gameplay Sequence (0 - 420 frames = 14.0s) */}
      <Sequence from={0} durationInFrames={420}>
        <div className="w-full h-full flex flex-col justify-between pb-16 relative">
          <HeaderBar modeTitle="FOOTBALL IMPOSTER" themeColor="orange" />

          {/* Top Hook Banner */}
          <div className="px-10 text-center">
            <div className="inline-block px-8 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-2xl uppercase tracking-wider shadow-[0_0_35px_rgba(239,68,68,0.6)]">
              🚨 1 OF THESE 4 STATS IS 100% FAKE!
            </div>
            <h1 className="mt-4 text-5xl font-black uppercase tracking-tight text-white">
              MYSTERY BALLER: CRISTIANO RONALDO
            </h1>
            <p className="mt-1 text-xl font-mono text-gray-400">
              Can you spot the fabricated imposter stat before time expires?
            </p>
          </div>

          {/* 4 Clue Cards */}
          <div className="px-12 flex flex-col gap-5 my-2">
            {/* Clue 1: Real */}
            {frame >= 40 && (
              <div
                style={{ transform: `scale(${clue1Spring})` }}
                className="p-6 rounded-3xl bg-[#12151e] border-2 border-white/10 flex items-center justify-between shadow-xl"
              >
                <div className="flex items-center gap-5">
                  <span className="text-4xl">🏆</span>
                  <div>
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest font-bold">
                      STAT 01
                    </span>
                    <h3 className="text-3xl font-black text-white uppercase">
                      5x Champions League Winner
                    </h3>
                  </div>
                </div>
                {frame >= 300 && (
                  <span className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold text-sm">
                    REAL ✓
                  </span>
                )}
              </div>
            )}

            {/* Clue 2: Real */}
            {frame >= 80 && (
              <div
                style={{ transform: `scale(${clue2Spring})` }}
                className="p-6 rounded-3xl bg-[#12151e] border-2 border-white/10 flex items-center justify-between shadow-xl"
              >
                <div className="flex items-center gap-5">
                  <span className="text-4xl">⚽</span>
                  <div>
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest font-bold">
                      STAT 02
                    </span>
                    <h3 className="text-3xl font-black text-white uppercase">
                      Real Madrid All-Time Top Scorer (450 Goals)
                    </h3>
                  </div>
                </div>
                {frame >= 300 && (
                  <span className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold text-sm">
                    REAL ✓
                  </span>
                )}
              </div>
            )}

            {/* Clue 3: Real */}
            {frame >= 120 && (
              <div
                style={{ transform: `scale(${clue3Spring})` }}
                className="p-6 rounded-3xl bg-[#12151e] border-2 border-white/10 flex items-center justify-between shadow-xl"
              >
                <div className="flex items-center gap-5">
                  <span className="text-4xl">🔥</span>
                  <div>
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest font-bold">
                      STAT 03
                    </span>
                    <h3 className="text-3xl font-black text-white uppercase">
                      100+ Goals For 4 Different Teams
                    </h3>
                  </div>
                </div>
                {frame >= 300 && (
                  <span className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold text-sm">
                    REAL ✓
                  </span>
                )}
              </div>
            )}

            {/* Clue 4: THE IMPOSTER */}
            {frame >= 160 && (
              <div
                style={{
                  transform: `scale(${frame >= 300 ? revealSpring : clue4Spring})`,
                }}
                className={`p-6 rounded-3xl transition-all shadow-xl flex items-center justify-between ${
                  frame >= 300
                    ? 'bg-red-950/80 border-4 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.7)]'
                    : 'bg-[#12151e] border-2 border-white/10'
                }`}
              >
                <div className="flex items-center gap-5">
                  <span className="text-4xl">{frame >= 300 ? '❌' : '🥇'}</span>
                  <div>
                    <span className="text-xs font-mono text-red-400 uppercase tracking-widest font-bold">
                      STAT 04 {frame >= 300 && '• THE IMPOSTER!'}
                    </span>
                    <h3 className="text-3xl font-black text-white uppercase">
                      Won World Cup 2018 Golden Boot
                    </h3>
                  </div>
                </div>

                {frame >= 300 ? (
                  <span className="px-4 py-2 rounded-xl bg-red-600 text-white font-mono font-black text-sm uppercase shadow-lg">
                    IMPOSTER DETECTED!
                  </span>
                ) : frame >= 200 ? (
                  <span className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 font-mono font-bold text-sm animate-pulse">
                    SUSPICIOUS ⚠️
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Suspense / Countdown Indicator */}
          <div className="flex flex-col items-center justify-center my-4">
            {frame >= 200 && frame < 300 ? (
              <CountdownRing
                startFrame={200}
                durationFrames={100}
                size={200}
              />
            ) : frame >= 300 ? (
              <div className="text-center px-8 py-4 rounded-2xl bg-red-500/10 border border-red-500/40">
                <span className="text-2xl font-mono font-bold text-red-400">
                  Harry Kane won the 2018 Golden Boot with 6 goals!
                </span>
              </div>
            ) : null}
          </div>

          {/* Bottom Callout */}
          <div className="px-10">
            <div className="p-6 rounded-3xl bg-[#181c28] border-2 border-red-500/50 flex items-center justify-between shadow-2xl">
              <span className="text-2xl font-black text-white uppercase tracking-wider">
                {frame < 300 ? 'DID YOU GUESS STAT #4?!' : '94% OF PLAYERS VOTED STAT #4! 🎯'}
              </span>
              <span className="px-6 py-2 rounded-xl bg-red-600 text-white font-mono font-black text-sm uppercase">
                {frame < 300 ? 'VOTE NOW 👇' : 'BUSTED 💥'}
              </span>
            </div>
          </div>

          {frame >= 300 && <ParticleExplosion startFrame={300} />}
        </div>
      </Sequence>

      {/* Outro Sequence (Frames 420 - 510 = 3.0s) */}
      <Sequence from={420} durationInFrames={90}>
        <Outro
          headline="PLAY FOOTBALL IMPOSTER LIVE"
          subheadline="BLUFF YOUR MATES OR EXPOSE THE IMPOSTER TOGETHER"
        />
      </Sequence>
    </div>
  );
};
