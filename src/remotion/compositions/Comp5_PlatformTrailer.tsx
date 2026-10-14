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

interface ModeCard {
  title: string;
  tagline: string;
  badge: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  features: string[];
}

const MODES: ModeCard[] = [
  {
    title: 'THE LINK-UP',
    tagline: 'Connect Club, Nation & Position into the mystery baller.',
    badge: 'DAILY GRID QUIZ',
    icon: '🔗',
    color: '#00f0ff',
    bgColor: 'from-cyan-500/20 via-[#12151e] to-[#0c0f17]',
    borderColor: 'border-cyan-400',
    features: ['3 Mystery Criteria', 'Clutch 5s Buzzer', 'Multiplayer Race'],
  },
  {
    title: 'AUCTION DRAFT',
    tagline: 'Real-time live bidding wars with friends. Manage your salary cap.',
    badge: 'LIVE BIDDING WAR',
    icon: '💰',
    color: '#fbbf24',
    bgColor: 'from-amber-500/20 via-[#12151e] to-[#0c0f17]',
    borderColor: 'border-amber-400',
    features: ['$100 Salary Cap', 'Dynamic Blind Bids', 'Instant Squad Synergy'],
  },
  {
    title: 'FOOTBALL IMPOSTER',
    tagline: 'Spot the fabricated stat before time expires. Bluff or bust.',
    badge: 'SUSPENSE BLUFF',
    icon: '🚨',
    color: '#ef4444',
    bgColor: 'from-red-600/20 via-[#12151e] to-[#0c0f17]',
    borderColor: 'border-red-500',
    features: ['4 Tactical Clues', '1 Complete Lie', 'Party Squad Voting'],
  },
  {
    title: 'SIDE NETTING',
    tagline: 'Deep dive trivia. Common answers score zero, rare ballers score thousands.',
    badge: 'OBSCURITY FLEX',
    icon: '🎯',
    color: '#ccff00',
    bgColor: 'from-[#ccff00]/20 via-[#12151e] to-[#0c0f17]',
    borderColor: 'border-[#ccff00]',
    features: ['Top-Bins Obscurity Meter', '4,000m Deep Diving', 'Ball Knower Rank'],
  },
  {
    title: 'RECORD BOOKS',
    tagline: 'Clash over legendary historical stats, streaks, and all-time records.',
    badge: 'STAT SHOWDOWN',
    icon: '📖',
    color: '#38bdf8',
    bgColor: 'from-sky-500/20 via-[#12151e] to-[#0c0f17]',
    borderColor: 'border-sky-400',
    features: ['Historical Records', 'Head-to-Head 1v1', 'Instant Club Stats'],
  },
];

export const Comp5_PlatformTrailer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Mode cycle index:
  // Intro (0 - 60)
  // Mode 1: The Link-Up (60 - 144)
  // Mode 2: Auction Draft (144 - 228)
  // Mode 3: Football Imposter (228 - 312)
  // Mode 4: Side Netting (312 - 396)
  // Mode 5: Record Books (396 - 480)
  // Outro: (480 - 570)

  let activeModeIndex = -1;
  let modeLocalFrame = 0;
  if (frame >= 60 && frame < 480) {
    const raw = (frame - 60) / 84;
    activeModeIndex = Math.min(4, Math.floor(raw));
    modeLocalFrame = (frame - 60) % 84;
  }

  const activeMode = activeModeIndex >= 0 ? MODES[activeModeIndex] : null;

  const cardSpring = spring({
    frame: modeLocalFrame,
    fps,
    config: { damping: 11, stiffness: 160 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Dynamic Background Ambience */}
      <div className="absolute inset-0 pitch-grid-bg opacity-30" />
      <div
        style={{
          backgroundColor: activeMode ? activeMode.color : '#ff6b00',
          opacity: 0.12,
        }}
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full blur-[140px] pointer-events-none transition-colors duration-500"
      />

      {/* Main Gameplay Montage Sequence (0 - 480 frames = 16.0s) */}
      <Sequence from={0} durationInFrames={480}>
        <div className="w-full h-full flex flex-col justify-between pb-16 relative">
          <HeaderBar
            modeTitle={activeMode ? activeMode.title : 'ADDED TIME ARCADE'}
            themeColor={activeModeIndex === 1 ? 'amber' : activeModeIndex === 2 ? 'orange' : activeModeIndex === 3 ? 'volt' : 'cyan'}
          />

          {/* Intro Section (Frames 0 - 60) */}
          {frame < 60 ? (
            <div className="px-10 flex flex-col items-center justify-center my-auto text-center">
              <div className="px-8 py-3 rounded-2xl bg-orange-500 text-black font-black text-2xl uppercase tracking-wider shadow-[0_0_40px_rgba(255,107,0,0.6)]">
                ⚽ TIRED OF BORING FOOTBALL TRIVIA?
              </div>
              <h1 className="mt-8 text-7xl font-black uppercase tracking-tight text-white leading-tight">
                THE ULTIMATE
                <br />
                FOOTBALL ARCADE
              </h1>
              <p className="mt-4 text-2xl font-mono text-gray-400">
                5 LIVE MULTIPLAYER MODES • PLAY FREE IN BROWSER
              </p>
            </div>
          ) : activeMode ? (
            /* Mode Showcase Card (Frames 60 - 480) */
            <div className="px-12 flex flex-col items-center justify-center my-auto">
              <div
                style={{ transform: `scale(${cardSpring})` }}
                className={`w-full p-10 rounded-[40px] bg-gradient-to-b ${activeMode.bgColor} border-4 ${activeMode.borderColor} shadow-2xl flex flex-col items-center text-center`}
              >
                {/* Mode Icon & Badge */}
                <div className="text-7xl mb-4">{activeMode.icon}</div>
                <span
                  style={{ color: activeMode.color, borderColor: activeMode.color }}
                  className="px-5 py-2 rounded-full border text-sm font-mono uppercase tracking-widest font-black bg-black/40"
                >
                  {activeMode.badge}
                </span>

                <h2 className="mt-6 text-6xl font-black text-white uppercase tracking-tight">
                  {activeMode.title}
                </h2>

                <p className="mt-4 text-2xl font-medium text-gray-300 max-w-lg">
                  {activeMode.tagline}
                </p>

                {/* Feature Pills */}
                <div className="mt-10 flex flex-col gap-3 w-full max-w-md">
                  {activeMode.features.map((feat, idx) => (
                    <div
                      key={idx}
                      className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-lg font-mono font-bold text-white"
                    >
                      <span>✓ {feat}</span>
                      <span style={{ color: activeMode.color }}>ACTIVE</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Progress Dots for 5 Modes */}
              <div className="flex gap-4 mt-8">
                {MODES.map((_, i) => (
                  <div
                    key={i}
                    className={`h-3 rounded-full transition-all duration-300 ${
                      i === activeModeIndex
                        ? 'w-12 bg-white shadow-lg'
                        : 'w-3 bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Bottom Banner */}
          <div className="px-10">
            <div className="p-6 rounded-3xl bg-[#12151e] border border-white/15 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xl font-mono text-white font-bold">
                  NO APP DOWNLOAD REQUIRED
                </span>
              </div>
              <span className="px-5 py-2 rounded-xl bg-orange-500 text-black font-black font-mono text-sm uppercase">
                FREE TO PLAY ⚡
              </span>
            </div>
          </div>

          {modeLocalFrame === 10 && <ParticleExplosion startFrame={frame} />}
        </div>
      </Sequence>

      {/* Outro Sequence (Frames 480 - 570 = 3.0s) */}
      <Sequence from={480} durationInFrames={90}>
        <Outro
          headline="WHICH GAME MODE ARE YOU PLAYING FIRST?"
          subheadline="CHALLENGE YOUR SQUAD • NO DOWNLOAD • 100% FREE"
        />
      </Sequence>
    </div>
  );
};
