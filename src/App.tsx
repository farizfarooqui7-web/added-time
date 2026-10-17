import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { BroadcastHeader } from './components/BroadcastHeader';
import { BentoGrid } from './components/BentoGrid';
import { GameModeModal } from './components/GameModeModal';
import type { LaunchFlowTab } from './components/GameModeModal';
import { AuctionSetupModal } from './games/auction-draft/AuctionSetupModal';
import type { MatchConfig } from './games/auction-draft';
import { LinkUpSetupModal } from './games/link-up/LinkUpSetupModal';
import type { LinkUpMatchConfig, LinkUpLobbyMode } from './games/link-up';
import { RecordBooksSetupModal } from './games/record-books/RecordBooksSetupModal';
import type { RecordBooksMatchConfig, RecordBooksLobbyMode } from './games/record-books';
import { ImposterSetupModal } from './games/football-imposter/ImposterSetupModal';
import type { ImposterMatchConfig, ImposterLobbyMode } from './games/football-imposter';
import { SideNettingSetupModal } from './games/side-netting/SideNettingSetupModal';
import type { SideNettingMatchConfig } from './games/side-netting';
import { PartyDrawer } from './components/PartyDrawer';
import { SoloEscapeHatchModal } from './components/SoloEscapeHatchModal';
import { MatchmakingOverlay } from './components/MatchmakingOverlay';
import { FeedbackWidget } from './components/FeedbackWidget';
import { MobileTabBar } from './components/MobileTabBar';
import { LockerRoom } from './components/LockerRoom';
import { useParty } from './context/PartyContext';
import { GAME_MODES } from './data/gameModes';
import type { GameModeInfo } from './types';

// Each arena (and the game data its engine imports) is a separate chunk, fetched when that game opens
const AuctionArena = lazy(() => import('./games/auction-draft/AuctionArena').then((m) => ({ default: m.AuctionArena })));
const LinkUpArena = lazy(() => import('./games/link-up/LinkUpArena').then((m) => ({ default: m.LinkUpArena })));
const RecordBooksArena = lazy(() =>
  import('./games/record-books/RecordBooksArena').then((m) => ({ default: m.RecordBooksArena }))
);
const ImposterArena = lazy(() =>
  import('./games/football-imposter/ImposterArena').then((m) => ({ default: m.ImposterArena }))
);
const SideNettingArena = lazy(() =>
  import('./games/side-netting/SideNettingArena').then((m) => ({ default: m.SideNettingArena }))
);

const ArenaLoading = () => (
  <div className="min-h-screen w-full bg-[#080a0f] flex items-center justify-center">
    <span className="font-mono text-xs tracking-[0.3em] text-slate-400 uppercase animate-pulse">Loading match...</span>
  </div>
);

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

  const [matchSessionId, setMatchSessionId] = useState<number>(() => Date.now());

  const {
    party,
    launchMatch,
    lastRemoteMatch,
    clearRemoteMatch,
    togglePartyHost,
    toggleJoinCode,
    isDrawerOpen,
    clearForfeit,
    leaveParty,
  } = useParty();

  // Listen for remote match launch from party host or matchmaker
  useEffect(() => {
    if (!lastRemoteMatch) return;
    const { modeId, config } = lastRemoteMatch;
    const cfg = (config || {}) as any;

    clearForfeit();
    setMatchSessionId(Date.now());

    if (modeId === 'auction-draft') {
      const fullConfig: MatchConfig = {
        formationId: cfg.formationId || 'balanced-1-1-2-1',
        deckId: cfg.deckId || 'global',
        mode: cfg.mode || (party.isCurrentUserHost ? 'host' : 'join'),
        roomCode: cfg.roomCode || party.roomCode || 'MATCH',
        isRoomCodeMasked: cfg.isRoomCodeMasked ?? party.isCodeMasked ?? true,
        isMultiplayer: true,
        ...cfg,
      };
      setActiveMatchConfig(fullConfig);
      setIsAuctionSetupOpen(false);
      setViewMode('auction-arena');
    } else if (modeId === 'criteria-rush' || modeId === 'link-up') {
      const fullConfig: LinkUpMatchConfig = {
        lobbyMode: cfg.lobbyMode || (party.isCurrentUserHost ? 'host' : 'join'),
        roomCode: cfg.roomCode || party.roomCode || 'MATCH',
        isRoomCodeMasked: cfg.isRoomCodeMasked ?? party.isCodeMasked ?? true,
        difficulty: cfg.difficulty || 'Medium',
        slotTypes: cfg.slotTypes || ['Club', 'Nation', 'Position'],
        randomizeSlotsEachRound: Boolean(cfg.randomizeSlotsEachRound),
        totalRounds: cfg.totalRounds || 10,
        isMultiplayer: true,
        ...cfg,
      };
      setActiveLinkUpConfig(fullConfig);
      setIsLinkUpSetupOpen(false);
      setViewMode('link-up-arena');
    } else if (modeId === 'tally-race' || modeId === 'record-books') {
      const fullConfig: RecordBooksMatchConfig = {
        lobbyMode: cfg.lobbyMode || (party.isCurrentUserHost ? 'host' : 'join'),
        roomCode: cfg.roomCode || party.roomCode || 'MATCH',
        isRoomCodeMasked: cfg.isRoomCodeMasked ?? party.isCodeMasked ?? true,
        difficulty: cfg.difficulty || 'Medium',
        totalRounds: cfg.totalRounds || 10,
        isMultiplayer: true,
        ...cfg,
        metric: 'Goals', // league goals only; ignores a stale 'Assists' setting from an older client
      };
      setActiveRecordBooksConfig(fullConfig);
      setIsRecordBooksSetupOpen(false);
      setViewMode('record-books-arena');
    } else if (modeId === 'football-imposter') {
      const fullConfig: ImposterMatchConfig = {
        lobbyMode: cfg.lobbyMode || (party.isCurrentUserHost ? 'host' : 'sandbox'),
        roomCode: cfg.roomCode || party.roomCode || 'MATCH',
        isRoomCodeMasked: cfg.isRoomCodeMasked ?? party.isCodeMasked ?? true,
        category: cfg.category || 'All-Time Legends',
        clueRounds: cfg.clueRounds || 2,
        botCount: cfg.botCount || 4,
        rolePreference: cfg.rolePreference || 'random',
        imposterClueEnabled: cfg.imposterClueEnabled ?? true,
        isMultiplayer: true,
        ...cfg,
      };
      setActiveImposterConfig(fullConfig);
      setIsImposterSetupOpen(false);
      setViewMode('imposter-arena');
    } else if (modeId === 'side_netting') {
      const fullConfig: SideNettingMatchConfig = {
        roundCount: cfg.roundCount || 10,
        timerSeconds: cfg.timerSeconds !== undefined ? cfg.timerSeconds : 60,
        isMultiplayer: true,
        ...cfg,
      };
      setActiveSideNettingConfig(fullConfig);
      setIsSideNettingSetupOpen(false);
      setViewMode('side-netting-arena');
    }
    clearRemoteMatch();
  }, [lastRemoteMatch, party.members.length, party.isCurrentUserHost, party.roomCode, party.isCodeMasked, clearRemoteMatch, clearForfeit]);

  // Safety net: Always disband/leave ephemeral drop-in match rooms when returning to hub.
  // Only on the way back from an arena: a fresh matchmaking result lands (party_created) one
  // message before match_launched switches the view, and must not be torn down meanwhile.
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    const returnedToHub = viewMode === 'hub' && prevViewModeRef.current !== 'hub';
    prevViewModeRef.current = viewMode;
    if (returnedToHub && party.isActive && party.roomCode?.startsWith('match_')) {
      leaveParty();
    }
  }, [viewMode, party.isActive, party.roomCode, leaveParty]);

  const handleHostParty = () => {
    togglePartyHost();
  };

  const handleJoinCode = () => {
    toggleJoinCode();
  };

  // Listen for browser back / popstate to smoothly close open setup modals
  useEffect(() => {
    const handlePopState = () => {
      setIsAuctionSetupOpen(false);
      setIsLinkUpSetupOpen(false);
      setIsRecordBooksSetupOpen(false);
      setIsImposterSetupOpen(false);
      setIsSideNettingSetupOpen(false);
      setIsGenericModalOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openSetupModal = (setter: (open: boolean) => void, setupKey: string) => {
    window.history.pushState({ modal: setupKey }, '', `?setup=${setupKey}`);
    setter(true);
  };

  const closeSetupModal = (setter: (open: boolean) => void) => {
    setter(false);
    if (window.location.search.includes('setup=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const handleLaunchMode = (mode: GameModeInfo, tab: 'solo' | 'quickmatch' | 'party' = 'solo') => {
    if (mode.id === 'auction-draft') {
      const mappedMode = tab === 'party' ? 'host' : tab === 'quickmatch' ? 'host' : 'solo';
      setAuctionInitialMode(mappedMode);
      openSetupModal(setIsAuctionSetupOpen, 'auction-draft');
    } else if (mode.id === 'criteria-rush') {
      const mappedMode: LinkUpLobbyMode = tab === 'party' ? 'host' : 'solo';
      setLinkUpInitialMode(mappedMode);
      openSetupModal(setIsLinkUpSetupOpen, 'link-up');
    } else if (mode.id === 'tally-race') {
      const mappedMode: RecordBooksLobbyMode = tab === 'party' ? 'host' : 'solo';
      setRecordBooksInitialMode(mappedMode);
      openSetupModal(setIsRecordBooksSetupOpen, 'record-books');
    } else if (mode.id === 'football-imposter') {
      const mappedMode: ImposterLobbyMode = tab === 'party' ? 'host' : 'sandbox';
      setImposterInitialMode(mappedMode);
      openSetupModal(setIsImposterSetupOpen, 'football-imposter');
    } else if (mode.id === 'side_netting') {
      openSetupModal(setIsSideNettingSetupOpen, 'side-netting');
    } else {
      setSelectedMode(mode);
      setModalInitialTab(tab);
      openSetupModal(setIsGenericModalOpen, 'generic');
    }
  };

  const handleEnterAuctionArena = (config: MatchConfig) => {
    setActiveMatchConfig(config);
    setIsAuctionSetupOpen(false);
    window.history.replaceState({ game: 'auction-draft' }, '', '?game=auction-draft');
    setViewMode('auction-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('auction-draft', config);
    }
  };

  const handleExitAuctionArena = () => {
    setViewMode('hub');
    setActiveMatchConfig(null);
    clearForfeit();
    if (party.isActive && party.roomCode?.startsWith('match_')) {
      leaveParty();
    }
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleEnterLinkUpArena = (config: LinkUpMatchConfig) => {
    setActiveLinkUpConfig(config);
    setIsLinkUpSetupOpen(false);
    clearForfeit();
    setMatchSessionId(Date.now());
    window.history.replaceState({ game: 'link-up' }, '', '?game=link-up');
    setViewMode('link-up-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('criteria-rush', config);
    }
  };

  const handleExitLinkUpArena = () => {
    setViewMode('hub');
    setActiveLinkUpConfig(null);
    clearForfeit();
    if (party.isActive && party.roomCode?.startsWith('match_')) {
      leaveParty();
    }
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleEnterRecordBooksArena = (config: RecordBooksMatchConfig) => {
    setActiveRecordBooksConfig(config);
    setIsRecordBooksSetupOpen(false);
    clearForfeit();
    setMatchSessionId(Date.now());
    window.history.replaceState({ game: 'record-books' }, '', '?game=record-books');
    setViewMode('record-books-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('tally-race', config);
    }
  };

  const handleExitRecordBooksArena = () => {
    setViewMode('hub');
    setActiveRecordBooksConfig(null);
    clearForfeit();
    if (party.isActive && party.roomCode?.startsWith('match_')) {
      leaveParty();
    }
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleEnterImposterArena = (config: ImposterMatchConfig) => {
    setActiveImposterConfig(config);
    setIsImposterSetupOpen(false);
    clearForfeit();
    setMatchSessionId(Date.now());
    window.history.replaceState({ game: 'football-imposter' }, '', '?game=football-imposter');
    setViewMode('imposter-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('football-imposter', config);
    }
  };

  const handleExitImposterArena = () => {
    setViewMode('hub');
    setActiveImposterConfig(null);
    clearForfeit();
    if (party.isActive && party.roomCode?.startsWith('match_')) {
      leaveParty();
    }
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleEnterSideNettingArena = (config: SideNettingMatchConfig) => {
    setActiveSideNettingConfig(config);
    setIsSideNettingSetupOpen(false);
    clearForfeit();
    setMatchSessionId(Date.now());
    window.history.replaceState({ game: 'side-netting' }, '', '?game=side-netting');
    setViewMode('side-netting-arena');
    if (party.isActive && party.isCurrentUserHost) {
      launchMatch('side_netting', config);
    }
  };

  const handleExitSideNettingArena = () => {
    setViewMode('hub');
    setActiveSideNettingConfig(null);
    clearForfeit();
    if (party.isActive && party.roomCode?.startsWith('match_')) {
      leaveParty();
    }
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleCancelMatchmaking = (cancelledModeId: string | null) => {
    if (!cancelledModeId) return;
    if (cancelledModeId === 'auction-draft') {
      openSetupModal(setIsAuctionSetupOpen, 'auction-draft');
    } else if (cancelledModeId === 'criteria-rush' || cancelledModeId === 'link-up') {
      openSetupModal(setIsLinkUpSetupOpen, 'link-up');
    } else if (cancelledModeId === 'tally-race' || cancelledModeId === 'record-books') {
      openSetupModal(setIsRecordBooksSetupOpen, 'record-books');
    } else if (cancelledModeId === 'football-imposter') {
      openSetupModal(setIsImposterSetupOpen, 'football-imposter');
    } else if (cancelledModeId === 'side_netting') {
      openSetupModal(setIsSideNettingSetupOpen, 'side-netting');
    }
  };

  if (viewMode === 'side-netting-arena' && activeSideNettingConfig) {
    return (
      <>
        <Suspense fallback={<ArenaLoading />}>
          <SideNettingArena
            key={matchSessionId}
            config={activeSideNettingConfig}
            onExitArena={handleExitSideNettingArena}
          />
        </Suspense>
        <FeedbackWidget currentView={viewMode} />
      </>
    );
  }

  if (viewMode === 'auction-arena' && activeMatchConfig) {
    return (
      <>
        <Suspense fallback={<ArenaLoading />}>
          <AuctionArena
            key={matchSessionId}
            config={activeMatchConfig}
            onExitMatch={handleExitAuctionArena}
          />
        </Suspense>
        <FeedbackWidget currentView={viewMode} />
      </>
    );
  }

  if (viewMode === 'link-up-arena' && activeLinkUpConfig) {
    return (
      <>
        <Suspense fallback={<ArenaLoading />}>
          <LinkUpArena
            key={matchSessionId}
            config={activeLinkUpConfig}
            onExitArena={handleExitLinkUpArena}
          />
        </Suspense>
        <FeedbackWidget currentView={viewMode} />
      </>
    );
  }

  if (viewMode === 'record-books-arena' && activeRecordBooksConfig) {
    return (
      <>
        <Suspense fallback={<ArenaLoading />}>
          <RecordBooksArena
            key={matchSessionId}
            config={activeRecordBooksConfig}
            onExitArena={handleExitRecordBooksArena}
          />
        </Suspense>
        <FeedbackWidget currentView={viewMode} />
      </>
    );
  }

  if (viewMode === 'imposter-arena' && activeImposterConfig) {
    return (
      <>
        <Suspense fallback={<ArenaLoading />}>
          <ImposterArena
            key={matchSessionId}
            config={activeImposterConfig}
            onExitArena={handleExitImposterArena}
          />
        </Suspense>
        <FeedbackWidget currentView={viewMode} />
      </>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#080a0f] text-neutral-100 flex flex-col selection:bg-[#ccff00] selection:text-black overflow-x-hidden">
      {/* Centered Constrained Container with Generous Breathing Room and Dynamic Drawer Spacing */}
      <div
        className={`w-full min-h-screen px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:py-4 flex flex-col gap-2 sm:gap-4 transition-all duration-300 ease-out ${
          isDrawerOpen
            ? 'w-full md:max-w-[calc(100vw/var(--zoom,1)-380px)] lg:max-w-[calc(100vw/var(--zoom,1)-400px)] xl:max-w-6xl md:mr-[360px] lg:mr-[380px] xl:mr-auto ml-auto'
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
          onClose={() => closeSetupModal(setIsAuctionSetupOpen)}
          onEnterArena={handleEnterAuctionArena}
          initialMode={auctionInitialMode}
        />

        {/* 4. THE LINK-UP Setup Modal */}
        <LinkUpSetupModal
          isOpen={isLinkUpSetupOpen}
          onClose={() => closeSetupModal(setIsLinkUpSetupOpen)}
          onLaunchArena={handleEnterLinkUpArena}
          initialMode={linkUpInitialMode}
        />

        {/* 5. THE RECORD BOOKS Setup Modal */}
        <RecordBooksSetupModal
          isOpen={isRecordBooksSetupOpen}
          onClose={() => closeSetupModal(setIsRecordBooksSetupOpen)}
          onLaunchArena={handleEnterRecordBooksArena}
          initialMode={recordBooksInitialMode}
        />

        {/* 6. FOOTBALL IMPOSTER Setup Modal */}
        <ImposterSetupModal
          isOpen={isImposterSetupOpen}
          onClose={() => closeSetupModal(setIsImposterSetupOpen)}
          onLaunchArena={handleEnterImposterArena}
          initialMode={imposterInitialMode}
        />

        {/* 7. SIDE NETTING Setup Modal */}
        <SideNettingSetupModal
          isOpen={isSideNettingSetupOpen}
          onClose={() => closeSetupModal(setIsSideNettingSetupOpen)}
          onLaunchArena={handleEnterSideNettingArena}
        />

        {/* 8. Generic Modal for unconfigured modes */}
        <GameModeModal
          mode={selectedMode}
          isOpen={isGenericModalOpen}
          onClose={() => closeSetupModal(setIsGenericModalOpen)}
          initialTab={modalInitialTab}
        />
      </div>

      {/* Drop-In Matchmaking Radar Overlay */}
      <MatchmakingOverlay onCancel={handleCancelMatchmaking} />

      {/* Persistent Right-Side Party & Lobby Drawer */}
      <PartyDrawer />

      {/* Guest Solo Escape Hatch Modal */}
      <SoloEscapeHatchModal />

      {/* Persistent Bug Reporting & Feedback Widget */}
      <MobileTabBar onHostParty={handleHostParty} onJoinCode={handleJoinCode} />
      <LockerRoom />
      <FeedbackWidget currentView={viewMode} />
    </div>
  );
}

export default App;
