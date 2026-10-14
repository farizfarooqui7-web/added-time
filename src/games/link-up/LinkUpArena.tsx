import React, { useState, useEffect, useRef } from 'react';
import type {
  LinkUpClue,
  LinkUpMatchConfig,
  LinkUpPlayerEvaluation,
  LinkUpPlayerRecord,
  LinkUpPuzzle,
  LinkUpRoundResult,
  LinkUpSlotType,
} from './types';
import {
  evaluatePlayerSubmission,
  generateLinkUpPuzzle,
  generateOpponentSubmission,
  randomizeSlotConfiguration,
  searchPlayersAutocomplete,
} from './puzzleEngine';
import { POSITION_META } from './clubAssets';
import { soundFX } from '../../utils/audio';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import {
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Globe2,
  Home,
  RotateCcw,
  Search,
  SkipForward,
  Sparkles,
  Trophy,
  User,
  Users,
  XCircle,
  Zap,
  Radio,
} from 'lucide-react';

interface LinkUpArenaProps {
  config: LinkUpMatchConfig;
  onExitArena: () => void;
}

export const LinkUpArena: React.FC<LinkUpArenaProps> = ({ config, onExitArena }) => {
  const {
    isMultiplayer,
    isHost,
    opponent,
    myPlayerId,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
    party,
    leaveParty,
  } = useGameSync('link-up');

  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [activeSlots] = useState<[LinkUpSlotType, LinkUpSlotType, LinkUpSlotType]>(
    config.slotTypes
  );

  // Synchronized round transition curtain & rematch readiness
  const [roundTransitionCount, setRoundTransitionCount] = useState<number | null>(null);
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);

  const usedSeedIdsRef = useRef<Set<string>>(new Set());

  const [currentPuzzle, setCurrentPuzzle] = useState<LinkUpPuzzle>(() => {
    if (gameInitData?.sharedData?.puzzles && gameInitData.sharedData.puzzles.length > 0) {
      return gameInitData.sharedData.puzzles[0];
    }
    const initialSlots = config.randomizeSlotsEachRound
      ? randomizeSlotConfiguration()
      : config.slotTypes;
    const p = generateLinkUpPuzzle(1, config.difficulty, initialSlots, usedSeedIdsRef.current);
    usedSeedIdsRef.current.add(p.seedPlayer.id);
    return p;
  });

  // Synchronize authoritative puzzle sequence from server gameInitData
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.puzzles && gameInitData.sharedData.puzzles.length > 0) {
      const p = gameInitData.sharedData.puzzles[roundNumber - 1];
      if (p) {
        setCurrentPuzzle(p);
      }
    }
  }, [isMultiplayer, gameInitData, roundNumber]);

  // Match & Round State
  const [phase, setPhase] = useState<'opening-countdown' | 'playing' | 'round-result' | 'match-over'>('opening-countdown');
  const [countdownValue, setCountdownValue] = useState<number>(3);
  const [userScore, setUserScore] = useState<number>(0);
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const [roundHistory, setRoundHistory] = useState<LinkUpRoundResult[]>([]);

  // 30s Pressure Timer State (triggers ONLY after opponent locks in an answer)
  const [opponentLockedIn, setOpponentLockedIn] = useState<boolean>(false);
  const [opponentLockedEval, setOpponentLockedEval] = useState<LinkUpPlayerEvaluation | null>(null);
  const [pressureTimeLeft, setPressureTimeLeft] = useState<number | null>(null);
  const [takenWarningMessage, setTakenWarningMessage] = useState<string | null>(null);
  const [userSubmittedEval, setUserSubmittedEval] = useState<LinkUpPlayerEvaluation | null>(null);
  const [isOpponentTyping, setIsOpponentTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundResultEnteredAtRef = useRef<number>(0);

  // Input & Autocomplete State
  const [searchInput, setSearchInput] = useState<string>('');
  const [suggestions, setSuggestions] = useState<LinkUpPlayerRecord[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [lastRoundResult, setLastRoundResult] = useState<LinkUpRoundResult | null>(null);

  // Room Code State
  const [isMasked, setIsMasked] = useState<boolean>(config.isRoomCodeMasked);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showForfeitModal, setShowForfeitModal] = useState<boolean>(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver: phase === 'match-over',
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena: onExitArena,
    arenaKey: 'link-up',
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const opponentLabel = isMultiplayer && opponent?.name ? opponent.name : (config.lobbyMode === 'solo' ? 'AI SCOUT' : 'OPPONENT');

  // Slot machine rolling reveal animation: 0 -> 1 -> 2 -> 3
  const [revealedSlotCount, setRevealedSlotCount] = useState<number>(0);

  // Opening 3-2-1 countdown on match start
  useEffect(() => {
    if (phase !== 'opening-countdown') return;

    setCountdownValue(3);
    soundFX.playClick(600);

    const t1 = setTimeout(() => {
      setCountdownValue(2);
      soundFX.playClick(750);
    }, 1000);

    const t2 = setTimeout(() => {
      setCountdownValue(1);
      soundFX.playClick(900);
    }, 2000);

    const t3 = setTimeout(() => {
      soundFX.playPhaseShift();
      setPhase('playing');
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase]);

  // Trigger staggered slot-machine roll on each new puzzle once playing begins
  useEffect(() => {
    if (phase !== 'playing') {
      setRevealedSlotCount(0);
      return;
    }

    setRevealedSlotCount(0);

    const t1 = setTimeout(() => {
      soundFX.playSlotReveal();
      setRevealedSlotCount(1);
    }, 400);

    const t2 = setTimeout(() => {
      soundFX.playSlotReveal();
      setRevealedSlotCount(2);
    }, 900);

    const t3 = setTimeout(() => {
      soundFX.playHammer();
      setRevealedSlotCount(3);
    }, 1450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase, currentPuzzle.id]);

  // Focus input at the start of each playing round
  useEffect(() => {
    if (phase === 'playing') {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [phase, currentPuzzle.id]);

  // Simulate Opponent locking in their answer after 5-8 seconds (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (phase !== 'playing') {
      setOpponentLockedIn(false);
      setOpponentLockedEval(null);
      setPressureTimeLeft(null);
      return;
    }

    setOpponentLockedIn(false);
    setOpponentLockedEval(null);
    setPressureTimeLeft(null);

    const delayMs = 5000 + Math.floor(Math.random() * 3500);
    const lockTimer = setTimeout(() => {
      soundFX.playClick(620);
      const preLockedOpponent = generateOpponentSubmission(currentPuzzle);
      setOpponentLockedEval(preLockedOpponent);
      setOpponentLockedIn(true);
      setPressureTimeLeft(30.0);
    }, delayMs);

    return () => clearTimeout(lockTimer);
  }, [isMultiplayer, phase, currentPuzzle.id]);

  // Synchronize incoming multiplayer events
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent.event === 'player_typing') {
      setIsOpponentTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsOpponentTyping(false), 2000);
    } else if (lastGameEvent.event === 'player_lock_in') {
      const { roundNumber: evRound, evaluation } = lastGameEvent.data || {};
      if (evRound === roundNumber && evaluation) {
        soundFX.playClick(620);
        setOpponentLockedEval(evaluation);
        setOpponentLockedIn(true);
        setIsOpponentTyping(false);

        if (userSubmittedEval) {
          finalizeRound(userSubmittedEval, evaluation);
        } else {
          setPressureTimeLeft(30.0);
        }
      }
    } else if (lastGameEvent.event === 'next_round_request') {
      const { nextRound } = lastGameEvent.data || {};
      if (nextRound && nextRound > roundNumber) {
        handleNextRound(nextRound);
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handleRestartMatch();
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, roundNumber, userSubmittedEval]);

  // 30s Countdown once either player has locked in
  useEffect(() => {
    if (phase !== 'playing' || pressureTimeLeft === null) return;

    const interval = setInterval(() => {
      setPressureTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 0.1) {
          clearInterval(interval);
          return 0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase, pressureTimeLeft]);

  // Auto-skip or finalize if the 30s post-opponent timer hits 0
  useEffect(() => {
    if (phase === 'playing' && pressureTimeLeft === 0) {
      if (userSubmittedEval) {
        // User already submitted, opponent timed out
        const timedOutOpponent: LinkUpPlayerEvaluation = {
          skipped: true,
          playerName: 'TIMED OUT',
          criteriaMetCount: 0,
          matchedSlotIndices: [],
          pointsAwarded: 0,
          isLinkVerified: false,
        };
        finalizeRound(userSubmittedEval, timedOutOpponent);
      } else if (opponentLockedIn) {
        // Opponent locked in first and user timed out
        soundFX.playVoltBuzz();
        handleSkipRound();
      }
    }
  }, [pressureTimeLeft, phase, opponentLockedIn, userSubmittedEval]);

  // Update autocomplete suggestions as user types (requires at least 3 characters)
  useEffect(() => {
    if (searchInput.trim().length >= 3 && phase === 'playing') {
      const hits = searchPlayersAutocomplete(searchInput, 7);
      setSuggestions(hits);
      setHighlightedIndex(0);
    } else {
      setSuggestions([]);
    }
  }, [searchInput, phase]);

  const finalizeRound = (userEval: LinkUpPlayerEvaluation, forcedOpponentEval?: LinkUpPlayerEvaluation) => {
    // If opponent already locked in a player, use that locked submission (excluding the user's player if matched);
    // otherwise generate opponent's pick now, ensuring they cannot pick the user's player.
    const opponentEval = forcedOpponentEval
      ? forcedOpponentEval
      : opponentLockedEval
      ? opponentLockedEval
      : generateOpponentSubmission(currentPuzzle, userEval, userEval.matchedPlayer?.id);

    if (userEval.pointsAwarded > 0) {
      setUserScore((prev) => prev + userEval.pointsAwarded);
    }
    if (opponentEval.pointsAwarded > 0) {
      setOpponentScore((prev) => prev + opponentEval.pointsAwarded);
    }

    const result: LinkUpRoundResult = {
      roundNumber,
      puzzle: currentPuzzle,
      userEval,
      opponentEval,
    };

    setSuggestions([]);
    setTakenWarningMessage(null);
    setLastRoundResult(result);
    setRoundHistory((prev) => [...prev, result]);
    setUserSubmittedEval(null);
    setOpponentLockedIn(false);
    setOpponentLockedEval(null);
    setPressureTimeLeft(null);
    roundResultEnteredAtRef.current = Date.now();
    setPhase('round-result');
  };

  const submitUserChoice = (userEval: LinkUpPlayerEvaluation) => {
    if (isMultiplayer) {
      sendAction('player_lock_in', { roundNumber, evaluation: userEval });
      setUserSubmittedEval(userEval);

      if (opponentLockedEval) {
        finalizeRound(userEval, opponentLockedEval);
      } else {
        setPressureTimeLeft(30.0);
      }
    } else {
      finalizeRound(userEval);
    }
  };

  const handleSkipRound = () => {
    if (phase !== 'playing') return;
    soundFX.playClick(500);

    const skippedEval: LinkUpPlayerEvaluation = {
      skipped: true,
      playerName: 'PASSED',
      criteriaMetCount: 0,
      matchedSlotIndices: [],
      pointsAwarded: 0,
      isLinkVerified: false,
    };

    submitUserChoice(skippedEval);
  };

  const isPlayerLockedByOpponent = (playerOrName: LinkUpPlayerRecord | string): boolean => {
    if (!opponentLockedIn || !opponentLockedEval || !opponentLockedEval.matchedPlayer) {
      return false;
    }
    const lockedId = opponentLockedEval.matchedPlayer.id;
    const lockedName = opponentLockedEval.matchedPlayer.name.toLowerCase().trim();

    if (typeof playerOrName === 'string') {
      const q = playerOrName.toLowerCase().trim();
      return (
        q === lockedName ||
        (opponentLockedEval.matchedPlayer.commonName &&
          q === opponentLockedEval.matchedPlayer.commonName.toLowerCase().trim()) ||
        opponentLockedEval.matchedPlayer.aliases.some((a) => a.toLowerCase().trim() === q)
      );
    }

    return playerOrName.id === lockedId;
  };

  const handleSubmitGuess = (explicitPlayer?: LinkUpPlayerRecord) => {
    if (phase !== 'playing') return;
    if (!explicitPlayer && !searchInput.trim()) return;

    // Check if the selected/typed player is already locked in by the opponent
    if (explicitPlayer && isPlayerLockedByOpponent(explicitPlayer)) {
      soundFX.playVoltBuzz();
      setTakenWarningMessage(`"${explicitPlayer.name}" was already taken by ${opponentLabel}! Choose another player.`);
      setTimeout(() => setTakenWarningMessage(null), 3500);
      return;
    }

    if (!explicitPlayer && searchInput.trim() && isPlayerLockedByOpponent(searchInput.trim())) {
      soundFX.playVoltBuzz();
      setTakenWarningMessage(`This player was already taken by ${opponentLabel}! Choose another player.`);
      setTimeout(() => setTakenWarningMessage(null), 3500);
      return;
    }

    const userEval = evaluatePlayerSubmission(searchInput, currentPuzzle, explicitPlayer);

    // If evaluated player resolved to the opponent's locked player
    if (userEval.matchedPlayer && isPlayerLockedByOpponent(userEval.matchedPlayer)) {
      soundFX.playVoltBuzz();
      setTakenWarningMessage(`"${userEval.matchedPlayer.name}" was already taken by ${opponentLabel}! Choose another player.`);
      setTimeout(() => setTakenWarningMessage(null), 3500);
      return;
    }

    if (userEval.isLinkVerified) {
      soundFX.playSuccess();
    } else if (userEval.criteriaMetCount > 0) {
      soundFX.playClick(750);
    } else {
      soundFX.playVoltBuzz();
    }

    setSearchInput(userEval.playerName);
    submitUserChoice(userEval);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        soundFX.playClick(850);
        setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        soundFX.playClick(850);
        setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (suggestions.length > 0 && suggestions[highlightedIndex]) {
        handleSubmitGuess(suggestions[highlightedIndex]);
      } else if (searchInput.trim()) {
        handleSubmitGuess();
      }
    }
  };

  const handleNextRound = (targetRound?: number) => {
    if (isMultiplayer && !targetRound && !isHost) {
      return; // Guests cannot advance round unilaterally
    }
    const nextRoundNum = targetRound || roundNumber + 1;
    if (nextRoundNum > config.totalRounds) {
      soundFX.playVictoryFanfare();
      setPhase('match-over');
      return;
    }
    soundFX.playCardFlip();

    if (isMultiplayer && !targetRound) {
      sendAction('next_round_request', { nextRound: nextRoundNum });
    }

    let nextPuzzle: LinkUpPuzzle;
    if (isMultiplayer && gameInitData?.sharedData?.puzzles?.[nextRoundNum - 1]) {
      nextPuzzle = gameInitData.sharedData.puzzles[nextRoundNum - 1];
    } else {
      nextPuzzle = generateLinkUpPuzzle(
        nextRoundNum,
        config.difficulty,
        activeSlots,
        usedSeedIdsRef.current
      );
      usedSeedIdsRef.current.add(nextPuzzle.seedPlayer.id);
    }

    setRoundNumber(nextRoundNum);
    setCurrentPuzzle(nextPuzzle);
    setSearchInput('');
    setSuggestions([]);
    setTakenWarningMessage(null);
    setLastRoundResult(null);
    setUserSubmittedEval(null);
    setOpponentLockedIn(false);
    setOpponentLockedEval(null);
    setPressureTimeLeft(null);
    setPhase('playing');
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }, 1000);
  };

  // Keyboard shortcut listener: Second Enter on round-result explicitly advances to the next round
  useEffect(() => {
    if (phase !== 'round-result') return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (isMultiplayer && !isHost) return;
        // Enforce 2-step Enter flow: ignore Enter if the round-result phase was just entered (< 450ms ago)
        if (Date.now() - roundResultEnteredAtRef.current < 450) {
          return;
        }
        e.preventDefault();
        handleNextRound();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [phase, roundNumber, config.totalRounds, activeSlots, isMultiplayer, isHost]);

  const handleRestartMatch = () => {
    soundFX.playClick(900);
    usedSeedIdsRef.current.clear();
    const firstPuzzle = generateLinkUpPuzzle(
      1,
      config.difficulty,
      config.slotTypes,
      usedSeedIdsRef.current
    );
    usedSeedIdsRef.current.add(firstPuzzle.seedPlayer.id);

    setRoundNumber(1);
    setCurrentPuzzle(firstPuzzle);
    setUserScore(0);
    setOpponentScore(0);
    setRoundHistory([]);
    setSearchInput('');
    setSuggestions([]);
    setLastRoundResult(null);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setPhase('playing');
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }, 1000);
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
    handleRestartMatch();
  };

  const handleCopyCode = async () => {
    soundFX.playClick(800);
    try {
      await navigator.clipboard.writeText(config.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // ================= MATCH OVER SUMMARY SCREEN =================
  if (phase === 'match-over') {
    const userWon = userScore >= opponentScore;
    const verifiedCount = roundHistory.filter((r) => r.userEval.isLinkVerified).length;

    return (
      <div className="h-screen w-full bg-[#080a0f] text-neutral-100 flex flex-col justify-between p-4 md:p-6 overflow-y-auto select-none font-sans">
        <div className="max-w-4xl w-full mx-auto my-auto bg-[#0e111a] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6">
          <div className="text-center space-y-2 pb-4 border-b border-white/10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#ccff00]/15 border border-[#ccff00]/40 text-[#ccff00] font-mono text-xs font-bold uppercase tracking-wider">
              <Trophy className="w-3.5 h-3.5" />
              <span>
                THE LINK-UP COMPLETE • {verifiedCount} / {config.totalRounds} LINKS VERIFIED
              </span>
            </div>
            <h1
              className={`font-sans font-black text-3xl md:text-5xl uppercase tracking-tight ${
                userWon ? 'text-[#ccff00]' : 'text-red-400'
              }`}
            >
              {userWon ? 'MASTER SCOUT VICTORY' : `${opponentLabel} PREVAILS`}
            </h1>
            <div className="flex items-center justify-center gap-8 pt-2">
              <div className="text-center">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">
                  YOUR SCORE
                </span>
                <span className="font-mono font-black text-3xl text-[#ccff00]">{userScore}</span>
              </div>
              <span className="font-mono text-slate-600 text-xl font-black">VS</span>
              <div className="text-center">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">
                  {opponentLabel}
                </span>
                <span className="font-mono font-black text-3xl text-slate-200">
                  {opponentScore}
                </span>
              </div>
            </div>
          </div>

          {/* Round-by-Round Head-to-Head Recap */}
          <div className="grid grid-cols-1 gap-2.5 max-h-[42vh] overflow-y-auto pr-1">
            {roundHistory.map((item) => {
              const wasSkipped = item.userEval.skipped;
              const wasVerified = item.userEval.isLinkVerified;
              return (
                <div
                  key={item.roundNumber}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    wasSkipped
                      ? 'bg-gradient-to-r from-red-950/35 via-[#12151e] to-[#12151e] border-red-500/45 shadow-[inset_3px_0_0_rgba(239,68,68,0.85)]'
                      : wasVerified
                      ? 'bg-[#141c24] border-[#ccff00]/40'
                      : 'bg-[#12151e] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`px-2 py-1 rounded font-mono text-xs font-black shrink-0 ${
                        wasSkipped
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-white/5 text-white'
                      }`}
                    >
                      R{item.roundNumber}
                    </span>
                    <span className="font-mono text-xs text-slate-300 truncate">
                      {item.puzzle.clues.map((c) => c.value).join(' + ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {/* USER RESULT (Shows PASSED stamp in red if skipped, no player or missed text) */}
                    <div className="text-right flex items-center justify-end min-w-[130px]">
                      {wasSkipped ? (
                        <span className="inline-flex items-center px-3 py-0.5 rounded border-2 border-red-500/80 bg-red-500/15 font-mono font-black text-[11px] text-red-400 uppercase tracking-[0.18em] -rotate-2 shadow-[0_0_12px_rgba(239,68,68,0.2)]">
                          PASSED
                        </span>
                      ) : (
                        <div>
                          <span className="text-[9px] font-mono text-slate-400 uppercase block">
                            YOU ({item.userEval.criteriaMetCount}/3)
                          </span>
                          <span className="font-sans font-black text-xs text-[#ccff00] uppercase">
                            {item.userEval.playerName} (+{item.userEval.pointsAwarded})
                          </span>
                        </div>
                      )}
                    </div>

                    <span className="text-slate-600 font-mono text-xs">VS</span>

                    {/* OPPONENT RESULT */}
                    <div className="text-right min-w-[130px]">
                      <span className="text-[9px] font-mono text-slate-400 uppercase block">
                        {opponentLabel} ({item.opponentEval.criteriaMetCount}/3)
                      </span>
                      <span className="font-sans font-black text-xs text-[#00f0ff] uppercase">
                        {item.opponentEval.playerName} (+{item.opponentEval.pointsAwarded})
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              disabled={isMultiplayer && !isHost && hasRequestedRematch}
              onClick={handleRequestOrExecuteRematch}
              className={`px-7 py-3 rounded-full font-sans font-black text-xs md:text-sm uppercase tracking-wider flex items-center gap-2 transition-all ${
                isMultiplayer && !isHost && hasRequestedRematch
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                  : isMultiplayer && isHost && isOpponentRematchReady
                  ? 'bg-[#ccff00] hover:bg-[#d8ff33] text-black shadow-[0_0_25px_rgba(204,255,0,0.6)] animate-pulse cursor-pointer'
                  : 'bg-[#ccff00] hover:bg-[#d8ff33] text-black cursor-pointer'
              }`}
            >
              <RotateCcw className={`w-4 h-4 ${isMultiplayer && !isHost && hasRequestedRematch ? 'animate-spin' : ''}`} />
              <span>
                {isMultiplayer && !isHost
                  ? hasRequestedRematch
                    ? 'HOST NOTIFIED : WAITING FOR HOST'
                    : 'PLAY AGAIN'
                  : isMultiplayer && isHost
                  ? isOpponentRematchReady
                    ? 'OPPONENT READY : PLAY AGAIN'
                    : 'PLAY AGAIN'
                  : 'PLAY AGAIN'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                if (isMultiplayer) sendGameLeave();
                handleCleanExit();
              }}
              className="px-7 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-sans font-bold text-xs md:text-sm uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>RETURN TO HUB</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // High-tech Loading Skeleton while waiting for server authoritative gameInitData
  if (isMultiplayer && !gameInitData) {
    return (
      <div className="h-screen w-full bg-[#080a0f] text-neutral-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
        <div className="absolute inset-0 pitch-grid-bg opacity-30" />
        <div
          className="pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.3)] animate-pulse">
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
            <div className="h-full bg-purple-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#080a0f] text-neutral-100 flex flex-col justify-between p-3 md:p-5 overflow-y-auto md:overflow-hidden select-none relative font-sans">
      {/* ================= 0. PULSING 3-2-1 OPENING COUNTDOWN OVERLAY ================= */}
      {phase === 'opening-countdown' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="text-center flex flex-col items-center">
            <span className="font-mono text-xs uppercase tracking-widest text-[#ccff00] font-bold mb-2">
              GET READY TO LINK
            </span>
            <div
              key={countdownValue}
              className="font-display text-8xl md:text-9xl font-black text-[#ccff00] drop-shadow-[0_0_50px_rgba(204,255,0,0.8)] scale-110 animate-ping"
              style={{ animationDuration: '900ms', animationIterationCount: 1 }}
            >
              {countdownValue}
            </div>
            <p className="mt-6 text-sm font-mono text-slate-400 uppercase tracking-widest">
              MATCH STARTING...
            </p>
          </div>
        </div>
      )}

      {/* Synchronized Round Transition Curtain */}
      {roundTransitionCount !== null && (
        <div className="absolute inset-0 z-50 bg-[#080a0f]/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-150">
          <div className="text-center space-y-3">
            <span className="font-mono text-xs tracking-widest text-[#a855f7] uppercase block">
              ROUND {roundNumber} OF {config.totalRounds}
            </span>
            <h2 className="font-sans font-black text-3xl md:text-5xl text-white uppercase tracking-tight animate-pulse">
              REVEALING CLUES...
            </h2>
            <div className="w-36 h-1 rounded-full bg-white/10 mx-auto overflow-hidden">
              <div className="h-full bg-[#a855f7] rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Subtle Stadium Pitch Grid Background */}
      <div className="absolute inset-0 pitch-grid-bg opacity-40 pointer-events-none" />

      {/* ================= 1. TOP BROADCAST HUD BAR ================= */}
      <header className="relative z-10 w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10 shrink-0">
        {/* Left: Round Pill + Static Difficulty Indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#12151e] border border-white/10 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-[#a855f7] animate-pulse" />
            <span className="font-mono text-xs font-bold text-white tracking-wider">
              ROUND {String(roundNumber).padStart(2, '0')} / {config.totalRounds}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#12151e] border border-white/10 font-mono text-[10px] font-bold text-slate-300 uppercase tracking-wider">
            <span className="text-slate-500">DIFF:</span>
            <span className="text-[#00f0ff] font-black">{config.difficulty}</span>
          </div>
        </div>

        {/* Center: Scoreboard & Lobby Badge */}
        <div className="flex items-center gap-3 bg-[#12151e] border border-white/10 px-4 py-1.5 rounded-full">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-[#ccff00]" />
            <span className="font-mono text-xs font-bold text-slate-300">YOU:</span>
            <span className="font-mono text-sm font-black text-[#ccff00]">{userScore}</span>
          </div>

          <span className="text-slate-600 font-mono">•</span>

          <div className="flex items-center gap-1.5">
            {config.lobbyMode === 'solo' ? (
              <Bot className="w-3.5 h-3.5 text-[#00f0ff]" />
            ) : (
              <Users className="w-3.5 h-3.5 text-[#00f0ff]" />
            )}
            <span className="font-mono text-xs font-bold text-slate-300">{opponentLabel}:</span>
            <span className="font-mono text-sm font-black text-white">{opponentScore}</span>
          </div>

          {config.lobbyMode !== 'solo' && (
            <>
              <span className="text-slate-600 font-mono">•</span>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-400">ROOM:</span>
                <span className="font-bold text-[#ccff00] tracking-widest">
                  {isMasked ? '••••' : config.roomCode}
                </span>
                <button
                  type="button"
                  onClick={() => setIsMasked(!isMasked)}
                  className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  {isMasked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  {copiedCode ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right: Active Slot Strip + Exit */}
        <div className="flex items-center gap-2">
          {/* Active Slot Formula Strip */}
          <div className="flex items-center bg-[#12151e] border border-white/10 rounded-full px-3 py-1.5 gap-2">
            <div className="flex items-center gap-1" title="Current 3-Slot Link Formula">
              {currentPuzzle.slotTypes.map((slotType, sIdx) => {
                const pillStyle =
                  slotType === 'Club'
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                    : slotType === 'Nation'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
                return (
                  <React.Fragment key={sIdx}>
                    <span
                      className={`px-2 py-0.5 rounded-full border font-mono text-[9px] font-black uppercase tracking-wider ${pillStyle}`}
                    >
                      {slotType}
                    </span>
                    {sIdx < 2 && <span className="text-slate-600 font-mono text-[10px]">•</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick(500);
              setShowForfeitModal(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-full bg-white/5 hover:bg-red-950/50 border border-white/10 hover:border-red-500/40 text-slate-300 hover:text-red-300 text-xs font-mono font-bold tracking-wider transition-all cursor-pointer flex items-center justify-center"
          >
            EXIT
          </button>
        </div>
      </header>

      {/* ================= 2. CENTER 3-SLOT CAREER LINK STAGE ================= */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto flex flex-col justify-between py-2 gap-3 overflow-hidden">
        {/* 3 Clue Cards Grid with Slot Machine Rolling Reveal */}
        <div className="my-auto grid grid-cols-1 md:grid-cols-3 gap-3.5 md:gap-5 items-stretch relative">
          {currentPuzzle.clues.map((clue, idx) => {
            const isSlotMatched =
              phase === 'round-result' &&
              lastRoundResult?.userEval.matchedSlotIndices.includes(idx);
            const isRevealed = phase === 'round-result' || idx < revealedSlotCount;
            return (
              <ClueSlotCard
                key={`${currentPuzzle.id}-slot-${idx}`}
                clue={clue}
                isMatched={Boolean(isSlotMatched)}
                showResultState={phase === 'round-result'}
                isRevealed={isRevealed}
                slotNumber={idx + 1}
              />
            );
          })}
        </div>

        {/* ================= 3. BOTTOM ANSWER CONSOLE OR CLEAN HEAD-TO-HEAD RESULT BAR ================= */}
        {phase === 'playing' ? (
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-2 shrink-0 pb-1">
            {/* Warning banner when attempting to pick opponent's locked player */}
            {takenWarningMessage && (
              <div className="px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-500/70 text-rose-300 font-mono text-xs font-bold flex items-center gap-2 animate-in fade-in duration-150">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{takenWarningMessage}</span>
              </div>
            )}

            {/* 30s Pressure Countdown Banner (Appears once Opponent locks in their answer) */}
            {opponentLockedIn && pressureTimeLeft !== null && (
              <div
                className={`px-4 py-1.5 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
                  pressureTimeLeft <= 10
                    ? 'bg-red-950/60 border-red-500/60 text-red-300'
                    : 'bg-[#121622] border-[#00f0ff]/40 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping" />
                  <span>{opponentLabel} LOCKED IN AN ANSWER!</span>
                </div>

                <div
                  className={`flex items-center gap-1.5 font-mono font-black text-sm tracking-widest ${
                    pressureTimeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-[#00f0ff]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{pressureTimeLeft.toFixed(1)}s</span>
                </div>
              </div>
            )}

            {/* Autocomplete Floating Dropdown (Renders cleanly above the input bar) */}
            <div className="relative w-full">
              {suggestions.length > 0 && (
                <div className="absolute bottom-full mb-2 inset-x-0 bg-[#121622] border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-y-auto max-h-48 sm:max-h-60 z-40 divide-y divide-white/5">
                  {suggestions.map((player, sIdx) => {
                    const isHighlighted = sIdx === highlightedIndex;
                    const isTaken = isPlayerLockedByOpponent(player);
                    const posColor =
                      player.position === 'GK'
                        ? 'text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10'
                        : player.position === 'DEF'
                        ? 'text-blue-400 border-blue-400/40 bg-blue-500/10'
                        : player.position === 'MID'
                        ? 'text-[#ccff00] border-[#ccff00]/40 bg-[#ccff00]/10'
                        : 'text-red-400 border-red-400/40 bg-red-500/10';
                    return (
                      <button
                        key={player.id}
                        type="button"
                        disabled={isTaken}
                        onMouseEnter={() => setHighlightedIndex(sIdx)}
                        onClick={() => {
                          if (isTaken) {
                            soundFX.playVoltBuzz();
                            setTakenWarningMessage(`"${player.name}" was already taken by ${opponentLabel}! Choose another player.`);
                            setTimeout(() => setTakenWarningMessage(null), 3500);
                            return;
                          }
                          handleSubmitGuess(player);
                        }}
                        className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors ${
                          isTaken
                            ? 'bg-rose-500/10 text-neutral-500 cursor-not-allowed opacity-75'
                            : isHighlighted
                            ? 'bg-[#ccff00]/15 text-white cursor-pointer'
                            : 'hover:bg-white/5 text-slate-200 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`font-sans font-black text-sm uppercase truncate ${
                              isTaken ? 'line-through text-neutral-500' : 'text-white'
                            }`}
                          >
                            {player.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isTaken ? (
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/30">
                              TAKEN BY {opponentLabel}
                            </span>
                          ) : (
                            <>
                              <span
                                className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border shrink-0 ${posColor}`}
                              >
                                {player.position}
                              </span>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/5 text-[#ccff00]">
                                LOCK IN
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Opponent typing indicator */}
              {isOpponentTyping && !opponentLockedIn && (
                <div className="text-[11px] font-mono text-[#00f0ff] flex items-center gap-1.5 animate-pulse pl-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff]" />
                  <span>{opponentLabel} is typing a player...</span>
                </div>
              )}

              {/* Waiting for opponent banner OR Search Input */}
              {userSubmittedEval ? (
                <div className="w-full h-12 md:h-13 rounded-2xl bg-[#12151e] border-2 border-[#ccff00]/40 flex items-center justify-between px-5 text-xs font-mono shadow-[0_0_20px_rgba(204,255,0,0.15)] animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ccff00] animate-ping" />
                    <span className="text-white font-bold uppercase tracking-wider">
                      LOCKED IN: <span className="text-[#ccff00]">{userSubmittedEval.playerName}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-[#00f0ff] animate-spin" />
                    <span className="font-bold text-[#00f0ff]">
                      WAITING FOR {opponentLabel.toUpperCase()} ({pressureTimeLeft !== null ? pressureTimeLeft.toFixed(1) : '30.0'}s)...
                    </span>
                  </div>
                </div>
              ) : (
                /* Search Input & Submit Row */
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={searchInput}
                      onChange={(e) => {
                        soundFX.playTypingTick();
                        setSearchInput(e.target.value);
                        if (isMultiplayer) {
                          sendAction('player_typing', { isTyping: true });
                        }
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a player name..."
                      className="w-full h-12 md:h-13 pl-11 pr-4 rounded-2xl bg-[#12151e] border-2 border-white/15 focus:border-[#ccff00] text-white font-sans font-bold text-base sm:text-sm placeholder:text-slate-500 focus:outline-none shadow-inner transition-colors"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (suggestions.length > 0 && suggestions[highlightedIndex]) {
                        handleSubmitGuess(suggestions[highlightedIndex]);
                      } else if (searchInput.trim()) {
                        handleSubmitGuess();
                      }
                    }}
                    className="h-12 md:h-13 px-6 rounded-2xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-xs md:text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(204,255,0,0.3)] transition-all flex items-center gap-2 shrink-0 cursor-pointer active:scale-95"
                  >
                    <Zap className="w-4 h-4 fill-black" />
                    <span>LOCK LINK</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSkipRound}
                    className="h-12 md:h-13 px-4 rounded-2xl bg-white/5 hover:bg-red-950/40 border border-white/10 hover:border-red-500/40 text-slate-300 hover:text-red-300 font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    title="Skip Round"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>SKIP</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= CLEAN HEAD-TO-HEAD RESULT BAR (NO CLUTTER) ================= */
          lastRoundResult && (
            <div className="w-full max-w-5xl mx-auto bg-[#12151e] border border-white/15 rounded-2xl px-4 py-3.5 shadow-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0 animate-in fade-in duration-150">
              {/* Both Players' Submitted Answers Side-by-Side */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* YOUR SUBMISSION CARD */}
                <SubmissionSummaryPill
                  title="YOUR ANSWER"
                  evaluation={lastRoundResult.userEval}
                  isPrimaryUser={true}
                />

                {/* OPPONENT SUBMISSION CARD */}
                <SubmissionSummaryPill
                  title={`${opponentLabel} ANSWER`}
                  evaluation={lastRoundResult.opponentEval}
                  isPrimaryUser={false}
                />
              </div>

              {/* Next Round Action */}
              {isMultiplayer && !isHost ? (
                <button
                  type="button"
                  disabled
                  className="px-6 py-3.5 rounded-xl bg-white/10 text-neutral-400 font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shrink-0 cursor-not-allowed opacity-75 border border-white/10"
                >
                  <Clock className="w-3.5 h-3.5 text-neutral-400 animate-spin" />
                  <span>WAITING FOR HOST...</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNextRound()}
                  className="px-6 py-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(204,255,0,0.3)] flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-all hover:scale-[1.02]"
                >
                  <span>
                    {roundNumber >= config.totalRounds ? 'FINAL SCOREBOARD' : 'NEXT ROUND'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-black/20 text-[10px] font-mono font-bold tracking-tight">
                    ENTER
                  </span>
                </button>
              )}
            </div>
          )
        )}
      </main>

      {/* Multiplayer Opponent Forfeit Dialog */}
      <MultiplayerForfeitModal
        forfeitEvent={playerForfeitEvent}
        onReturnToHub={() => {
          clearForfeit();
          if (party.roomCode?.startsWith('match_')) {
            leaveParty();
          }
          handleCleanExit();
        }}
      />

      {/* In-Game Exit / Forfeit Confirmation Guard */}
      <ForfeitMatchModal
        isOpen={showForfeitModal}
        onStay={() => setShowForfeitModal(false)}
        onForfeit={() => {
          if (isMultiplayer) sendGameLeave();
          if (party.roomCode?.startsWith('match_')) {
            leaveParty();
          }
          setShowForfeitModal(false);
          handleCleanExit();
        }}
      />
    </div>
  );
};

interface SubmissionSummaryPillProps {
  title: string;
  evaluation: LinkUpPlayerEvaluation;
  isPrimaryUser: boolean;
}

const SubmissionSummaryPill: React.FC<SubmissionSummaryPillProps> = ({
  title,
  evaluation,
  isPrimaryUser,
}) => {
  // Special red stamp layout when the round was skipped/passed
  if (evaluation.skipped) {
    return (
      <div className="rounded-xl border border-red-500/45 bg-gradient-to-r from-red-950/35 via-black/40 to-red-950/20 px-4 py-2.5 flex items-center justify-between gap-3 shadow-[0_0_20px_rgba(239,68,68,0.12)]">
        <div className="min-w-0">
          <span className="text-[10px] font-mono font-bold text-red-300/80 uppercase tracking-wider block">
            {title}
          </span>
          <div className="font-sans font-black text-sm md:text-base text-red-200 uppercase tracking-wide mt-0.5">
            ROUND PASSED
          </div>
        </div>

        <div className="px-3.5 py-1 rounded-md border-2 border-red-500/80 bg-red-500/15 text-red-400 font-mono font-black text-xs md:text-sm uppercase tracking-[0.2em] -rotate-3 shadow-[0_0_15px_rgba(239,68,68,0.25)] shrink-0">
          SKIPPED
        </div>
      </div>
    );
  }

  const statusText = evaluation.isLinkVerified
    ? 'LINK VERIFIED'
    : evaluation.criteriaMetCount > 0
    ? 'PARTIAL LINK'
    : 'NO LINK';

  const statusBadgeStyle = evaluation.isLinkVerified
    ? 'bg-[#ccff00]/20 text-[#ccff00] border-[#ccff00]/40'
    : evaluation.criteriaMetCount > 0
    ? 'bg-[#00f0ff]/15 text-[#00f0ff] border-[#00f0ff]/35'
    : 'bg-red-500/15 text-red-300 border-red-500/30';

  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 ${
        evaluation.isLinkVerified
          ? isPrimaryUser
            ? 'bg-[#151f22] border-[#ccff00]/40'
            : 'bg-[#131b24] border-[#00f0ff]/40'
          : 'bg-black/35 border-white/10'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            {title}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full border font-mono text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${statusBadgeStyle}`}
          >
            {evaluation.isLinkVerified ? (
              <CheckCircle2 className="w-2.5 h-2.5" />
            ) : (
              <XCircle className="w-2.5 h-2.5" />
            )}
            <span>{statusText}</span>
          </span>
        </div>

        <div className="font-sans font-black text-base md:text-lg text-white uppercase truncate mt-0.5">
          {evaluation.playerName}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-mono font-black text-sm md:text-base text-[#ccff00]">
          +{evaluation.pointsAwarded} PTS
        </div>
        <div className="font-mono text-[10px] font-bold text-slate-300 uppercase">
          {evaluation.criteriaMetCount}/3 CRITERIA MET
        </div>
      </div>
    </div>
  );
};

interface ClueSlotCardProps {
  clue: LinkUpClue;
  isMatched: boolean;
  showResultState: boolean;
  isRevealed?: boolean;
  slotNumber?: number;
}

const ClueSlotCard: React.FC<ClueSlotCardProps> = ({
  clue,
  isMatched,
  showResultState,
  isRevealed = true,
  slotNumber = 1,
}) => {
  const isClub = clue.type === 'Club';
  const isNation = clue.type === 'Nation';
  const posMeta =
    clue.type === 'Position' ? POSITION_META[clue.value as keyof typeof POSITION_META] : null;

  const accentBorder = showResultState
    ? isMatched
      ? 'border-[#ccff00] shadow-[0_0_25px_rgba(204,255,0,0.2)]'
      : 'border-white/10 opacity-75'
    : isClub
    ? 'border-white/15 hover:border-cyan-400/50'
    : isNation
    ? 'border-white/15 hover:border-emerald-400/50'
    : 'border-white/15 hover:border-amber-400/50';

  // If slot is not revealed yet: show casino slot machine spinning reel animation
  if (!isRevealed) {
    return (
      <div
        className="relative rounded-2xl bg-[#0b0e16] border-2 border-white/10 p-5 flex flex-col items-center justify-between text-center shadow-[0_18px_40px_rgba(0,0,0,0.8)] overflow-hidden min-h-[210px] md:min-h-[245px] animate-pulse"
      >
        {/* Slot Machine Rolling Reel Lines */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.15) 0px, transparent 15px, rgba(0,0,0,0.3) 30px)',
          }}
        />

        <div className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 z-10">
          <span className="font-bold">SLOT 0{slotNumber}</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-400">
            ROLLING...
          </span>
        </div>

        {/* Center Slot Tumbler */}
        <div className="my-auto py-3 flex flex-col items-center justify-center z-10">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center mb-2 shadow-inner">
            <Sparkles className="w-8 h-8 text-slate-400 animate-spin" />
          </div>
          <span className="font-mono text-xs font-black uppercase tracking-[0.25em] text-slate-400">
            SPINNING REEL
          </span>
        </div>

        <div className="w-full h-1 rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl bg-[#10141f] border-2 ${accentBorder} p-5 flex flex-col items-center justify-between text-center shadow-[0_18px_40px_rgba(0,0,0,0.75)] transition-all overflow-hidden min-h-[210px] md:min-h-[245px] animate-in zoom-in-95 duration-300`}
    >
      {/* Top Slot Type Header */}
      <div className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-400 z-10">
        <span className="flex items-center gap-1.5 font-bold text-slate-300">
          {isClub ? (
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
          ) : isNation ? (
            <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Crosshair className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>
            SLOT 0{clue.slotIndex + 1} • {clue.type}
          </span>
        </span>

        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-black text-slate-300">
          {clue.subLabel}
        </span>
      </div>

      {/* Center Emblem / Club Crest / Nation Flag / Position Badge */}
      <div className="my-auto py-3 flex flex-col items-center justify-center z-10">
        {isClub && clue.crestUrl ? (
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-black/40 border border-white/10 p-3 flex items-center justify-center mb-3 shadow-inner">
            <img
              src={clue.crestUrl}
              alt={clue.value}
              className="w-full h-full object-contain filter drop-shadow-lg"
            />
          </div>
        ) : isNation && clue.flagUrl ? (
          <div className="w-24 h-16 md:w-28 md:h-20 rounded-xl bg-black/40 border-2 border-white/15 p-1.5 flex items-center justify-center mb-3 shadow-lg overflow-hidden">
            <img
              src={clue.flagUrl}
              alt={clue.value}
              className="w-full h-full object-cover rounded-lg shadow-sm"
            />
          </div>
        ) : (
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-b from-[#2b2210] to-[#120e07] border-2 border-[#fbbf24]/50 flex flex-col items-center justify-center mb-3 shadow-lg">
            <span className="font-mono font-black text-2xl md:text-3xl text-[#fbbf24] tracking-wider">
              {clue.value}
            </span>
          </div>
        )}

        {/* Primary Clue Value Title (Removed roleDesc subtitle under Position) */}
        <h3 className="font-sans font-black text-xl md:text-2xl text-white uppercase tracking-tight leading-tight">
          {clue.type === 'Position' && posMeta ? posMeta.fullName : clue.value}
        </h3>
      </div>

      {/* Bottom Accent Line */}
      <div
        className={`w-full h-1 rounded-full ${
          isClub
            ? 'bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent'
            : isNation
            ? 'bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent'
            : 'bg-gradient-to-r from-transparent via-amber-400/60 to-transparent'
        }`}
      />
    </div>
  );
};
