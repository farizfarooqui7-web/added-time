import React, { useState, useEffect } from 'react';
import type {
  LinkUpDifficulty,
  LinkUpLobbyMode,
  LinkUpMatchConfig,
  LinkUpSlotType,
} from './types';
import {
  randomizeSlotConfiguration,
  updateSlotConfiguration,
} from './slotConfig';
import { soundFX } from '../../utils/audio';
import { Bot, Building2, Crosshair, Globe2, Shuffle, Sparkles, Users, Zap } from 'lucide-react';
import {
  SetupShell,
  SetupSection,
  OptionTile,
  PathwayButton,
  PathwayGrid,
  GuestNotice,
  ChipButton,
} from '../../components/setup/SetupKit';
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

  const { party, syncSetupSettings, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isHostWithMembers = party.isActive && party.isCurrentUserHost && party.members.length > 1;
  const shouldWarnPartyLeave = isGuestInParty || isHostWithMembers;
  const isSquadReady = party.isActive && party.members.length >= 2 && party.members.length <= 8;

  // Real-time synchronization of setup settings from host
  useEffect(() => {
    const pending = party.pendingSetup?.['link-up'] || party.pendingSetup?.['criteria-rush'];
    if (pending) {
      if (pending.slotTypes) setSlotTypes(pending.slotTypes);
      if (pending.difficulty) setDifficulty(pending.difficulty);
      if (pending.randomizeEachRound !== undefined) setRandomizeEachRound(pending.randomizeEachRound);
    }
  }, [party.pendingSetup?.['link-up'], party.pendingSetup?.['criteria-rush']]);

  if (!isOpen) return null;

  const handleSlotChange = (index: 0 | 1 | 2, newType: LinkUpSlotType) => {
    soundFX.playClick(680);
    const updated = updateSlotConfiguration(slotTypes, index, newType);
    setSlotTypes(updated);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('link-up', { slotTypes: updated, difficulty, randomizeEachRound });
    }
  };

  const handleShuffleSlots = () => {
    soundFX.playClick(820);
    const shuffled = randomizeSlotConfiguration();
    setSlotTypes(shuffled);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('link-up', { slotTypes: shuffled, difficulty, randomizeEachRound });
    }
  };

  const handleDifficultyChange = (d: LinkUpDifficulty) => {
    soundFX.playClick(650);
    setDifficulty(d);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('link-up', { slotTypes, difficulty: d, randomizeEachRound });
    }
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
      joinQueue('criteria-rush', 'duel');
    };
    if (shouldWarnPartyLeave) {
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

  const SLOT_ICONS: Record<LinkUpSlotType, React.ElementType> = { Club: Building2, Nation: Globe2, Position: Crosshair };

  return (
    <SetupShell
      accent="#3dff8f"
      accent2="#00f0ff"
      code="02"
      badge="Speed trivia · 3-slot matrix"
      title="The Link-Up"
      tagline="Three clues, one baller. Shape the clue slots, pick a tier, and race to lock the link first."
      mark="3/3"
      onClose={onClose}
      footer={
        <PathwayGrid cols={4}>
          <PathwayButton
            icon={Bot}
            title="Solo time attack"
            desc="Race the AI Scout across 10 career-link puzzles."
            onClick={handleLaunchSolo}
          />
          <PathwayButton
            icon={Zap}
            title="1v1 Speed duel"
            chip="<10s"
            primary={!isSquadReady}
            desc="Ranked: 10 rounds, rising difficulty. Bot steps in at 10s."
            onClick={handleQuickMatch}
          />
          <PathwayButton
            icon={Users}
            title="Public drop-in"
            chip="FFA"
            desc="Ranked: 10 rounds, rising difficulty, with live players."
            onClick={handlePublicParty}
          />
          {isGuestInParty ? (
            <PathwayButton icon={Users} title="Waiting for host" chip="HOST ONLY" locked desc="Only the squad host can launch Link-Up." />
          ) : (
            <PathwayButton
              icon={Users}
              title={isSquadReady ? 'Launch with squad' : 'Play with squad'}
              chip={isSquadReady ? `${party.members.length}/8 READY` : 'PARTY DOCK'}
              primary={isSquadReady}
              desc={isSquadReady ? `Start a 10-round match for your ${party.members.length} players.` : 'Open the Party Dock to invite up to 8 friends.'}
              onClick={handleSquadAction}
            />
          )}
        </PathwayGrid>
      }
    >
      {isGuestInParty && <GuestNotice>The host is configuring this match. Settings update live.</GuestNotice>}

      <SetupSection
        index="01"
        label="Clue slots"
        aside={
          <span className="flex items-center gap-1.5">
            <ChipButton icon={Shuffle} disabled={isGuestInParty} onClick={handleShuffleSlots}>
              Shuffle
            </ChipButton>
            <ChipButton
              icon={Sparkles}
              active={randomizeEachRound}
              disabled={isGuestInParty}
              onClick={() => {
                soundFX.playClick(720);
                setRandomizeEachRound(!randomizeEachRound);
              }}
            >
              Re-roll each round
            </ChipButton>
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((slotIdx) => {
            const currentType = slotTypes[slotIdx];
            const SlotIcon = SLOT_ICONS[currentType];
            return (
              <div key={slotIdx} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-slate-500">SLOT {slotIdx + 1}</span>
                  <span className="flex items-center gap-1.5 font-athletic italic font-black text-lg uppercase text-white leading-none">
                    <SlotIcon className="w-3.5 h-3.5" style={{ color: 'var(--acc)' }} />
                    {currentType}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {SLOT_OPTIONS.map((opt) => {
                    const isPositionDisabled =
                      opt.type === 'Position' && slotTypes.some((t, i) => t === 'Position' && i !== slotIdx);
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        aria-pressed={currentType === opt.type}
                        disabled={isGuestInParty || isPositionDisabled}
                        onClick={() => handleSlotChange(slotIdx, opt.type)}
                        title={
                          isGuestInParty
                            ? 'Host is configuring match'
                            : isPositionDisabled
                            ? 'Only 1 Position slot allowed per puzzle'
                            : opt.shortDesc
                        }
                        className={`bc-tile ${currentType === opt.type ? 'is-selected' : ''} h-9 rounded-md font-mono text-[10px] font-black tracking-[0.08em] text-slate-200 cursor-pointer`}
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
      </SetupSection>

      <SetupSection index="02" label="Difficulty tier" hint="10 rounds">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {DIFFICULTY_PRESETS.map((preset) => (
            <OptionTile
              key={preset.id}
              selected={difficulty === preset.id}
              disabled={isGuestInParty}
              onClick={() => handleDifficultyChange(preset.id)}
              title={preset.title}
              tag={preset.badge}
              sub={preset.description}
            />
          ))}
        </div>
      </SetupSection>
    </SetupShell>
  );
};
