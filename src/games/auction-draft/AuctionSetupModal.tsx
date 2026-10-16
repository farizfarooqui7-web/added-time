import React, { useState, useEffect } from 'react';
import { FORMATION_PRESETS } from './formations';
import type { FormationId, MatchConfig, LeagueDeckId } from './types';
import { soundFX } from '../../utils/audio';
import { Users, Bot, Zap } from 'lucide-react';
import { SetupShell, SetupSection, OptionTile, PathwayButton, PathwayGrid, GuestNotice } from '../../components/setup/SetupKit';
import { useParty } from '../../context/PartyContext';

interface AuctionSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnterArena: (config: MatchConfig) => void;
  initialMode?: 'solo' | 'host' | 'join';
}

const LEAGUE_DECKS: Array<{
  id: LeagueDeckId;
  name: string;
  tag: string;
  description: string;
}> = [
  {
    id: 'global',
    name: 'GLOBAL ALL-STARS',
    tag: 'ALL ERAS',
    description: 'All leagues, eras, and world icons.',
  },
  {
    id: 'premier-league',
    name: 'PREMIER LEAGUE',
    tag: 'ENG',
    description: 'Icons and stars across all Premier League history.',
  },
  {
    id: 'la-liga',
    name: 'LA LIGA',
    tag: 'ESP',
    description: 'Spanish top-flight legends and modern standouts.',
  },
  {
    id: 'serie-a',
    name: 'SERIE A',
    tag: 'ITA',
    description: 'Italian league icons and historic greats.',
  },
  {
    id: 'bundesliga',
    name: 'BUNDESLIGA',
    tag: 'GER',
    description: 'German top-flight legends and title winners.',
  },
];

export const AuctionSetupModal: React.FC<AuctionSetupModalProps> = ({
  isOpen,
  onClose,
  onEnterArena,
}) => {
  const [selectedFormation, setSelectedFormation] = useState<FormationId>('balanced-1-1-2-1');
  const [selectedDeck, setSelectedDeck] = useState<LeagueDeckId>('global');

  const { party, syncSetupSettings, setMemberPrefs, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isHostWithMembers = party.isActive && party.isCurrentUserHost && party.members.length > 1;
  const shouldWarnPartyLeave = isGuestInParty || isHostWithMembers;
  const isSquadReady = party.isActive && party.members.length === 2;

  // Real-time synchronization of setup settings from host (the deck only: every player keeps their own formation)
  useEffect(() => {
    const pending = party.pendingSetup?.['auction-draft'];
    if (pending?.deckId) setSelectedDeck(pending.deckId);
  }, [party.pendingSetup?.['auction-draft']]);

  // Guests tell the host room which formation they draft into
  useEffect(() => {
    if (isOpen && isGuestInParty) setMemberPrefs({ formationId: selectedFormation });
  }, [isOpen, isGuestInParty, selectedFormation]);

  if (!isOpen) return null;

  const handleFormationChange = (f: FormationId) => {
    soundFX.playClick(600);
    setSelectedFormation(f);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('auction-draft', { formationId: f, deckId: selectedDeck });
    }
    // Guests sync their own formation through the effect above
  };

  const handleDeckChange = (d: LeagueDeckId) => {
    soundFX.playClick(600);
    setSelectedDeck(d);
    if (party.isActive && party.isCurrentUserHost) {
      syncSetupSettings('auction-draft', { formationId: selectedFormation, deckId: d });
    }
  };

  const handleLaunchSolo = () => {
    soundFX.playClick(1000);
    const startSolo = () => {
      onEnterArena({
        formationId: selectedFormation,
        deckId: selectedDeck,
        mode: 'solo',
        roomCode: 'SOLO_AI',
        isRoomCodeMasked: true,
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
      joinQueue('auction-draft', 'duel', { formationId: selectedFormation });
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
      const config: MatchConfig = {
        formationId: selectedFormation,
        deckId: selectedDeck,
        mode: 'host',
        roomCode: party.roomCode,
        isRoomCodeMasked: party.isCodeMasked,
        isMultiplayer: true,
      };
      launchMatch('auction-draft', config);
      onEnterArena(config);
    } else {
      soundFX.playClick(750);
      onClose();
      openDrawer();
    }
  };

  return (
    <SetupShell
      accent="#ccff00"
      code="01"
      title="$20 Auction Draft"
      mark="$20"
      onClose={onClose}
      footer={
        <PathwayGrid>
          <PathwayButton
            icon={Bot}
            title="Solo vs The Gaffer"
            desc="Instant match against a tactical AI that bids with real psychology."
            onClick={handleLaunchSolo}
          />
          <PathwayButton
            icon={Zap}
            title="Quick Match"
            chip="<10s"
            primary={!isSquadReady}
            desc="Your formation vs theirs on a random league deck. Bot steps in at 10s."
            onClick={handleQuickMatch}
          />
          {isGuestInParty ? (
            <PathwayButton icon={Users} title="Waiting for host" chip="HOST ONLY" locked desc="Only the squad host can launch the draft." />
          ) : (
            <PathwayButton
              icon={Users}
              title={isSquadReady ? 'Launch with squad' : 'Play with squad'}
              chip={isSquadReady ? '2/2 READY' : 'PARTY DOCK'}
              primary={isSquadReady}
              desc={isSquadReady ? 'Both managers are in. Send the squad into the live auction.' : 'Open the Party Dock to invite or duel a friend.'}
              onClick={handleSquadAction}
            />
          )}
        </PathwayGrid>
      }
    >
      {isGuestInParty && <GuestNotice>The host sets the league deck. Your formation is yours to pick.</GuestNotice>}

      <SetupSection index="01" label="Formation">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Object.values(FORMATION_PRESETS).map((formation) => (
            <OptionTile
              key={formation.id}
              selected={selectedFormation === formation.id}
              onClick={() => handleFormationChange(formation.id)}
              title={formation.name}
              sub={formation.slots.join(' · ')}
            />
          ))}
        </div>
      </SetupSection>

      <SetupSection index="02" label="Player pool" hint={isGuestInParty ? 'Set by host' : undefined}>
        {/* One even row on desktop; on phones Global takes the top row so the 2-col grid stays even */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {LEAGUE_DECKS.map((deck) => (
            <OptionTile
              key={deck.id}
              className={deck.id === 'global' ? 'col-span-2 sm:col-span-1' : ''}
              selected={selectedDeck === deck.id}
              disabled={isGuestInParty}
              onClick={() => handleDeckChange(deck.id)}
              title={deck.name}
              sub={deck.tag}
            />
          ))}
        </div>
      </SetupSection>
    </SetupShell>
  );
};

export const LaunchpadModal = AuctionSetupModal;
