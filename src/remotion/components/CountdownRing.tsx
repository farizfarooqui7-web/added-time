import React from 'react';
import { useCurrentFrame } from 'remotion';

interface CountdownRingProps {
  startFrame: number;
  durationFrames: number;
  size?: number;
  secondsDisplay?: number;
}

export const CountdownRing: React.FC<CountdownRingProps> = ({
  startFrame,
  durationFrames,
  size = 180,
  secondsDisplay,
}) => {
  const currentFrame = useCurrentFrame();
  const progress = Math.max(0, Math.min(1, (currentFrame - startFrame) / durationFrames));

  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * progress;

  const currentSec =
    secondsDisplay !== undefined
      ? secondsDisplay
      : Math.max(0, Math.ceil((1 - progress) * (durationFrames / 30)));

  // Pulse when under 2 seconds
  const isEmergency = currentSec <= 2;
  const ringColor = isEmergency ? '#ef4444' : progress > 0.6 ? '#f59e0b' : '#ccff00';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1e2538"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          style={{
            filter: `drop-shadow(0 0 10px ${ringColor})`,
            transition: 'stroke 0.2s',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-mono font-black text-5xl tracking-tighter ${
            isEmergency ? 'text-red-500 scale-110 animate-pulse' : 'text-white'
          }`}
        >
          {currentSec}s
        </span>
        <span className="text-[11px] font-mono uppercase tracking-widest text-gray-400 font-bold -mt-1">
          TIMER
        </span>
      </div>
    </div>
  );
};
