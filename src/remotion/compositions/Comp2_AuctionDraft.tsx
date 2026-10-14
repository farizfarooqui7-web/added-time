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

export const Comp2_AuctionDraft: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Budget calculations
  // Frame 0-60: $20.00
  // Frame 60-160: Lot 1 (Erling Haaland -$9.00 -> $11.00)
  // Frame 160-260: Lot 2 (Kevin De Bruyne -$7.00 -> $4.00)
  // Frame 260-360: Lot 3 Bargain (Cole Palmer -$3.50 -> $0.50)
  // Frame 360-450: Squad Completed Showcase + Rate 1-10 CTA
  // Frame 450-540: Outro

  let currentBudget = 20.0;
  if (frame >= 100 && frame < 200) {
    const p = Math.min(1, (frame - 100) / 20);
    currentBudget = 20.0 - 9.0 * p;
  } else if (frame >= 200 && frame < 300) {
    const p = Math.min(1, (frame - 200) / 20);
    currentBudget = 11.0 - 7.0 * p;
  } else if (frame >= 300) {
    const p = Math.min(1, (frame - 300) / 20);
    currentBudget = 4.0 - 3.5 * p;
  }

  // Springs for cards
  const lot1Spring = spring({
    frame: frame - 50,
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const lot2Spring = spring({
    frame: frame - 150,
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const lot3Spring = spring({
    frame: frame - 250,
    fps,
    config: { damping: 12, stiffness: 150 },
  });
  const squadRevealSpring = spring({
    frame: frame - 360,
    fps,
    config: { damping: 10, stiffness: 140 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Ambience */}
      <div className="absolute inset-0 pitch-grid-bg opacity-30" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[850px] bg-gradient-to-br from-amber-500/15 via-transparent to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Main Gameplay Sequence (0 - 450 frames = 15.0s) */}
      <Sequence from={0} durationInFrames={450}>
        <div className="w-full h-full flex flex-col justify-between pb-16 relative">
          <HeaderBar modeTitle="AUCTION DRAFT" themeColor="amber" />

          {/* Top Hook Banner */}
          <div className="px-10 text-center">
            <div className="inline-block px-8 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black text-2xl uppercase tracking-wider shadow-[0_0_30px_rgba(245,158,11,0.5)]">
              💰 $20 BUDGET SQUAD BUILDER CHALLENGE!
            </div>
            <h1 className="mt-5 text-5xl font-black uppercase tracking-tight text-white">
              BUILD THE ULTIMATE ATTACK
            </h1>
            <p className="mt-1 text-xl font-mono text-gray-400">
              Real-time bids • Can you stay under the cap?
            </p>
          </div>

          {/* Floating Live Budget HUD */}
          <div className="mx-12 p-6 rounded-3xl bg-[#12151e]/90 border-2 border-amber-500/60 shadow-[0_0_40px_rgba(245,158,11,0.3)] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
                REMAINING SALARY CAP
              </span>
              <span className="text-6xl font-mono font-black text-white tracking-tight">
                ${currentBudget.toFixed(2)}
              </span>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
                BUDGET USED
              </span>
              <span className="text-3xl font-mono font-black text-amber-400">
                ${(20 - currentBudget).toFixed(2)} / $20.00
              </span>
            </div>
          </div>

          {/* Player Lots Timeline */}
          {frame < 360 ? (
            <div className="px-12 flex flex-col gap-6 my-2">
              {/* Lot 1: Haaland */}
              {frame >= 50 && (
                <div
                  style={{ transform: `scale(${lot1Spring})` }}
                  className="p-6 rounded-3xl bg-[#181c28] border-2 border-cyan-400/60 flex items-center justify-between shadow-2xl"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-3xl font-black text-cyan-300">
                      ST
                    </div>
                    <div>
                      <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
                        LOT #01 • MAN CITY
                      </span>
                      <h3 className="text-4xl font-black text-white uppercase">
                        ERLING HAALAND
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-gray-400 uppercase">
                      WINNING BID
                    </span>
                    <div className="text-3xl font-mono font-black text-[#ccff00]">
                      -$9.00
                    </div>
                  </div>
                </div>
              )}

              {/* Lot 2: De Bruyne */}
              {frame >= 150 && (
                <div
                  style={{ transform: `scale(${lot2Spring})` }}
                  className="p-6 rounded-3xl bg-[#181c28] border-2 border-amber-400/60 flex items-center justify-between shadow-2xl"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-3xl font-black text-amber-300">
                      CAM
                    </div>
                    <div>
                      <span className="text-xs font-mono text-amber-400 font-bold uppercase tracking-wider">
                        LOT #02 • MAN CITY
                      </span>
                      <h3 className="text-4xl font-black text-white uppercase">
                        KEVIN DE BRUYNE
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-gray-400 uppercase">
                      WINNING BID
                    </span>
                    <div className="text-3xl font-mono font-black text-[#ccff00]">
                      -$7.00
                    </div>
                  </div>
                </div>
              )}

              {/* Lot 3: The Bargain Pick */}
              {frame >= 250 && (
                <div
                  style={{ transform: `scale(${lot3Spring})` }}
                  className="p-6 rounded-3xl bg-gradient-to-r from-emerald-500/20 to-[#181c28] border-2 border-emerald-400 flex items-center justify-between shadow-[0_0_35px_rgba(52,211,153,0.3)]"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/30 border border-emerald-400 flex items-center justify-center text-3xl font-black text-emerald-300">
                      RW
                    </div>
                    <div>
                      <span className="text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider">
                        🔥 BARGAIN SNIPE • CHELSEA
                      </span>
                      <h3 className="text-4xl font-black text-white uppercase">
                        COLE PALMER
                      </h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-emerald-400 uppercase font-bold">
                      CLUTCH SNIPE
                    </span>
                    <div className="text-3xl font-mono font-black text-emerald-300">
                      -$3.50
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Squad Completed Final Showcase (Frames 360-450) */
            <div
              style={{ transform: `scale(${squadRevealSpring})` }}
              className="mx-10 p-8 rounded-3xl bg-gradient-to-b from-[#181c28] to-[#10131c] border-2 border-[#ccff00] shadow-[0_0_60px_rgba(204,255,0,0.4)] flex flex-col items-center text-center"
            >
              <span className="px-5 py-2 rounded-full bg-[#ccff00] text-black font-black text-sm uppercase tracking-widest font-mono">
                🏆 SQUAD ASSEMBLED UNDER BUDGET!
              </span>

              <h2 className="mt-4 text-5xl font-black text-white uppercase tracking-tight">
                HAALAND • KDB • PALMER
              </h2>

              <div className="mt-4 flex gap-6 text-xl font-mono text-gray-300">
                <span>TOTAL SPENT: <strong className="text-white">$19.50</strong></span>
                <span>•</span>
                <span>SURPLUS: <strong className="text-[#ccff00]">+$0.50</strong></span>
              </div>

              <div className="mt-8 px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-amber-300 uppercase tracking-wide">
                👇 RATE THIS SQUAD 1–10 IN THE COMMENTS!
              </div>
            </div>
          )}

          {/* Bottom Prompt Bar */}
          <div className="px-10">
            <div className="p-5 rounded-2xl bg-[#12151e] border border-white/10 flex items-center justify-between text-gray-400 text-lg font-mono">
              <span>{frame < 360 ? '⚡ LIVE AUCTION CLOCK TICKING...' : '👑 DRAFT WINNER VERIFIED'}</span>
              <span className="text-white font-bold">{frame < 360 ? '3/3 PICKS COMPLETED' : 'FINAL RATINGS: 9.8/10'}</span>
            </div>
          </div>

          {frame >= 300 && frame < 360 && <ParticleExplosion startFrame={300} />}
          {frame >= 360 && <ParticleExplosion startFrame={360} />}
        </div>
      </Sequence>

      {/* Outro Sequence (Frames 450 - 540 = 3.0s) */}
      <Sequence from={450} durationInFrames={90}>
        <Outro
          headline="PLAY LIVE AUCTION DRAFTS"
          subheadline="OUT-BID YOUR FRIENDS & BUILD SQUADS IN REAL-TIME"
        />
      </Sequence>
    </div>
  );
};
