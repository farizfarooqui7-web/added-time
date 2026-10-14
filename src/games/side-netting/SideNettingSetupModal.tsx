import React, { useState } from 'react';
import {
  Play,
  Sparkles,
  Target,
  X,
  Users,
  Zap,
} from 'lucide-react';
import type { SideNettingMatchConfig } from './types';
import { soundFX } from '../../utils/audio';
import { useParty } from '../../context/PartyContext';

interface SideNettingSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchArena: (config: SideNettingMatchConfig) => void;
}

export const SideNettingSetupModal: React.FC<SideNettingSetupModalProps> = ({
  isOpen,
  onClose,
  onLaunchArena,
}) => {
  const [timerSeconds, setTimerSeconds] = useState<30 | 45 | 60 | 0>(45);

  const { party, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isSquadReady = party.isActive && party.members.length >= 2;

  if (!isOpen) return null;

  const handleLaunchSolo = () => {
    soundFX.playClick(1000);
    const startSolo = () => {
      onLaunchArena({
        roundCount: 10,
        timerSeconds,
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
    const startQuickMatch = () => {
      onClose();
      joinQueue('side_netting', 'duel');
    };

    if (isGuestInParty) {
      triggerSoloEscapeHatch(startQuickMatch, 'matchmaking');
      return;
    }
    startQuickMatch();
  };

  const handleSquadAction = () => {
    if (isSquadReady) {
      soundFX.playHammer();
      const config: SideNettingMatchConfig = {
        roundCount: 10,
        timerSeconds,
        isMultiplayer: true,
      };
      launchMatch('side_netting', config);
      onLaunchArena(config);
    } else {
      soundFX.playClick(750);
      onClose();
      openDrawer();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-[32px] bg-[#0c121d] border border-cyan-500/35 shadow-[0_32px_100px_rgba(0,240,255,0.2)] p-5 sm:p-8 flex flex-col justify-between">
        {/* Ambient Stadium Floodlight Glow */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #00f0ff 0%, transparent 70%)' }}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-5 mb-5 shrink-0 gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 aspect-square flex-shrink-0 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_25px_rgba(0,240,255,0.3)]">
              <Target className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl font-black uppercase tracking-tight text-white truncate">
                  SIDE NETTING
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shrink-0">
                  OBSCURITY DUEL
                </span>
              </div>
              <p className="text-xs font-mono text-neutral-400 mt-0.5 truncate">
                Hit the tightest angle. The more obscure your answer, the deeper it bends.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 aspect-square flex-shrink-0 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Guest Read-Only Advisory Banner */}
        {isGuestInParty && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs mb-4 flex items-center justify-between">
            <span>Host is configuring match...</span>
            <span className="text-[10px] uppercase font-bold text-amber-400/80">READ-ONLY</span>
          </div>
        )}

        {/* Concept Explainer Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/25 mb-5">
          <div className="flex items-center gap-2 text-cyan-300 font-display text-xs font-black uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>THE PRECISION OBSCURITY ENGINE</span>
          </div>
          <p className="text-xs font-mono text-neutral-300 leading-relaxed">
            Obvious answers land harmlessly in the middle of the net for 5 points. Niche, cult-hero answers bend directly into the side netting postage-stamp for up to 100 points!
          </p>
        </div>

        {/* Settings: Locked 10 Rounds + Timer */}
        <div className="space-y-4 mb-6">
          {/* Round Indicator (Always 10 Rounds) */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/10">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 block">
                MATCH FORMAT
              </span>
              <span className="text-xs font-display font-black text-white uppercase tracking-wider">
                10 Precision Rounds
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 font-mono text-[10px] font-black uppercase tracking-wider">
              10 ROUNDS LOCKED
            </span>
          </div>

          {/* TIMER SELECTOR */}
          <div>
            <label className="text-[11px] font-mono font-bold uppercase tracking-widest text-neutral-400 block mb-2">
              ROUND COUNTDOWN SPEED
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { val: 30, label: '30s Blitz' },
                { val: 45, label: '45s Standard' },
                { val: 60, label: '60s Tactical' },
                { val: 0, label: 'Relaxed' },
              ].map((t) => (
                <button
                  key={t.val}
                  type="button"
                  disabled={isGuestInParty}
                  onClick={() => {
                    soundFX.playClick(650);
                    setTimerSeconds(t.val as 30 | 45 | 60 | 0);
                  }}
                  className={`py-2.5 rounded-xl border font-mono text-xs font-black transition-all ${
                    isGuestInParty
                      ? 'opacity-60 cursor-not-allowed bg-white/[0.02] border-white/10 text-neutral-400'
                      : timerSeconds === t.val
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.25)] cursor-pointer'
                      : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:bg-white/[0.06] cursor-pointer'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3 CLEAN GAME PATHWAYS */}
        <div className="space-y-2.5 pt-4 border-t border-white/10 shrink-0">
          {/* 1. Solo High-Score Run */}
          <button
            type="button"
            onClick={handleLaunchSolo}
            className="w-full py-3.5 px-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-black font-display text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between shadow-[0_8px_25px_rgba(0,240,255,0.35)] cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Play className="w-4 h-4 fill-black" />
              <span>SOLO HIGH-SCORE RUN</span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-black/20 px-2 py-0.5 rounded">
              PERSONAL BEST
            </span>
          </button>

          {/* 2. 1v1 Obscurity Duel (Online Quick Match) */}
          <button
            type="button"
            onClick={handleQuickMatch}
            className="w-full py-3 px-4 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-cyan-400/40 text-cyan-300 font-display text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between cursor-pointer hover:border-cyan-300"
          >
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-cyan-400 fill-current" />
              <span>1v1 OBSCURITY DUEL</span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 px-2 py-0.5 rounded">
              QUICK MATCH (DROP-IN)
            </span>
          </button>

          {/* 3. Play with Squad / Waiting for Host */}
          {isGuestInParty ? (
            <button
              type="button"
              disabled
              className="w-full py-3 px-4 rounded-2xl border font-display text-xs font-black uppercase tracking-wider flex items-center justify-between bg-white/[0.02] border-white/10 text-neutral-500 cursor-not-allowed opacity-75"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-neutral-500" />
                <span>WAITING FOR HOST TO LAUNCH...</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">HOST CONTROLS</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSquadAction}
              className={`w-full py-3 px-4 rounded-2xl border font-display text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between cursor-pointer ${
                isSquadReady
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-white/[0.02] border-white/10 text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>
                  {isSquadReady
                    ? `LAUNCH WITH SQUAD (${party.members.length}/4)`
                    : 'PLAY WITH SQUAD'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400">
                {isSquadReady ? 'READY' : 'OPEN PARTY DOCK'}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
