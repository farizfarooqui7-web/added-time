import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Flame,
  Lock,
  RotateCcw,
  Search,
  SkipForward,
  Target,
  Trophy,
  Radio,
} from 'lucide-react';
import type {
  RecordBooksClubRecord,
  RecordBooksMatchConfig,
  RecordBooksRoundResult,
  RecordBooksSubmissionEval,
} from './types';
import {
  evaluateRecordBooksSubmission,
  generateClubSequence,
  generateRecordBooksOpponentSubmission,
  isSameRecordBooksPlayer,
  searchRecordBooksPlayers,
} from './recordBooksEngine';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';
import { ForfeitMatchModal } from '../../components/ForfeitMatchModal';
import { useArenaBackGuard } from '../../hooks/useArenaBackGuard';
import { soundFX } from '../../utils/audio';

interface RecordBooksArenaProps {
  config: RecordBooksMatchConfig;
  onExitArena: () => void;
}

type RoundStage =
  | 'club-intro'
  | 'playing'
  | 'both-locked'
  | 'tally-user'
  | 'tally-opponent'
  | 'round-done';

const ROUND_DURATION_SECONDS = 25;

export const RecordBooksArena: React.FC<RecordBooksArenaProps> = ({
  config,
  onExitArena,
}) => {
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
  } = useGameSync('record-books');

  const [clubSequence, setClubSequence] = useState<RecordBooksClubRecord[]>(() => {
    if (gameInitData?.sharedData?.clubSequence && gameInitData.sharedData.clubSequence.length > 0) {
      return gameInitData.sharedData.clubSequence;
    }
    return generateClubSequence(config.difficulty, config.totalRounds);
  });

  // Sync authoritative clubSequence from server gameInitData
  useEffect(() => {
    if (isMultiplayer && gameInitData?.sharedData?.clubSequence && gameInitData.sharedData.clubSequence.length > 0) {
      setClubSequence(gameInitData.sharedData.clubSequence);
    }
  }, [isMultiplayer, gameInitData]);

  const [roundIdx, setRoundIdx] = useState(0);
  const [stage, setStage] = useState<RoundStage>('club-intro');

  // Synchronized round transition curtain & rematch readiness
  const [roundTransitionCount, setRoundTransitionCount] = useState<number | null>(null);
  const [isOpponentRematchReady, setIsOpponentRematchReady] = useState(false);
  const [hasRequestedRematch, setHasRequestedRematch] = useState(false);

  // Round timer
  const [secondsLeft, setSecondsLeft] = useState<number>(ROUND_DURATION_SECONDS);

  // Input & Autocomplete state
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isOpponentTyping, setIsOpponentTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Round evaluations (set as soon as each player locks in) & Arcade Ticker values
  const [userEval, setUserEval] = useState<RecordBooksSubmissionEval | null>(null);
  const [opponentEval, setOpponentEval] = useState<RecordBooksSubmissionEval | null>(null);
  const [userTickerValue, setUserTickerValue] = useState(0);
  const [opponentTickerValue, setOpponentTickerValue] = useState(0);

  // Cumulative scores & round history
  const [userTotalScore, setUserTotalScore] = useState(0);
  const [opponentTotalScore, setOpponentTotalScore] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RecordBooksRoundResult[]>([]);
  const [isMatchOver, setIsMatchOver] = useState(false);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  const { handleCleanExit } = useArenaBackGuard({
    isMatchOver,
    onTriggerForfeit: () => setShowForfeitModal(true),
    onExitArena,
    arenaKey: 'record-books',
  });

  const inputRef = useRef<HTMLInputElement>(null);

  const currentClub = clubSequence[roundIdx] || clubSequence[0];
  const opponentLabel = isMultiplayer && opponent?.name ? opponent.name : (config.lobbyMode === 'solo' ? 'AI SCOUT' : 'OPPONENT');
  const metricLabel = config.metric === 'Goals' ? 'ALL-TIME GOALS' : 'ALL-TIME ASSISTS';
  const metricUnit = config.metric === 'Goals' ? 'GOALS' : 'ASSISTS';

  // Instant fuzzy autocomplete suggestions (requires at least 3 letters)
  const suggestions = useMemo(() => {
    if (stage !== 'playing' || userEval !== null || query.trim().length < 3) return [];
    return searchRecordBooksPlayers(query, 7);
  }, [query, stage, userEval]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Stage 1: Brief club reveal transition at start of each round
  useEffect(() => {
    if (stage !== 'club-intro') return;
    const timer = window.setTimeout(() => {
      setStage('playing');
      setSecondsLeft(ROUND_DURATION_SECONDS);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [stage, roundIdx]);

  // Opponent automatic lock-in timer during 'playing' (solo mode only)
  useEffect(() => {
    if (isMultiplayer) return;
    if (stage !== 'playing' || opponentEval !== null) return;

    const delayMs =
      userEval !== null
        ? 650
        : 4500 + Math.floor(Math.random() * 3000);

    const timer = window.setTimeout(() => {
      const oppPick = generateRecordBooksOpponentSubmission(
        currentClub,
        config.metric,
        userEval?.playerName ?? null
      );
      setOpponentEval(oppPick);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isMultiplayer, stage, opponentEval, userEval, currentClub, config.metric]);

  // Synchronize incoming multiplayer events from opponent
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent.event === 'player_typing') {
      setIsOpponentTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsOpponentTyping(false), 2000);
    } else if (lastGameEvent.event === 'record_lock_in') {
      const { roundIdx: evRound, evaluation } = lastGameEvent.data || {};
      if (evRound === roundIdx && evaluation) {
        setOpponentEval(evaluation);
        setIsOpponentTyping(false);
      }
    } else if (lastGameEvent.event === 'next_round_request') {
      const { nextRoundIdx } = lastGameEvent.data || {};
      if (typeof nextRoundIdx === 'number' && nextRoundIdx > roundIdx) {
        handleNextRound(nextRoundIdx);
      }
    } else if (lastGameEvent.event === 'player_rematch_ready') {
      setIsOpponentRematchReady(true);
      soundFX.playSuccess();
    } else if (lastGameEvent.event === 'match_restart') {
      handleRematch();
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, roundIdx]);

  // Transition from 'playing' to 'both-locked' as soon as BOTH userEval and opponentEval are locked in
  useEffect(() => {
    if (stage === 'playing' && userEval !== null && opponentEval !== null) {
      setStage('both-locked');
    }
  }, [stage, userEval, opponentEval]);

  // Brief pause in 'both-locked' so both players see each other's locked-in player names before scores roll up
  useEffect(() => {
    if (stage !== 'both-locked') return;
    soundFX.playLockIn();
    const timer = window.setTimeout(() => {
      setStage('tally-user');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // Stage 2: Active round countdown timer while in 'playing'
  useEffect(() => {
    if (stage !== 'playing') return;
    if (secondsLeft <= 0) {
      if (userEval === null) {
        handleLockIn('', true);
      }
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next <= 3 && next > 0) {
          soundFX.playCountdownTick(next <= 1 ? 3 : 2);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, secondsLeft, userEval]);

  // Stage 3: Staggered Arcade Number Ticker for Player 1 -> Player 2
  useEffect(() => {
    if (stage !== 'tally-user' || !userEval) return;

    const target = userEval.statCount;
    const duration = target === 0 ? 320 : Math.min(1150, Math.max(550, target * 2.4));
    const startTime = performance.now();
    let rafId = 0;
    let lastTickVal = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(target * eased);
      setUserTickerValue(currentVal);

      if (currentVal !== lastTickVal && currentVal > 0 && currentVal % 3 === 0) {
        lastTickVal = currentVal;
        soundFX.playSlotTick();
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setUserTickerValue(target);
        setUserTotalScore((prev) => prev + target);
        if (target > 0) {
          soundFX.playSuccess();
        } else {
          soundFX.playVoltBuzz();
        }
        window.setTimeout(() => {
          setStage('tally-opponent');
        }, 320);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, userEval]);

  useEffect(() => {
    if (stage !== 'tally-opponent' || !opponentEval || !userEval) return;

    const target = opponentEval.statCount;
    const duration = target === 0 ? 320 : Math.min(1150, Math.max(550, target * 2.4));
    const startTime = performance.now();
    let rafId = 0;
    let lastTickVal = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(target * eased);
      setOpponentTickerValue(currentVal);

      if (currentVal !== lastTickVal && currentVal > 0 && currentVal % 3 === 0) {
        lastTickVal = currentVal;
        soundFX.playSlotTick();
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setOpponentTickerValue(target);
        setOpponentTotalScore((prev) => prev + target);
        soundFX.playHammer();
        setRoundHistory((prev) => [
          ...prev,
          {
            roundNumber: roundIdx + 1,
            club: currentClub,
            metric: config.metric,
            userEval,
            opponentEval,
          },
        ]);
        window.setTimeout(() => {
          setStage('round-done');
        }, 240);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [stage, opponentEval, userEval, roundIdx, currentClub, config.metric]);

  const handleLockIn = (submittedText: string, isSkip = false) => {
    if (stage !== 'playing' || userEval !== null) return;

    const trimmed = isSkip ? '' : submittedText.trim();

    // Prevent locking in the same player the opponent already locked in
    if (
      !isSkip &&
      trimmed &&
      opponentEval &&
      isSameRecordBooksPlayer(trimmed, opponentEval.playerName, currentClub, config.metric)
    ) {
      soundFX.playVoltBuzz();
      setDuplicateWarning(
        `${opponentEval.playerName} is already locked in by ${opponentLabel}! Choose a different player.`
      );
      return;
    }

    setDuplicateWarning(null);

    const uEval: RecordBooksSubmissionEval =
      isSkip || !trimmed
        ? {
            skipped: true,
            playerName: 'PASSED',
            statCount: 0,
            allTimeRank: null,
          }
        : evaluateRecordBooksSubmission(trimmed, currentClub, config.metric);

    if (isSkip || !trimmed) {
      soundFX.playClick(450);
    } else {
      soundFX.playLockIn();
    }

    setUserEval(uEval);
    setUserTickerValue(0);
    setShowDropdown(false);

    if (isMultiplayer) {
      sendAction('record_lock_in', {
        roundIdx,
        evaluation: uEval,
      });
    }
  };

  const handleNextRound = (targetRoundIdx?: number) => {
    if (isMultiplayer && targetRoundIdx === undefined && !isHost) {
      return; // Guests cannot advance round unilaterally
    }
    const nextIdx = targetRoundIdx !== undefined ? targetRoundIdx : roundIdx + 1;
    if (nextIdx >= config.totalRounds) {
      soundFX.playVictoryFanfare();
      setIsMatchOver(true);
      return;
    }

    soundFX.playCardFlip();
    if (isMultiplayer && targetRoundIdx === undefined) {
      sendAction('next_round_request', { nextRoundIdx: nextIdx });
    }

    setRoundIdx(nextIdx);
    setQuery('');
    setDuplicateWarning(null);
    setUserEval(null);
    setOpponentEval(null);
    setUserTickerValue(0);
    setOpponentTickerValue(0);
    setSecondsLeft(ROUND_DURATION_SECONDS);
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setStage('club-intro');
    }, 1000);
  };

  // Keyboard shortcut: Press ENTER on round-done screen to immediately proceed to NEXT CLUB / Final Scoreboard
  useEffect(() => {
    if (stage !== 'round-done') return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (isMultiplayer && !isHost) return;
        e.preventDefault();
        handleNextRound();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [stage, roundIdx, config.totalRounds, isMultiplayer, isHost]);

  const handleRematch = () => {
    soundFX.playClick(900);
    setClubSequence(generateClubSequence(config.difficulty, config.totalRounds));
    setRoundIdx(0);
    setQuery('');
    setDuplicateWarning(null);
    setUserEval(null);
    setOpponentEval(null);
    setUserTickerValue(0);
    setOpponentTickerValue(0);
    setUserTotalScore(0);
    setOpponentTotalScore(0);
    setRoundHistory([]);
    setIsMatchOver(false);
    setIsOpponentRematchReady(false);
    setHasRequestedRematch(false);
    setSecondsLeft(ROUND_DURATION_SECONDS);
    setRoundTransitionCount(1);
    setTimeout(() => {
      setRoundTransitionCount(null);
      setStage('club-intro');
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
    handleRematch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (stage !== 'playing' || userEval !== null) return;

    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && suggestions.length > 0 && suggestions[selectedIndex]) {
        const chosen = suggestions[selectedIndex];
        setQuery(chosen);
        handleLockIn(chosen, false);
      } else if (query.trim().length > 0) {
        handleLockIn(query, false);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Match End & Summary Screen
  if (isMatchOver) {
    const userWon = userTotalScore > opponentTotalScore;
    const isDraw = userTotalScore === opponentTotalScore;

    return (
      <div className="min-h-screen w-full bg-[#07090e] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div
          className="pointer-events-none fixed inset-0 opacity-25"
          style={{
            background:
              'radial-gradient(circle at 50% 15%, rgba(255,159,28,0.22), transparent 60%)',
          }}
        />

        <div className="relative z-10 max-w-3xl w-full rounded-[28px] bg-[#10141d]/95 border border-white/10 p-7 shadow-[0_32px_90px_rgba(0,0,0,0.85)]">
          {/* Header Verdict */}
          <div className="flex flex-col items-center text-center mb-6">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border mb-3 ${
                userWon
                  ? 'bg-[#ff9f1c]/15 border-[#ff9f1c]/40 shadow-[0_0_30px_rgba(255,159,28,0.25)]'
                  : isDraw
                  ? 'bg-sky-400/15 border-sky-400/40'
                  : 'bg-rose-500/15 border-rose-500/40'
              }`}
            >
              <Trophy
                className={`w-7 h-7 ${
                  userWon
                    ? 'text-[#ff9f1c]'
                    : isDraw
                    ? 'text-sky-400'
                    : 'text-rose-400'
                }`}
              />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 mb-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#ff9f1c]">
                {config.metric.toUpperCase()} TALLY COMPLETE • {config.difficulty.toUpperCase()} TIER
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
              {userWon
                ? 'RECORD BOOKS DOMINATED'
                : isDraw
                ? 'DEAD HEAT TALLY'
                : `${opponentLabel} TAKES THE CROWN`}
            </h1>
          </div>

          {/* Head-to-Head Total Tally Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div
              className={`rounded-2xl p-4 border text-center transition-all ${
                userWon
                  ? 'bg-[#ff9f1c]/12 border-[#ff9f1c]/45 shadow-[0_0_25px_rgba(255,159,28,0.12)]'
                  : 'bg-white/[0.03] border-white/10'
              }`}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block">
                YOUR TOTAL {metricUnit}
              </span>
              <span className="font-display text-4xl sm:text-5xl font-black text-[#ff9f1c] mt-1 block tabular-nums">
                {userTotalScore.toLocaleString()}
              </span>
            </div>

            <div
              className={`rounded-2xl p-4 border text-center transition-all ${
                !userWon && !isDraw
                  ? 'bg-sky-400/12 border-sky-400/45 shadow-[0_0_25px_rgba(56,189,248,0.12)]'
                  : 'bg-white/[0.03] border-white/10'
              }`}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block">
                {opponentLabel} TOTAL {metricUnit}
              </span>
              <span className="font-display text-4xl sm:text-5xl font-black text-sky-400 mt-1 block tabular-nums">
                {opponentTotalScore.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Round-by-Round Breakdown */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mb-6">
            {roundHistory.map((r) => {
              const userSkipped = r.userEval.skipped;
              const userBeatOpp = r.userEval.statCount > r.opponentEval.statCount;
              const oppBeatUser = r.opponentEval.statCount > r.userEval.statCount;

              return (
                <div
                  key={r.roundNumber}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
                    userSkipped
                      ? 'bg-rose-500/[0.07] border-rose-500/35'
                      : 'bg-white/[0.025] border-white/5'
                  }`}
                >
                  {/* Left: Round & Club */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-[10px] font-mono font-bold w-6 ${
                        userSkipped ? 'text-rose-400' : 'text-neutral-500'
                      }`}
                    >
                      R{r.roundNumber}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center p-1 shrink-0">
                      <img
                        src={r.club.badgeUrl}
                        alt={r.club.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs font-display font-extrabold uppercase tracking-wide text-white truncate">
                      {r.club.name}
                    </span>
                  </div>

                  {/* Right: User vs Opponent choices & stats */}
                  <div className="flex items-center gap-3 shrink-0">
                    {userSkipped ? (
                      <div className="px-2.5 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/50 text-[10px] font-display font-black uppercase tracking-widest text-rose-300">
                        SKIPPED
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-200 max-w-[125px] truncate">
                          {r.userEval.playerName}
                        </span>
                        <span
                          className={`text-xs font-mono font-black px-2 py-0.5 rounded-md border tabular-nums ${
                            userBeatOpp
                              ? 'bg-[#ff9f1c]/15 text-[#ff9f1c] border-[#ff9f1c]/40'
                              : r.userEval.statCount > 0
                              ? 'bg-white/[0.06] text-white border-white/15'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {r.userEval.statCount}
                        </span>
                      </div>
                    )}

                    <span className="text-[10px] font-mono text-neutral-600">VS</span>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-sky-200 max-w-[125px] truncate">
                        {r.opponentEval.playerName}
                      </span>
                      <span
                        className={`text-xs font-mono font-black px-2 py-0.5 rounded-md border tabular-nums ${
                          oppBeatUser
                            ? 'bg-sky-400/15 text-sky-300 border-sky-400/40'
                            : 'bg-white/[0.05] text-neutral-300 border-white/10'
                        }`}
                      >
                        {r.opponentEval.statCount}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rematch / Exit Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (isMultiplayer) sendGameLeave();
                handleCleanExit();
              }}
              className="flex-1 py-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-display font-extrabold uppercase tracking-widest text-neutral-300 transition-all cursor-pointer"
            >
              RETURN TO HUB
            </button>
            <button
              type="button"
              disabled={isMultiplayer && !isHost && hasRequestedRematch}
              onClick={handleRequestOrExecuteRematch}
              className={`flex-1 py-3.5 rounded-xl font-display font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                isMultiplayer && !isHost && hasRequestedRematch
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                  : isMultiplayer && isHost && isOpponentRematchReady
                  ? 'bg-[#ff9f1c] hover:bg-[#ffad3b] text-black shadow-[0_0_25px_rgba(255,159,28,0.6)] animate-pulse cursor-pointer'
                  : 'bg-[#ff9f1c] hover:bg-[#ffad3b] text-black shadow-[0_10px_28px_rgba(255,159,28,0.3)] cursor-pointer'
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
          style={{ background: 'radial-gradient(circle, #ff9f1c 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-[#ff9f1c]/10 border border-[#ff9f1c]/40 flex items-center justify-center text-[#ff9f1c] shadow-[0_0_30px_rgba(255,159,28,0.3)] animate-pulse">
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
            <div className="h-full bg-[#ff9f1c] rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const isLowTime = stage === 'playing' && secondsLeft <= 8;
  const showUserScore =
    stage === 'tally-user' || stage === 'tally-opponent' || stage === 'round-done';
  const showOpponentScore = stage === 'tally-opponent' || stage === 'round-done';

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#07090e] text-white flex flex-col justify-between p-3 sm:p-6 relative overflow-y-auto md:overflow-hidden select-none">
      {/* Ambient Backdrop Glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(255,159,28,0.16), transparent 55%), radial-gradient(circle at 85% 82%, rgba(56,189,248,0.10), transparent 55%)',
        }}
      />

      {/* Synchronized Round Transition Curtain */}
      {roundTransitionCount !== null && (
        <div className="absolute inset-0 z-50 bg-[#07090e]/92 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-150">
          <div className="text-center space-y-3">
            <span className="font-mono text-xs tracking-widest text-[#ff9f1c] uppercase block">
              ROUND {roundIdx + 1} OF {config.totalRounds}
            </span>
            <h2 className="font-sans font-black text-3xl md:text-5xl text-white uppercase tracking-tight animate-pulse">
              REVEALING CLUB...
            </h2>
            <div className="w-36 h-1 rounded-full bg-white/10 mx-auto overflow-hidden">
              <div className="h-full bg-[#ff9f1c] rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* TOP BROADCAST HUD */}
      <header className="relative z-10 max-w-5xl w-full mx-auto flex items-center justify-between gap-3 bg-[#10141d]/90 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick(500);
              setShowForfeitModal(true);
            }}
            className="min-h-[44px] min-w-[44px] w-11 h-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="Exit to Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-black uppercase tracking-wider text-white">
                THE RECORD BOOKS
              </span>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest bg-[#ff9f1c]/15 text-[#ff9f1c] border border-[#ff9f1c]/30">
                {config.metric.toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest bg-white/[0.05] text-neutral-300 border border-white/10">
                {config.difficulty}
              </span>
            </div>
            <p className="text-[10px] font-mono text-neutral-400">
              ROUND {roundIdx + 1} OF {config.totalRounds}
              {config.lobbyMode !== 'solo' ? ` • ROOM ${config.roomCode}` : ' • VS AI SCOUT'}
            </p>
          </div>
        </div>

        {/* Center / Right Live Score & Timer Strip */}
        <div className="flex items-center gap-3">
          {/* Timer Pill */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${
              stage !== 'playing'
                ? 'bg-white/[0.03] border-white/10 text-neutral-400'
                : isLowTime
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                : 'bg-[#ff9f1c]/12 border-[#ff9f1c]/35 text-[#ff9f1c]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs font-mono font-black tracking-wider tabular-nums">
              {stage === 'playing' ? `${secondsLeft}s` : 'LOCKED'}
            </span>
          </div>

          {/* Scoreboard Pill */}
          <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-black/50 border border-white/10">
            <div className="text-right">
              <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-400 block">
                YOU
              </span>
              <span className="font-display text-lg font-black text-[#ff9f1c] leading-none tabular-nums">
                {userTotalScore.toLocaleString()}
              </span>
            </div>
            <span className="text-xs font-mono text-neutral-600">:</span>
            <div className="text-left">
              <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-400 block">
                {opponentLabel}
              </span>
              <span className="font-display text-lg font-black text-sky-400 leading-none tabular-nums">
                {opponentTotalScore.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN STAGE */}
      <main className="relative z-10 max-w-4xl w-full mx-auto my-auto py-4 flex flex-col gap-4">
        {/* Stage 1: Club Intro Transition */}
        {stage === 'club-intro' ? (
          <div className="rounded-[28px] bg-[#10141d]/95 border border-[#ff9f1c]/35 p-10 flex flex-col items-center justify-center text-center shadow-[0_28px_80px_rgba(0,0,0,0.85)] min-h-[380px]">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#ff9f1c]/15 border border-[#ff9f1c]/35 mb-4">
              <BookOpen className="w-3.5 h-3.5 text-[#ff9f1c]" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.22em] text-[#ff9f1c]">
                ROUND {roundIdx + 1} CLUB REVEAL
              </span>
            </div>

            <div className="w-28 h-28 rounded-3xl bg-white/[0.04] border border-white/15 flex items-center justify-center p-4 mb-4 shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
              <img
                src={currentClub.badgeUrl}
                alt={currentClub.name}
                className="w-full h-full object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)]"
              />
            </div>

            <h2 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-white">
              {currentClub.name}
            </h2>
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400 mt-2">
              TARGET METRIC: {metricLabel}
            </p>
          </div>
        ) : (
          <>
            {/* CLUB ARCHIVE HEADER BANNER */}
            <div className="relative rounded-[26px] bg-gradient-to-b from-[#151b27] to-[#0e121b] border border-white/12 p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.7)] overflow-hidden">
              <div
                className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-40 rounded-full blur-3xl opacity-30"
                style={{
                  background:
                    config.metric === 'Goals'
                      ? 'radial-gradient(circle, rgba(255,159,28,0.55), transparent 70%)'
                      : 'radial-gradient(circle, rgba(56,189,248,0.55), transparent 70%)',
                }}
              />

              <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-white/[0.05] border border-white/15 flex items-center justify-center p-3 shadow-[0_12px_30px_rgba(0,0,0,0.55)] shrink-0">
                    <img
                      src={currentClub.badgeUrl}
                      alt={currentClub.name}
                      className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
                    />
                  </div>

                  <div className="text-center sm:text-left">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ff9f1c]/15 border border-[#ff9f1c]/35 mb-1.5">
                      {config.metric === 'Goals' ? (
                        <Flame className="w-3 h-3 text-[#ff9f1c]" />
                      ) : (
                        <Target className="w-3 h-3 text-[#ff9f1c]" />
                      )}
                      <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[#ff9f1c]">
                        {metricLabel}
                      </span>
                    </div>

                    <h1 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white leading-tight">
                      {currentClub.name}
                    </h1>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Name a player with high official all-competition{' '}
                      <span className="text-white font-semibold">
                        {config.metric.toLowerCase()}
                      </span>{' '}
                      for {currentClub.name}.
                    </p>
                  </div>
                </div>

                {/* Round Progress Dots */}
                <div className="flex flex-col items-center sm:items-end gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                    CLUB {roundIdx + 1} OF {config.totalRounds}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: config.totalRounds }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2 rounded-full transition-all ${
                          i < roundIdx
                            ? 'w-2 bg-[#ff9f1c]'
                            : i === roundIdx
                            ? 'w-6 bg-[#ff9f1c] shadow-[0_0_10px_rgba(255,159,28,0.7)]'
                            : 'w-2 bg-white/15'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* LEFT (YOU) & RIGHT (OPPONENT) LIVE LOCK-IN + TALLY CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* LEFT SIDE: YOU */}
              <div
                className={`rounded-2xl p-4 border transition-all ${
                  userEval === null
                    ? 'bg-[#10141d]/90 border-white/10'
                    : userEval.skipped
                    ? 'bg-rose-500/10 border-rose-500/35'
                    : showUserScore && userEval.statCount > 0
                    ? 'bg-[#ff9f1c]/12 border-[#ff9f1c]/45 shadow-[0_0_30px_rgba(255,159,28,0.12)]'
                    : 'bg-[#ff9f1c]/[0.07] border-[#ff9f1c]/35'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                    YOUR SELECTION
                  </span>

                  {userEval === null ? (
                    <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                      SELECTING...
                    </span>
                  ) : userEval.skipped ? (
                    <span className="px-2 py-0.5 rounded bg-rose-500/25 border border-rose-500/50 text-[9px] font-mono font-black uppercase tracking-widest text-rose-300">
                      SKIPPED
                    </span>
                  ) : showUserScore && userEval.allTimeRank ? (
                    <span className="px-2 py-0.5 rounded bg-[#ff9f1c]/20 border border-[#ff9f1c]/40 text-[9px] font-mono font-black uppercase tracking-widest text-[#ff9f1c]">
                      #{userEval.allTimeRank} ALL-TIME
                    </span>
                  ) : showUserScore ? (
                    <span className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                      UNRANKED (0)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#ff9f1c]/20 border border-[#ff9f1c]/40 text-[9px] font-mono font-black uppercase tracking-widest text-[#ff9f1c]">
                      <Lock className="w-2.5 h-2.5" />
                      LOCKED IN
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between gap-3 mt-1">
                  <div className="min-w-0">
                    <p
                      className={`font-display text-lg sm:text-xl font-black uppercase tracking-wide truncate ${
                        userEval === null ? 'text-neutral-500' : 'text-white'
                      }`}
                    >
                      {userEval === null
                        ? 'AWAITING YOUR PICK...'
                        : userEval.skipped
                        ? 'PASSED'
                        : userEval.playerName}
                    </p>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-0.5">
                      {currentClub.name} • {metricUnit}
                    </p>
                  </div>

                  {/* Score only appears once both players have locked in and tally begins */}
                  {showUserScore && (
                    <div className="text-right shrink-0">
                      <span
                        className={`font-display text-4xl sm:text-5xl font-black leading-none tabular-nums ${
                          (userEval?.statCount ?? 0) > 0
                            ? 'text-[#ff9f1c]'
                            : 'text-neutral-500'
                        }`}
                      >
                        +{userTickerValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT SIDE: OPPONENT / AI SCOUT */}
              <div
                className={`rounded-2xl p-4 border transition-all ${
                  opponentEval === null
                    ? 'bg-[#10141d]/90 border-white/10'
                    : showOpponentScore
                    ? 'bg-sky-400/12 border-sky-400/45 shadow-[0_0_30px_rgba(56,189,248,0.12)]'
                    : 'bg-sky-400/[0.07] border-sky-400/35'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-sky-300">
                    {opponentLabel} SELECTION
                  </span>

                  {opponentEval === null ? (
                    <span className="px-2 py-0.5 rounded bg-white/[0.05] border border-white/10 text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                      SELECTING...
                    </span>
                  ) : showOpponentScore && opponentEval.allTimeRank ? (
                    <span className="px-2 py-0.5 rounded bg-sky-400/20 border border-sky-400/40 text-[9px] font-mono font-black uppercase tracking-widest text-sky-300">
                      #{opponentEval.allTimeRank} ALL-TIME
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-400/20 border border-sky-400/40 text-[9px] font-mono font-black uppercase tracking-widest text-sky-300">
                      <Lock className="w-2.5 h-2.5" />
                      LOCKED IN
                    </span>
                  )}
                </div>

                <div className="flex items-baseline justify-between gap-3 mt-1">
                  <div className="min-w-0">
                    <p
                      className={`font-display text-lg sm:text-xl font-black uppercase tracking-wide truncate ${
                        opponentEval === null ? 'text-neutral-500' : 'text-white'
                      }`}
                    >
                      {opponentEval === null
                        ? 'THINKING...'
                        : opponentEval.playerName}
                    </p>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-0.5">
                      {currentClub.name} • {metricUnit}
                    </p>
                  </div>

                  {/* Opponent score only appears during tally-opponent / round-done */}
                  {showOpponentScore && (
                    <div className="text-right shrink-0">
                      <span className="font-display text-4xl sm:text-5xl font-black leading-none text-sky-400 tabular-nums">
                        +{opponentTickerValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SEARCH INPUT BAR (while user has not locked in yet) OR ROUND DONE BAR */}
            {stage === 'playing' && userEval === null ? (
              <div className="relative z-30 rounded-2xl bg-[#10141d]/95 border border-white/12 p-4 sm:p-5 shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
                {duplicateWarning && (
                  <div className="mb-3 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-center gap-2 text-xs font-semibold text-rose-200">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}

                {/* Opponent typing indicator */}
                {isOpponentTyping && opponentEval === null && (
                  <div className="mb-2 text-[11px] font-mono text-sky-400 flex items-center gap-1.5 animate-pulse pl-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    <span>{opponentLabel} is searching the record books...</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => {
                        soundFX.playTypingTick();
                        setQuery(e.target.value);
                        setDuplicateWarning(null);
                        setShowDropdown(true);
                        if (isMultiplayer) {
                          sendAction('player_typing', { isTyping: true });
                        }
                      }}
                      onFocus={() => setShowDropdown(true)}
                      onKeyDown={handleKeyDown}
                      placeholder={`Search ${currentClub.name} ${config.metric.toLowerCase()} leader...`}
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-black/55 border border-white/15 focus:border-[#ff9f1c] focus:outline-none text-base sm:text-sm font-semibold text-white placeholder:text-neutral-500 transition-colors"
                    />

                    {/* Instant Fuzzy Autocomplete Dropdown */}
                    {showDropdown && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl bg-[#121722] border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-y-auto max-h-48 sm:max-h-60 z-40 divide-y divide-white/5">
                        {suggestions.map((name, idx) => {
                          const isSelected = idx === selectedIndex;
                          const isTakenByOpponent =
                            opponentEval !== null &&
                            isSameRecordBooksPlayer(
                              name,
                              opponentEval.playerName,
                              currentClub,
                              config.metric
                            );

                          return (
                            <button
                              key={name}
                              type="button"
                              disabled={isTakenByOpponent}
                              onMouseEnter={() => setSelectedIndex(idx)}
                              onClick={() => {
                                if (isTakenByOpponent) return;
                                setQuery(name);
                                handleLockIn(name, false);
                              }}
                              className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors ${
                                isTakenByOpponent
                                  ? 'bg-rose-500/10 text-neutral-500 cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-[#ff9f1c]/15 text-white cursor-pointer'
                                  : 'text-neutral-300 hover:bg-white/[0.04] cursor-pointer'
                              }`}
                            >
                              <span
                                className={`font-display text-sm font-bold tracking-wide ${
                                  isTakenByOpponent ? 'line-through text-neutral-500' : ''
                                }`}
                              >
                                {name}
                              </span>
                              {isTakenByOpponent ? (
                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rose-400">
                                  TAKEN BY {opponentLabel}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono uppercase tracking-widest text-[#ff9f1c]">
                                  LOCK IN
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleLockIn(query, false)}
                      disabled={query.trim().length === 0}
                      className="flex-1 sm:flex-initial px-6 py-3.5 rounded-xl bg-[#ff9f1c] hover:bg-[#ffad3b] disabled:opacity-40 disabled:pointer-events-none text-black font-display text-xs font-black uppercase tracking-widest transition-all shadow-[0_8px_25px_rgba(255,159,28,0.28)] cursor-pointer"
                    >
                      LOCK IN
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLockIn('', true)}
                      className="px-4 py-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-neutral-300 hover:text-white font-display text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Skip this round"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      SKIP
                    </button>
                  </div>
                </div>
              </div>
            ) : stage === 'round-done' ? (
              <div className="rounded-2xl bg-[#10141d]/95 border border-white/12 px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.8)] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <CheckCircle2 className="w-4 h-4 text-[#ff9f1c] shrink-0" />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-300">
                    {(userEval?.statCount ?? 0) > (opponentEval?.statCount ?? 0)
                      ? 'YOU TOOK THE ROUND LEAD'
                      : (userEval?.statCount ?? 0) === (opponentEval?.statCount ?? 0)
                      ? 'ROUND TIED'
                      : `${opponentLabel} TOOK THE ROUND`}
                  </span>
                </div>

                {isMultiplayer && !isHost ? (
                  <button
                    type="button"
                    disabled
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white/10 text-neutral-400 font-display text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-not-allowed opacity-75 border border-white/10 shrink-0"
                  >
                    <Clock className="w-3.5 h-3.5 text-neutral-400 animate-spin" />
                    <span>WAITING FOR HOST...</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleNextRound()}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#ff9f1c] hover:bg-[#ffad3b] text-black font-display text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(255,159,28,0.3)] cursor-pointer shrink-0"
                  >
                    <span>{roundIdx + 1 >= config.totalRounds ? 'FINAL SCOREBOARD' : 'NEXT CLUB'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-black/20 text-[10px] font-mono font-bold tracking-tight">
                      ENTER
                    </span>
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </main>

      {/* Multiplayer Opponent Forfeit Dialog */}
      <MultiplayerForfeitModal
        forfeitEvent={playerForfeitEvent}
        onReturnToHub={() => {
          clearForfeit();
          if (party.roomCode?.startsWith('match_') || party.visibility === 'public') {
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
          if (party.roomCode?.startsWith('match_') || party.visibility === 'public') {
            leaveParty();
          }
          setShowForfeitModal(false);
          handleCleanExit();
        }}
      />

      <div className="h-2" />
    </div>
  );
};
