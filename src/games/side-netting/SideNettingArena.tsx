import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  RotateCcw,
  Send,
  AlertCircle,
  Sparkles,
  SkipForward,
} from 'lucide-react';
import type {
  SideNettingMatchConfig,
  SideNettingPrompt,
  SideNettingRoundResult,
  SideNettingRoundSubmission,
} from './types';
import {
  SIDE_NETTING_TIER_CONFIGS,
} from './types';
import {
  drawMatchPrompts,
  evaluateAnswer,
  findDidYouMeanTriviaAnswer,
  getBallKnowerRating,
} from './sideNettingEngine';
import { soundFX } from '../../utils/audio';
import { useGameSync } from '../../context/PartyContext';
import { MultiplayerForfeitModal } from '../../components/MultiplayerForfeitModal';

interface SideNettingArenaProps {
  config: SideNettingMatchConfig;
  onExitArena: () => void;
}

type DiveState = 'idle-surface' | 'answered-bubble' | 'diving' | 'at-depth' | 'ascending' | 'game-over';

export const SideNettingArena: React.FC<SideNettingArenaProps> = ({
  config,
  onExitArena,
}) => {
  const {
    isMultiplayer,
    opponent,
    myPlayerId,
    gameInitData,
    lastGameEvent,
    sendAction,
    playerForfeitEvent,
    clearForfeit,
    sendGameLeave,
  } = useGameSync('side_netting');

  const [initialData] = useState(() => drawMatchPrompts(config.roundCount, []));
  const [prompts, setPrompts] = useState<SideNettingPrompt[]>(() => {
    if (gameInitData?.sharedData?.prompts && gameInitData.sharedData.prompts.length > 0) {
      return gameInitData.sharedData.prompts;
    }
    return initialData.prompts;
  });
  const [usedPromptIds, setUsedPromptIds] = useState<string[]>(initialData.updatedExcludedIds);
  const [currentRoundIdx, setCurrentRoundIdx] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(config.timerSeconds);
  const [diveState, setDiveState] = useState<DiveState>('idle-surface');

  // Opponent multiplayer state
  const [opponentLockedIn, setOpponentLockedIn] = useState(false);
  const [opponentSubmission, setOpponentSubmission] = useState<SideNettingRoundSubmission | null>(null);
  const [opponentTotalScore, setOpponentTotalScore] = useState(0);

  // Answer & Input state
  const [inputVal, setInputVal] = useState<string>('');
  const [currentSubmission, setCurrentSubmission] = useState<SideNettingRoundSubmission | null>(null);

  // Did-you-mean auto-correction suggestion & Wrong Answer Shake state
  const [didYouMeanSuggestion, setDidYouMeanSuggestion] = useState<string | null>(null);
  const [lastAttemptedInvalid, setLastAttemptedInvalid] = useState<string | null>(null);
  const [isWrongAnswerShake, setIsWrongAnswerShake] = useState<boolean>(false);
  const [shakeMessage, setShakeMessage] = useState<string | null>(null);

  // Depth meter animation state (0 to 4000 meters)
  const [displayDepth, setDisplayDepth] = useState<number>(0);

  // Cumulative match results
  const [totalScore, setTotalScore] = useState<number>(0);
  const [maxDepthReached, setMaxDepthReached] = useState<number>(0);
  const [roundResults, setRoundResults] = useState<SideNettingRoundResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const currentPrompt = prompts[currentRoundIdx] || prompts[0];

  // 1. ROUND START: RESET TO SURFACE & FOCUS INPUT
  useEffect(() => {
    if (diveState === 'game-over') return;
    setDiveState('idle-surface');
    setDisplayDepth(0);
    setInputVal('');
    setDidYouMeanSuggestion(null);
    setLastAttemptedInvalid(null);
    setIsWrongAnswerShake(false);
    setShakeMessage(null);
    setCurrentSubmission(null);
    setOpponentLockedIn(false);
    setOpponentSubmission(null);
    if (config.timerSeconds > 0) {
      setSecondsLeft(config.timerSeconds);
    }
    window.setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentRoundIdx, config.timerSeconds]);

  // Synchronize incoming multiplayer events
  useEffect(() => {
    if (!isMultiplayer || !lastGameEvent) return;
    if (lastGameEvent.senderId === myPlayerId) return;

    if (lastGameEvent.event === 'sidenetting_lock_in') {
      const { roundIdx: evRound, submission } = lastGameEvent.data || {};
      if (evRound === currentRoundIdx && submission) {
        setOpponentLockedIn(true);
        setOpponentSubmission(submission);
        setOpponentTotalScore((prev) => prev + (submission.score || 0));
      }
    }
  }, [isMultiplayer, lastGameEvent, myPlayerId, currentRoundIdx]);

  // 2. ROUND TIMER
  useEffect(() => {
    if (diveState !== 'idle-surface') return;
    if (config.timerSeconds <= 0) return; // relaxed mode

    if (secondsLeft <= 0) {
      // Time expired: auto-lock as NO ANSWER (never submit partially typed random letters)
      triggerSubmission('');
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
  }, [diveState, secondsLeft, config.timerSeconds]);

  // Core execution of a validated submission
  const triggerSubmission = (finalAnswer: string) => {
    const evaluated = evaluateAnswer(finalAnswer, currentPrompt);
    setCurrentSubmission(evaluated);
    setDidYouMeanSuggestion(null);
    setIsWrongAnswerShake(false);
    setShakeMessage(null);

    if (isMultiplayer) {
      sendAction('sidenetting_lock_in', {
        roundIdx: currentRoundIdx,
        answer: finalAnswer,
        submission: evaluated,
      });
    }

    // Step A: Show speech bubble next to player/mascot at the surface
    setDiveState('answered-bubble');
    soundFX.playLockIn();

    // Step B: After 750ms, dive downwards into the ocean!
    window.setTimeout(() => {
      setDiveState('diving');
      if (evaluated.isValid) soundFX.playPhaseShift();
      else soundFX.playVoltBuzz();

      // Step C: Animate depth meters roll-up
      const target = evaluated.depthMeters;
      const durationMs = target > 0 ? 2200 : 800;
      const startTime = Date.now();
      let lastTickerBucket = 0;

      const depthTicker = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // smooth cubic ease-out
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentMeters = Math.round(target * eased);
        setDisplayDepth(currentMeters);

        const currentBucket = Math.floor(currentMeters / 150);
        if (currentBucket > lastTickerBucket) {
          lastTickerBucket = currentBucket;
          soundFX.playSlotTick();
        }

        if (progress >= 1) {
          window.clearInterval(depthTicker);
          setDisplayDepth(target);
          setDiveState('at-depth');

          if (evaluated.score >= 50) {
            soundFX.playSuccess();
          } else if (evaluated.score > 0) {
            soundFX.playBid();
          }

          // Record score
          setTotalScore((prev) => prev + evaluated.score);
          setMaxDepthReached((prev) => Math.max(prev, target));
          setRoundResults((prev) => [
            ...prev,
            { prompt: currentPrompt, submission: evaluated },
          ]);

          // Step D: Hold at depth for 2.2s, then ascend back to top or finish
          window.setTimeout(() => {
            if (currentRoundIdx + 1 < prompts.length) {
              setDiveState('ascending');
              soundFX.playClick(750);
              // Ascend takes 1.2s, then loads next question
              window.setTimeout(() => {
                setCurrentRoundIdx((prev) => prev + 1);
              }, 1200);
            } else {
              setDiveState('game-over');
              soundFX.playVictoryFanfare();
            }
          }, 2200);
        }
      }, 35);
    }, 750);
  };

  // 3. LOCK IN ANSWER WITH TYPO GUARD & SHAKE ERROR
  const handleLockAnswer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (diveState !== 'idle-surface') return;

    const trimmed = inputVal.trim();
    if (!trimmed) return;

    // A. Check if user typed a nickname, alias, or typo that needs confirmation
    // (e.g. "cr7" -> "Cristiano Ronaldo", "craisitnao" -> "Cristiano Ronaldo", "mesi" -> "Lionel Messi")
    const typoCheck = findDidYouMeanTriviaAnswer(trimmed, currentPrompt);
    if (
      typoCheck.hasCorrection &&
      typoCheck.suggestedName &&
      typoCheck.suggestedName.toLowerCase() !== trimmed.toLowerCase() &&
      (!didYouMeanSuggestion || didYouMeanSuggestion.toLowerCase() !== typoCheck.suggestedName.toLowerCase())
    ) {
      soundFX.playClick(700);
      setInputVal(typoCheck.suggestedName);
      setDidYouMeanSuggestion(typoCheck.suggestedName);
      setShakeMessage(`Did you mean "${typoCheck.suggestedName}"? Press ENTER to strike`);
      return;
    }

    // Target answer to evaluate (either confirmed suggestion or current input)
    const answerToTest = didYouMeanSuggestion || trimmed;

    // B. Validate strictly against the question's accepted answer pool
    // Ensure the player CANNOT send a wrong answer no matter what!
    const evalPreview = evaluateAnswer(answerToTest, currentPrompt);
    if (!evalPreview.isValid) {
      soundFX.playVoltBuzz();
      setIsWrongAnswerShake(true);
      setDidYouMeanSuggestion(null);
      setShakeMessage(`"${answerToTest}" is not a valid answer for this question! Try another player.`);
      window.setTimeout(() => setIsWrongAnswerShake(false), 900);
      return;
    }

    // Valid answer -> Send and Dive!
    soundFX.playClick(900);
    triggerSubmission(answerToTest);
  };

  const handlePlayAgain = () => {
    soundFX.playClick(950);
    // Draw fresh non-repeating questions
    const nextResult = drawMatchPrompts(config.roundCount, usedPromptIds);
    setPrompts(nextResult.prompts);
    setUsedPromptIds(nextResult.updatedExcludedIds);
    setCurrentRoundIdx(0);

    // Reset timer before resetting diveState to prevent the 0-second auto-skip bug
    const initialSeconds = config.timerSeconds > 0 ? config.timerSeconds : 0;
    setSecondsLeft(initialSeconds);

    setInputVal('');
    setDidYouMeanSuggestion(null);
    setLastAttemptedInvalid(null);
    setIsWrongAnswerShake(false);
    setShakeMessage(null);
    setCurrentSubmission(null);
    setDisplayDepth(0);
    setTotalScore(0);
    setMaxDepthReached(0);
    setRoundResults([]);

    setDiveState('idle-surface');
    window.setTimeout(() => inputRef.current?.focus(), 120);
  };

  // Ball Knower classification for endgame
  const avgScore =
    roundResults.length > 0 ? Math.round(totalScore / roundResults.length) : 0;
  const ratingBadge = getBallKnowerRating(avgScore, maxDepthReached);

  const matchedTierConfig =
    currentSubmission?.tier && currentSubmission.tier !== 'Miss'
      ? SIDE_NETTING_TIER_CONFIGS[currentSubmission.tier]
      : null;

  // Normalized progress from 0 to 1 based on depth (4,000m = 100%)
  const drillProgress = Math.min(1, displayDepth / 4000);

  // Training Pitch vertical scroll / perspective transformation
  // As the ball gets struck deeper down the pitch, the pitch scrolls down smoothly
  const pitchTranslateY = -(drillProgress * 65);

  // Ball horizontal slalom zigzag calculation based on progress
  // Ball weaves between the cones: sin wave that dampens at the end
  const ballZigzagX =
    diveState === 'diving'
      ? Math.sin(drillProgress * Math.PI * 6) * 48
      : 0;

  return (
    <div
      className={`min-h-screen w-full bg-[#080d14] text-white flex flex-col justify-between relative overflow-hidden select-none font-sans transition-colors duration-300 ${
        isWrongAnswerShake ? 'ring-8 ring-inset ring-rose-500/50' : ''
      }`}
    >
      {/* SHAKE CSS ANIMATIONS & BALL SPIN */}
      <style>{`
        @keyframes errorShake {
          0%, 100% { transform: translateX(0); }
          15%, 45%, 75% { transform: translateX(-9px); }
          30%, 60%, 90% { transform: translateX(9px); }
        }
        .animate-error-shake {
          animation: errorShake 0.45s ease-in-out;
        }

        @keyframes ballSpinSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ballSpinFast {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(1080deg); }
        }
        .spin-fast {
          animation: ballSpinFast 1.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }
        .spin-idle {
          animation: ballSpinSlow 12s linear infinite;
        }

        @keyframes bootKickStrike {
          0% {
            transform: translate(-38px, -30px) rotate(-42deg) scale(0.9);
            opacity: 0;
          }
          20% {
            transform: translate(-22px, -18px) rotate(-30deg) scale(1.05);
            opacity: 1;
          }
          55% {
            transform: translate(12px, 8px) rotate(16deg) scale(1.12);
            opacity: 1;
          }
          80% {
            transform: translate(22px, 14px) rotate(22deg) scale(1.04);
            opacity: 0.9;
          }
          100% {
            transform: translate(28px, 18px) rotate(26deg) scale(0.95);
            opacity: 0;
          }
        }
        .animate-boot-kick {
          animation: bootKickStrike 0.72s cubic-bezier(0.18, 0.9, 0.25, 1) forwards;
        }
      `}</style>

      {/* RED HUE SCREEN OVERLAY UPON WRONG ANSWER */}
      <div
        className={`pointer-events-none fixed inset-0 z-40 transition-opacity duration-300 ${
          isWrongAnswerShake ? 'opacity-40 bg-rose-950/60' : 'opacity-0'
        }`}
      />

      {/* ================= FLOODLIT TRAINING GROUND & TACTICAL PITCH SCENERY ================= */}
      <div
        className="pointer-events-none fixed inset-0 z-0 transition-transform duration-700 ease-out"
        style={{
          transform: `translateY(${pitchTranslateY}%)`,
          height: '380%',
        }}
      >
        {/* PITCH LAYER 1: 6-YARD BOX & GOALMOUTH (0 - 500m / TAP-IN ZONE) */}
        <div className="h-[25%] w-full relative bg-gradient-to-b from-[#06140d] via-[#092215] to-[#0c2e1c] overflow-hidden border-b border-emerald-500/20">
          {/* Turf Mower Stripes */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              background:
                'repeating-linear-gradient(180deg, rgba(255,255,255,0.06) 0px, transparent 40px, rgba(0,0,0,0.12) 80px)',
            }}
          />
          {/* Penalty Box White Lines */}
          <div className="absolute top-8 inset-x-8 sm:inset-x-24 h-64 border-2 border-white/20 rounded-b-xl">
            {/* 6-Yard Box */}
            <div className="absolute top-0 inset-x-16 sm:inset-x-36 h-28 border-2 border-white/25 rounded-b-lg flex items-center justify-center">
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-300/40 font-black">
                6-YARD TAP-IN ZONE (5 PTS)
              </span>
            </div>
            {/* Penalty Spot */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
          </div>

          {/* Aesthetic 3D Training Equipment Scattered Naturally Across Sidelines (Small & Varied Spacing) */}
          {/* Left sideline scattered items */}
          <div className="absolute top-8 left-3 sm:left-6 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/training_cone_3d.png"
              alt="Cone"
              className="w-7 h-9 sm:w-9 sm:h-11 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] -rotate-12"
            />
          </div>
          <div className="absolute top-28 left-8 sm:left-14 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/whistle_3d.png"
              alt="Whistle"
              className="w-5 h-5 sm:w-6 sm:h-6 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] rotate-45"
            />
          </div>
          <div className="absolute top-48 left-4 sm:left-8 opacity-70 pointer-events-none select-none">
            <img
              src="/assets/yellow_card_3d.png"
              alt="Card"
              className="w-4 h-6 sm:w-5 sm:h-7 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] -rotate-6"
            />
          </div>

          {/* Right sideline scattered items */}
          <div className="absolute top-10 right-4 sm:right-10 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/training_bib_3d.png"
              alt="Bib"
              className="w-7 h-7 sm:w-10 sm:h-10 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] rotate-12"
            />
          </div>
          <div className="absolute top-36 right-8 sm:right-16 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/training_cone_3d.png"
              alt="Cone"
              className="w-6 h-8 sm:w-8 sm:h-10 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] -rotate-6"
            />
          </div>
          <div className="absolute top-52 right-3 sm:right-7 opacity-70 pointer-events-none select-none">
            <img
              src="/assets/football_boot_3d.png"
              alt="Boot"
              className="w-7 h-5 sm:w-9 sm:h-7 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] rotate-12"
            />
          </div>
        </div>

        {/* PITCH LAYER 2: PENALTY ARC & MIDFIELD CONE DRILL (500m - 1,500m / STARTER XI) */}
        <div className="h-[25%] w-full relative bg-gradient-to-b from-[#0c2e1c] via-[#0a2517] to-[#071c11] overflow-hidden border-b border-emerald-500/20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-40 border-2 border-white/20 rounded-b-full border-t-0" />
          <div className="absolute top-20 left-10 sm:left-20 text-emerald-400/30 font-mono text-xs uppercase tracking-widest font-black">
            PENALTY ARC &amp; MIDFIELD DRILL (STARTER XI • 30 PTS)
          </div>

          {/* Left sideline scattered items */}
          <div className="absolute top-8 left-5 sm:left-12 opacity-80 pointer-events-none select-none">
            <img
              src="/assets/football_boot_3d.png"
              alt="Boot"
              className="w-8 h-6 sm:w-10 sm:h-8 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] -rotate-12"
            />
          </div>
          <div className="absolute top-32 left-3 sm:left-7 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/training_cone_3d.png"
              alt="Cone"
              className="w-8 h-10 sm:w-9 sm:h-11 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] rotate-6"
            />
          </div>
          <div className="absolute top-56 left-6 sm:left-14 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/red_card_3d.png"
              alt="Red Card"
              className="w-4 h-6 sm:w-5 sm:h-7 object-contain drop-shadow-[0_4px_8px_rgba(244,63,94,0.6)] rotate-12"
            />
          </div>

          {/* Right sideline scattered items */}
          <div className="absolute top-12 right-6 sm:right-12 opacity-80 pointer-events-none select-none">
            <img
              src="/assets/yellow_card_3d.png"
              alt="Yellow Card"
              className="w-4 h-6 sm:w-5 sm:h-7 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] rotate-12"
            />
          </div>
          <div className="absolute top-36 right-3 sm:right-6 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/training_bib_3d.png"
              alt="Bib"
              className="w-7 h-7 sm:w-9 sm:h-9 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] -rotate-6"
            />
          </div>
          <div className="absolute top-52 right-7 sm:right-16 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/training_cone_3d.png"
              alt="Cone"
              className="w-6 h-8 sm:w-8 sm:h-10 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] rotate-12"
            />
          </div>
        </div>

        {/* PITCH LAYER 3: CENTER CIRCLE & CULT HERO DRILL (1,500m - 2,800m / CULT HERO & STREETS) */}
        <div className="h-[25%] w-full relative bg-gradient-to-b from-[#071c11] via-[#06181a] to-[#06131c] overflow-hidden border-b border-cyan-500/20">
          <div className="absolute top-1/2 inset-x-0 h-0.5 bg-white/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full border-2 border-white/20 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
          </div>
          <div className="absolute top-12 left-10 text-cyan-400/40 font-mono text-xs uppercase tracking-widest font-black">
            CENTER CIRCLE SLALOM (CULT HERO &amp; STREETS • 50 &amp; 85 PTS)
          </div>

          {/* Left sideline scattered items */}
          <div className="absolute top-12 left-4 sm:left-9 opacity-80 pointer-events-none select-none">
            <img
              src="/assets/red_card_3d.png"
              alt="Red Card"
              className="w-5 h-7 sm:w-6 sm:h-8 object-contain drop-shadow-[0_4px_12px_rgba(244,63,94,0.6)] -rotate-12"
            />
          </div>
          <div className="absolute top-36 left-7 sm:left-16 opacity-80 pointer-events-none select-none">
            <img
              src="/assets/training_cone_3d.png"
              alt="Cone"
              className="w-8 h-10 sm:w-9 sm:h-11 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] rotate-3"
            />
          </div>
          <div className="absolute top-56 left-3 sm:left-6 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/whistle_3d.png"
              alt="Whistle"
              className="w-5 h-5 sm:w-6 sm:h-6 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] rotate-12"
            />
          </div>

          {/* Right sideline scattered items */}
          <div className="absolute top-10 right-4 sm:right-8 opacity-80 pointer-events-none select-none">
            <img
              src="/assets/training_cone_3d.png"
              alt="Cone"
              className="w-8 h-10 sm:w-10 sm:h-12 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] -rotate-6"
            />
          </div>
          <div className="absolute top-32 right-8 sm:right-16 opacity-80 pointer-events-none select-none">
            <img
              src="/assets/training_bib_3d.png"
              alt="Bib"
              className="w-7 h-7 sm:w-10 sm:h-10 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)] rotate-12"
            />
          </div>
          <div className="absolute top-52 right-3 sm:right-7 opacity-75 pointer-events-none select-none">
            <img
              src="/assets/football_boot_3d.png"
              alt="Boot"
              className="w-7 h-5 sm:w-9 sm:h-7 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] rotate-6"
            />
          </div>
        </div>

        {/* PITCH LAYER 4: OPPOSITION TOP BINS & BALLON D'OR SIDE NETTING (2,800m - 4,000m) */}
        <div className="h-[25%] w-full relative bg-gradient-to-b from-[#06131c] via-[#070d18] to-[#03060c] overflow-hidden">
          <div
            className="absolute -top-10 inset-x-0 h-full opacity-40"
            style={{
              background:
                'radial-gradient(ellipse at 50% 25%, rgba(250,204,21,0.3) 0%, transparent 65%)',
            }}
          />

          {/* LARGER 3D GOLDEN GOAL NET */}
          <div className="absolute top-4 sm:top-8 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="relative w-72 h-52 sm:w-[440px] sm:h-[300px] lg:w-[560px] lg:h-[360px] flex items-center justify-center">
              <img
                src="/assets/goal_net_3d.png"
                alt="Golden Goal Net"
                className="w-full h-full object-contain drop-shadow-[0_0_55px_rgba(250,204,21,0.75)]"
              />
              <div className="absolute top-2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-black font-display text-xs sm:text-sm font-black uppercase tracking-widest shadow-[0_0_24px_#facc15]">
                GOLDEN GOAL
              </div>
            </div>
            <span className="font-display text-2xl sm:text-3xl lg:text-4xl font-black uppercase tracking-widest text-yellow-300 drop-shadow-[0_0_24px_#facc15] mt-1 text-center">
              BALLON D'OR SIDE NETTING
            </span>
            <span className="text-xs sm:text-sm font-mono text-yellow-200/80 mt-1 uppercase tracking-widest text-center">
              100 PTS • MAXIMUM PURIST RECALL
            </span>
          </div>
        </div>
      </div>

      {/* ================= TOP BROADCAST HUD ================= */}
      <header className="relative z-30 max-w-[1400px] w-full mx-auto flex items-center justify-between gap-3 bg-[#0a0e17]/85 border border-white/10 rounded-2xl px-5 py-3.5 backdrop-blur-md shadow-2xl mt-2">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => {
              if (isMultiplayer) sendGameLeave();
              onExitArena();
            }}
            className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 flex items-center justify-center text-neutral-300 hover:text-white transition-all cursor-pointer"
            title="Exit to Hub"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-black uppercase tracking-wider text-white">
                SIDE NETTING
              </span>
            </div>
            <p className="text-[11px] font-mono text-neutral-400">
              ROUND {currentRoundIdx + 1} OF {prompts.length}
            </p>
          </div>
        </div>

        {/* Multiplayer Opponent Status Pill */}
        {isMultiplayer && opponent && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px]">
            <span className={`w-2 h-2 rounded-full ${opponentLockedIn ? 'bg-[#ccff00] animate-pulse' : 'bg-[#00f0ff]'}`} />
            <span className="text-slate-300 uppercase font-bold">{opponent.name}:</span>
            <span className={opponentLockedIn ? 'text-[#ccff00] font-bold' : 'text-slate-400'}>
              {opponentLockedIn ? (opponentSubmission?.matchedAnswer?.text ? `LOCKED (${opponentSubmission.matchedAnswer.text})` : opponentSubmission?.rawInput ? `LOCKED (${opponentSubmission.rawInput})` : 'LOCKED IN') : 'THINKING...'}
            </span>
          </div>
        )}

        {/* 5 KNOWLEDGE TIERS MINI HUD BAR */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 font-mono text-[10px]">
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-400/30">
            TAP-IN 5P
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30">
            STARTER 30P
          </span>
          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30">
            CULT 50P
          </span>
          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-400/30">
            STREETS 85P
          </span>
          <span className="px-2 py-0.5 rounded bg-yellow-400/25 text-yellow-300 font-bold border border-yellow-400/50">
            BALLON D'OR 100P
          </span>
        </div>

        {/* Live Score Tally & Clock */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/50 border border-white/10 font-mono text-xs">
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase tracking-wider">TOTAL POINTS</span>
              <span className="font-display text-base font-black text-emerald-300 tabular-nums">
                {totalScore} PTS
              </span>
            </div>
            {isMultiplayer && opponent && (
              <>
                <div className="w-px h-6 bg-white/10" />
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase tracking-wider">{opponent.name}</span>
                  <span className="font-display text-base font-black text-cyan-300 tabular-nums">
                    {opponentTotalScore} PTS
                  </span>
                </div>
              </>
            )}
            <div className="w-px h-6 bg-white/10" />
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase tracking-wider">MAX RANGE</span>
              <span className="font-display text-base font-black text-cyan-300 tabular-nums">
                {maxDepthReached}m
              </span>
            </div>
          </div>

          {config.timerSeconds > 0 && diveState === 'idle-surface' && (
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${
                secondsLeft <= 10
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                  : 'bg-emerald-500/15 border-emerald-400/50 text-white'
              }`}
            >
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="font-display text-lg font-black tracking-wider tabular-nums">
                {secondsLeft}s
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ================= MAIN ACTIVE STAGE (TOP WIDE QUESTION, CENTER BALL, BOTTOM INPUT) ================= */}
      <main className="relative z-10 w-full mx-auto pt-1 pb-3 flex-1 flex flex-col justify-between">
        {/* TOP: THE QUESTION (HIGH-CONTRAST SANS-SERIF BROADCAST CARD) */}
        {diveState !== 'game-over' && (
          <div className="text-center pt-1 sm:pt-2 max-w-5xl w-full mx-auto px-4 sm:px-6">
            <div className="bg-[#0b1420]/85 backdrop-blur-md border border-white/15 rounded-2xl px-5 sm:px-8 py-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.7)] flex flex-col items-center">
              <span className="px-3 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-[0.25em] bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 shadow inline-block mb-1.5">
                ROUND {currentRoundIdx + 1} OF {prompts.length} • {currentPrompt.category}
              </span>
              <h1 className="font-sans text-base sm:text-lg lg:text-xl font-semibold tracking-normal text-white text-balance leading-relaxed">
                "{currentPrompt.prompt}"
              </h1>
            </div>
          </div>
        )}

        {/* MIDDLE: ARENA WITH HIGHER-POSITIONED BALL & ANCHORED RIGHT SLIDER */}
        {diveState !== 'game-over' && (
          <div className="relative w-full h-[290px] sm:h-[340px] mt-1 sm:mt-2 mb-auto flex items-center justify-center px-4 sm:px-8">
            {/* CENTER STAGE: HIGHER UP CLOSER TO QUESTION */}
            <div className="w-full max-w-2xl flex flex-col items-center justify-center relative -translate-y-6 sm:-translate-y-8">
              {/* SINGLE SPEECH BUBBLE:
                  - While typing / rolling: ONLY shows the answer text (e.g. "Messi")
                  - When stopped at destination: Appends the tier tag (e.g. "TAP-IN • +5 PTS") into that SAME bubble */}
              {(diveState === 'answered-bubble' || diveState === 'diving' || diveState === 'at-depth') && currentSubmission && (
                <div
                  className="absolute -top-14 sm:-top-16 z-30 px-4 py-2 rounded-2xl border-2 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex items-center gap-2.5 transition-all animate-fade-in"
                  style={{
                    backgroundColor: currentSubmission.isValid
                      ? matchedTierConfig?.badgeBg || 'rgba(16, 185, 129, 0.25)'
                      : 'rgba(244, 63, 94, 0.25)',
                    borderColor: currentSubmission.isValid
                      ? matchedTierConfig?.glowColor || '#10b981'
                      : '#f43f5e',
                  }}
                >
                  <span className="font-display text-sm sm:text-base font-bold uppercase text-white tracking-wide">
                    "{currentSubmission.rawInput ? currentSubmission.rawInput : 'NO ANSWER'}"
                  </span>

                  {/* ONLY REVEAL TIER BADGE ONCE THE BALL HAS STOPPED AT ITS FINAL DESTINATION */}
                  {diveState === 'at-depth' && (
                    <span
                      className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded-lg text-black shadow animate-scale-up"
                      style={{
                        backgroundColor: currentSubmission.isValid
                          ? matchedTierConfig?.glowColor || '#10b981'
                          : '#f43f5e',
                        color: currentSubmission.isValid ? '#000000' : '#ffffff',
                      }}
                    >
                      {currentSubmission.isValid
                        ? `${matchedTierConfig?.label || currentSubmission.tier.toUpperCase()} • +${currentSubmission.score} PTS`
                        : 'MISS (0m)'}
                    </span>
                  )}
                </div>
              )}

              {/* THE SOCCER BALL: KICKED BY 3D BOOT THEN ROLLS DOWNFIELD */}
              <div
                className={`relative z-20 flex flex-col items-center transition-all duration-700 ease-out ${
                  isWrongAnswerShake ? 'animate-error-shake' : ''
                }`}
                style={{
                  transform:
                    diveState === 'diving'
                      ? `translate(${ballZigzagX}px, 40px) scale(1.15)`
                      : diveState === 'at-depth'
                      ? 'translate(0px, 30px) scale(1.08)'
                      : diveState === 'ascending'
                      ? 'translate(0px, -30px) scale(0.95)'
                      : 'translate(0px, 0px)',
                }}
              >
                {/* 3D SOCCER BOOT: SWINGS IN AND KICKS THE BALL */}
                {diveState === 'answered-bubble' && (
                  <div className="absolute -left-12 -top-10 sm:-left-16 sm:-top-12 z-40 w-20 h-20 sm:w-26 sm:h-26 pointer-events-none select-none animate-boot-kick">
                    <img
                      src="/assets/football_boot_3d.png"
                      alt="Striking Boot"
                      className="w-full h-full object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.85)] filter brightness-110"
                    />
                  </div>
                )}

                {/* HIGH-FIDELITY 3D MATCH FOOTBALL PNG */}
                <div
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 transition-all duration-500 ${
                    diveState === 'diving' ? 'spin-fast' : 'spin-idle'
                  }`}
                  style={{
                    filter:
                      isWrongAnswerShake
                        ? 'drop-shadow(0 0 20px rgba(244,63,94,0.9))'
                        : matchedTierConfig
                        ? `drop-shadow(0 0 30px ${matchedTierConfig.glowColor})`
                        : 'drop-shadow(0 10px 24px rgba(16,185,129,0.5))',
                  }}
                >
                  <img
                    src="/assets/soccer_ball_3d.png"
                    alt="Match Football"
                    className="w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            </div>

            {/* FAR-RIGHT CORNER: TALLER, WIDER, ANCHORED STRIKE RANGE METER */}
            <div className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 z-30 w-36 sm:w-48 h-[320px] sm:h-[380px] flex items-center justify-end">
              <div className="w-full h-full py-5 rounded-3xl bg-black/80 border border-white/20 backdrop-blur-md p-4 flex flex-col justify-between items-center shadow-[0_16px_50px_rgba(0,0,0,0.85)]">
                {/* Top readout */}
                <div className="text-center">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 block">
                    STRIKE RANGE
                  </span>
                  <span className="font-display text-2xl sm:text-3xl font-black text-emerald-300 tabular-nums">
                    {displayDepth}m
                  </span>
                </div>

                {/* Vertical Pitch Gauge Track with in-between markers */}
                <div className="relative w-full flex-1 my-4 flex items-center justify-center">
                  {/* Gauge Bar (Wider) */}
                  <div className="relative w-4 sm:w-5 h-full rounded-full bg-white/10 overflow-hidden border border-white/20 shadow-inner">
                    <div
                      className="w-full rounded-full transition-all duration-300 ease-out"
                      style={{
                        height: `${drillProgress * 100}%`,
                        background:
                          'linear-gradient(180deg, #f59e0b 0%, #10b981 25%, #06b6d4 50%, #a855f7 75%, #eab308 100%)',
                      }}
                    />
                  </div>

                  {/* IN-BETWEEN LINE MARKERS (0m, 1,000m, 2,000m, 3,000m, 4,000m) */}
                  <div className="absolute inset-y-0 right-1 sm:right-2 flex flex-col justify-between text-[10px] font-mono pointer-events-none select-none pl-3">
                    {/* 0m Marker (Top) */}
                    <div className="flex items-center gap-2 -translate-y-1">
                      <div className="w-3 h-px bg-amber-400" />
                      <span className="text-amber-300 font-bold">0m</span>
                    </div>

                    {/* 25% Marker (1,000m) */}
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-px bg-emerald-400" />
                      <span className="text-emerald-300">1000m</span>
                    </div>

                    {/* 50% Marker (2,000m) */}
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-px bg-cyan-400" />
                      <span className="text-cyan-300">2000m</span>
                    </div>

                    {/* 75% Marker (3,000m) */}
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-px bg-purple-400" />
                      <span className="text-purple-300">3000m</span>
                    </div>

                    {/* 100% Marker (4,000m Bottom) */}
                    <div className="flex items-center gap-2 translate-y-1">
                      <div className="w-3 h-px bg-yellow-400" />
                      <span className="text-yellow-300 font-black">4000m</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Tier Indicator */}
                <div className="text-center">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-400 block">
                    PITCH ZONE
                  </span>
                  <span className="text-[11px] font-mono font-black text-emerald-300">
                    {displayDepth >= 3600
                      ? "BALLON D'OR"
                      : displayDepth >= 2600
                      ? "STREETS WON'T FORGET"
                      : displayDepth >= 1500
                      ? 'CULT HERO'
                      : displayDepth >= 500
                      ? 'STARTER XI'
                      : 'TAP-IN'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM: THE ANSWER INPUT BOX WITH DID-YOU-MEAN & WRONG ANSWER SHAKE */}
        {diveState !== 'game-over' && (
          <div className="max-w-xl w-full mx-auto pb-3 px-4 space-y-2">
            {/* WRONG ANSWER OR DID-YOU-MEAN BANNER */}
            {shakeMessage && (
              <div
                className={`px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2.5 backdrop-blur-md animate-fade-in ${
                  isWrongAnswerShake
                    ? 'bg-rose-500/20 border-rose-500/60 text-rose-200'
                    : 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-mono">
                  {isWrongAnswerShake ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span>{shakeMessage}</span>
                </div>
                {didYouMeanSuggestion && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerSubmission(didYouMeanSuggestion);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-mono text-[10px] font-black uppercase tracking-wider shrink-0 cursor-pointer transition-all"
                  >
                    SEND "{didYouMeanSuggestion}"
                  </button>
                )}
              </div>
            )}

            <form
              onSubmit={handleLockAnswer}
              className={`relative flex items-center gap-2.5 transition-all ${
                isWrongAnswerShake ? 'animate-error-shake' : ''
              }`}
            >
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputVal}
                  disabled={diveState !== 'idle-surface'}
                  onChange={(e) => {
                    setInputVal(e.target.value);
                    if (didYouMeanSuggestion) setDidYouMeanSuggestion(null);
                    if (lastAttemptedInvalid) setLastAttemptedInvalid(null);
                    if (shakeMessage) setShakeMessage(null);
                  }}
                  placeholder="Type your answer..."
                  className={`w-full px-4 py-3 rounded-xl bg-black/75 border text-sm sm:text-base font-semibold text-white placeholder:text-neutral-500 backdrop-blur-md shadow-2xl transition-all focus:outline-none ${
                    isWrongAnswerShake
                      ? 'border-rose-500 ring-2 ring-rose-500/50'
                      : didYouMeanSuggestion
                      ? 'border-amber-400 ring-2 ring-amber-400/50'
                      : 'border-white/20 focus:border-emerald-400'
                  }`}
                />
                {inputVal.trim() && diveState === 'idle-surface' && (
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] font-mono uppercase tracking-widest text-emerald-400 animate-pulse">
                    READY
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={!inputVal.trim() || diveState !== 'idle-surface'}
                className="px-6 py-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:pointer-events-none text-black font-display text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_8px_20px_rgba(16,185,129,0.35)] cursor-pointer shrink-0"
              >
                <span>{didYouMeanSuggestion ? 'CONFIRM' : 'STRIKE'}</span>
                {didYouMeanSuggestion ? (
                  <ArrowRight className="w-3.5 h-3.5" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                disabled={diveState !== 'idle-surface'}
                onClick={() => {
                  soundFX.playVoltBuzz();
                  triggerSubmission('');
                }}
                className="px-4 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 disabled:opacity-40 disabled:pointer-events-none text-neutral-300 hover:text-white font-display text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                title="Skip this question immediately"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>SKIP</span>
              </button>
            </form>
          </div>
        )}

        {/* ================= GAME OVER PODIUM ================= */}
        {diveState === 'game-over' && (
          <div className="max-w-xl w-full mx-auto my-auto rounded-[32px] bg-[#0c141d]/95 border-2 border-emerald-400/40 p-8 text-center shadow-[0_32px_100px_rgba(16,185,129,0.25)] animate-fade-in">
            <div className="w-24 h-24 rounded-3xl bg-emerald-500/15 border-2 border-emerald-400/60 flex items-center justify-center mx-auto mb-4 shadow-[0_0_40px_rgba(16,185,129,0.35)] p-2">
              <img
                src="/assets/trophy_3d.png"
                alt="Championship Trophy"
                className="w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)]"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            <span className="px-4 py-1 rounded-full text-xs font-mono font-black uppercase tracking-[0.2em] bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
              DRILL COMPLETED
            </span>

            <h1 className="font-display text-4xl font-black uppercase text-white mt-3">
              SESSION CONCLUDED
            </h1>

            {/* Scoreboard Comparison */}
            <div className="grid grid-cols-2 gap-4 my-6">
              <div className="p-5 rounded-2xl bg-black/60 border-2 border-emerald-400/40">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block mb-1">
                  TOTAL POINTS
                </span>
                <span className="font-display text-4xl sm:text-5xl font-black text-emerald-300">
                  {totalScore}
                </span>
                <span className="text-xs font-mono text-neutral-400 block mt-1">ACROSS {prompts.length} ROUNDS</span>
              </div>

              <div className="p-5 rounded-2xl bg-black/60 border border-white/15">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block mb-1">
                  FURTHEST STRIKE
                </span>
                <span className="font-display text-4xl sm:text-5xl font-black text-cyan-300">
                  {maxDepthReached}m
                </span>
                <span className="text-xs font-mono text-neutral-400 block mt-1">MAX PITCH RANGE</span>
              </div>
            </div>

            {/* Ball Knower Rating Badge */}
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 mb-6 flex items-center justify-between text-left">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block">
                  BALL KNOWER CLASSIFICATION:
                </span>
                <h4 className="font-display text-lg font-black uppercase text-white mt-0.5">
                  {ratingBadge.title}
                </h4>
                <p className="text-xs font-mono text-neutral-400 mt-0.5">
                  {ratingBadge.desc}
                </p>
              </div>

              <span
                className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-black uppercase shrink-0 ${ratingBadge.badgeClass}`}
              >
                AVG {avgScore} PTS
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isMultiplayer) sendGameLeave();
                  onExitArena();
                }}
                className="flex-1 py-4 rounded-2xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 text-xs font-display font-extrabold uppercase tracking-widest text-neutral-300 transition-all cursor-pointer"
              >
                RETURN TO HUB
              </button>
              <button
                type="button"
                onClick={handlePlayAgain}
                className="flex-1 py-4 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-display font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(16,185,129,0.4)] cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Multiplayer Opponent Forfeit Dialog */}
      <MultiplayerForfeitModal
        forfeitEvent={playerForfeitEvent}
        onReturnToHub={() => {
          clearForfeit();
          onExitArena();
        }}
      />

      <div className="h-1" />
    </div>
  );
};


