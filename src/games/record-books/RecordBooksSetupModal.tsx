import React, { useState, useEffect } from 'react';
import type {
  RecordBooksDifficulty,
  RecordBooksMatchConfig,
  RecordBooksMetric,
  RecordBooksLobbyMode,
} from './types';
import { soundFX } from '../../utils/audio';
import { Bot, Goal, Users, Zap } from 'lucide-react';
import { SetupShell, SetupSection, OptionTile, PathwayButton, PathwayGrid, GuestNotice } from '../../components/setup/SetupKit';
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
    <SetupShell
      accent="#f59e0b"
      accent2="#fbbf24"
      code="03"
      badge="Stat vault · Tally duel"
      title="The Record Books"
      tagline="Name a club's league scorers and bank their tallies. Every goal is checked against Wikipedia."
      mark="#1"
      onClose={onClose}
      footer={
        <PathwayGrid>
          <PathwayButton
            icon={Bot}
            title="Solo vs AI scout"
            desc="Test your recall against a bot with realistic lookup time."
            onClick={handleLaunchSolo}
          />
          <PathwayButton
            icon={Zap}
            title="Quick Match"
            chip="<10s"
            primary={!isSquadReady}
            desc="Ranked: 10 rounds, rising difficulty. Bot steps in at 10s."
            onClick={handleQuickMatch}
          />
          {isGuestInParty ? (
            <PathwayButton icon={Users} title="Waiting for host" chip="HOST ONLY" locked desc="Only the squad host can launch the Record Books." />
          ) : (
            <PathwayButton
              icon={Users}
              title={isSquadReady ? 'Launch with squad' : 'Play with squad'}
              chip={isSquadReady ? '2/2 READY' : 'PARTY DOCK'}
              primary={isSquadReady}
              desc={isSquadReady ? 'Squad is ready. Start the tally duel.' : 'Open the Party Dock to invite a rival.'}
              onClick={handleSquadAction}
            />
          )}
        </PathwayGrid>
      }
    >
      {isGuestInParty && <GuestNotice>The host is configuring this match. Settings update live.</GuestNotice>}

      <SetupSection index="01" label="Statistic" hint="Source: Wikipedia infoboxes">
        <OptionTile
          selected={metric === 'Goals'}
          disabled={isGuestInParty}
          onClick={() => handleMetricChange('Goals')}
          icon={Goal}
          title="League goals"
          sub="Senior league goals each player scored for the club."
        />
      </SetupSection>

      <SetupSection index="02" label="Club pool tier" hint={`${totalRounds} clubs · 10 rounds`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {DIFFICULTY_PRESETS.map((d) => (
            <OptionTile
              key={d.id}
              selected={difficulty === d.id}
              disabled={isGuestInParty}
              onClick={() => handleDifficultyChange(d.id)}
              title={d.title}
              sub={d.description}
            />
          ))}
        </div>
      </SetupSection>
    </SetupShell>
  );
};
