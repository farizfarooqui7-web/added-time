import React, { useState, useEffect } from 'react';
import {
  Database,
  Flame,
  Layers,
  Sparkles,
  Trophy,
  FlaskConical,
  Users,
  Zap,
} from 'lucide-react';
import { SetupShell, SetupSection, OptionTile, PathwayButton, PathwayGrid, GuestNotice } from '../../components/setup/SetupKit';
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
  icon: React.ElementType;
}> = [
  {
    id: 'All Players',
    desc: 'Every single footballer across the full database',
    icon: Database,
  },
  {
    id: 'All-Time Legends',
    desc: 'Iconic legends and historic world-class greats',
    icon: Trophy,
  },
  {
    id: 'Modern Superstars',
    desc: 'Global superstars across European top leagues',
    icon: Flame,
  },
  {
    id: 'Premier League Icons',
    desc: 'Premier League legends, stars, and fan favorites',
    icon: Sparkles,
  },
  {
    id: 'Cult Heroes',
    desc: 'Niche ballers, mavericks, and cult favorites',
    icon: Layers,
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
    <SetupShell
      accent="#ef4444"
      accent2="#10b981"
      code="04"
      badge="Social deduction · 3-8 players"
      title="Football Imposter"
      tagline="Everyone sees the secret footballer except one. Drop clues, read the room, vote out the imposter."
      mark="??"
      onClose={onClose}
      footer={
        <PathwayGrid>
          <PathwayButton
            icon={Zap}
            title="Find public game"
            chip="3-8 FFA"
            primary={!isSquadReady}
            desc="2 clue rounds, hint on, random roles. Starts at 3 players."
            onClick={handleFindPublicGame}
          />
          {isGuestInParty ? (
            <PathwayButton icon={Users} title="Waiting for host" chip="HOST ONLY" locked desc="Only the squad host can launch Imposter." />
          ) : (
            <PathwayButton
              icon={Users}
              title={isSquadReady ? 'Launch with squad' : 'Play with squad'}
              chip={isSquadReady ? `${party.members.length}/8 READY` : '3-8 PLAYERS'}
              primary={isSquadReady}
              desc={
                isSquadReady
                  ? `${party.members.length} ballers in. Open the tribunal.`
                  : 'Needs 3-8 players. Open the Party Dock to invite.'
              }
              onClick={handleSquadAction}
            />
          )}
          <PathwayButton
            icon={FlaskConical}
            title="Sandbox vs bots"
            chip="DEV"
            locked={isSandboxBlocked}
            desc={isSandboxBlocked ? 'Leave your squad to use the sandbox.' : `Solo test: you + ${sandboxBots} bots.`}
            onClick={handleLaunchSandbox}
          />
        </PathwayGrid>
      }
    >
      {isGuestInParty && <GuestNotice>The host is configuring this match. Settings update live.</GuestNotice>}

      <SetupSection index="01" label="Secret player pool">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CATEGORIES.map((cat, index) => (
            <OptionTile
              key={cat.id}
              className={index === 0 ? 'sm:col-span-2' : ''}
              selected={category === cat.id}
              disabled={isGuestInParty}
              onClick={() => handleCategoryChange(cat.id)}
              icon={cat.icon}
              title={cat.id}
              sub={cat.desc}
            />
          ))}
        </div>
      </SetupSection>

      <SetupSection index="02" label="Imposter hint">
        <div className="grid grid-cols-2 gap-2">
          {[
            { val: true, label: 'One vague clue', sub: 'A single subtle hint for the imposter.' },
            { val: false, label: 'No clues', sub: 'Hardcore: the imposter bluffs blind.' },
          ].map((opt) => (
            <OptionTile
              key={String(opt.val)}
              selected={imposterClueEnabled === opt.val}
              disabled={isGuestInParty}
              onClick={() => {
                if (imposterClueEnabled !== opt.val) handleToggleClue();
              }}
              title={opt.label}
              sub={opt.sub}
            />
          ))}
        </div>
      </SetupSection>

      {/* TEMPORARY DEV SANDBOX settings: remove before release */}
      <SetupSection index="03" label="Sandbox settings" hint="Solo test vs bots">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'Bots',
              options: ([3, 4, 5] as const).map((n) => ({
                key: String(n),
                text: String(n),
                active: sandboxBots === n,
                pick: () => setSandboxBots(n),
              })),
            },
            {
              label: 'Your role',
              options: (
                [
                  ['random', 'RND'],
                  ['crew', 'CREW'],
                  ['imposter', 'IMP'],
                ] as Array<[ImposterRolePreference, string]>
              ).map(([r, text]) => ({ key: r, text, active: sandboxRole === r, pick: () => setSandboxRole(r) })),
            },
            {
              label: 'Clue rounds',
              options: ([1, 2] as const).map((n) => ({
                key: String(n),
                text: String(n),
                active: sandboxRounds === n,
                pick: () => setSandboxRounds(n),
              })),
            },
          ].map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-slate-500 uppercase">{group.label}</span>
              <div className="flex gap-1">
                {group.options.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={o.active}
                    onClick={() => {
                      soundFX.playClick(650);
                      o.pick();
                    }}
                    className={`bc-tile ${o.active ? 'is-selected' : ''} flex-1 h-9 rounded-md font-mono text-[11px] font-black text-slate-200 cursor-pointer`}
                  >
                    {o.text}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SetupSection>
    </SetupShell>
  );
};
