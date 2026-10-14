import React, { useState, useEffect, useRef } from 'react';
import type { PlayerEraCardExtended } from '../../types';
import type { MatchConfig, ManagerState, AuctionPhase, SquadSlot } from './types';
import {
  FORMATION_PRESETS,
  buildEmptySquad,
  canManagerAcceptCard,
  assignCardToSlot,
  isSquadFull,
  findFirstEligibleSlotIndex,
} from './formations';
import { drawNextWeightedCard } from './draftEngine';
import { evaluateBotBid } from './botEngine';
import { EraPlayerCard } from '../../components/EraPlayerCard';
import { SquadShowdown } from './SquadShowdown';
import { soundFX } from '../../utils/audio';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Gavel,
  Shield,
  Bot,
  User,
  Radio,
} from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onExitMatch?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AuctionErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AuctionErrorBoundary] Caught arena runtime exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full bg-[#080a0f] text-neutral-100 flex flex-col items-center justify-center p-6 text-center space-y-4 select-none font-sans">
          <div className="p-6 rounded-3xl bg-[#121622] border border-red-500/40 max-w-md w-full space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto border border-red-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-sans font-black text-xl text-white uppercase tracking-wider">
                ARENA VIEW RECOVERED
              </h2>
              <p className="text-xs font-mono text-slate-400 mt-1">
                A rendering issue was intercepted safely. Your match state is preserved.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/60 font-mono text-[11px] text-red-300 text-left overflow-x-auto max-h-24">
              {this.state.error?.message || 'Unknown render error'}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-5 py-2.5 rounded-full bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-[#ccff00]/20"
              >
                RELOAD ARENA
              </button>
              {this.props.onExitMatch && (
                <button
                  type="button"
                  onClick={this.props.onExitMatch}
                  className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white font-mono font-bold text-xs uppercase transition-all cursor-pointer"
                >
                  RETURN TO HUB
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface AuctionArenaProps {
  config: MatchConfig;
  onExitMatch: () => void;
}

const AuctionArenaInner: React.FC<AuctionArenaProps> = ({ config, onExitMatch }) => {
  const formation = FORMATION_PRESETS[config.formationId] || FORMATION_PRESETS['balanced-1-1-2-1'];

  const {
    isMultiplayer,
    isHost,
    opponent,
    myPlayerId,
    myPlayerName,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
  } = useGameSync('auction-draft');

  // Match start 3-2-1 countdown overlay state
  const [matchIntroCount, setMatchIntroCount] = useState<number | null>(3);
  const lastTickRef = useRef<number>(-1);

  // Manager Dugout States
  const [userState, setUserState] = useState<ManagerState>(() => ({
    id: 'user',
    name: myPlayerName ? `${myPlayerName} / MGR` : 'YOU / MANAGER',
    isBot: false,
    bankroll: 20,
    slots: buildEmptySquad('user', formation),
    hasFolded: false,
  }));

  const [botState, setBotState] = useState<ManagerState>(() => ({
    id: 'gaffer',
    name: isMultiplayer && opponent ? `${opponent.name} [RIVAL]` : (config.mode === 'solo' ? 'THE GAFFER [AI]' : 'OPPONENT / MGR'),
    isBot: !isMultiplayer,
    bankroll: 20,
    slots: buildEmptySquad('gaffer', formation),
    hasFolded: false,
  }));

  // Sync opponent name in multiplayer if it updates
  useEffect(() => {
    if (isMultiplayer && opponent?.name) {
      setBotState((prev) => ({
        ...prev,
        name: `${opponent.name} [RIVAL]`,
        isBot: false,
      }));
    }
  }, [isMultiplayer, opponent?.name]);

  // Track drafted and discarded card IDs for dynamic weighted dealer
  const draftedCardIdsRef = useRef<Set<string>>(new Set());
  const discardedCardIdsRef = useRef<Set<string>>(new Set());

  // Current lot index & active card
  const [lotNumber, setLotNumber] = useState<number>(1);
  const [currentLot, setCurrentLot] = useState<PlayerEraCardExtended>(() => {
    if (gameInitData?.sharedData?.cards && gameInitData.sharedData.cards.length > 0) {
      return gameInitData.sharedData.cards[0];
    }
    return drawNextWeightedCard(
      new Set(),
      new Set(),
      buildEmptySquad('user', formation),
      buildEmptySquad('gaffer', formation),
      config.deckId
    );
  });

  // Sync currentLot when authoritative server gameInitData arrives
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.cards && gameInitData.sharedData.cards.length > 0) {
      const idx = lotNumber - 1;
      if (gameInitData.sharedData.cards[idx]) {
        setCurrentLot(gameInitData.sharedData.cards[idx]);
      }
    }
  }, [isMultiplayer, gameInitData, lotNumber]);

  const [currentBid, setCurrentBid] = useState(0);
  const [highBidderId, setHighBidderId] = useState<string | null>(null);
  const [roundTimer, setRoundTimer] = useState(15.0); // 15.0 seconds initial lot clock
  const [phase, setPhase] = useState<AuctionPhase>('bidding');
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver: phase === 'showdown',
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena: onExitMatch,
    arenaKey: 'auction-draft',
  });

  // Absolute Bidding Swipe Belt Selection
  const [selectedBidAmount, setSelectedBidAmount] = useState<number | null>(null);

  // Gavel Slam & Transfer Sweep Animation states
  const [stampText, setStampText] = useState<string | null>(null);
  const [stampColor, setStampColor] = useState<'volt' | 'red' | 'amber'>('volt');
  const [flyDirection, setFlyDirection] = useState<'left' | 'right' | null>(null);
  const [flashingSlotId, setFlashingSlotId] = useState<string | null>(null);

  // Streamer Code Privacy
  const [isMasked, setIsMasked] = useState(config.isRoomCodeMasked);
  const [codeCopied, setCodeCopied] = useState(false);

  // Refs for timeouts
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hammerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global unmount cleanup for all animation and bot timers
  useEffect(() => {
    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
      if (hammerTimeoutRef.current) clearTimeout(hammerTimeoutRef.current);
      if (flyTimeoutRef.current) clearTimeout(flyTimeoutRef.current);
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    };
  }, []);

  // ================= STRICT BANKROLL ACCOUNTING FORMULA =================
  // Total Initial Bankroll = $20.00
  const INITIAL_BANKROLL = 20;

  // 1. Permanent spent funds = sum of winning purchase prices for all players currently in roster
  const userSpent = userState.slots.reduce((sum, slot) => sum + (slot.cost ?? 0), 0);
  const botSpent = botState.slots.reduce((sum, slot) => sum + (slot.cost ?? 0), 0);

  // 2. Permanent unspent capital (remaining bankroll)
  const userRemainingCash = Math.max(0, INITIAL_BANKROLL - userSpent);
  const botRemainingCash = Math.max(0, INITIAL_BANKROLL - botSpent);

  // 3. Provisional Escrow: Active bid on table ONLY IF actively held by that player during bidding
  const isUserHighBidder = highBidderId === 'user';
  const isBotHighBidder = highBidderId === 'gaffer';
  const userEscrow = isUserHighBidder && phase === 'bidding' ? currentBid : 0;
  const botEscrow = isBotHighBidder && phase === 'bidding' ? currentBid : 0;

  // 4. Available Funds = $20 - spent - escrow (outbid recovery is instant)
  const userAvailableFunds = Math.max(0, userRemainingCash - userEscrow);
  const botAvailableFunds = Math.max(0, botRemainingCash - botEscrow);

  // 5. Squad completion flags
  const isUserFull = isSquadFull(userState.slots);
  const isBotFull = isSquadFull(botState.slots);

  // 6. Eligibility & Bankruptcy Calculations (defensive null guard)
  const canUserAcceptCurrentLot = currentLot && !isUserFull ? canManagerAcceptCard(userState.slots, currentLot) : false;
  const canBotAcceptCurrentLot = currentLot && !isBotFull ? canManagerAcceptCard(botState.slots, currentLot) : false;

  // Uncontested lot detection: exactly one manager can legally roster this card
  const isUserUncontested = Boolean(currentLot && canUserAcceptCurrentLot && !canBotAcceptCurrentLot);
  const isBotUncontested = Boolean(currentLot && canBotAcceptCurrentLot && !canUserAcceptCurrentLot);

  // Auto-award uncontested signing instantly: no countdown timer and no forced bidding needed!
  useEffect(() => {
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;

    if (isUserUncontested || isBotUncontested) {
      const winner = isUserUncontested ? 'user' : 'gaffer';
      const timerId = setTimeout(() => {
        executeBid(winner, 0);
        setRoundTimer(0.1); // Instantly triggers hammer drop and assigns player for $0
      }, 600);
      return () => clearTimeout(timerId);
    }
  }, [phase, matchIntroCount, isTransitioning, currentLot, isUserUncontested, isBotUncontested]);
  // Real Bankruptcy: only if unspent bankroll is 0
  const isUserBankrupt = userRemainingCash <= 0;
  // Next legal bid amount:
  const userMinNextBid = currentBid === 0 ? 1 : currentBid + 1;
  // Usable bidding capacity is userRemainingCash (since placing a bid replaces any prior escrow)
  const canUserAffordMinBid = userRemainingCash >= userMinNextBid;

  // Available bid options from next legal bid up to user's remaining bankroll
  const availableBidAmounts: number[] = [];
  if (
    canUserAffordMinBid &&
    canUserAcceptCurrentLot &&
    !isUserHighBidder &&
    phase === 'bidding' &&
    !isBotFull &&
    !isUserUncontested
  ) {
    for (let amt = userMinNextBid; amt <= userRemainingCash; amt++) {
      availableBidAmounts.push(amt);
    }
  }

  // Clear selected bid if current bid climbs higher than or equal to selected amount
  useEffect(() => {
    if (selectedBidAmount !== null && selectedBidAmount <= currentBid) {
      setSelectedBidAmount(null);
    }
  }, [currentBid, selectedBidAmount]);

  // 1. Initial 3-2-1 countdown sequence on arena mount
  useEffect(() => {
    if (matchIntroCount === null) return;

    if (matchIntroCount > 0) {
      soundFX.playClick(400 + (4 - matchIntroCount) * 200);
      const timer = setTimeout(() => {
        setMatchIntroCount(matchIntroCount - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (matchIntroCount === 0) {
      soundFX.playHammer();
      const timer = setTimeout(() => {
        setMatchIntroCount(null); // Dissolve overlay and begin draft
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [matchIntroCount]);

  // Turn-based bidding state: alternating turns between user and gaffer/opponent
  const [roundStarter, setRoundStarter] = useState<'user' | 'gaffer'>(() => {
    if (isMultiplayer && gameInitData?.sharedData?.startingBidderId) {
      return gameInitData.sharedData.startingBidderId === myPlayerId ? 'user' : 'gaffer';
    }
    return Math.random() < 0.5 ? 'user' : 'gaffer';
  });

  const [activeTurn, setActiveTurn] = useState<'user' | 'gaffer'>(() => {
    if (isMultiplayer && gameInitData?.sharedData?.startingBidderId) {
      return gameInitData.sharedData.startingBidderId === myPlayerId ? 'user' : 'gaffer';
    }
    return Math.random() < 0.5 ? 'user' : 'gaffer';
  });

  // Rematch readiness sync
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);

  // Sync startingBidderId if gameInitData arrives asynchronously
  const hasSyncedStarterRef = useRef(false);
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.startingBidderId && !hasSyncedStarterRef.current) {
      hasSyncedStarterRef.current = true;
      const starter = gameInitData.sharedData.startingBidderId === myPlayerId ? 'user' : 'gaffer';
      setRoundStarter(starter);
      setActiveTurn(starter);
    }
  }, [isMultiplayer, gameInitData, myPlayerId]);

  const lastProcessedEventIdRef = useRef<number | string | null>(null);

  // Main High-Precision Auction Timer (100ms ticks)
  useEffect(() => {
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;
    lastTickRef.current = -1;

    const interval = setInterval(() => {
      setRoundTimer((prev) => {
        if (prev <= 0.1) {
          return 0;
        }
        // Audio tick strictly once per integer second under 3 seconds
        const intSec = Math.ceil(prev - 0.1);
        if (intSec <= 3 && intSec > 0 && lastTickRef.current !== intSec) {
          lastTickRef.current = intSec;
          soundFX.playCountdownTick();
        }
        return Math.max(0, parseFloat((prev - 0.1).toFixed(1)));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase, matchIntroCount, isTransitioning, currentLot]);

  // Turn Timeout Trigger when Round Timer hits 0
  useEffect(() => {
    if (roundTimer <= 0 && phase === 'bidding' && !isTransitioning && matchIntroCount === null && currentLot) {
      console.log(`[AuctionArena] Turn timer reached 0s for ${activeTurn}`);
      if (activeTurn === 'user') {
        // User ran out of time
        if (highBidderId === 'gaffer') {
          handleHammerDrop('gaffer', currentBid, false);
        } else {
          // Pass at $0
          setUserState((prev) => ({ ...prev, hasFolded: true }));
          if (botState.hasFolded) {
            handleHammerDrop(null, 0, false);
          } else {
            setActiveTurn('gaffer');
            setRoundTimer(8.0);
          }
        }
      } else {
        // Opponent / Gaffer ran out of time
        if (highBidderId === 'user') {
          handleHammerDrop('user', currentBid, false);
        } else {
          // Pass at $0
          setBotState((prev) => ({ ...prev, hasFolded: true }));
          if (userState.hasFolded) {
            handleHammerDrop(null, 0, false);
          } else {
            setActiveTurn('user');
            setRoundTimer(8.0);
          }
        }
      }
    }
  }, [roundTimer, phase, isTransitioning, matchIntroCount, currentLot, activeTurn, highBidderId, currentBid, botState.hasFolded, userState.hasFolded]);

  // Bot Autonomous Bidding Trigger (solo mode only, when activeTurn === 'gaffer')
  useEffect(() => {
    if (isMultiplayer) return;
    if (phase !== 'bidding' || matchIntroCount !== null || isTransitioning || !currentLot) return;
    if (activeTurn !== 'gaffer') return;
    if (botState.hasFolded) return;

    // Forced Slot Acquisition: Bot is already 100% full
    if (isBotFull) {
      return;
    }

    // Forced Slot Acquisition: User is full, Bot must acquire remaining vacant slot
    if (isUserFull && !isBotFull && canBotAcceptCurrentLot) {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
      const forcedBotCost = botRemainingCash > 0 ? 1 : 0;
      botTimeoutRef.current = setTimeout(() => {
        executeBid('gaffer', forcedBotCost);
        setActiveTurn('user');
      }, 800);
      return;
    }

    const decision = evaluateBotBid(botState, userState, currentLot, currentBid, highBidderId);

    if (decision.shouldBid && decision.bidAmount && decision.bidAmount > currentBid) {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);

      botTimeoutRef.current = setTimeout(() => {
        executeBid('gaffer', decision.bidAmount!);
        setActiveTurn('user');
      }, decision.delayMs || 1000);
    } else {
      // Bot folds
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = setTimeout(() => {
        setBotState((prev) => ({ ...prev, hasFolded: true }));
        if (highBidderId === 'user') {
          handleHammerDrop('user', currentBid, false);
        } else {
          setActiveTurn('user');
          setRoundTimer(8.0);
          if (userState.hasFolded) {
            handleHammerDrop(null, 0, false);
          }
        }
      }, 700);
    }

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, [
    isMultiplayer,
    phase,
    matchIntroCount,
    isTransitioning,
    currentBid,
    highBidderId,
    activeTurn,
    botState.hasFolded,
    userState.hasFolded,
    currentLot,
    botRemainingCash,
    isUserFull,
    isBotFull,
    canBotAcceptCurrentLot,
  ]);

  // Synchronize incoming multiplayer events from opponent
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent._eventId && lastProcessedEventIdRef.current === lastGameEvent._eventId) {
      return;
    }
    lastProcessedEventIdRef.current = lastGameEvent._eventId || null;

    if (lastGameEvent.event === 'auction_bid') {
      const { amount, lotNumber: evLot } = lastGameEvent.data || {};
      if (typeof amount === 'number' && (evLot === undefined || evLot === lotNumber)) {
        executeBid('gaffer', amount);
        setActiveTurn('user');
      }
    } else if (lastGameEvent.event === 'auction_pass') {
      soundFX.playClick(400);
      setBotState((prev) => ({ ...prev, hasFolded: true }));
      if (highBidderId === 'user') {
        if (isHost) {
          handleHammerDrop('user', currentBid, false);
        }
      } else {
        // Passed at $0, turn flips to user
        setActiveTurn('user');
        setRoundTimer(8.0);
        if (userState.hasFolded && isHost) {
          handleHammerDrop(null, 0, false);
        }
      }
    } else if (lastGameEvent.event === 'auction_hammer_outcome') {
      const { winnerPlayerId, finalCost: authCost, isBankruptFreeClaim: authFree, lotNumber: authLot } = lastGameEvent.data || {};
      if (!isHost && authLot === lotNumber && phase === 'bidding' && !isTransitioning) {
        const resolvedWinnerId = winnerPlayerId === myPlayerId ? 'user' : (winnerPlayerId ? 'gaffer' : null);
        handleHammerDrop(resolvedWinnerId, typeof authCost === 'number' ? authCost : 0, Boolean(authFree));
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handleRematch();
    }
  }, [isMultiplayer, isHost, lastGameEvent, myPlayerId, highBidderId, lotNumber, phase, isTransitioning, currentBid, userState.hasFolded]);

  // Execute a Provisional Bid
  const executeBid = (managerId: 'user' | 'gaffer', amount: number) => {
    soundFX.playBid();
    setCurrentBid(amount);
    setHighBidderId(managerId);

    // Each placed bid resets clock to 8.0 seconds for the next manager's turn
    setRoundTimer(8.0);

    if (managerId === 'user') {
      setUserState((prev) => ({ ...prev, hasFolded: false }));
    } else {
      setBotState((prev) => ({ ...prev, hasFolded: false }));
    }
  };

  // User Bidding Handlers
  const handleConfirmUserBid = () => {
    if (selectedBidAmount === null || !currentLot || isTransitioning || activeTurn !== 'user') return;
    if (selectedBidAmount > userRemainingCash) return;
    if (!canManagerAcceptCard(userState.slots, currentLot)) return;

    executeBid('user', selectedBidAmount);
    setActiveTurn('gaffer');
    if (isMultiplayer) {
      sendAction('auction_bid', { amount: selectedBidAmount, lotNumber });
    }
    setSelectedBidAmount(null);
  };

  const handleUserPass = () => {
    if (isTransitioning || phase !== 'bidding' || isBotFull || activeTurn !== 'user') return;
    soundFX.playClick(400);
    setUserState((prev) => ({ ...prev, hasFolded: true }));
    setSelectedBidAmount(null);

    if (isMultiplayer) {
      sendAction('auction_pass', { lotNumber });
    }

    if (highBidderId === 'gaffer') {
      // Opponent held high bid: pass immediately forfeits the lot to high bidder
      handleHammerDrop('gaffer', currentBid, false);
    } else {
      // User passed at $0: turn passes to gaffer
      setActiveTurn('gaffer');
      setRoundTimer(8.0);
      if (botState.hasFolded) {
        handleHammerDrop(null, 0, false);
      }
    }
  };

  // User Forced Slot Claim: locks in remaining slot at min valid cost
  const handleForcedUserClaim = () => {
    if (isTransitioning || phase !== 'bidding' || !currentLot) return;
    const cost = userRemainingCash > 0 ? 1 : 0;
    executeBid('user', cost);
    setRoundTimer(0.1); // Immediate hammer drop
  };

  // Gavel Slam & Transfer Sweep Animation sequence
  const handleHammerDrop = (forcedWinnerId?: string | null, forcedCost?: number, forcedFreeClaim?: boolean) => {
    if (isTransitioning || phase !== 'bidding') return;
    console.log(`[AuctionArena] Hammer dropping for Lot ${lotNumber}:`, currentLot?.displayName || currentLot?.name);
    setIsTransitioning(true);
    setPhase('hammer');
    setSelectedBidAmount(null);

    // Clear any pending bot bidding timeout
    if (botTimeoutRef.current) {
      clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = null;
    }
    if (hammerTimeoutRef.current) clearTimeout(hammerTimeoutRef.current);
    if (flyTimeoutRef.current) clearTimeout(flyTimeoutRef.current);
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);

    const canUserTake = currentLot && !isUserFull ? canManagerAcceptCard(userState.slots, currentLot) : false;
    const canBotTake = currentLot && !isBotFull ? canManagerAcceptCard(botState.slots, currentLot) : false;

    let winnerId: string | null = forcedWinnerId !== undefined ? forcedWinnerId : highBidderId;
    let finalCost = forcedCost !== undefined ? forcedCost : currentBid;
    let isBankruptFreeClaim = forcedFreeClaim !== undefined ? forcedFreeClaim : false;

    if (forcedWinnerId === undefined) {
      // Forced Slot Acquisition: If one squad is full, the unfull squad must win the needed lot
      if (isBotFull && !isUserFull && canUserTake) {
        winnerId = 'user';
        finalCost = Math.max(currentBid, userRemainingCash > 0 ? 1 : 0);
        isBankruptFreeClaim = userRemainingCash <= 0;
      } else if (isUserFull && !isBotFull && canBotTake) {
        winnerId = 'gaffer';
        finalCost = Math.max(currentBid, botRemainingCash > 0 ? 1 : 0);
        isBankruptFreeClaim = botRemainingCash <= 0;
      } else if (!winnerId || currentBid === 0) {
        // Bankrupt or AFK $0 free drop check if nobody bid > 0
        if (canUserTake && (botState.hasFolded || !canBotTake || botRemainingCash <= 0)) {
          winnerId = 'user';
          finalCost = 0;
          isBankruptFreeClaim = true;
        } else if (canBotTake && (userState.hasFolded || !canUserTake || userRemainingCash <= 0)) {
          winnerId = 'gaffer';
          finalCost = 0;
          isBankruptFreeClaim = true;
        }
      }

      if (isMultiplayer && isHost) {
        const winnerPlayerId = winnerId === 'user' ? myPlayerId : (opponent?.id || 'opponent');
        sendAction('auction_hammer_outcome', {
          lotNumber,
          winnerPlayerId: winnerId ? winnerPlayerId : null,
          finalCost,
          isBankruptFreeClaim,
        });
      }
    }

    console.log(`[AuctionArena] Lot ${lotNumber} outcome: winner=${winnerId}, finalCost=$${finalCost}, isFreeClaim=${isBankruptFreeClaim}`);

    // Step 1: Stamp bold diagonal watermark across center card (1.2s freeze)
    if (winnerId === 'user') {
      soundFX.playHammer();
      window.setTimeout(() => soundFX.playSuccess(), 120);
      setStampText(isBankruptFreeClaim ? 'FREE DROP TO YOU! ($0)' : `SOLD TO YOU! ($${finalCost})`);
      setStampColor('volt');
    } else if (winnerId === 'gaffer') {
      soundFX.playHammer();
      setStampText(isBankruptFreeClaim ? 'FREE DROP TO THE GAFFER! ($0)' : `SOLD TO THE GAFFER! ($${finalCost})`);
      setStampColor('red');
    } else {
      soundFX.playVoltBuzz();
      setStampText('LOT BURNED!');
      setStampColor('amber');
    }

    // Step 2: At +1.2s: Card flies with CSS curve toward winner's dugout slot
    flyTimeoutRef.current = setTimeout(() => {
      if (winnerId === 'user') {
        setFlyDirection('left');
      } else if (winnerId === 'gaffer') {
        setFlyDirection('right');
      }
    }, 1200);

    // Step 3: At +1.6s: Card lands in slot, target roster slot flashes with accent pulse
    lockTimeoutRef.current = setTimeout(() => {
      soundFX.playLockIn();
      let nextUserSlots = userState.slots;
      let nextBotSlots = botState.slots;

      // Permanent deduction happens strictly when won card is assigned to slot
      if (winnerId === 'user' && currentLot) {
        const targetIdx = findFirstEligibleSlotIndex(userState.slots, currentLot);
        nextUserSlots = assignCardToSlot(userState.slots, currentLot, finalCost);
        setUserState((prev) => ({
          ...prev,
          bankroll: Math.max(0, INITIAL_BANKROLL - (userSpent + finalCost)),
          slots: nextUserSlots,
        }));
        draftedCardIdsRef.current.add(currentLot.id);

        if (targetIdx !== -1 && nextUserSlots[targetIdx]) {
          setFlashingSlotId(nextUserSlots[targetIdx].id);
        }
        soundFX.playCardFlip();
      } else if (winnerId === 'gaffer' && currentLot) {
        const targetIdx = findFirstEligibleSlotIndex(botState.slots, currentLot);
        nextBotSlots = assignCardToSlot(botState.slots, currentLot, finalCost);
        setBotState((prev) => ({
          ...prev,
          bankroll: Math.max(0, INITIAL_BANKROLL - (botSpent + finalCost)),
          slots: nextBotSlots,
        }));
        draftedCardIdsRef.current.add(currentLot.id);

        if (targetIdx !== -1 && nextBotSlots[targetIdx]) {
          setFlashingSlotId(nextBotSlots[targetIdx].id);
        }
        soundFX.playCardFlip();
      } else if (currentLot) {
        discardedCardIdsRef.current.add(currentLot.id);
      }

      // Step 4: At +2.0s (0.4s pause after lock-in), drop next lot or transition to showdown
      hammerTimeoutRef.current = setTimeout(() => {
        setFlashingSlotId(null);
        setStampText(null);
        setFlyDirection(null);

        const userFull = isSquadFull(nextUserSlots);
        const botFull = isSquadFull(nextBotSlots);

        console.log(`[AuctionArena] Squad completion status: userFull=${userFull}, botFull=${botFull}`);

        if (userFull && botFull) {
          console.log('[AuctionArena] Both squads complete! Advancing to Squad Showdown.');
          setIsTransitioning(false);
          setPhase('showdown');
        } else {
          try {
            const nextCard =
              isMultiplayer && gameInitData?.sharedData?.cards?.[lotNumber]
                ? gameInitData.sharedData.cards[lotNumber]
                : drawNextWeightedCard(
                    draftedCardIdsRef.current,
                    discardedCardIdsRef.current,
                    nextUserSlots,
                    nextBotSlots,
                    config.deckId
                  );

            if (!nextCard || !nextCard.id) {
              console.error('[AuctionArena] drawNextWeightedCard returned empty or invalid card. Advancing to showdown.');
              setIsTransitioning(false);
              setPhase('showdown');
              return;
            }

            console.log(`[AuctionArena] Dealing Lot ${lotNumber + 1}: ${nextCard.displayName || nextCard.name}`);
            setLotNumber((prev) => prev + 1);
            setCurrentLot(nextCard);
            setCurrentBid(0);
            setHighBidderId(null);
            const nextStarter = roundStarter === 'user' ? 'gaffer' : 'user';
            setRoundStarter(nextStarter);
            setActiveTurn(nextStarter);
            setRoundTimer(10.0); // 10.0 seconds opening turn clock
            setSelectedBidAmount(null);
            setUserState((prev) => ({ ...prev, hasFolded: false }));
            setBotState((prev) => ({ ...prev, hasFolded: false }));
            setIsTransitioning(false);
            setPhase('bidding');
          } catch (err) {
            console.error('[AuctionArena] Exception in lot transition:', err);
            setIsTransitioning(false);
            setPhase('showdown');
          }
        }
      }, 400);
    }, 1600);
  };

  // Rematch / Run It Back handler
  const handleRematch = () => {
    soundFX.playClick(900);
    setUserState({
      id: 'user',
      name: 'YOU / MANAGER',
      isBot: false,
      bankroll: 20,
      slots: buildEmptySquad('user', formation),
      hasFolded: false,
    });
    setBotState({
      id: 'gaffer',
      name: config.mode === 'solo' ? 'THE GAFFER [AI]' : 'OPPONENT / MGR',
      isBot: true,
      bankroll: 20,
      slots: buildEmptySquad('gaffer', formation),
      hasFolded: false,
    });
    draftedCardIdsRef.current.clear();
    discardedCardIdsRef.current.clear();
    setLotNumber(1);
    setCurrentLot(
      drawNextWeightedCard(
        new Set(),
        new Set(),
        buildEmptySquad('user', formation),
        buildEmptySquad('gaffer', formation),
        config.deckId
      )
    );
    setCurrentBid(0);
    setHighBidderId(null);
    const starter = Math.random() < 0.5 ? 'user' : 'gaffer';
    setRoundStarter(starter);
    setActiveTurn(starter);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setRoundTimer(10.0);
    setPhase('bidding');
    setSelectedBidAmount(null);
    setMatchIntroCount(3);
    setStampText(null);
    setFlyDirection(null);
    setFlashingSlotId(null);
  };

  const handleRequestOrExecuteRematch = () => {
    if (isMultiplayer) {
      if (!isHost) {
        sendAction('player_rematch_ready', {});
        setHasRequestedRematch(true);
        soundFX.playClick(900);
        return;
      }
      sendAction('match_restart', {});
    }
    handleRematch();
  };

  // Streamer Code Copy
  const handleCopyCode = async () => {
    soundFX.playClick(800);
    try {
      await navigator.clipboard.writeText(config.roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#080a0f] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #ccff00 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-[#ccff00]/10 border border-[#ccff00]/40 flex items-center justify-center text-[#ccff00] shadow-[0_0_30px_rgba(204,255,0,0.3)] animate-pulse">
            <Radio className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-black uppercase tracking-wider text-white">
              SYNCHRONIZING ARENA
            </h2>
            <p className="text-xs font-mono text-neutral-400 mt-1 uppercase tracking-widest">
              Connecting to authoritative match server...
            </p>
          </div>
          <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-[#ccff00] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#080a0f] text-neutral-100 flex flex-col justify-between p-3 md:p-4 overflow-y-auto md:overflow-hidden select-none relative font-sans">
      {/* ================= 3-2-1 DRAFT INTRO COUNTDOWN OVERLAY ================= */}
      {matchIntroCount !== null && (
        <div className="absolute inset-0 z-50 bg-[#080a0f]/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-200">
          <div className="text-center space-y-4">
            <span className="font-mono text-sm tracking-widest text-[#ccff00] uppercase block">
              INITIALIZING AUCTION ARENA
            </span>
            <div className="font-sans font-black text-8xl md:text-9xl text-white tracking-tighter drop-shadow-[0_0_35px_rgba(204,255,0,0.5)] animate-pulse">
              {matchIntroCount === 0 ? 'DRAFT!' : matchIntroCount}
            </div>
          </div>
        </div>
      )}

      {/* ================= 1. TOP STATUS BAR ================= */}
      <header className="w-full flex items-center justify-between gap-2 sm:gap-3 pb-2.5 border-b border-white/10 shrink-0">
        {/* Left: Round & Formation Counter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#12151e] border border-white/10 px-2.5 sm:px-3 py-1.5 rounded-full shadow-inner">
            <span className="w-2 h-2 rounded-full bg-[#ccff00] animate-pulse" />
            <span className="font-mono text-xs font-bold text-white tracking-wider">
              LOT {String(lotNumber).padStart(2, '0')}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-slate-300">
            <Shield className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span className="font-bold text-white">{formation.badge}</span>
            <span className="text-slate-400">({formation.formula})</span>
          </div>
        </div>

        {/* Compact Mobile Live Bankroll Bar */}
        <div className="flex sm:hidden items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#12151e] border border-white/10 text-[10px] font-mono">
          <span className="text-[#ccff00] font-bold">${userRemainingCash.toFixed(1)}</span>
          <span className="text-neutral-500">•</span>
          <span className="text-slate-400">${botRemainingCash.toFixed(1)}</span>
        </div>

        {/* Center: Streamer-Safe Room Code or Matchroom Badge */}
        <div className="flex items-center gap-2 bg-[#12151e] border border-white/10 px-3.5 py-1.5 rounded-full shadow-inner">
          {config.mode === 'solo' ? (
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Bot className="w-3.5 h-3.5 text-[#ff6b00]" />
              <span className="font-bold text-white">SOLO MATCH</span>
              <span className="text-slate-500">•</span>
              <span className="text-[#ff6b00]">THE GAFFER</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">ROOM:</span>
              <span className="font-bold text-[#ccff00] tracking-widest">
                {isMasked ? '••••' : config.roomCode}
              </span>
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick(600);
                  setIsMasked(!isMasked);
                }}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                title={isMasked ? 'Reveal Room Code' : 'Hide Room Code'}
              >
                {isMasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                title="Copy Room Code"
              >
                {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* Right: Forfeit Button */}
        <div>
          <button
            type="button"
            onClick={() => {
              soundFX.playClick(500);
              setShowForfeitModal(true);
            }}
            className="px-3.5 py-1.5 rounded-full bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 hover:border-red-500 text-red-400 text-xs font-mono font-bold tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">FORFEIT MATCH</span>
            <span className="sm:hidden">EXIT</span>
          </button>
        </div>
      </header>

      {/* ================= 2. REBALANCED GRID (30% / 40% / 30%) ================= */}
      <main className="flex-1 w-full grid grid-cols-1 md:grid-cols-10 gap-3 md:gap-4 my-2 overflow-visible md:overflow-hidden items-stretch">
        {/* ================= LEFT DUGOUT: 30% WIDTH (3/10 COLS) ================= */}
        <div className="order-2 md:order-1 md:col-span-3 bg-[#10131a] border border-white/10 rounded-3xl p-3 md:p-3.5 flex flex-col justify-between shadow-[0_12px_30px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden">
          {/* Header & Bankroll HUD (Strict Escrow Release Formula) */}
          <div className="pb-2 border-b border-white/5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#ccff00]" />
                <span className="font-sans font-black text-xs md:text-sm text-white uppercase tracking-tight">
                  {userState.name}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {isUserHighBidder
                  ? `RESERVED: $${currentBid} • AVAIL: $${userAvailableFunds}`
                  : `AVAILABLE FUNDS: $${userAvailableFunds}`}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[9px] font-mono text-slate-400 uppercase block">BANKROLL</span>
              <span
                className={`font-mono font-black text-lg md:text-xl tracking-tight ${
                  userRemainingCash <= 0 ? 'text-red-500 animate-pulse' : 'text-[#ccff00]'
                }`}
              >
                ${userRemainingCash.toFixed(2)}
              </span>
            </div>
          </div>

          {/* 5 Horizontal Collector Slabs (h-[86px] md:h-[90px] each, filling dugout vertically without dead space) */}
          <div className="flex-1 my-1.5 flex flex-col justify-between gap-2 overflow-hidden">
            {userState.slots.map((slot, idx) => (
              <HorizontalCollectorSlab
                key={slot.id}
                slot={slot}
                index={idx}
                isFlashing={flashingSlotId === slot.id}
              />
            ))}
          </div>

          {/* Status Indicator */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400">
              SQUAD: {userState.slots.filter((s) => s.filledPlayer).length} / 5
            </span>
            {userState.hasFolded ? (
              <span className="text-red-400 font-bold">[ FOLDED LOT ]</span>
            ) : isUserBankrupt ? (
              <span className="text-red-400 font-bold animate-pulse">[ BANKRUPT $0 ]</span>
            ) : isUserHighBidder ? (
              <span className="text-[#ccff00] font-bold">[ HIGH BIDDER ]</span>
            ) : (
              <span className="text-slate-500">[ READY ]</span>
            )}
          </div>
        </div>

        {/* ================= CENTER AUCTION BLOCK: 40% WIDTH (4/10 COLS) ================= */}
        <div className="order-1 md:order-2 md:col-span-4 bg-[#0c0e14] border border-white/10 rounded-3xl p-3 md:p-3.5 flex flex-col justify-between items-center shadow-2xl relative overflow-hidden">
          {/* Symmetrical Centered Stage Spotlight & Collector Aura (Zero crooked flares) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 flex items-center justify-center">
            {/* Subtle Architectural Grid Backdrop */}
            <div className="absolute inset-0 pitch-grid-bg opacity-45" />
            {/* Centered Vertical Stage Spotlight Column */}
            <div
              className="w-80 h-full opacity-60"
              style={{
                background:
                  'linear-gradient(180deg, rgba(251,191,36,0.03) 0%, rgba(251,191,36,0.08) 50%, rgba(212,175,55,0.12) 82%, transparent 100%)',
                filter: 'blur(24px)',
              }}
            />
            {/* Symmetrical Radial Halo Centered Directly Behind the Card */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[420px] rounded-full"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 50%, rgba(251,191,36,0.14) 0%, rgba(30,41,59,0.22) 48%, transparent 72%)',
                filter: 'blur(18px)',
              }}
            />
          </div>

          {/* Top HUD & High Bid Indicator with Floating Digital Clock Pill (Zero clutter, zero duplicate strip) */}
          <div className="w-full flex items-center justify-between gap-2 px-1 relative z-10 pb-1 border-b border-white/5 shrink-0">
            {/* High Bid Amount & Held-By Information */}
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    backgroundColor: isUserHighBidder
                      ? '#ccff00'
                      : highBidderId === 'gaffer'
                      ? '#ef4444'
                      : '#94a3b8',
                  }}
                />
                <span className="text-[10px] md:text-xs font-mono font-bold tracking-wider uppercase text-slate-400">
                  {isUserHighBidder
                    ? 'HIGH BID • HELD BY YOU'
                    : highBidderId === 'gaffer'
                    ? 'HIGH BID • THE GAFFER'
                    : 'OPENING LOT • BASE'}
                </span>
              </div>

              {/* Massive Absolute Bid Dollar Amount */}
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span
                  className={`font-mono font-black text-4xl md:text-5xl lg:text-6xl tracking-tight leading-none transition-all ${
                    isUserHighBidder
                      ? 'text-[#ccff00] drop-shadow-[0_0_25px_rgba(204,255,0,0.7)]'
                      : highBidderId === 'gaffer'
                      ? 'text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,0.7)]'
                      : 'text-white/80'
                  }`}
                >
                  ${currentBid}
                </span>
                {currentBid === 0 && (
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    (OPEN)
                  </span>
                )}
              </div>
            </div>

            {/* Floating Digital Clock Pill ("15.0s", resets to 7.0s on counter-bid) */}
            <div
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border shadow-lg transition-all ${
                roundTimer <= 3.0
                  ? 'bg-red-500/25 border-red-500 text-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                  : roundTimer <= 5.0
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-[#12151e] border-white/20 text-[#00f0ff]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="font-mono font-black text-base md:text-lg tracking-widest">
                {roundTimer.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Center Stage: Levitating Era Card + Architectural Collector Stage Plinth */}
          <div className="my-auto py-1 flex flex-col items-center justify-center w-full relative z-10 min-h-[280px] sm:min-h-[380px]">
            {!currentLot ? (
              <div className="flex flex-col items-center justify-center h-[280px] sm:h-[380px] text-zinc-500 font-mono text-xs uppercase tracking-widest animate-pulse">
                Dealing Next Lot...
              </div>
            ) : (
              <>
                {/* Spotlighted Era Card (Levitates cleanly above the stage without touching it) */}
                <div
                  className={`relative z-20 w-[235px] sm:w-[285px] md:w-[300px] lg:w-[314px] max-h-[36vh] sm:max-h-[48vh] transition-all duration-400 ease-out transform ${
                    flyDirection === 'left'
                      ? '-translate-x-[120%] scale-50 opacity-0'
                      : flyDirection === 'right'
                      ? 'translate-x-[120%] scale-50 opacity-0'
                      : 'translate-x-0 scale-100 opacity-100'
                  }`}
                >
                  <EraPlayerCard
                    key={currentLot?.id ?? lotNumber}
                    id={currentLot?.id ?? ''}
                    name={currentLot?.name ?? 'UNKNOWN'}
                    displayName={currentLot?.displayName ?? currentLot?.name ?? ''}
                    firstName={currentLot?.firstName ?? ''}
                    lastName={currentLot?.lastName ?? currentLot?.name ?? ''}
                    clubCode={currentLot?.clubCode ?? 'AT'}
                    clubAbbreviation={currentLot?.clubAbbreviation ?? currentLot?.clubCode}
                    season={currentLot?.season ?? '2024'}
                    positions={currentLot?.positions ?? ['ATK']}
                    club={currentLot?.club ?? 'Added Time'}
                    clubCrestUrl={currentLot?.clubCrestUrl}
                    crestPath={currentLot?.crestPath}
                    nation={currentLot?.nation}
                    nationFlagUrl={currentLot?.nationFlagUrl}
                    imageUrl={currentLot?.imageUrl}
                    imagePath={currentLot?.imagePath}
                    auctionBasePrice={currentLot?.auctionBasePrice ?? currentLot?.basePrice ?? 4}
                    ovr={currentLot?.ovr ?? 90}
                    showOvr={false}
                    stampText={stampText}
                    stampColor={stampColor}
                    eraStats={currentLot?.eraStats}
                    interactive={true}
                    className="w-full drop-shadow-[0_18px_28px_rgba(0,0,0,0.92)]"
                  />
                </div>

                {/* Architectural Collector Stage Plinth (Separated below the floating card with air gap) */}
                <div className="relative w-72 md:w-80 mt-3 mb-0.5 z-10 flex flex-col items-center justify-center pointer-events-none">
                  {/* Upward Stage Reflection & Floating Card Cast Shadow */}
                  <div className="w-52 h-2.5 rounded-full bg-black/90 blur-[5px] -mb-1 z-20" />
                  <div className="absolute -top-3 w-56 h-5 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.22)_0%,transparent_75%)] blur-md" />

                  {/* Upper Illuminated Plinth Deck */}
                  <div className="relative w-full h-3.5 rounded-[100%] bg-gradient-to-b from-[#1e2536] via-[#111520] to-[#090c12] border border-[#fbbf24]/50 shadow-[0_8px_20px_rgba(0,0,0,0.95),0_0_18px_rgba(251,191,36,0.12)] flex items-center justify-center overflow-hidden">
                    {/* Crisp Center Gold Horizon Laser Line */}
                    <div className="absolute top-0 inset-x-10 h-[1.5px] bg-gradient-to-r from-transparent via-[#fbbf24]/90 to-transparent" />
                    {/* Subtle Inner Collector Ring */}
                    <div className="w-[82%] h-[55%] rounded-[100%] border border-[#fbbf24]/25 bg-[#0a0d14]/60" />
                  </div>

                  {/* Lower Stepped Metallic Base */}
                  <div className="w-[88%] h-1.5 -mt-0.5 rounded-b-[100%] bg-gradient-to-r from-transparent via-[#fbbf24]/30 to-transparent opacity-80" />
                </div>
              </>
            )}
          </div>

          {/* Bottom: Absolute-Bid Swipe Belt & 2-Step Misclick Confirmation */}
          <div className="w-full pt-2 border-t border-white/5 flex flex-col gap-1.5 relative z-10 shrink-0">
            {/* Position Filled Alert, Forced Claim Notice, or Bankrupt Alert */}
            {isUserUncontested ? (
              <div className="py-2.5 px-3 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/40 text-center text-xs font-mono text-[#ccff00] font-black uppercase tracking-wider animate-pulse shadow-[0_0_20px_rgba(204,255,0,0.25)]">
                UNCONTESTED SIGNING • OPPONENT HAS NO VACANT {(currentLot?.positions ?? []).join('/')} SLOT • SIGNING TO YOU FREE ($0)!
              </div>
            ) : isBotUncontested ? (
              <div className="py-2.5 px-3 rounded-xl bg-red-500/15 border border-red-500/40 text-center text-xs font-mono text-red-400 font-black uppercase tracking-wider animate-pulse">
                UNCONTESTED SIGNING • YOU HAVE NO VACANT {(currentLot?.positions ?? []).join('/')} SLOT • SIGNING TO THE GAFFER!
              </div>
            ) : isUserFull ? (
              <div className="py-2 px-3 rounded-xl bg-white/5 border border-white/10 text-center text-xs font-mono text-slate-300">
                [ SQUAD COMPLETE ] Your roster is full (5/5). Waiting for opponent to finalize remaining slots.
              </div>
            ) : isBotFull && canUserAcceptCurrentLot ? (
              <div className="py-2 px-3 rounded-xl bg-[#ccff00]/10 border border-[#ccff00]/30 text-center text-xs font-mono text-[#ccff00] font-bold">
                OPPONENT ROSTER COMPLETE (5/5) • MANDATORY FORCED CLAIM FOR YOUR VACANT SLOT
              </div>
            ) : !canUserAcceptCurrentLot ? (
              <div className="py-1 px-2 rounded-lg bg-white/5 border border-white/10 text-center text-[11px] font-mono text-slate-400">
                [ POSITION SLOTS FULL ] You cannot draft another {(currentLot?.positions ?? []).join('/')}.
              </div>
            ) : isUserBankrupt ? (
              <div className="py-1 px-2 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/30 text-center text-[11px] font-mono text-[#fbbf24]">
                BANKRUPT ($0) : Bidding disabled. If opponent passes, you claim for FREE ($0)!
              </div>
            ) : isUserHighBidder ? (
              <div className="py-1 px-2 rounded-lg bg-[#ccff00]/10 border border-[#ccff00]/30 text-center text-[11px] font-mono text-[#ccff00] font-bold">
                YOU HOLD THE HIGH BID (${currentBid}) • WAITING ON CLOCK OR GAFFER
              </div>
            ) : !canUserAffordMinBid ? (
              <div className="py-1 px-2 rounded-lg bg-red-950/40 border border-red-500/30 text-center text-[11px] font-mono text-red-400">
                INSUFFICIENT FUNDS (${userMinNextBid} needed, ${userRemainingCash} available).
              </div>
            ) : null}

            {/* Turn Status Banner */}
            {!isUserUncontested && !isBotUncontested && !isUserFull && !(isBotFull && canUserAcceptCurrentLot) && (
              activeTurn === 'user' ? (
                <div className="py-1 px-2.5 rounded-lg bg-[#ccff00]/15 border border-[#ccff00]/40 text-center text-[11px] font-mono text-[#ccff00] font-black tracking-wider uppercase animate-pulse flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(204,255,0,0.15)]">
                  <span className="w-2 h-2 rounded-full bg-[#ccff00] animate-ping" />
                  <span>YOUR TURN TO BID OR PASS ({roundTimer.toFixed(1)}s)</span>
                </div>
              ) : (
                <div className="py-1 px-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-center text-[11px] font-mono text-amber-300 font-bold tracking-wider uppercase flex items-center justify-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  <span>WAITING FOR {botState.name.toUpperCase()} TO BID... ({roundTimer.toFixed(1)}s)</span>
                </div>
              )
            )}

            {/* Action Buttons Section */}
            {isUserUncontested || isBotUncontested ? (
              <div className="w-full py-3 flex items-center justify-center gap-2 text-xs font-mono text-[#ccff00] animate-pulse">
                <Check className="w-4 h-4" />
                <span>Awarding uncontested player to dugout...</span>
              </div>
            ) : isUserFull ? (
              <div className="w-full py-3 flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
                <Clock className="w-4 h-4 animate-spin text-[#ccff00]" />
                <span>The Gaffer is drafting final positions...</span>
              </div>
            ) : isBotFull && canUserAcceptCurrentLot ? (
              /* Forced Claim Button: PASS is completely hidden, only CLAIM ($1 or FREE $0) */
              <div className="w-full pt-1">
                <button
                  type="button"
                  disabled={phase !== 'bidding'}
                  onClick={handleForcedUserClaim}
                  className="w-full h-12 md:h-14 rounded-2xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-sm md:text-base uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(204,255,0,0.5)] active:scale-95 cursor-pointer animate-pulse"
                >
                  <Gavel className="w-5 h-5" />
                  <span>CLAIM {userRemainingCash > 0 ? '($1)' : 'FREE ($0)'}</span>
                </button>
              </div>
            ) : (
              <>
                {/* Dynamic Absolute Number Track (Horizontal Swipe Belt) */}
                {canUserAcceptCurrentLot && !isUserBankrupt && !isUserHighBidder && canUserAffordMinBid && (
                  <div className={`w-full flex flex-col gap-1 transition-opacity ${activeTurn !== 'user' ? 'opacity-40 pointer-events-none' : ''}`}>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
                      <span className="uppercase tracking-wider">CHOOSE EXACT BID:</span>
                      <span>MAX BANKROLL: ${userRemainingCash}</span>
                    </div>

                    <div className="w-full flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar">
                      {availableBidAmounts.map((amount) => {
                        const isSelected = selectedBidAmount === amount;
                        return (
                          <button
                            key={amount}
                            type="button"
                            disabled={phase !== 'bidding' || activeTurn !== 'user'}
                            onClick={() => {
                              soundFX.playClick(600);
                              setSelectedBidAmount(amount);
                            }}
                            className={`shrink-0 min-w-[50px] md:min-w-[56px] h-10 md:h-11 rounded-xl font-mono font-black text-sm md:text-base transition-all flex items-center justify-center cursor-pointer ${
                              isSelected
                                ? 'bg-[#ccff00] text-black border-2 border-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.6)] scale-105'
                                : 'bg-[#141824] hover:bg-[#1e2436] text-white border border-white/10 hover:border-[#ccff00]/50'
                            }`}
                          >
                            <span>${amount}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2-Step Misclick Protection Actions: [ CONFIRM BID $X ] & Independent [ PASS ] */}
                <div className="grid grid-cols-3 gap-2 pt-0.5">
                  {/* CONFIRM BID $X Button (2 cols) */}
                  <button
                    type="button"
                    disabled={phase !== 'bidding' || selectedBidAmount === null || activeTurn !== 'user'}
                    onClick={handleConfirmUserBid}
                    className={`col-span-2 h-11 md:h-12 rounded-xl font-sans font-black text-xs md:text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg ${
                      selectedBidAmount !== null && phase === 'bidding' && activeTurn === 'user'
                        ? 'bg-[#ccff00] hover:bg-[#d8ff33] text-black shadow-[#ccff00]/20 active:scale-95 cursor-pointer animate-pulse'
                        : 'bg-white/5 border border-white/10 text-slate-500 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Gavel className="w-4 h-4" />
                    <span>
                      {selectedBidAmount !== null ? `CONFIRM BID $${selectedBidAmount}` : 'SELECT A BID ABOVE'}
                    </span>
                  </button>

                  {/* Independent PASS Button (1 col) */}
                  <button
                    type="button"
                    disabled={phase !== 'bidding' || userState.hasFolded || activeTurn !== 'user'}
                    onClick={handleUserPass}
                    className="col-span-1 h-11 md:h-12 rounded-xl bg-[#ef4444]/20 hover:bg-[#ef4444] border border-[#ef4444] text-[#ef4444] hover:text-white font-mono font-black text-xs md:text-sm uppercase tracking-wider transition-all flex items-center justify-center active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  >
                    <span>PASS</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ================= RIGHT DUGOUT: 30% WIDTH (3/10 COLS) ================= */}
        <div className="order-3 md:order-3 md:col-span-3 bg-[#10131a] border border-white/10 rounded-3xl p-3 md:p-3.5 flex flex-col justify-between shadow-[0_12px_30px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden">
          {/* Header & Bankroll HUD */}
          <div className="pb-2 border-b border-white/5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-[#ff6b00]" />
                <span className="font-sans font-black text-xs md:text-sm text-white uppercase tracking-tight">
                  {botState.name}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {isBotHighBidder
                  ? `RESERVED: $${currentBid} • AVAIL: $${botAvailableFunds}`
                  : `AVAILABLE FUNDS: $${botAvailableFunds}`}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[9px] font-mono text-slate-400 uppercase block">BANKROLL</span>
              <span
                className={`font-mono font-black text-lg md:text-xl tracking-tight ${
                  botRemainingCash <= 0 ? 'text-red-500 animate-pulse' : 'text-slate-200'
                }`}
              >
                ${botRemainingCash.toFixed(2)}
              </span>
            </div>
          </div>

          {/* 5 Horizontal Collector Slabs (h-[86px] md:h-[90px] each, filling dugout vertically without dead space) */}
          <div className="flex-1 my-1.5 flex flex-col justify-between gap-2 overflow-hidden">
            {botState.slots.map((slot, idx) => (
              <HorizontalCollectorSlab
                key={slot.id}
                slot={slot}
                index={idx}
                isFlashing={flashingSlotId === slot.id}
              />
            ))}
          </div>

          {/* Status Indicator */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400">
              SQUAD: {botState.slots.filter((s) => s.filledPlayer).length} / 5
            </span>
            {botState.hasFolded ? (
              <span className="text-red-400 font-bold">[ FOLDED LOT ]</span>
            ) : botRemainingCash <= 0 ? (
              <span className="text-red-400 font-bold animate-pulse">[ BANKRUPT $0 ]</span>
            ) : highBidderId === 'gaffer' ? (
              <span className="text-[#ff6b00] font-bold">[ HIGH BIDDER ]</span>
            ) : (
              <span className="text-slate-500">[ EVALUATING ]</span>
            )}
          </div>
        </div>
      </main>

      {/* ================= 3. FORFEIT CONFIRMATION MODAL ================= */}
      <ForfeitMatchModal
        isOpen={showForfeitModal}
        onStay={() => setShowForfeitModal(false)}
        onForfeit={() => {
          if (isMultiplayer) sendGameLeave();
          setShowForfeitModal(false);
          handleCleanExit();
        }}
      />

      {/* ================= 4. POST-MATCH SQUAD SHOWDOWN OVERLAY ================= */}
      {phase === 'showdown' && (
        <SquadShowdown
          userState={{
            ...userState,
            bankroll: userRemainingCash,
          }}
          botState={{
            ...botState,
            bankroll: botRemainingCash,
          }}
          onRematch={handleRequestOrExecuteRematch}
          isMultiplayer={isMultiplayer}
          isHost={isHost}
          isOpponentRematchReady={isOpponentRematchReady}
          hasRequestedRematch={hasRequestedRematch}
          onReturnToHub={() => {
            if (isMultiplayer) sendGameLeave();
            handleCleanExit();
          }}
        />
      )}

      {/* Multiplayer Opponent Forfeit Dialog */}
      <MultiplayerForfeitModal
        forfeitEvent={playerForfeitEvent}
        onReturnToHub={() => {
          clearForfeit();
          handleCleanExit();
        }}
      />
    </div>
  );
};

export const AuctionArena: React.FC<AuctionArenaProps> = (props) => {
  return (
    <AuctionErrorBoundary onExitMatch={props.onExitMatch}>
      <AuctionArenaInner {...props} />
    </AuctionErrorBoundary>
  );
};

/**
 * Tactile Horizontal Collector Slab for Dugout Formation Slots (h-[86px] md:h-[90px])
 * Features enlarged player surname, enlarged photo cutout frame, enlarged club crest,
 * robust image error safety nets (clean dark silhouette / clubCode badge),
 * and high-visibility Acid Volt winning price pill.
 * Strictly zero OVR during draft phase.
 */
interface HorizontalCollectorSlabProps {
  slot: SquadSlot;
  index: number;
  isFlashing?: boolean;
}

const HorizontalCollectorSlab: React.FC<HorizontalCollectorSlabProps> = ({
  slot,
  index,
  isFlashing = false,
}) => {
  const p = slot.filledPlayer;
  const [avatarError, setAvatarError] = useState(false);
  const [crestError, setCrestError] = useState(false);
  const [activeCrest, setActiveCrest] = useState<string>('');

  const crestSrc = p ? (p.crestPath || p.clubCrestUrl || '') : '';

  useEffect(() => {
    setActiveCrest(crestSrc);
    setCrestError(false);
    setAvatarError(false);
  }, [p?.id, crestSrc]);

  const posBadgeColor =
    slot.position === 'GK'
      ? 'bg-[#fbbf24]/20 text-[#fbbf24] border-[#fbbf24]/60'
      : slot.position === 'DEF'
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/60'
      : slot.position === 'MID'
      ? 'bg-[#ccff00]/20 text-[#ccff00] border-[#ccff00]/60'
      : 'bg-red-500/20 text-red-400 border-red-500/60';

  // Format full season (e.g. "2018-2019")
  const formatSeason = (s: string = '') => {
    if (!s) return '';
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts[0]?.length === 4 && parts[1]?.length === 2) {
        return `${parts[0]}-${parts[0].slice(0, 2)}${parts[1]}`;
      }
      if (parts[0]?.length === 4 && parts[1]?.length === 4) {
        return `${parts[0]}-${parts[1]}`;
      }
    }
    return s;
  };

  // Vacant Slot State: Dark carbon slab with dashed slate border, larger position tag, centered "VACANT"
  if (!p) {
    return (
      <div
        className={`h-[86px] md:h-[90px] rounded-2xl bg-[#0b0e14]/90 border-2 border-dashed flex items-center justify-between px-3.5 relative overflow-hidden transition-all duration-300 ${
          isFlashing
            ? 'border-[#ccff00] bg-[#ccff00]/10 shadow-[0_0_24px_rgba(204,255,0,0.6)] scale-[1.02]'
            : 'border-slate-800'
        }`}
      >
        {/* Left Section: Rounded dashed avatar frame with faint silhouette placeholder */}
        <div className="flex items-center gap-3 z-10">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-black/50 border border-dashed border-slate-700/80 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 md:w-7 md:h-7 text-slate-700" />
          </div>

          {/* Middle Section: Position label + Centered Vacant sub-label */}
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs md:text-sm font-sans font-black px-2.5 py-1 rounded-lg border-2 ${posBadgeColor}`}>
                {slot.position}
              </span>
              <span className="text-xs md:text-sm font-mono font-bold text-slate-400 uppercase tracking-wider">
                SLOT {index + 1} • {slot.position} •
              </span>
            </div>
            <span className="text-xs font-mono text-slate-600 block mt-1 uppercase tracking-widest font-bold">
              VACANT
            </span>
          </div>
        </div>

        {/* Faint position watermark on right */}
        <span className="font-sans font-black text-3xl md:text-4xl text-slate-800/40 select-none pointer-events-none">
          {slot.position}
        </span>
      </div>
    );
  }

  // Acquired Slot State: Metallic sheen, enlarged avatar cutout, enlarged surname, club crest, bright large price badge
  const safeName = (p.displayName || p.name || 'UNKNOWN').trim();
  const nameParts = safeName ? safeName.split(' ') : [];
  const firstName = p.firstName || (nameParts.length > 1 ? nameParts[0] : '');
  const lastName = p.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : safeName);
  const imageSrc = p.imagePath || p.imageUrl || '';
  const clubCode = p.clubCode || p.clubAbbreviation || (p.club ? p.club.slice(0, 3).toUpperCase() : 'TB');

  return (
    <div
      className={`h-[86px] md:h-[90px] rounded-2xl bg-[#121622] border-2 flex items-center justify-between px-3 md:px-3.5 shadow-md relative overflow-hidden transition-all duration-300 ${
        isFlashing
          ? 'border-[#ccff00] shadow-[0_0_30px_rgba(204,255,0,0.85)] scale-[1.02] bg-[#1a2336]'
          : 'border-white/10 hover:border-white/20'
      }`}
    >
      {/* Subtle metallic sheen gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent pointer-events-none" />

      {/* Left Section: Enlarged rounded avatar frame with fallback safety net */}
      <div className="flex items-center gap-3 overflow-hidden z-10">
        <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-black/75 border border-white/15 overflow-hidden flex items-center justify-center shrink-0 relative shadow-inner">
          {imageSrc && !avatarError ? (
            <img
              key={imageSrc}
              src={imageSrc}
              alt={p.name}
              className="w-full h-full object-cover object-center scale-100 filter contrast-110 drop-shadow"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#141824]">
              <User className="w-7 h-7 text-slate-600" />
            </div>
          )}
        </div>

        {/* Middle Section */}
        <div className="truncate">
          {/* Small position and first name line */}
          <div className="flex items-center gap-1.5 leading-none">
            <span className={`text-[10px] font-sans font-black px-2 py-0.5 rounded border ${posBadgeColor}`}>
              {slot.position}
            </span>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider truncate">
              {slot.position} • {firstName || 'STAR'}
            </span>
          </div>

          {/* Significantly enlarged bold prominent surname */}
          <span className="font-sans font-black text-lg md:text-xl text-white uppercase truncate block leading-tight mt-0.5 tracking-tight drop-shadow">
            {lastName}
          </span>

          {/* Club or season metadata line */}
          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-mono text-[#fbbf24] font-bold leading-none mt-1 truncate">
            <span>{formatSeason(p.season)}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300 truncate">{p.club}</span>
          </div>
        </div>
      </div>

      {/* Right Section: Official club crest with fallback + Large brighter purchase price pill */}
      <div className="flex items-center gap-2.5 shrink-0 z-10 ml-2">
        {activeCrest && !crestError ? (
          <img
            src={activeCrest}
            alt={p.club}
            className="w-7 h-7 md:w-8 md:h-8 object-contain filter drop-shadow"
            onError={() => {
              if (activeCrest.endsWith('.png')) {
                setActiveCrest(activeCrest.replace(/\.png$/, '.svg'));
              } else {
                setCrestError(true);
              }
            }}
          />
        ) : (
          <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/20 uppercase tracking-wider">
            {clubCode}
          </span>
        )}
        <span className="font-mono text-base md:text-lg font-black text-black bg-[#ccff00] px-3.5 py-1.5 rounded-full shadow-[0_0_15px_rgba(204,255,0,0.4)] border border-[#ccff00]">
          ${slot.cost ?? p.auctionBasePrice ?? p.basePrice ?? 4}
        </span>
      </div>
    </div>
  );
};
