import React, { useState } from 'react';
import {
  Database,
  Flame,
  Layers,
  Sparkles,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useParty } from '../../context/PartyContext';
import { soundFX } from '../../utils/audio';
import type {
  ImposterCategory,
  ImposterLobbyMode,
  ImposterMatchConfig,
} from './types';

interface ImposterSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchArena: (config: ImposterMatchConfig) => void;
  initialMode?: ImposterLobbyMode;
}

const CATEGORIES: Array<{
  id: ImposterCategory;
  desc: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'All Players',
    desc: 'Every single footballer across the full database',
    icon: <Database className="w-3.5 h-3.5 text-[#ff2a5f]" />,
  },
  {
    id: 'All-Time Legends',
    desc: 'Iconic legends and historic world-class greats',
    icon: <Trophy className="w-3.5 h-3.5 text-[#ff2a5f]" />,
  },
  {
    id: 'Modern Superstars',
    desc: 'Global superstars across European top leagues',
    icon: <Flame className="w-3.5 h-3.5 text-[#ff2a5f]" />,
  },
  {
    id: 'Premier League Icons',
    desc: 'Premier League legends, stars, and fan favorites',
    icon: <Sparkles className="w-3.5 h-3.5 text-[#ff2a5f]" />,
  },
  {
    id: 'Cult Heroes',
    desc: 'Niche ballers, mavericks, and cult favorites',
    icon: <Layers className="w-3.5 h-3.5 text-[#ff2a5f]" />,
  },
];

export const ImposterSetupModal: React.FC<ImposterSetupModalProps> = ({
  isOpen,
  onClose,
  onLaunchArena,
}) => {
  const [category, setCategory] = useState<ImposterCategory>('All Players');
  const [imposterClueEnabled, setImposterClueEnabled] = useState<boolean>(true);

  const { party, openDrawer, joinQueue, launchMatch } = useParty();
  const isSquadReady = party.isActive && party.members.length >= 3 && party.members.length <= 8;

  if (!isOpen) return null;

  const handleFindPublicGame = () => {
    soundFX.playClick(850);
    onClose();
    joinQueue('football-imposter', 'ffa');
  };

  const handleSquadAction = () => {
    if (isSquadReady) {
      soundFX.playHammer();
      const config: ImposterMatchConfig = {
        lobbyMode: 'host',
        roomCode: party.roomCode,
        isRoomCodeMasked: party.isCodeMasked,
        category,
        clueRounds: 2,
        botCount: 4,
        rolePreference: 'random',
        imposterClueEnabled,
        isMultiplayer: true,
      };
      launchMatch('football-imposter', config);
      onLaunchArena(config);
    } else {
      soundFX.playClick(750);
      onClose();
      openDrawer();
    }
  };

  return (
    <div
      onClick={() => {
        soundFX.playClick(500);
        onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#0e111a] border border-white/10 rounded-2xl px-5 py-4 md:px-7 md:py-5 shadow-[0_30px_90px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col justify-between gap-4 max-h-[92vh] overflow-y-auto"
      >
        {/* Ambient Top Crimson Glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-40 rounded-full blur-3xl opacity-35"
          style={{
            background: 'radial-gradient(circle, rgba(255, 42, 95, 0.55), transparent 70%)',
          }}
        />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff2a5f] animate-pulse shadow-[0_0_10px_rgba(255,42,95,0.9)]" />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-sans font-black text-xl md:text-2xl text-white uppercase tracking-tight leading-none">
                  FOOTBALL IMPOSTER
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#ff2a5f]/15 border border-[#ff2a5f]/40 text-[#ff2a5f] font-mono text-[10px] font-bold tracking-wider uppercase">
                  SOCIAL DEDUCTION
                </span>
              </div>
              <p className="text-slate-400 text-xs font-sans mt-1">
                Spot the spy in the squad or bluff your way through without getting caught.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick(500);
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Category Presets */}
        <div className="relative z-10 space-y-2 shrink-0">
          <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-[#ff2a5f]">01.</span> PLAYER POOL CATEGORY
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CATEGORIES.map((cat, index) => {
              const active = category === cat.id;
              const isFullSpan = index === 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    soundFX.playClick(620);
                    setCategory(cat.id);
                  }}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isFullSpan ? 'sm:col-span-2' : ''
                  } ${
                    active
                      ? 'bg-[#ff2a5f]/15 border-[#ff2a5f] text-white shadow-[0_0_20px_rgba(255,42,95,0.16)]'
                      : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    {cat.icon}
                    <span className="font-sans font-black text-xs uppercase tracking-wide text-white">
                      {cat.id}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                    {cat.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Imposter Clue Setting */}
        <div className="relative z-10 space-y-2 shrink-0">
          <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-[#ff2a5f]">02.</span> IMPOSTER CLUE ASSISTANCE
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: true, label: '1 CLUE', sub: 'Single subtle hint for imposter' },
              { val: false, label: 'DISABLED', sub: 'Zero clues (hardcore mode)' },
            ].map((opt) => {
              const active = imposterClueEnabled === opt.val;
              return (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() => {
                    soundFX.playClick(650);
                    setImposterClueEnabled(opt.val);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-[#ff2a5f]/15 border-[#ff2a5f] text-white shadow-[0_0_15px_rgba(255,42,95,0.2)]'
                      : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200'
                  }`}
                >
                  <div className="font-sans font-black text-xs uppercase text-white">
                    {opt.label}
                  </div>
                  <span className="text-[10px] font-mono text-neutral-400 block mt-0.5">
                    {opt.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Match Pathways */}
        <div className="relative z-10 space-y-2.5 pt-3 border-t border-white/10 shrink-0">
          <label className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
            03. CHOOSE MATCH PATHWAY
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Pathway 1: Find Public Game */}
            <button
              type="button"
              onClick={handleFindPublicGame}
              className="py-3 px-4 rounded-xl bg-[#ff2a5f]/10 hover:bg-[#ff2a5f]/20 border border-[#ff2a5f]/40 hover:border-[#ff2a5f] text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ff2a5f] fill-current" />
                  <span className="font-sans font-black text-xs text-[#ff2a5f] uppercase tracking-wide">
                    FIND PUBLIC GAME
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-[#ff2a5f]/20 px-1.5 py-0.5 rounded text-[#ff2a5f]">
                  3-8 FFA
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-300 leading-snug">
                Drop into public matchmaking staging to play with online ballers or bots.
              </p>
            </button>

            {/* Pathway 2: Play with Squad */}
            <button
              type="button"
              onClick={handleSquadAction}
              className={`py-3 px-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group ${
                isSquadReady
                  ? 'bg-amber-500/15 border-amber-400/50 hover:bg-amber-500/25'
                  : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="font-sans font-black text-xs text-white uppercase tracking-wide">
                    {isSquadReady ? 'LAUNCH WITH SQUAD' : 'PLAY WITH SQUAD'}
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                  {isSquadReady ? `${party.members.length}/8 SQUAD` : '3-8 PLAYERS'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 leading-snug">
                {isSquadReady
                  ? `Your squad has ${party.members.length} ballers. Click to launch Imposter room!`
                  : 'Requires 3-8 players. Open the Party Dock to invite squad teammates.'}
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
