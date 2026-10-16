import React, { useState, useEffect } from 'react';
import { Play, Sparkles, Users, Zap } from 'lucide-react';
import { SetupShell, SetupSection, OptionTile, PathwayButton, PathwayGrid, GuestNotice } from '../../components/setup/SetupKit';
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

  const { party, syncSetupSettings, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isHostWithMembers = party.isActive && party.isCurrentUserHost && party.members.length > 1;
  const shouldWarnPartyLeave = isGuestInParty || isHostWithMembers;
  const isSquadReady = party.isActive && party.members.length >= 2;

  // Real-time synchronization of setup settings from host
  useEffect(() => {
    if (party.pendingSetup?.side_netting?.timerSeconds !== undefined) {
      setTimerSeconds(party.pendingSetup.side_netting.timerSeconds);
    }
  }, [party.pendingSetup?.side_netting?.timerSeconds]);

  if (!isOpen) return null;

  const handleTimerChange = (val: 30 | 45 | 60 | 0) => {
    soundFX.playClick(650);
    setTimerSeconds(val);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('side_netting', { timerSeconds: val });
    }
  };

  const handleLaunchSolo = () => {
    soundFX.playClick(1000);
    const startSolo = () => {
      onLaunchArena({
        roundCount: 10,
        timerSeconds,
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
    const startQuickMatch = () => {
      onClose();
      joinQueue('side_netting', 'duel');
    };

    if (shouldWarnPartyLeave) {
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
    <SetupShell
      accent="#00f0ff"
      code="05"
      badge="Obscurity trivia · 10 rounds"
      title="Side Netting"
      tagline="Obvious answers die in the box. The more obscure your pick, the deeper it tucks into the side netting."
      mark="100"
      onClose={onClose}
      footer={
        <PathwayGrid>
          <PathwayButton
            icon={Play}
            title="Solo high-score run"
            chip="PB"
            primary={!isSquadReady}
            desc="Ten prompts, chase your personal best."
            onClick={handleLaunchSolo}
          />
          <PathwayButton
            icon={Zap}
            title="1v1 Obscurity duel"
            chip="RANKED"
            desc="Ranked: 10 rounds, rising difficulty. Bot steps in at 10s."
            onClick={handleQuickMatch}
          />
          {isGuestInParty ? (
            <PathwayButton icon={Users} title="Waiting for host" chip="HOST ONLY" locked desc="Only the squad host can launch Side Netting." />
          ) : (
            <PathwayButton
              icon={Users}
              title={isSquadReady ? 'Launch with squad' : 'Play with squad'}
              chip={isSquadReady ? `${party.members.length} READY` : 'PARTY DOCK'}
              primary={isSquadReady}
              desc={isSquadReady ? 'Everyone in the squad plays the same prompts.' : 'Open the Party Dock to invite friends.'}
              onClick={handleSquadAction}
            />
          )}
        </PathwayGrid>
      }
    >
      {isGuestInParty && <GuestNotice>The host is configuring this match. Settings update live.</GuestNotice>}

      {/* How scoring works: depth meter, shallow tap-in to the side netting */}
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3.5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--acc)' }}>
            <Sparkles className="w-3.5 h-3.5" />
            Obscurity scoring
          </span>
          <p className="mt-1 text-[12px] text-slate-400 leading-snug">
            Obvious answers land in the middle of the pitch for a few points. Deep cuts bend into the side netting for up to 100.
          </p>
        </div>
        <div className="hidden sm:flex items-end gap-1 h-12 shrink-0" aria-hidden>
          {[18, 30, 44, 62, 100].map((h) => (
            <span key={h} className="w-2.5 rounded-sm" style={{ height: `${h}%`, background: 'var(--acc)', opacity: 0.25 + h / 140 }} />
          ))}
        </div>
      </div>

      <SetupSection index="01" label="Round clock" hint="10 rounds">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { val: 30, label: '30s', sub: 'Blitz' },
            { val: 45, label: '45s', sub: 'Standard' },
            { val: 60, label: '60s', sub: 'Tactical' },
            { val: 0, label: 'No clock', sub: 'Relaxed' },
          ].map((t) => (
            <OptionTile
              key={t.val}
              selected={timerSeconds === t.val}
              disabled={isGuestInParty}
              onClick={() => handleTimerChange(t.val as 30 | 45 | 60 | 0)}
              title={t.label}
              sub={t.sub}
            />
          ))}
        </div>
      </SetupSection>
    </SetupShell>
  );
};
