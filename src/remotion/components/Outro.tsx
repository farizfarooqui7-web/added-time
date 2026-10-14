import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, staticFile, Img } from 'remotion';

interface OutroProps {
  headline?: string;
  subheadline?: string;
}

export const Outro: React.FC<OutroProps> = ({
  headline = 'PLAY FREE IN BROWSER',
  subheadline = 'NO DOWNLOAD • MULTIPLAYER • REAL-TIME',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring animation
  const shieldScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.8 },
  });

  const textOpacity = interpolate(frame, [10, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const urlY = interpolate(frame, [20, 35], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Glowing ring pulse
  const pulseScale = interpolate(
    (frame % 30) / 30,
    [0, 0.5, 1],
    [1, 1.15, 1],
    { extrapolateRight: 'clamp' }
  );
  const pulseOpacity = interpolate(
    (frame % 30) / 30,
    [0, 0.5, 1],
    [0.6, 0.2, 0.6],
    { extrapolateRight: 'clamp' }
  );

  return (
    <div className="absolute inset-0 bg-[#080a0f] flex flex-col items-center justify-center p-12 text-white overflow-hidden select-none">
      {/* Background stadium pitch lines & ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,107,0,0.18)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 pitch-grid-bg opacity-30 pointer-events-none" />

      {/* Top Banner Tag */}
      <div
        style={{ opacity: textOpacity }}
        className="mb-8 px-6 py-2 rounded-full border border-orange-500/40 bg-orange-500/10 backdrop-blur-md text-orange-400 font-mono text-xl tracking-[0.2em] uppercase font-bold"
      >
        ⚽ THE #1 FOOTBALL TRIVIA ARENA
      </div>

      {/* Center 90+ Shield Logo with Pulsing Energy Rings */}
      <div className="relative my-10 flex items-center justify-center">
        {/* Glow halo */}
        <div
          style={{
            transform: `scale(${pulseScale * 1.3})`,
            opacity: pulseOpacity,
          }}
          className="absolute w-72 h-72 rounded-full bg-gradient-to-r from-orange-500/40 to-amber-500/40 blur-3xl pointer-events-none"
        />

        {/* Outer rotating neon ring */}
        <div
          style={{
            transform: `scale(${shieldScale}) rotate(${frame * 0.8}deg)`,
          }}
          className="w-64 h-64 rounded-full border-2 border-dashed border-orange-500/50 flex items-center justify-center pointer-events-none"
        />

        {/* Shield Image */}
        <div
          style={{
            transform: `scale(${shieldScale})`,
          }}
          className="absolute w-48 h-48 drop-shadow-[0_0_40px_rgba(255,107,0,0.6)] flex items-center justify-center"
        >
          <Img
            src={staticFile('favicon.png')}
            className="w-44 h-44 object-contain"
          />
        </div>
      </div>

      {/* Brand Title: ADDED TIME [90+] */}
      <div
        style={{ opacity: textOpacity }}
        className="text-center mt-6 flex flex-col items-center"
      >
        <div className="flex items-center gap-4">
          <span className="text-6xl font-black tracking-tight text-white uppercase font-sans">
            ADDED TIME
          </span>
          <span className="px-3.5 py-1 rounded-xl bg-orange-500 text-black font-black text-3xl font-mono shadow-[0_0_25px_rgba(255,107,0,0.8)]">
            [90+]
          </span>
        </div>

        <p className="mt-4 text-2xl font-semibold tracking-wider text-gray-400 uppercase font-sans">
          {headline}
        </p>
      </div>

      {/* Primary CTA Box */}
      <div
        style={{
          opacity: textOpacity,
          transform: `translateY(${urlY}px)`,
        }}
        className="mt-10 w-full max-w-xl mx-auto"
      >
        <div className="relative group">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-orange-500 to-amber-400 blur-lg opacity-70 animate-pulse" />
          <div className="relative px-8 py-6 rounded-2xl bg-[#0c0f17] border-2 border-orange-500/80 flex flex-col items-center justify-center text-center shadow-2xl">
            <span className="text-sm font-mono uppercase tracking-widest text-orange-400 font-bold mb-1">
              TAP LINK IN BIO OR VISIT:
            </span>
            <span className="text-4xl font-mono font-black text-white tracking-wide">
              addedtime.vercel.app
            </span>
          </div>
        </div>
      </div>

      {/* Subtext info */}
      <div
        style={{ opacity: textOpacity }}
        className="mt-8 text-center text-lg font-mono text-gray-500 tracking-wider"
      >
        {subheadline}
      </div>
    </div>
  );
};
