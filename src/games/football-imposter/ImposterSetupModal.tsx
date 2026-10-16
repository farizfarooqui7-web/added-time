import React, { useState, useEffect } from 'react';
import {
  Flame,
  Layers,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { SetupShell, SetupSection, OptionTile, PathwayButton, PathwayGrid, GuestNotice, ChipButton } from '../../components/setup/SetupKit';
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
  icon: React.ElementType;
}> = [
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
  const [category, setCategory] = useState<ImposterCategory>('All-Time Legends');
  const [imposterClueEnabled, setImposterClueEnabled] = useState<boolean>(true);

  // TEMPORARY DEV SANDBOX: solo test match against bots. Remove before release.

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
      title="Football Imposter"
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
        </PathwayGrid>
      }
    >
      {isGuestInParty && <GuestNotice>The host is configuring this match. Settings update live.</GuestNotice>}

      <SetupSection index="01" label="Player pool">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CATEGORIES.map((cat) => (
            <OptionTile
              key={cat.id}
              selected={category === cat.id}
              disabled={isGuestInParty}
              onClick={() => handleCategoryChange(cat.id)}
              icon={cat.icon}
              title={cat.id}
            />
          ))}
        </div>
      </SetupSection>

      <SetupSection index="02" label="Imposter hint">
        <div className="flex gap-1.5">
          {[true, false].map((on) => (
            <ChipButton
              key={String(on)}
              active={imposterClueEnabled === on}
              disabled={isGuestInParty}
              onClick={() => imposterClueEnabled !== on && handleToggleClue()}
            >
              <span className="w-6 text-center">{on ? 'On' : 'Off'}</span>
            </ChipButton>
          ))}
        </div>
      </SetupSection>
    </SetupShell>
  );
};
