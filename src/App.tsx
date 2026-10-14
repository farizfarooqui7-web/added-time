import { useState, useEffect } from 'react';
import { BroadcastHeader } from './components/BroadcastHeader';
import { BentoGrid } from './components/BentoGrid';
import { GameModeModal } from './components/GameModeModal';
import type { LaunchFlowTab } from './components/GameModeModal';
import { AuctionSetupModal, AuctionArena } from './games/auction-draft';
import type { MatchConfig } from './games/auction-draft';
import { LinkUpSetupModal, LinkUpArena } from './games/link-up';
import type { LinkUpMatchConfig, LinkUpLobbyMode } from './games/link-up';
import { RecordBooksSetupModal, RecordBooksArena } from './games/record-books';
import type { RecordBooksMatchConfig, RecordBooksLobbyMode } from './games/record-books';
import { ImposterSetupModal, ImposterArena } from './games/football-imposter';
import type { ImposterMatchConfig, ImposterLobbyMode } from './games/football-imposter';
import { SideNettingSetupModal, SideNettingArena } from './games/side-netting';
import type { SideNettingMatchConfig } from './games/side-netting';
import { PartyDrawer } from './components/PartyDrawer';
import { SoloEscapeHatchModal } from './components/SoloEscapeHatchModal';
import { MatchmakingOverlay } from './components/MatchmakingOverlay';
import { useParty } from './context/PartyContext';
import { GAME_MODES } from './data/gameModes';
import type { GameModeInfo } from './types';

export function App() {
  const [viewMode, setViewMode] = useState<
    | 'hub'
    | 'auction-arena'
    | 'link-up-arena'
    | 'record-books-arena'
    | 'imposter-arena'
    | 'side-netting-arena'
  >('hub');
  const [selectedMode, setSelectedMode] = useState<GameModeInfo | null>(GAME_MODES[0]);
  const [isGenericModalOpen, setIsGenericModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<LaunchFlowTab>('solo');

  // $20 Auction Draft specific launchpad state
  const [isAuctionSetupOpen, setIsAuctionSetupOpen] = useState(false);
  const [auctionInitialMode, setAuctionInitialMode] = useState<'solo' | 'host' | 'join'>('solo');
  const [activeMatchConfig, setActiveMatchConfig] = useState<MatchConfig | null>(null);

  // THE LINK-UP specific launchpad & arena state
  const [isLinkUpSetupOpen, setIsLinkUpSetupOpen] = useState(false);
  const [linkUpInitialMode, setLinkUpInitialMode] = useState<LinkUpLobbyMode>('solo');
  const [activeLinkUpConfig, setActiveLinkUpConfig] = useState<LinkUpMatchConfig | null>(null);

  // THE RECORD BOOKS specific launchpad & arena state
  const [isRecordBooksSetupOpen, setIsRecordBooksSetupOpen] = useState(false);
  const [recordBooksInitialMode, setRecordBooksInitialMode] = useState<RecordBooksLobbyMode>('solo');
  const [activeRecordBooksConfig, setActiveRecordBooksConfig] = useState<RecordBooksMatchConfig | null>(null);

  // FOOTBALL IMPOSTER specific launchpad & arena state
  const [isImposterSetupOpen, setIsImposterSetupOpen] = useState(false);
  const [imposterInitialMode, setImposterInitialMode] = useState<ImposterLobbyMode>('sandbox');
  const [activeImposterConfig, setActiveImposterConfig] = useState<ImposterMatchConfig | null>(null);

  // SIDE NETTING specific launchpad & arena state
  const [isSideNettingSetupOpen, setIsSideNettingSetupOpen] = useState(false);
  const [activeSideNettingConfig, setActiveSideNettingConfig] = useState<SideNettingMatchConfig | null>(null);

  const {
    party,
    launchMatch,
    lastRemoteMatch,
    clearRemoteMatch,
    togglePartyHost,
    toggleJoinCode,
    isDrawerOpen,
  } = useParty();

  // Listen for remote match launch from party host
  useEffect(() => {
    if (!lastRemoteMatch) return;
    const { modeId, config } = lastRemoteMatch;
    if (modeId === 'auction-draft') {
      setActiveMatchConfig(
        (config as MatchConfig) || {
          budget: 20,
          turnTimerSeconds: 15,
          rounds: 5,
          isMultiplayer: true,
          opponentType: 'online',
        }
      );
      setIsAuctionSetupOpen(false);
      setViewMode('auction-arena');
    } else if (modeId === 'criteria-rush' || modeId === 'link-up') {
      setActiveLinkUpConfig(
        (config as LinkUpMatchConfig) || {
          timerSeconds: 30,
          rounds: 3,
          isMultiplayer: true,
          difficulty: 'normal',
        }
      );
      setIsLinkUpSetupOpen(false);
      setViewMode('link-up-arena');
    } else if (modeId === 'tally-race' || modeId === 'record-books') {
      setActiveRecordBooksConfig(
        (config as RecordBooksMatchConfig) || {
          targetPoints: 50,
          turnTimerSeconds: 15,
          isMultiplayer: true,
        }
      );
      setIsRecordBooksSetupOpen(false);
      setViewMode('record-books-arena');
    } else if (modeId === 'football-imposter') {
      setActiveImposterConfig(
        (config as ImposterMatchConfig) || {
          playerCount: Math.max(3, party.members.length),
          imposterCount: 1,
          timerSeconds: 45,
          vagueClueCount: 1,
        }
      );
      setIsImposterSetupOpen(false);
      setViewMode('imposter-arena');
    } else if (modeId === 'side_netting') {
      setActiveSideNettingConfig(
        (config as SideNettingMatchConfig) || {
          rounds: 5,
          timerSeconds: 20,
        }
      );
      setIsSideNettingSetupOpen(false);
      setViewMode('side-netting-arena');
    }
    clearRemoteMatch();
  }, [lastRemoteMatch, party.members.length, clearRemoteMatch]);

  const handleHostParty = () => {
    togglePartyHost();
  };

  const handleJoinCode = () => {
    toggleJoinCode();
  };

  const handleLaunchMode = (mode: GameModeInfo, tab: 'solo' | 'quickmatch' | 'party' = 'solo') => {
    if (mode.id === 'auction-draft') {
      const mappedMode = tab === 'party' ? 'host' : tab === 'quickmatch' ? 'host' : 'solo';
      setAuctionInitialMode(mappedMode);
      setIsAuctionSetupOpen(true);
    } else if (mode.id === 'criteria-rush') {
      const mappedMode: LinkUpLobbyMode = tab === 'party' ? 'host' : 'solo';
      setLinkUpInitialMode(mappedMode);
      setIsLinkUpSetupOpen(true);
    } else if (mode.id === 'tally-race') {
      const mappedMode: RecordBooksLobbyMode = tab === 'party' ? 'host' : 'solo';
      setRecordBooksInitialMode(mappedMode);
      setIsRecordBooksSetupOpen(true);
    } else if (mode.id === 'football-imposter') {
      const mappedMode: ImposterLobbyMode = tab === 'party' ? 'host' : 'sandbox';
      setImposterInitialMode(mappedMode);
      setIsImposterSetupOpen(true);
    } else if (mode.id === 'side_netting') {
      setIsSideNettingSetupOpen(true);
    } else {
      setSelectedMode(mode);
      setModalInitialTab(tab);
      setIsGenericModalOpen(true);
    }
  };

  const handleEnterAuctionArena = (config: MatchConfig) => {
    setActiveMatchConfig(config);
    setIsAuctionSetupOpen(false);
    setViewMode('auction-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('auction-draft', config);
    }
  };

  const handleExitAuctionArena = () => {
    setViewMode('hub');
    setActiveMatchConfig(null);
  };

  const handleEnterLinkUpArena = (config: LinkUpMatchConfig) => {
    setActiveLinkUpConfig(config);
    setIsLinkUpSetupOpen(false);
    setViewMode('link-up-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('criteria-rush', config);
    }
  };

  const handleExitLinkUpArena = () => {
    setViewMode('hub');
    setActiveLinkUpConfig(null);
  };

  const handleEnterRecordBooksArena = (config: RecordBooksMatchConfig) => {
    setActiveRecordBooksConfig(config);
    setIsRecordBooksSetupOpen(false);
    setViewMode('record-books-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('tally-race', config);
    }
  };

  const handleExitRecordBooksArena = () => {
    setViewMode('hub');
    setActiveRecordBooksConfig(null);
  };

  const handleEnterImposterArena = (config: ImposterMatchConfig) => {
    setActiveImposterConfig(config);
    setIsImposterSetupOpen(false);
    setViewMode('imposter-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('football-imposter', config);
    }
  };

  const handleExitImposterArena = () => {
    setViewMode('hub');
    setActiveImposterConfig(null);
  };

  const handleEnterSideNettingArena = (config: SideNettingMatchConfig) => {
    setActiveSideNettingConfig(config);
    setIsSideNettingSetupOpen(false);
    setViewMode('side-netting-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('side_netting', config);
    }
  };

  const handleExitSideNettingArena = () => {
    setViewMode('hub');
    setActiveSideNettingConfig(null);
  };

  if (viewMode === 'side-netting-arena' && activeSideNettingConfig) {
    return (
      <SideNettingArena
        config={activeSideNettingConfig}
        onExitArena={handleExitSideNettingArena}
      />
    );
  }

  if (viewMode === 'auction-arena' && activeMatchConfig) {
    return (
      <AuctionArena
        config={activeMatchConfig}
        onExitMatch={handleExitAuctionArena}
      />
    );
  }

  if (viewMode === 'link-up-arena' && activeLinkUpConfig) {
    return (
      <LinkUpArena
        config={activeLinkUpConfig}
        onExitArena={handleExitLinkUpArena}
      />
    );
  }

  if (viewMode === 'record-books-arena' && activeRecordBooksConfig) {
    return (
      <RecordBooksArena
        config={activeRecordBooksConfig}
        onExitArena={handleExitRecordBooksArena}
      />
    );
  }

  if (viewMode === 'imposter-arena' && activeImposterConfig) {
    return (
      <ImposterArena
        config={activeImposterConfig}
        onExitArena={handleExitImposterArena}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#080a0f] text-neutral-100 flex flex-col selection:bg-[#ccff00] selection:text-black overflow-x-hidden">
      {/* Centered Constrained Container with Generous Breathing Room and Dynamic Drawer Spacing */}
      <div
        className={`w-full min-h-screen px-6 py-6 flex flex-col justify-between transition-all duration-300 ease-out ${
          isDrawerOpen
            ? 'max-w-[calc(100vw-340px)] sm:max-w-[calc(100vw-370px)] lg:max-w-[calc(100vw-400px)] xl:max-w-6xl mr-[320px] sm:mr-[350px] lg:mr-[380px] xl:mr-auto ml-auto'
            : 'max-w-6xl mx-auto'
        }`}
      >
        {/* 1. Header Bar (Centered Logo, Left SFX, Right Action Pills) */}
        <BroadcastHeader
          onHostPartyClick={handleHostParty}
          onJoinCodeClick={handleJoinCode}
        />

        {/* 2. Tactile Claymorphic Bento Grid with Cinematic Artwork */}
        <BentoGrid
          modes={GAME_MODES}
          onLaunchMode={handleLaunchMode}
        />

        {/* 3. $20 Auction Draft Launchpad Modal */}
        <AuctionSetupModal
          isOpen={isAuctionSetupOpen}
          onClose={() => setIsAuctionSetupOpen(false)}
          onEnterArena={handleEnterAuctionArena}
          initialMode={auctionInitialMode}
        />

        {/* 4. THE LINK-UP Setup Modal */}
        <LinkUpSetupModal
          isOpen={isLinkUpSetupOpen}
          onClose={() => setIsLinkUpSetupOpen(false)}
          onLaunchArena={handleEnterLinkUpArena}
          initialMode={linkUpInitialMode}
        />

        {/* 5. THE RECORD BOOKS Setup Modal */}
        <RecordBooksSetupModal
          isOpen={isRecordBooksSetupOpen}
          onClose={() => setIsRecordBooksSetupOpen(false)}
          onLaunchArena={handleEnterRecordBooksArena}
          initialMode={recordBooksInitialMode}
        />

        {/* 6. FOOTBALL IMPOSTER Setup Modal */}
        <ImposterSetupModal
          isOpen={isImposterSetupOpen}
          onClose={() => setIsImposterSetupOpen(false)}
          onLaunchArena={handleEnterImposterArena}
          initialMode={imposterInitialMode}
        />

        {/* 7. SIDE NETTING Setup Modal */}
        <SideNettingSetupModal
          isOpen={isSideNettingSetupOpen}
          onClose={() => setIsSideNettingSetupOpen(false)}
          onLaunchArena={handleEnterSideNettingArena}
        />

        {/* 8. Generic Modal for unconfigured modes */}
        <GameModeModal
          mode={selectedMode}
          isOpen={isGenericModalOpen}
          onClose={() => setIsGenericModalOpen(false)}
          initialTab={modalInitialTab}
        />
      </div>

      {/* Drop-In Matchmaking Radar Overlay */}
      <MatchmakingOverlay />

      {/* Persistent Right-Side Party & Lobby Drawer */}
      <PartyDrawer />

      {/* Guest Solo Escape Hatch Modal */}
      <SoloEscapeHatchModal />
    </div>
  );
}

export default App;
