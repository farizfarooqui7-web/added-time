import React, { useState, useEffect } from 'react';
import {
  Database,
  Flame,
  Layers,
  Sparkles,
  Trophy,
  FlaskConical,
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
  ImposterRolePreference,
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

  // TEMPORARY DEV SANDBOX: solo test match against bots. Remove before release.
  const [sandboxBots, setSandboxBots] = useState<3 | 4 | 5>(4);
  const [sandboxRole, setSandboxRole] = useState<ImposterRolePreference>('random');
  const [sandboxRounds, setSandboxRounds] = useState<1 | 2>(2);

  const { party, syncSetupSettings, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isHostWithMembers = party.isActive && party.isCurrentUserHost && party.members.length > 1;
  const shouldWarnPartyLeave = isGuestInParty || isHostWithMembers;
  const isSquadReady = party.isActive && party.members.length >= 3 && party.members.length <= 8;

  // Real-time synchronization of setup settings from host
  useEffect(() => {
    const pending = party.pendingSetup?.['football-imposter'];
    if (pending) {
      if (pending.category) setCategory(pending.category);
      if (pending.imposterClueEnabled !== undefined) setImposterClueEnabled(pending.imposterClueEnabled);
    }
  }, [party.pendingSetup?.['football-imposter']]);

  if (!isOpen) return null;

  const handleCategoryChange = (c: ImposterCategory) => {
    soundFX.playClick(600);
    setCategory(c);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('football-imposter', { category: c, imposterClueEnabled });
    }
  };

  const handleToggleClue = () => {
    soundFX.playClick(600);
    const nextVal = !imposterClueEnabled;
    setImposterClueEnabled(nextVal);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('football-imposter', { category, imposterClueEnabled: nextVal });
    }
  };

  // TEMPORARY DEV SANDBOX: launches a local bot match (no party / matchmaking involved).
  const isSandboxBlocked = party.isActive && party.members.length > 1;
  const handleLaunchSandbox = () => {
    if (isSandboxBlocked) return;
    soundFX.playHammer();
    onLaunchArena({
      lobbyMode: 'sandbox',
      roomCode: 'SANDBOX',
      isRoomCodeMasked: false,
      category,
      clueRounds: sandboxRounds,
      botCount: sandboxBots,
      rolePreference: sandboxRole,
      imposterClueEnabled,
      isMultiplayer: false,
    });
  };

  const handleFindPublicGame = () => {
    soundFX.playClick(850);
    const start = () => {
      onClose();
      joinQueue('football-imposter', 'ffa');
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-[#0e111a] border border-white/10 rounded-2xl px-5 py-4 md:px-7 md:py-5 shadow-[0_30px_90px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col justify-between gap-4 max-h-[92dvh] overflow-y-auto"
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

        {/* Guest Read-Only Advisory Banner */}
        {isGuestInParty && (
          <div className="relative z-10 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-center justify-between shrink-0">
            <span>Host is configuring match...</span>
            <span className="text-[10px] uppercase font-bold text-amber-400/80">READ-ONLY</span>
          </div>
        )}

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
                  disabled={isGuestInParty}
                  onClick={() => {
                    if (isGuestInParty) return;
                    handleCategoryChange(cat.id);
                  }}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                    isFullSpan ? 'sm:col-span-2' : ''
                  } ${
                    isGuestInParty
                      ? active
                        ? 'bg-[#ff2a5f]/15 border-[#ff2a5f]/60 opacity-80 cursor-not-allowed'
                        : 'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
                      : active
                      ? 'bg-[#ff2a5f]/15 border-[#ff2a5f] text-white shadow-[0_0_20px_rgba(255,42,95,0.16)] cursor-pointer'
                      : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200 cursor-pointer'
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
                  disabled={isGuestInParty}
                  onClick={() => {
                    if (isGuestInParty) return;
                    handleToggleClue();
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isGuestInParty
                      ? active
                        ? 'bg-[#ff2a5f]/15 border-[#ff2a5f]/60 opacity-80 cursor-not-allowed'
                        : 'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
                      : active
                      ? 'bg-[#ff2a5f]/15 border-[#ff2a5f] text-white shadow-[0_0_15px_rgba(255,42,95,0.2)] cursor-pointer'
                      : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200 cursor-pointer'
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
                2 clue rounds • imposter hint on • random roles. Well-known secret player, random category. Starts at 3 players.
              </p>
            </button>

            {/* Pathway 2: Play with Squad / Guest Lock */}
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
                  Only the squad host can configure and launch Imposter matches.
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
                    {isSquadReady ? `${party.members.length}/8 SQUAD` : '3-8 PLAYERS'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400 leading-snug">
                  {isSquadReady
                    ? `Your squad has ${party.members.length} ballers. Click to launch Imposter room!`
                    : 'Requires 3-8 players. Open the Party Dock to invite squad teammates.'}
                </p>
              </button>
            )}
          </div>
        </div>

        {/* TEMPORARY DEV SANDBOX — remove before release */}
        <div className="relative z-10 mt-3 p-3 rounded-xl border border-dashed border-[#ccff00]/45 bg-[#ccff00]/[0.04] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#ccff00]" />
              <span className="font-sans font-black text-xs text-[#ccff00] uppercase tracking-wide">DEV SANDBOX</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#ccff00]/15 text-[#ccff00]">TEMPORARY</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Solo test vs bots</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block">BOTS</span>
              <div className="flex gap-1">
                {([3, 4, 5] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      soundFX.playClick(650);
                      setSandboxBots(n);
                    }}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-mono font-black border cursor-pointer transition-colors ${
                      sandboxBots === n ? 'bg-[#ccff00] text-black border-[#ccff00]' : 'bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/[0.08]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block">YOUR ROLE</span>
              <div className="flex gap-1">
                {([
                  ['random', 'RND'],
                  ['crew', 'CREW'],
                  ['imposter', 'IMP'],
                ] as Array<[ImposterRolePreference, string]>).map(([r, label]) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      soundFX.playClick(650);
                      setSandboxRole(r);
                    }}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-mono font-black border cursor-pointer transition-colors ${
                      sandboxRole === r ? 'bg-[#ccff00] text-black border-[#ccff00]' : 'bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/[0.08]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider block">CLUE ROUNDS</span>
              <div className="flex gap-1">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      soundFX.playClick(650);
                      setSandboxRounds(n);
                    }}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-mono font-black border cursor-pointer transition-colors ${
                      sandboxRounds === n ? 'bg-[#ccff00] text-black border-[#ccff00]' : 'bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/[0.08]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLaunchSandbox}
            disabled={isSandboxBlocked}
            className="w-full py-2.5 rounded-lg bg-[#ccff00] hover:bg-[#d8ff33] disabled:opacity-40 disabled:cursor-not-allowed text-black font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            {isSandboxBlocked ? 'LEAVE YOUR SQUAD TO USE SANDBOX' : `LAUNCH SANDBOX • YOU + ${sandboxBots} BOTS`}
          </button>
        </div>
      </div>
    </div>
  );
};
