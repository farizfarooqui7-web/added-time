import React from 'react';
import {
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
  Img,
} from 'remotion';
import { HeaderBar } from '../components/HeaderBar';
import { ParticleExplosion } from '../components/ParticleExplosion';
import { Outro } from '../components/Outro';
import { ChevronRight } from 'lucide-react';

export const Comp4_SideNettingFlex: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Guesses:
  // Guess 1 (Frame 40-120): "Cesc Fàbregas" -> Tap-In Zone (350m / 5 PTS)
  // Guess 2 (Frame 120-220): "Olivier Giroud" -> Starter Box (1,200m / 20 PTS)
  // Guess 3 (Frame 220-330): "Lassana Diarra" -> BALLON D'OR / 3,920m / 100 PTS TOP BINS!
  // Final flex showcase (Frame 330-420)
  // Outro (Frame 420-510)

  let activePlayer = 'Cesc Fàbregas';
  let activeDepth = 350;
  let activeTier = '6-YARD TAP-IN';
  let tierColor = '#94a3b8';
  let points = 5;

  if (frame >= 120 && frame < 220) {
    activePlayer = 'Olivier Giroud';
    activeDepth = 1200;
    activeTier = 'STARTER DRILL';
    tierColor = '#fbbf24';
    points = 20;
  } else if (frame >= 220) {
    activePlayer = 'Lassana Diarra';
    activeDepth = 3920;
    activeTier = "BALLON D'OR SIDE NETTING";
    tierColor = '#ccff00';
    points = 100;
  }

  const depthNormalized = Math.min(1, activeDepth / 4000);
  const isTopBins = frame >= 240;

  const topBinsSpring = spring({
    frame: frame - 240,
    fps,
    config: { damping: 9, stiffness: 220 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080d14] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Stadium Grid & Neon Beams */}
      <div className="absolute inset-0 pitch-grid-bg opacity-35 pointer-events-none" />
      <div
        className="absolute -top-20 -left-20 w-[600px] h-[600px] pointer-events-none opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(0,240,255,0.45) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute -top-20 -right-20 w-[600px] h-[600px] pointer-events-none opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(204,255,0,0.35) 0%, transparent 70%)',
        }}
      />

      {/* Main Arena Sequence (Frames 0 - 420 = 14s) */}
      <Sequence from={0} durationInFrames={420}>
        <div className="w-full h-full flex flex-col justify-between pb-12 relative">
          <HeaderBar modeTitle="SIDE NETTING • DEEP DIVE" pillColor="#00f0ff" />

          {/* TikTok Hook Header */}
          <div className="px-8 pt-4 text-center">
            <span className="inline-block px-5 py-2 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-mono text-base font-bold uppercase tracking-wider mb-2">
              🎯 OBSCURITY TRIVIA ARENA
            </span>
            <h1 className="text-5xl font-black uppercase tracking-tight text-white font-athletic">
              COMMON ANSWERS SCORE 5 PTS • DEEP CUTS SCORE 100!
            </h1>
          </div>

          {/* EXACT SITE TOP HUD BAR (from SideNettingArena.tsx) */}
          <div className="mx-8 p-4 rounded-2xl bg-[#0a0e17]/90 border border-white/10 flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-sm font-bold text-white tracking-wider">
                ROUND 01 / 05
              </span>
            </div>

            <div className="flex items-center gap-2 bg-[#060910] px-4 py-2 rounded-xl border border-white/10">
              <span className="text-xs font-mono text-slate-400">DEPTH TELEMETRY:</span>
              <span className="font-mono text-base font-black text-cyan-400">
                {activeDepth}m / 4,000m
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-sm">
              <span className="text-slate-400">SCORE:</span>
              <span className="font-black text-[#ccff00] text-lg">
                {points} PTS
              </span>
            </div>
          </div>

          {/* QUESTION PROMPT CARD (Exact site prompt style) */}
          <div className="mx-8 p-6 rounded-3xl bg-[#10141f] border-2 border-cyan-400/40 shadow-2xl flex flex-col items-center text-center">
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-widest mb-1">
              TRIVIA DRILL PROMPT
            </span>
            <h2 className="text-4xl font-athletic font-black text-white uppercase tracking-tight">
              NAME A PLAYER WHO PLAYED FOR ARSENAL & CHELSEA
            </h2>
            <p className="mt-1 text-sm font-mono text-slate-400">
              Aim for the side netting. Common players score near zero.
            </p>
          </div>

          {/* CENTER PITCH TRAINING ARENA WITH ACTUAL 3D ASSETS */}
          <div className="mx-8 p-6 rounded-3xl bg-[#070b14]/90 border border-white/15 flex flex-col gap-4 relative overflow-hidden shadow-2xl">
            {/* Background 3D Equipment Sprites */}
            <div className="absolute top-4 left-6 opacity-60 pointer-events-none">
              <Img src={staticFile('assets/training_cone_3d.png')} className="w-12 h-14 object-contain" />
            </div>
            <div className="absolute top-4 right-6 opacity-60 pointer-events-none">
              <Img src={staticFile('assets/training_bib_3d.png')} className="w-12 h-12 object-contain" />
            </div>
            <div className="absolute bottom-4 left-8 opacity-60 pointer-events-none">
              <Img src={staticFile('assets/whistle_3d.png')} className="w-8 h-8 object-contain" />
            </div>

            {/* Answer Display */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest block">
                  LOCKED ANSWER:
                </span>
                <span className="text-4xl font-athletic font-black text-white uppercase mt-0.5 block">
                  {activePlayer}
                </span>
              </div>
              <div
                style={{
                  transform: isTopBins ? `scale(${topBinsSpring})` : 'scale(1)',
                }}
                className={`px-4 py-2 rounded-2xl border font-mono font-black text-sm uppercase ${
                  isTopBins
                    ? 'bg-[#ccff00] text-black border-[#ccff00] shadow-[0_0_25px_rgba(204,255,0,0.8)]'
                    : 'bg-white/10 text-white border-white/20'
                }`}
              >
                {activeTier}
              </div>
            </div>

            {/* Depth Progress Slalom Meter */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-xs text-slate-400">
                <span>6-YARD (0m)</span>
                <span>18-YARD (1,500m)</span>
                <span>CENTER CIRCLE (2,800m)</span>
                <span className="text-[#ccff00] font-bold">TOP BINS (4,000m)</span>
              </div>

              <div className="w-full h-8 rounded-full bg-black/70 border-2 border-white/20 overflow-hidden relative p-1">
                <div
                  style={{
                    width: `${depthNormalized * 100}%`,
                    backgroundColor: tierColor,
                  }}
                  className="h-full rounded-full transition-all duration-300 shadow-[0_0_20px_rgba(0,240,255,0.8)]"
                />
              </div>

              <div className="flex justify-between items-center text-sm font-mono mt-1">
                <span className="text-cyan-300 font-bold">
                  TRAJECTORY DEPTH: {activeDepth}m / 4,000m
                </span>
                <span className="font-black text-2xl" style={{ color: tierColor }}>
                  +{points} PTS
                </span>
              </div>
            </div>

            {/* Top Bins Golden Goal Stamp */}
            {isTopBins && (
              <div className="mt-2 p-4 rounded-2xl bg-gradient-to-r from-yellow-500/20 via-[#ccff00]/20 to-yellow-500/20 border-2 border-[#ccff00] flex items-center justify-between shadow-[0_0_35px_rgba(204,255,0,0.4)]">
                <div className="flex items-center gap-3">
                  <Img src={staticFile('assets/trophy_3d.png')} className="w-10 h-10 object-contain" />
                  <div>
                    <span className="font-athletic font-black text-2xl text-white uppercase block">
                      BALLON D'OR SIDE NETTING!
                    </span>
                    <span className="text-xs font-mono text-yellow-300 font-bold">
                      98.4% OBSCURITY • MAXIMUM PURIST RECALL 👑
                    </span>
                  </div>
                </div>
                <span className="px-4 py-1.5 rounded-xl bg-[#ccff00] text-black font-mono font-black text-sm">
                  100 PTS
                </span>
              </div>
            )}
          </div>

          {/* Action Input Bar */}
          <div className="px-8">
            <div className="p-4 rounded-2xl bg-[#10141f] border border-white/10 flex items-center justify-between">
              <span className="text-lg font-mono text-slate-300">
                {isTopBins ? '👑 CERTIFIED BALL KNOWER STATUS' : 'CAN YOU HIT THE 4,000m ZONE?!'}
              </span>
              <div className="px-5 py-2.5 rounded-xl bg-cyan-400 text-black font-sans font-black text-xs uppercase tracking-wider flex items-center gap-1 shadow-lg">
                <span>SUBMIT GUESS</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {isTopBins && <ParticleExplosion startFrame={240} />}
        </div>
      </Sequence>

      {/* Outro (Frames 420 - 510) */}
      <Sequence from={420} durationInFrames={90}>
        <Outro
          headline="TEST YOUR OBSCURITY KNOWLEDGE"
          subheadline="SIDE NETTING • TRIVIA WHERE THE DEEPEST ANSWER WINS"
        />
      </Sequence>
    </div>
  );
};
