import React, { useState } from 'react';
import type {
  LinkUpDifficulty,
  LinkUpLobbyMode,
  LinkUpMatchConfig,
  LinkUpSlotType,
} from './types';
import {
  randomizeSlotConfiguration,
  updateSlotConfiguration,
} from './puzzleEngine';
import { soundFX } from '../../utils/audio';
import {
  Bot,
  Building2,
  Crosshair,
  Globe2,
  Play,
  Shuffle,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useParty } from '../../context/PartyContext';

interface LinkUpSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchArena: (config: LinkUpMatchConfig) => void;
  initialMode?: LinkUpLobbyMode;
}

const DIFFICULTY_PRESETS: Array<{
  id: LinkUpDifficulty;
  title: string;
  badge: string;
  accent: string;
  description: string;
}> = [
  {
    id: 'Easy',
    title: 'EASY',
    badge: 'WORLD GIANTS',
    accent: 'text-[#ccff00] border-[#ccff00] bg-[#ccff00]/15',
    description: 'Elite, globally recognized clubs and top football nations.',
  },
  {
    id: 'Medium',
    title: 'MEDIUM',
    badge: 'CONTENDERS',
    accent: 'text-[#00f0ff] border-[#00f0ff] bg-[#00f0ff]/15',
    description: 'Mid-table European clubs and tier 2/3 nations.',
  },
  {
    id: 'Hard',
    title: 'HARD',
    badge: 'DEEP VAULT',
    accent: 'text-[#ff6b00] border-[#ff6b00] bg-[#ff6b00]/15',
    description: 'Niche clubs, lower divisions, and rare national teams.',
  },
];

const SLOT_OPTIONS: Array<{
  type: LinkUpSlotType;
  label: string;
  shortDesc: string;
}> = [
  { type: 'Club', label: 'CLUB', shortDesc: 'Senior career club' },
  { type: 'Nation', label: 'NATION', shortDesc: 'National team' },
  { type: 'Position', label: 'POSITION', shortDesc: 'Max 1 per puzzle' },
];

export const LinkUpSetupModal: React.FC<LinkUpSetupModalProps> = ({
  isOpen,
  onClose,
  onLaunchArena,
}) => {
  const [slotTypes, setSlotTypes] = useState<[LinkUpSlotType, LinkUpSlotType, LinkUpSlotType]>([
    'Club',
    'Club',
    'Nation',
  ]);
  const [randomizeEachRound, setRandomizeEachRound] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<LinkUpDifficulty>('Easy');

  const { party, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isSquadReady = party.isActive && party.members.length >= 2 && party.members.length <= 8;

  if (!isOpen) return null;

  const handleSlotChange = (index: 0 | 1 | 2, newType: LinkUpSlotType) => {
    soundFX.playClick(680);
    setSlotTypes((prev) => updateSlotConfiguration(prev, index, newType));
  };

  const handleShuffleSlots = () => {
    soundFX.playClick(820);
    setSlotTypes(randomizeSlotConfiguration());
  };

  const handleLaunchSolo = () => {
    soundFX.playClick(1000);
    const startSolo = () => {
      onLaunchArena({
        lobbyMode: 'solo',
        roomCode: 'SOLO_AI',
        isRoomCodeMasked: true,
        difficulty,
        slotTypes,
        randomizeSlotsEachRound: randomizeEachRound,
        totalRounds: 10,
      });
    };

    if (isGuestInParty) {
      triggerSoloEscapeHatch(startSolo, 'solo');
      return;
    }
    startSolo();
  };

  const handleQuickMatch = () => {
    soundFX.playClick(850);
    const start = () => {
      onClose();
      joinQueue('criteria-rush', 'duel');
    };
    if (isGuestInParty) {
      triggerSoloEscapeHatch(start, 'matchmaking');
      return;
    }
    start();
  };

  const handlePublicParty = () => {
    soundFX.playClick(850);
    const start = () => {
      onClose();
      joinQueue('criteria-rush', 'ffa');
    };
    if (isGuestInParty) {
      triggerSoloEscapeHatch(start, 'matchmaking');
      return;
    }
    start();
  };

  const handleSquadAction = () => {
    if (isSquadReady) {
      soundFX.playHammer();
      const config: LinkUpMatchConfig = {
        lobbyMode: 'host',
        roomCode: party.roomCode,
        isRoomCodeMasked: party.isCodeMasked,
        difficulty,
        slotTypes,
        randomizeSlotsEachRound: randomizeEachRound,
        totalRounds: 10,
        isMultiplayer: true,
      };
      launchMatch('criteria-rush', config);
      onLaunchArena(config);
    } else {
      soundFX.playClick(750);
      onClose();
      openDrawer();
    }
  };

  const renderSlotIcon = (type: LinkUpSlotType) => {
    if (type === 'Club') return <Building2 className="w-3.5 h-3.5 text-cyan-400" />;
    if (type === 'Nation') return <Globe2 className="w-3.5 h-3.5 text-emerald-400" />;
    return <Crosshair className="w-3.5 h-3.5 text-amber-400" />;
  };

  const getSlotBadgeStyle = (type: LinkUpSlotType) => {
    if (type === 'Club') return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    if (type === 'Nation') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  };

  const getOptionActiveStyle = (type: LinkUpSlotType) => {
    if (type === 'Club') return 'bg-cyan-400 text-black shadow-[0_0_12px_rgba(6,182,212,0.4)]';
    if (type === 'Nation') return 'bg-emerald-400 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)]';
    return 'bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.4)]';
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
        className="relative w-full max-w-5xl bg-[#0e111a] border border-white/10 rounded-2xl px-5 py-4 md:px-7 md:py-5 shadow-[0_30px_90px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col justify-between gap-4 max-h-[92vh] overflow-y-auto"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#a855f7] animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.9)]" />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-sans font-black text-xl md:text-2xl text-white uppercase tracking-tight leading-none">
                  THE LINK-UP
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#a855f7]/15 border border-[#a855f7]/40 text-[#c084fc] font-mono text-[10px] font-bold tracking-wider uppercase">
                  3-SLOT CAREER MATRIX
                </span>
              </div>
              <p className="text-slate-400 text-xs font-sans mt-1">
                Customize the 3 link slots, choose your difficulty tier, and launch your match pathway.
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

        {/* Guest Read-Only Advisory Banner */}
        {isGuestInParty && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-center justify-between shrink-0">
            <span>Host is configuring match...</span>
            <span className="text-[10px] uppercase font-bold text-amber-400/80">READ-ONLY</span>
          </div>
        )}

        {/* ================= 1. 3-SLOT LINK CONFIGURATION ================= */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-[#ccff00]">01.</span> 3-SLOT LINK CONFIGURATION
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isGuestInParty}
                onClick={handleShuffleSlots}
                className={`min-h-[44px] px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                  isGuestInParty
                    ? 'opacity-50 cursor-not-allowed bg-white/5 border-white/10 text-slate-500'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200 cursor-pointer active:scale-95'
                }`}
              >
                <Shuffle className="w-3 h-3 text-[#ccff00]" />
                <span>SHUFFLE SLOTS</span>
              </button>

              <button
                type="button"
                disabled={isGuestInParty}
                onClick={() => {
                  soundFX.playClick(720);
                  setRandomizeEachRound(!randomizeEachRound);
                }}
                className={`min-h-[44px] px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                  isGuestInParty
                    ? 'opacity-50 cursor-not-allowed bg-white/5 border-white/10 text-slate-500'
                    : randomizeEachRound
                    ? 'bg-[#ccff00]/15 border-[#ccff00] text-[#ccff00] shadow-[0_0_12px_rgba(204,255,0,0.2)] cursor-pointer'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 cursor-pointer'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>AUTO-RANDOMIZE EACH ROUND: {randomizeEachRound ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([0, 1, 2] as const).map((slotIdx) => {
              const currentType = slotTypes[slotIdx];
              const badgeStyle = getSlotBadgeStyle(currentType);
              return (
                <div
                  key={slotIdx}
                  className="px-3.5 py-3 rounded-xl bg-[#12151e] border border-white/10 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">
                        SLOT #{slotIdx + 1}
                      </span>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${badgeStyle}`}>
                        {renderSlotIcon(currentType)}
                        <span className="font-mono text-xs font-black uppercase tracking-wider">
                          {currentType}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {SLOT_OPTIONS.map((opt) => {
                      const isActive = currentType === opt.type;
                      const isPositionDisabled =
                        opt.type === 'Position' &&
                        slotTypes.some((t, i) => t === 'Position' && i !== slotIdx);

                      const activeStyle = getOptionActiveStyle(opt.type);

                      return (
                        <button
                          key={opt.type}
                          type="button"
                          disabled={isGuestInParty || isPositionDisabled}
                          onClick={() => handleSlotChange(slotIdx, opt.type)}
                          title={
                            isGuestInParty
                              ? 'Host is configuring match'
                              : isPositionDisabled
                              ? 'Only 1 Position slot allowed per puzzle'
                              : opt.label
                          }
                          className={`min-h-[44px] py-2 px-2 rounded-lg text-center font-mono text-[11px] font-bold uppercase transition-all flex items-center justify-center ${
                            isActive
                              ? activeStyle
                              : isGuestInParty || isPositionDisabled
                              ? 'bg-white/5 text-slate-500 opacity-40 cursor-not-allowed border border-dashed border-white/5'
                              : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 cursor-pointer'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= 2. DIFFICULTY TIER ================= */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-[#00f0ff]">02.</span> DIFFICULTY TIER
            </label>
            <span className="text-[10px] font-mono text-slate-400">
              10 ROUNDS LOCKED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DIFFICULTY_PRESETS.map((preset) => {
              const isSelected = difficulty === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => {
                    if (isGuestInParty) return;
                    soundFX.playClick(640);
                    setDifficulty(preset.id);
                  }}
                  className={`px-4 py-3 rounded-xl transition-all duration-200 border flex flex-col justify-between gap-1.5 ${
                    isGuestInParty
                      ? isSelected
                        ? 'bg-[#181e2b] border-[#ccff00]/60 opacity-80 cursor-not-allowed'
                        : 'bg-[#12151e] border-white/5 opacity-50 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#181e2b] border-[#ccff00] ring-1 ring-[#ccff00] shadow-[0_0_16px_rgba(204,255,0,0.18)] cursor-pointer'
                      : 'bg-[#12151e] border-white/10 hover:border-white/20 hover:bg-[#151924] cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans font-black text-base text-white uppercase tracking-tight">
                      {preset.title}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border uppercase tracking-wider ${preset.accent}`}
                    >
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] font-sans text-slate-400 leading-snug">
                    {preset.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= 3. GAME PATHWAYS (4 MODES) ================= */}
        <div className="space-y-2.5 pt-3 border-t border-white/10 shrink-0">
          <label className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
            03. CHOOSE MATCH PATHWAY
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Pathway 1: Solo Time Attack */}
            <button
              type="button"
              onClick={handleLaunchSolo}
              className="py-3 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 hover:border-[#ccff00]/40 text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-[#ccff00]" />
                  <span className="font-sans font-black text-xs text-white uppercase tracking-wide group-hover:text-[#ccff00]">
                    SOLO TIME ATTACK
                  </span>
                </div>
                <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#ccff00]" />
              </div>
              <p className="text-[11px] font-mono text-slate-400 leading-snug">
                Race the AI Scout across 10 reverse-seeded career link puzzles.
              </p>
            </button>

            {/* Pathway 2: 1v1 Speed Duel */}
            <button
              type="button"
              onClick={handleQuickMatch}
              className="py-3 px-3.5 rounded-xl bg-[#00f0ff]/10 hover:bg-[#00f0ff]/20 border border-[#00f0ff]/40 hover:border-[#00f0ff] text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-[#00f0ff] fill-current" />
                  <span className="font-sans font-black text-xs text-[#00f0ff] uppercase tracking-wide">
                    1v1 SPEED DUEL
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-[#00f0ff]/20 px-1.5 py-0.5 rounded text-[#00f0ff]">
                  &lt;10s
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-300 leading-snug">
                Drop-in duel queue. Pairs with online ballers or automated bot at 10s.
              </p>
            </button>

            {/* Pathway 3: 8-Player Public Party */}
            <button
              type="button"
              onClick={handlePublicParty}
              className="py-3 px-3.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/40 hover:border-purple-400 text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span className="font-sans font-black text-xs text-purple-300 uppercase tracking-wide">
                    8-PLAYER DROP-IN
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-purple-500/20 px-1.5 py-0.5 rounded text-purple-300">
                  FFA
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-300 leading-snug">
                Drop into an 8-player public speed trivia room with live players.
              </p>
            </button>

            {/* Pathway 4: Play with Squad / Guest Lock */}
            {isGuestInParty ? (
              <button
                type="button"
                disabled
                className="py-3 px-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-left flex flex-col justify-between gap-1.5 cursor-not-allowed opacity-70"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-neutral-500" />
                    <span className="font-sans font-black text-xs text-neutral-400 uppercase tracking-wide">
                      WAITING FOR HOST TO LAUNCH...
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5 text-neutral-500">
                    HOST ONLY
                  </span>
                </div>
                <p className="text-[11px] font-mono text-neutral-500 leading-snug">
                  Only the squad host can configure and launch Link-Up matches.
                </p>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSquadAction}
                className={`py-3 px-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group ${
                  isSquadReady
                    ? 'bg-amber-500/15 border-amber-400/50 hover:bg-amber-500/25'
                    : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span className="font-sans font-black text-xs text-white uppercase tracking-wide">
                      {isSquadReady ? 'LAUNCH WITH SQUAD' : 'PLAY WITH SQUAD'}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                    {isSquadReady ? `${party.members.length}/8 SQUAD` : 'PARTY DOCK'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400 leading-snug">
                  {isSquadReady
                    ? `Launch 10-round match with your ${party.members.length} squad members.`
                    : 'Open right slide-over Party Dock to invite friends (up to 8).'}
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
