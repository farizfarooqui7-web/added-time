import React, { useState, useEffect } from 'react';
import type {
  RecordBooksDifficulty,
  RecordBooksMatchConfig,
  RecordBooksMetric,
  RecordBooksLobbyMode,
} from './types';
import { soundFX } from '../../utils/audio';
import {
  Bot,
  Goal,
  Users,
  X,
  Zap,
  Play,
} from 'lucide-react';
import { useParty } from '../../context/PartyContext';

interface RecordBooksSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchArena: (config: RecordBooksMatchConfig) => void;
  initialMode?: RecordBooksLobbyMode;
}

const DIFFICULTY_PRESETS: Array<{
  id: RecordBooksDifficulty;
  title: string;
  description: string;
  activeColor: string;
  titleColor: string;
}> = [
  {
    id: 'Easy',
    title: 'EASY',
    description: 'Real Madrid, Barcelona, Liverpool.',
    activeColor: 'bg-emerald-500/15 border-emerald-400 ring-1 ring-emerald-400 text-white shadow-[0_0_14px_rgba(16,185,129,0.3)]',
    titleColor: 'text-emerald-400',
  },
  {
    id: 'Medium',
    title: 'MEDIUM',
    description: 'Roma, Napoli, Ajax.',
    activeColor: 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400 text-white shadow-[0_0_14px_rgba(251,191,36,0.3)]',
    titleColor: 'text-amber-400',
  },
  {
    id: 'Hard',
    title: 'HARD',
    description: 'Leeds, Valencia, Newcastle.',
    activeColor: 'bg-rose-500/15 border-rose-500 ring-1 ring-rose-500 text-white shadow-[0_0_14px_rgba(244,63,94,0.3)]',
    titleColor: 'text-rose-400',
  },
];

export const RecordBooksSetupModal: React.FC<RecordBooksSetupModalProps> = ({
  isOpen,
  onClose,
  onLaunchArena,
}) => {
  const [metric, setMetric] = useState<RecordBooksMetric>('Goals');
  const [totalRounds] = useState<10>(10);
  const [difficulty, setDifficulty] = useState<RecordBooksDifficulty>('Medium');

  const { party, syncSetupSettings, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isHostWithMembers = party.isActive && party.isCurrentUserHost && party.members.length > 1;
  const shouldWarnPartyLeave = isGuestInParty || isHostWithMembers;
  const isSquadReady = party.isActive && party.members.length === 2;

  // Real-time synchronization of setup settings from host
  useEffect(() => {
    const pending = party.pendingSetup?.['record-books'] || party.pendingSetup?.['tally-race'];
    if (pending) {
      if (pending.metric) setMetric(pending.metric);
      if (pending.difficulty) setDifficulty(pending.difficulty);
    }
  }, [party.pendingSetup?.['record-books'], party.pendingSetup?.['tally-race']]);

  if (!isOpen) return null;

  const handleMetricChange = (val: RecordBooksMetric) => {
    soundFX.playClick(650);
    setMetric(val);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('record-books', { metric: val, difficulty });
    }
  };

  const handleDifficultyChange = (val: RecordBooksDifficulty) => {
    soundFX.playClick(650);
    setDifficulty(val);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('record-books', { metric, difficulty: val });
    }
  };

  const handleLaunchSolo = () => {
    soundFX.playClick(1000);
    const startSolo = () => {
      onLaunchArena({
        lobbyMode: 'solo',
        roomCode: 'SOLO_AI',
        isRoomCodeMasked: true,
        metric,
        difficulty,
        totalRounds,
      });
    };

    if (shouldWarnPartyLeave) {
      triggerSoloEscapeHatch(startSolo, 'solo');
      return;
    }
    startSolo();
  };

  const handleQuickMatch = () => {
    soundFX.playClick(850);
    const start = () => {
      onClose();
      joinQueue('tally-race', 'duel');
    };
    if (shouldWarnPartyLeave) {
      triggerSoloEscapeHatch(start, 'matchmaking');
      return;
    }
    start();
  };

  const handleSquadAction = () => {
    if (isSquadReady) {
      soundFX.playHammer();
      const config: RecordBooksMatchConfig = {
        lobbyMode: 'host',
        roomCode: party.roomCode,
        isRoomCodeMasked: party.isCodeMasked,
        metric,
        difficulty,
        totalRounds,
        isMultiplayer: true,
      };
      launchMatch('tally-race', config);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl bg-[#0e111a] border border-white/10 rounded-2xl px-5 py-4 md:px-7 md:py-5 shadow-[0_30px_90px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col justify-between gap-4 max-h-[92dvh] overflow-y-auto"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff9f1c] animate-pulse shadow-[0_0_10px_rgba(255,159,28,0.8)]" />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-sans font-black text-xl md:text-2xl text-white uppercase tracking-tight leading-none">
                  THE RECORD BOOKS
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#ff9f1c]/15 border border-[#ff9f1c]/40 text-[#ff9f1c] font-mono text-[10px] font-bold tracking-wider uppercase">
                  1v1 TALLY DUEL
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-1">
                Name the club&apos;s all-time stat leader to race the ticker to 50 points.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
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

        {/* 1. METRIC SELECTION */}
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-[#ff9f1c]">01.</span> TARGET STATISTIC METRIC
          </label>
          <div className="grid grid-cols-1 gap-3">
            {[
              {
                id: 'Goals',
                title: 'LEAGUE GOALS',
                desc: "Senior league goals scored for the club, as listed in each player's Wikipedia infobox.",
                icon: Goal,
              },
            ].map((m) => {
              const isSelected = metric === m.id;
              const Icon = m.icon;
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    if (isGuestInParty) return;
                    handleMetricChange(m.id as RecordBooksMetric);
                  }}
                  className={`p-3 rounded-xl transition-all duration-200 border flex flex-col justify-between gap-1.5 ${
                    isGuestInParty
                      ? isSelected
                        ? 'bg-[#181e2b] border-[#ff9f1c]/60 opacity-80 cursor-not-allowed'
                        : 'bg-[#12151e] border-white/5 opacity-50 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#181e2b] border-[#ff9f1c] ring-1 ring-[#ff9f1c] shadow-[0_0_16px_rgba(255,159,28,0.2)] cursor-pointer'
                      : 'bg-[#12151e] border-white/10 hover:border-white/20 hover:bg-[#151924] cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-[#ff9f1c]' : 'text-slate-400'}`} />
                      <span className="font-sans font-black text-xs text-white uppercase tracking-tight">
                        {m.title}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f1c] shadow-[0_0_6px_#ff9f1c]" />
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-slate-400 leading-snug">{m.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. CLUB POOL & ROUNDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
          {/* Difficulty */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-[#00f0ff]">02.</span> CLUB POOL TIER
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTY_PRESETS.map((d) => {
                const isSelected = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={isGuestInParty}
                    onClick={() => handleDifficultyChange(d.id)}
                    className={`min-h-[44px] p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isGuestInParty
                        ? isSelected
                          ? 'opacity-80 cursor-not-allowed border-white/20 bg-white/5'
                          : 'opacity-40 cursor-not-allowed border-white/5 bg-transparent'
                        : isSelected
                        ? `${d.activeColor} cursor-pointer`
                        : 'bg-[#12151e] border-white/10 text-slate-400 hover:bg-[#151924] cursor-pointer'
                    }`}
                  >
                    <span className={`font-sans font-black text-xs uppercase ${isSelected ? d.titleColor : 'text-slate-300'}`}>
                      {d.title}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500 truncate">{d.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rounds */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="text-[#ccff00]">03.</span> MATCH LENGTH
            </label>
            <div className="p-3 rounded-xl border border-white/10 bg-[#12151e] flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#ccff00] shadow-[0_0_8px_rgba(204,255,0,0.8)]" />
                <span className="font-mono text-xs font-black text-white uppercase">
                  10 CLUBS (10 ROUNDS)
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-[#ccff00] bg-[#ccff00]/10 border border-[#ccff00]/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                LOCKED
              </span>
            </div>
          </div>
        </div>

        {/* 3. GAME PATHWAYS */}
        <div className="space-y-2.5 pt-3 border-t border-white/10 shrink-0">
          <label className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
            CHOOSE MATCH PATHWAY
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Pathway 1: Solo vs AI */}
            <button
              type="button"
              onClick={handleLaunchSolo}
              className="py-3 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 hover:border-[#ff9f1c]/40 text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#ff9f1c]" />
                  <span className="font-sans font-black text-xs text-white uppercase tracking-wide group-hover:text-[#ff9f1c]">
                    SOLO VS AI SCOUT
                  </span>
                </div>
                <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#ff9f1c]" />
              </div>
              <p className="text-[11px] font-mono text-slate-400 leading-snug">
                Test your knowledge against an automated AI bot with realistic lookup time.
              </p>
            </button>

            {/* Pathway 2: 1v1 Quick Match */}
            <button
              type="button"
              onClick={handleQuickMatch}
              className="py-3 px-4 rounded-xl bg-[#ff9f1c]/10 hover:bg-[#ff9f1c]/20 border border-[#ff9f1c]/40 hover:border-[#ff9f1c] text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ff9f1c] fill-current" />
                  <span className="font-sans font-black text-xs text-[#ff9f1c] uppercase tracking-wide">
                    1v1 QUICK MATCH
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-[#ff9f1c]/20 px-1.5 py-0.5 rounded text-[#ff9f1c]">
                  &lt;10s
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-300 leading-snug">
                Ranked: 10 rounds, rising difficulty. Goals tally. Pairs with a live baller or a bot at 10s.
              </p>
            </button>

            {/* Pathway 3: Play with Squad / Guest Lock */}
            {isGuestInParty ? (
              <button
                type="button"
                disabled
                className="py-3 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-left flex flex-col justify-between gap-1.5 cursor-not-allowed opacity-70"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
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
                  Only the squad host can configure and launch Record Books matches.
                </p>
              </button>
            ) : (
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
                    {isSquadReady ? '2/2 SQUAD' : 'PARTY DOCK'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400 leading-snug">
                  {isSquadReady
                    ? 'Squad is ready. Click to duel your party partner.'
                    : 'Open the right slide-over Party Dock to invite or duel a friend.'}
                </p>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
