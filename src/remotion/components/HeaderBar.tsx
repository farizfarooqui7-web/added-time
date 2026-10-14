import React from 'react';
import { staticFile, Img } from 'remotion';

interface HeaderBarProps {
  modeTitle: string;
  badgeText?: string;
  themeColor?: 'volt' | 'cyan' | 'orange' | 'amber' | 'emerald';
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  modeTitle,
  badgeText = 'ADDED TIME [90+]',
  themeColor = 'orange',
}) => {
  const badgeColors = {
    volt: 'border-[#ccff00]/40 text-[#ccff00] bg-[#ccff00]/10',
    cyan: 'border-cyan-400/40 text-cyan-400 bg-cyan-400/10',
    orange: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
    amber: 'border-amber-400/40 text-amber-400 bg-amber-400/10',
    emerald: 'border-emerald-400/40 text-emerald-400 bg-emerald-400/10',
  }[themeColor];

  return (
    <div className="w-full flex items-center justify-between px-10 pt-16 pb-6 select-none z-20">
      <div className="flex items-center gap-3">
        <Img
          src={staticFile('favicon.png')}
          className="w-12 h-12 object-contain drop-shadow-[0_0_12px_rgba(255,107,0,0.5)]"
        />
        <div className="flex flex-col">
          <span className="text-2xl font-black tracking-tight text-white uppercase font-sans">
            ADDED TIME
          </span>
          <span className="text-xs font-mono tracking-widest text-orange-400 font-bold">
            {badgeText}
          </span>
        </div>
      </div>

      <div
        className={`px-4 py-1.5 rounded-full border text-xs font-mono uppercase tracking-widest font-black ${badgeColors}`}
      >
        {modeTitle}
      </div>
    </div>
  );
};
