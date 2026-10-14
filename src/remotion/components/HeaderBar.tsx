import React from 'react';
import { staticFile, Img } from 'remotion';

interface HeaderBarProps {
  modeTitle?: string;
  pillColor?: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  modeTitle,
  pillColor = '#ccff00',
}) => {
  return (
    <header className="w-full px-10 pt-14 pb-4 flex items-center justify-between border-b border-white/10 bg-[#080a0f]/95 select-none z-30">
      {/* Exact BroadcastHeader branding */}
      <div className="flex items-center gap-3">
        <Img
          src={staticFile('favicon.png')}
          className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(255,107,0,0.5)]"
        />
        <div className="flex items-center gap-2.5">
          <span className="font-athletic font-black text-3xl tracking-tight uppercase text-white whitespace-nowrap">
            ADDED TIME
          </span>
          <div className="flex items-center px-2 py-0.5 rounded bg-[#0a0d14] border-2 border-[#ff6b00] shadow-[0_0_16px_rgba(255,107,0,0.55)] shrink-0">
            <span className="font-mono text-xs font-black tracking-tight text-[#ff6b00]">
              90+
            </span>
          </div>
        </div>
      </div>

      {/* Mode / Live indicator pill */}
      {modeTitle && (
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12151e] border border-white/10 shadow-sm">
          <span
            style={{ backgroundColor: pillColor }}
            className="w-2 h-2 rounded-full animate-pulse"
          />
          <span className="font-mono text-xs font-black tracking-wider text-white uppercase">
            {modeTitle}
          </span>
        </div>
      )}
    </header>
  );
};
