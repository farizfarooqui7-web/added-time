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
import { ArrowRight, Flame, Zap } from 'lucide-react';

export const Comp5_PlatformTrailer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cycling across the 5 actual BentoGrid cards:
  // Intro Hook: 0 - 60 (2.0s)
  // Card 1: $20 Auction Draft (60 - 144)
  // Card 2: The Link-Up (144 - 228)
  // Card 3: The Record Books (228 - 312)
  // Card 4: Football Imposter (312 - 396)
  // Card 5: Side Netting (396 - 480)
  // Outro: 480 - 570 (3.0s)

  let activeIndex = -1;
  let localFrame = 0;
  if (frame >= 60 && frame < 480) {
    const raw = (frame - 60) / 84;
    activeIndex = Math.min(4, Math.floor(raw));
    localFrame = (frame - 60) % 84;
  }

  const cardSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 160 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Stadium Grid from site */}
      <div className="absolute inset-0 pitch-grid-bg opacity-40 pointer-events-none" />

      {/* Main Montage Sequence (Frames 0 - 480 = 16s) */}
      <Sequence from={0} durationInFrames={480}>
        <div className="w-full h-full flex flex-col justify-between pb-12 relative">
          <HeaderBar modeTitle="5 MULTIPLAYER MODES" pillColor="#ff6b00" />

          {/* Intro Hook (Frames 0 - 60) */}
          {frame < 60 ? (
            <div className="px-10 flex flex-col items-center justify-center my-auto text-center">
              <span className="px-6 py-2.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-400 font-mono text-lg font-bold uppercase tracking-wider mb-4">
                ⚽ THE ULTIMATE FOOTBALL ARCADE
              </span>
              <h1 className="text-7xl font-black uppercase tracking-tight text-white font-athletic leading-tight">
                TIRED OF BORING
                <br />
                FOOTBALL TRIVIA?
              </h1>
              <p className="mt-4 text-2xl font-mono text-gray-400">
                5 LIVE GAME MODES • FREE IN BROWSER
              </p>
            </div>
          ) : (
            /* EXACT BENTOGRID CARDS SHOWCASE (Frames 60 - 480) */
            <div className="px-8 flex flex-col items-center justify-center my-auto w-full">
              {/* CARD 1: $20 AUCTION DRAFT */}
              {activeIndex === 0 && (
                <div
                  style={{ transform: `scale(${cardSpring})` }}
                  className="w-full relative rounded-3xl overflow-hidden bg-[#10131a] border-2 border-[#ccff00]/60 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-8 flex flex-col justify-between min-h-[580px]"
                >
                  {/* Glowing $20 Digital Watermark */}
                  <div className="absolute right-6 top-8 font-mono font-black text-9xl text-[#ccff00]/[0.08] select-none pointer-events-none">
                    $20
                  </div>

                  {/* Top Row: Micro-Pills */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#ccff00] text-black text-sm font-sans font-bold uppercase tracking-wider shadow-[0_2px_12px_rgba(204,255,0,0.4)]">
                      <Flame className="w-4 h-4 fill-black" />
                      Featured Mode
                    </span>

                    <div className="flex items-center gap-2 font-mono text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>5 Rounds • 2-Player Duel</span>
                    </div>
                  </div>

                  {/* Tactical Formation Mini-Board Preview from BentoGrid */}
                  <div className="relative z-10 my-4 p-5 rounded-2xl bg-black/50 border border-white/10 backdrop-blur-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                      <span>5-SLOT FORMATION</span>
                      <span className="text-[#ccff00] font-bold">SALARY CAP: $20.00</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center font-mono text-xs">
                      <div className="p-2.5 rounded-xl bg-[#ccff00]/20 border border-[#ccff00]/40 text-[#ccff00] font-bold">ATK</div>
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300">MID</div>
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300">MID</div>
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300">DEF</div>
                      <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">GK</div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="relative z-10">
                    <h2 className="font-athletic font-black text-6xl text-white tracking-tight uppercase mb-2">
                      $20 Auction Draft
                    </h2>
                    <p className="text-slate-300 text-lg font-sans leading-relaxed">
                      Manage your $20 bankroll across 5 rounds. Outbid your opponent to construct the ultimate 5-a-side dream squad.
                    </p>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">1v1 REAL-TIME BID WARS</span>
                    <div className="px-6 py-3 rounded-full bg-[#ccff00] text-black font-sans font-bold text-sm uppercase tracking-wide flex items-center gap-2 shadow-[0_4px_16px_rgba(204,255,0,0.3)]">
                      <span>ENTER DRAFT</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 2: THE LINK-UP */}
              {activeIndex === 1 && (
                <div
                  style={{ transform: `scale(${cardSpring})` }}
                  className="w-full relative rounded-3xl overflow-hidden bg-[#10131a] border-2 border-purple-500/60 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-8 flex flex-col justify-between min-h-[580px]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/15 via-transparent to-[#10131a] pointer-events-none" />

                  {/* Top Row */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="px-4 py-1.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-sm font-sans font-bold uppercase tracking-wider flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-400 fill-purple-400" />
                      Speed Trivia
                    </span>
                    <span className="font-mono text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                      1-8 Players • Live Party
                    </span>
                  </div>

                  {/* Visual 3-Slot Formula Matrix */}
                  <div className="relative z-10 my-4 p-5 rounded-2xl bg-black/50 border border-white/10 flex flex-col gap-2">
                    <span className="text-xs font-mono text-purple-400 uppercase tracking-widest font-bold">
                      THE 3-SLOT CAREER MATRIX
                    </span>
                    <div className="grid grid-cols-3 gap-3 text-center font-mono">
                      <div className="p-3 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold text-sm">CLUB</div>
                      <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-sm">NATION</div>
                      <div className="p-3 rounded-xl bg-[#ccff00]/20 border border-[#ccff00]/40 text-[#ccff00] font-bold text-sm">POSITION</div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="relative z-10">
                    <h2 className="font-athletic font-black text-6xl text-white tracking-tight uppercase mb-2">
                      The Link-Up
                    </h2>
                    <p className="text-slate-300 text-lg font-sans leading-relaxed">
                      Club + Nation + Position. Customize your 3-slot career matrix and lock the connecting baller before the buzzer.
                    </p>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">INSTANT AUTOCOMPLETE</span>
                    <div className="px-6 py-3 rounded-full bg-purple-600 text-white font-sans font-bold text-sm uppercase tracking-wide flex items-center gap-2 shadow-[0_4px_16px_rgba(168,85,247,0.4)]">
                      <span>PLAY SPEED DUEL</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 3: THE RECORD BOOKS */}
              {activeIndex === 2 && (
                <div
                  style={{ transform: `scale(${cardSpring})` }}
                  className="w-full relative rounded-3xl overflow-hidden bg-[#10131a] border-2 border-amber-400/60 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-8 flex flex-col justify-between min-h-[580px]"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/85 to-transparent pointer-events-none" />

                  {/* Top Row */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm font-sans font-bold uppercase tracking-wider">
                      Stat Vault
                    </span>
                    <span className="font-mono text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                      1-4 Players • Stat Clash
                    </span>
                  </div>

                  {/* Trophy & Historical Stat Preview */}
                  <div className="relative z-10 my-4 p-5 rounded-2xl bg-black/50 border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono text-amber-400 uppercase tracking-widest font-bold block">
                        RECORD TARGET:
                      </span>
                      <span className="text-2xl font-bold text-white font-athletic">
                        ALL-TIME EUROPEAN TOP SCORERS
                      </span>
                    </div>
                    <span className="text-5xl">🏆</span>
                  </div>

                  {/* Title & Description */}
                  <div className="relative z-10">
                    <h2 className="font-athletic font-black text-6xl text-white tracking-tight uppercase mb-2">
                      The Record Books
                    </h2>
                    <p className="text-slate-300 text-lg font-sans leading-relaxed">
                      Snatch Europe's all-time top goalscorers and legendary records before your opponent locks them down.
                    </p>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">HISTORICAL VAULT</span>
                    <div className="px-6 py-3 rounded-full bg-amber-400 text-black font-sans font-bold text-sm uppercase tracking-wide flex items-center gap-2 shadow-[0_4px_16px_rgba(251,191,36,0.3)]">
                      <span>OPEN THE BOOKS</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 4: FOOTBALL IMPOSTER */}
              {activeIndex === 3 && (
                <div
                  style={{ transform: `scale(${cardSpring})` }}
                  className="w-full relative rounded-3xl overflow-hidden bg-[#10131a] border-2 border-red-500/60 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-8 flex flex-col justify-between min-h-[580px]"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/85 to-transparent pointer-events-none" />

                  {/* Top Row */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="px-4 py-1.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-sm font-sans font-bold uppercase tracking-wider">
                      Social Deduction
                    </span>
                    <span className="font-mono text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                      3-8 Players • Party Game
                    </span>
                  </div>

                  {/* Tactical Clue Clash Preview */}
                  <div className="relative z-10 my-4 p-5 rounded-2xl bg-black/50 border border-white/10 flex flex-col gap-2 font-mono text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>SQUAD VOTE STATUS:</span>
                      <span className="text-red-400 font-bold">1 IMPOSTER IN SQUAD</span>
                    </div>
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-white font-sans text-sm">
                      🚨 "One player has a fake stat. Bluff your way through or expose the spy."
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="relative z-10">
                    <h2 className="font-athletic font-black text-6xl text-white tracking-tight uppercase mb-2">
                      Football Imposter
                    </h2>
                    <p className="text-slate-300 text-lg font-sans leading-relaxed">
                      One fake in the squad. Drop niche clues and spot the spy before they steal the win.
                    </p>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">VOICE / CHAT DEDUCTION</span>
                    <div className="px-6 py-3 rounded-full bg-red-500 text-white font-sans font-bold text-sm uppercase tracking-wide flex items-center gap-2 shadow-[0_4px_16px_rgba(239,68,68,0.4)]">
                      <span>SPOT THE SPY</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 5: SIDE NETTING */}
              {activeIndex === 4 && (
                <div
                  style={{ transform: `scale(${cardSpring})` }}
                  className="w-full relative rounded-3xl overflow-hidden bg-[#10131a] border-2 border-cyan-400/60 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] p-8 flex flex-col justify-between min-h-[580px]"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/80 to-transparent pointer-events-none" />

                  {/* Top Row */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="px-4 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-sm font-sans font-bold uppercase tracking-wider">
                      Obscurity Trivia
                    </span>
                    <span className="font-mono text-xs text-slate-300 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                      1-8 Players • Purist Recall
                    </span>
                  </div>

                  {/* 4,000m Depth Indicator Preview */}
                  <div className="relative z-10 my-4 p-5 rounded-2xl bg-black/50 border border-white/10 flex flex-col gap-2 font-mono text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>DEPTH TARGET:</span>
                      <span className="text-cyan-400 font-bold">4,000m (TOP BINS)</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-[#ccff00] rounded-full w-[95%]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="relative z-10">
                    <h2 className="font-athletic font-black text-6xl text-white tracking-tight uppercase mb-2">
                      Side Netting
                    </h2>
                    <p className="text-slate-300 text-lg font-sans leading-relaxed">
                      Target the rarest, most obscure answers. Deep cuts claim maximum points and Ballon d'Or glory.
                    </p>
                  </div>

                  {/* Bottom Action Pill */}
                  <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">4,000m DRILL</span>
                    <div className="px-6 py-3 rounded-full bg-cyan-400 text-black font-sans font-bold text-sm uppercase tracking-wide flex items-center gap-2 shadow-[0_4px_16px_rgba(0,240,255,0.3)]">
                      <span>AIM FOR SIDE NETTING</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Indicator for 5 Modes */}
              <div className="flex gap-4 mt-8">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-3 rounded-full transition-all duration-300 ${
                      i === activeIndex
                        ? 'w-14 bg-white shadow-lg'
                        : 'w-3.5 bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Bottom Site Callout */}
          <div className="px-8">
            <div className="p-4 rounded-2xl bg-[#12151e] border border-white/10 flex items-center justify-between">
              <span className="font-mono text-sm text-slate-300">
                ⚡ PLAY FREE IN YOUR BROWSER • NO APP DOWNLOAD
              </span>
              <span className="px-4 py-1.5 rounded-xl bg-orange-500 text-black font-mono font-black text-xs uppercase">
                INSTANT PLAY
              </span>
            </div>
          </div>

          {localFrame === 10 && <ParticleExplosion startFrame={frame} />}
        </div>
      </Sequence>

      {/* Outro (Frames 480 - 570) */}
      <Sequence from={480} durationInFrames={90}>
        <Outro
          headline="WHICH GAME MODE ARE YOU PLAYING FIRST?"
          subheadline="PLAY 100% FREE IN BROWSER • NO DOWNLOAD REQUIRED"
        />
      </Sequence>
    </div>
  );
};
