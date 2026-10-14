import React from 'react';
import type { GameModeInfo } from '../types';
import { soundFX } from '../utils/audio';
import { DollarSign, Zap, Trophy, HelpCircle, Compass, ArrowUpRight } from 'lucide-react';

interface GameModeDeckProps {
  modes: GameModeInfo[];
  onSelectMode: (mode: GameModeInfo) => void;
}

export const GameModeDeck: React.FC<GameModeDeckProps> = ({ modes, onSelectMode }) => {
  const getModeIcon = (id: string, accent: string) => {
    const iconClass =
      accent === 'cyan'
        ? 'text-[#00f0ff]'
        : accent === 'gold'
        ? 'text-[#fbbf24]'
        : 'text-[#ccff00]';

    switch (id) {
      case 'auction-draft':
        return <DollarSign className={`w-5 h-5 ${iconClass}`} />;
      case 'criteria-rush':
        return <Zap className={`w-5 h-5 ${iconClass}`} />;
      case 'tally-race':
        return <Trophy className={`w-5 h-5 ${iconClass}`} />;
      case 'football-imposter':
        return <HelpCircle className={`w-5 h-5 ${iconClass}`} />;
      case 'football-wavelength':
        return <Compass className={`w-5 h-5 ${iconClass}`} />;
      default:
        return <Zap className={`w-5 h-5 ${iconClass}`} />;
    }
  };

  const getAccentTheme = (accent: string) => {
    switch (accent) {
      case 'cyan':
        return {
          hoverBorder: 'hover:border-[#00f0ff]',
          badgeText: 'text-[#00f0ff]',
          badgeBorder: 'border-[#00f0ff]/40',
          btnHover: 'group-hover:bg-[#00f0ff] group-hover:text-black group-hover:border-[#00f0ff]',
          highlightText: 'group-hover:text-[#00f0ff]',
        };
      case 'gold':
        return {
          hoverBorder: 'hover:border-[#fbbf24]',
          badgeText: 'text-[#fbbf24]',
          badgeBorder: 'border-[#fbbf24]/40',
          btnHover: 'group-hover:bg-[#fbbf24] group-hover:text-black group-hover:border-[#fbbf24]',
          highlightText: 'group-hover:text-[#fbbf24]',
        };
      default:
        return {
          hoverBorder: 'hover:border-[#ccff00]',
          badgeText: 'text-[#ccff00]',
          badgeBorder: 'border-[#ccff00]/40',
          btnHover: 'group-hover:bg-[#ccff00] group-hover:text-black group-hover:border-[#ccff00]',
          highlightText: 'group-hover:text-[#ccff00]',
        };
    }
  };

  const handleCardClick = (mode: GameModeInfo) => {
    soundFX.playClick(700);
    onSelectMode(mode);
  };

  return (
    <section id="hub" className="w-full py-6">
      {/* Clean Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 pb-3 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-[#ccff00] rounded-none inline-block" />
            <span className="font-mono text-[11px] font-bold text-[#ccff00] uppercase tracking-wider">
              PARTY ARENA
            </span>
          </div>
          <h2 className="font-athletic font-black text-3xl sm:text-4xl text-white uppercase tracking-tight">
            SELECT GAME MODE
          </h2>
        </div>

        <div className="text-xs font-mono text-neutral-400">
          5 COMPETITIVE FOOTBALL PARTY FORMATS
        </div>
      </div>

      {/* 5-Game Mode Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {modes.map((mode) => {
          const theme = getAccentTheme(mode.accent);

          return (
            <div
              key={mode.id}
              onClick={() => handleCardClick(mode)}
              className={`group relative bg-[#12151e] border border-neutral-800 ${theme.hoverBorder} transition-colors duration-150 cursor-pointer flex flex-col justify-between p-5 text-left select-none`}
            >
              <div>
                {/* 1. Header with Badge & Icon */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
                  <div className="p-1.5 bg-[#080a0f] border border-neutral-800">
                    {getModeIcon(mode.id, mode.accent)}
                  </div>

                  {/* Clean Category Badge */}
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 bg-black border ${theme.badgeBorder} ${theme.badgeText} uppercase tracking-wider`}
                  >
                    {mode.badge}
                  </span>
                </div>

                {/* 2. Title */}
                <h3
                  className={`font-athletic font-black text-2xl text-white uppercase tracking-tight ${theme.highlightText} transition-colors leading-tight mb-2`}
                >
                  {mode.title}
                </h3>

                {/* 3. Concise Description */}
                <p className="text-xs text-neutral-300 font-sans leading-relaxed mb-4">
                  {mode.desc}
                </p>
              </div>

              {/* 4. Footer Specs & CTA */}
              <div className="pt-3 border-t border-neutral-800 space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span>{mode.playerRange}</span>
                  <span>{mode.roundCount}</span>
                </div>

                <div
                  className={`w-full flex items-center justify-center gap-1 font-athletic font-black text-sm uppercase py-2 border border-neutral-700 bg-[#080a0f] text-neutral-200 ${theme.btnHover} transition`}
                >
                  <span>PLAY NOW</span>
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
