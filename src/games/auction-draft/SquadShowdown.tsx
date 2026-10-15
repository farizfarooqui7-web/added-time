import React, { useState, useEffect } from 'react';
import type { ManagerState } from './types';
import type { PositionCategory } from '../../types';
import { getSquadAverageOvr } from './formations';
import { soundFX } from '../../utils/audio';
import { RotateCcw, Home, ChevronRight, Zap, User } from 'lucide-react';

interface SquadShowdownProps {
  userState: ManagerState;
  botState: ManagerState;
  onRematch: () => void;
  onReturnToHub: () => void;
  isMultiplayer?: boolean;
  isHost?: boolean;
  isOpponentRematchReady?: boolean;
  hasRequestedRematch?: boolean;
  /** Asymmetric formations: per-position OVR offsets applied to scoring (server-computed). */
  positionOffsets?: Partial<Record<PositionCategory, number>>;
}

export const SquadShowdown: React.FC<SquadShowdownProps> = ({
  userState,
  botState,
  onRematch,
  onReturnToHub,
  isMultiplayer = false,
  isHost = false,
  isOpponentRematchReady = false,
  hasRequestedRematch = false,
  positionOffsets,
}) => {
  // Step-by-step reveal: 0 = start, 1 = slot 1, 2 = slot 2, 3 = slot 3, 4 = slot 4, 5 = all 5 revealed
  const [revealedSlotCount, setRevealedSlotCount] = useState<number>(0);

  // Final Squad Average OVR (pure rating metric)
  const userAvgOvr = getSquadAverageOvr(userState.slots, positionOffsets);
  const botAvgOvr = getSquadAverageOvr(botState.slots, positionOffsets);
  const adjust = (slot?: { position: PositionCategory }) => (slot ? positionOffsets?.[slot.position] ?? 0 : 0);

  const isUserWinner = userAvgOvr > botAvgOvr;
  const isBotWinner = botAvgOvr > userAvgOvr;
  const isComplete = revealedSlotCount >= 5;

  // Auto-advance reveal sequence every 2.4 seconds until all 5 slots are revealed
  useEffect(() => {
    if (revealedSlotCount >= 5) return;

    const timer = setTimeout(() => {
      setRevealedSlotCount((prev) => {
        const next = prev + 1;
        soundFX.playHammer();
        return next;
      });
    }, 2200);

    return () => clearTimeout(timer);
  }, [revealedSlotCount]);

  useEffect(() => {
    if (revealedSlotCount === 5) {
      if (isUserWinner) {
        soundFX.playVictoryFanfare();
      } else if (isBotWinner) {
        soundFX.playVoltBuzz();
      } else {
        soundFX.playSuccess();
      }
    }
  }, [revealedSlotCount, isUserWinner, isBotWinner]);

  const handleNextStep = () => {
    if (revealedSlotCount < 5) {
      soundFX.playClick(850);
      setRevealedSlotCount((prev) => prev + 1);
    }
  };

  const handleRevealAll = () => {
    soundFX.playHammer();
    setRevealedSlotCount(5);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080a0f]/95 backdrop-blur-xl flex flex-col justify-between p-4 md:p-6 animate-in fade-in duration-300 overflow-y-auto font-sans select-none">
      {/* Top Banner and Championship Header */}
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center text-center pt-2 pb-3">
        {isComplete ? (
          <div className="animate-in zoom-in-95 duration-300 space-y-1">
            <h1
              className={`font-sans font-black text-4xl md:text-6xl uppercase tracking-tight ${
                isUserWinner
                  ? 'text-[#ccff00] drop-shadow-[0_4px_24px_rgba(204,255,0,0.45)]'
                  : isBotWinner
                  ? 'text-red-500 drop-shadow-[0_4px_24px_rgba(239,68,68,0.45)]'
                  : 'text-[#00f0ff]'
              }`}
            >
              {isUserWinner
                ? 'VICTORY : SQUAD MASTERCLASS'
                : isBotWinner
                ? 'DEFEAT : THE GAFFER PREVAILS'
                : 'STALEMATE : HONOURS EVEN'}
            </h1>
            <p className="text-slate-400 text-xs md:text-sm font-sans max-w-md mx-auto">
              {isUserWinner
                ? `Champion crowned by Squad Average OVR (${userAvgOvr} vs ${botAvgOvr}). Pure tactical superiority!`
                : isBotWinner
                ? `The Gaffer assembled a higher overall rating (${botAvgOvr} vs ${userAvgOvr}). Regroup and draft again.`
                : `Both squads deadlocked at identical ${userAvgOvr} Squad Average OVR.`}
              {positionOffsets && ' Different formations: averages are position-adjusted.'}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="font-sans font-black text-2xl md:text-4xl text-white uppercase tracking-tight flex items-center justify-center gap-2.5">
              <Zap className="w-6 h-6 text-[#ccff00] animate-pulse" />
              <span>REVEALING POSITION DUELS ({revealedSlotCount}/5)</span>
            </h2>
          </div>
        )}
      </div>

      {/* Main Position-by-Position Comparison Arena */}
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-3 my-auto">
        {/* Teams Header Bar with Prominent Squad Averages */}
        <div className="grid grid-cols-2 gap-4 pb-2 border-b border-white/10">
          {/* User Dugout Summary */}
          <div className="flex items-center justify-between px-3">
            <div>
              <span className="font-sans font-black text-lg text-white uppercase block">
                {userState.name}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                TOTAL SPENT: ${20 - userState.bankroll}
              </span>
            </div>
            {isComplete && (
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">SQUAD AVERAGE</span>
                <span className="font-mono font-black text-3xl text-[#ccff00] drop-shadow-[0_0_12px_rgba(204,255,0,0.5)]">
                  {userAvgOvr} OVR
                </span>
              </div>
            )}
          </div>

          {/* Bot Dugout Summary */}
          <div className="flex items-center justify-between px-3">
            <div>
              <span className="font-sans font-black text-lg text-white uppercase block">
                {botState.name}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                TOTAL SPENT: ${20 - botState.bankroll}
              </span>
            </div>
            {isComplete && (
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 uppercase block">SQUAD AVERAGE</span>
                <span className="font-mono font-black text-3xl text-slate-200">
                  {botAvgOvr} OVR
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 5 Position Duels Rows */}
        <div className="space-y-2.5">
          {userState.slots.map((uSlot, idx) => {
            const bSlot = botState.slots[idx];
            const isRevealed = idx < revealedSlotCount;

            const uPlayer = uSlot.filledPlayer;
            const bPlayer = bSlot?.filledPlayer;

            const uOvr = uPlayer?.ovr ?? 80;
            const bOvr = bPlayer?.ovr ?? 80;

            const uScore = uOvr + adjust(uSlot);
            const bScore = bOvr + adjust(bSlot);
            const userWonDuel = isRevealed && uScore > bScore;
            const botWonDuel = isRevealed && bScore > uScore;

            return (
              <div
                key={idx}
                className={`p-3 rounded-2xl border transition-all duration-300 grid grid-cols-2 gap-4 items-center ${
                  isRevealed
                    ? 'bg-[#12151e] border-white/10 shadow-lg'
                    : 'bg-black/30 border-white/5 opacity-40'
                }`}
              >
                {/* User Player Duel Card */}
                <DuelPlayerCard
                  slot={uSlot}
                  player={uPlayer}
                  opponentOvr={bOvr}
                  isRevealed={isRevealed}
                  isWinner={userWonDuel}
                  accentColor="volt"
                />

                {/* Bot Player Duel Card */}
                <DuelPlayerCard
                  slot={bSlot}
                  player={bPlayer}
                  opponentOvr={uOvr}
                  isRevealed={isRevealed}
                  isWinner={botWonDuel}
                  accentColor="red"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div className="w-full max-w-5xl mx-auto pt-4 flex flex-wrap items-center justify-center gap-4">
        {!isComplete ? (
          <>
            <button
              onClick={handleNextStep}
              className="px-6 py-3 rounded-full bg-[#ccff00] hover:bg-[#b8e600] text-black font-sans font-black text-xs uppercase tracking-wider shadow-[0_4px_20px_rgba(204,255,0,0.3)] transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
            >
              <span>NEXT DUEL</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleRevealAll}
              className="px-5 py-3 rounded-full bg-[#161a24] hover:bg-[#1e2433] border border-white/10 text-white font-sans font-bold text-xs uppercase tracking-wider transition-all"
            >
              <span>REVEAL ALL</span>
            </button>
          </>
        ) : (
          <>
            {/* Run It Back Button */}
            <button
              onClick={() => {
                soundFX.playClick(900);
                onRematch();
              }}
              disabled={isMultiplayer && !isHost && hasRequestedRematch}
              className={`px-7 py-3.5 rounded-full font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
                isMultiplayer && !isHost && hasRequestedRematch
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-not-allowed opacity-80'
                  : isMultiplayer && isHost && isOpponentRematchReady
                  ? 'bg-[#ccff00] hover:bg-[#b8e600] text-black shadow-[0_0_25px_rgba(204,255,0,0.6)] animate-pulse hover:scale-105 active:scale-95 cursor-pointer'
                  : 'bg-[#ccff00] hover:bg-[#b8e600] text-black shadow-[0_4px_20px_rgba(204,255,0,0.3)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <RotateCcw className={`w-4 h-4 ${isMultiplayer && !isHost && hasRequestedRematch ? 'animate-spin' : ''}`} />
              <span>
                {isMultiplayer && !isHost
                  ? hasRequestedRematch
                    ? 'HOST NOTIFIED : WAITING FOR HOST'
                    : '[ RUN IT BACK ]'
                  : isMultiplayer && isHost
                  ? isOpponentRematchReady
                    ? 'OPPONENT READY : PLAY AGAIN'
                    : '[ RUN IT BACK ]'
                  : '[ RUN IT BACK ]'}
              </span>
            </button>

            {/* Return to Hub Button */}
            <button
              onClick={() => {
                soundFX.playClick(500);
                onReturnToHub();
              }}
              className="px-7 py-3.5 rounded-full bg-[#161a24] hover:bg-[#1e2433] border border-white/10 hover:border-white/25 text-white font-sans font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg"
            >
              <Home className="w-4 h-4 text-slate-400" />
              <span>[ RETURN TO HUB ]</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Visual Head-to-Head Duel Card with Photo Cutout, Club Crest, and Animated OVR Meter
 */
interface DuelPlayerCardProps {
  slot: any;
  player: any;
  opponentOvr: number;
  isRevealed: boolean;
  isWinner: boolean;
  accentColor: 'volt' | 'red';
}

const DuelPlayerCard: React.FC<DuelPlayerCardProps> = ({
  slot,
  player,
  isRevealed,
  isWinner,
  accentColor,
}) => {
  const targetOvr = player?.ovr ?? 80;
  const [animatedNumber, setAnimatedNumber] = useState<number>(0);

  // Animated OVR counter rapidly counts up from 0 to target rating on reveal
  useEffect(() => {
    if (!isRevealed) {
      setAnimatedNumber(0);
      return;
    }

    let current = 0;
    const duration = 600;
    const stepTime = 20;
    const stepIncrement = Math.ceil(targetOvr / (duration / stepTime));

    const timer = setInterval(() => {
      current += stepIncrement;
      if (current >= targetOvr) {
        setAnimatedNumber(targetOvr);
        clearInterval(timer);
      } else {
        setAnimatedNumber(current);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [isRevealed, targetOvr]);

  const [crestFailed, setCrestFailed] = useState<boolean>(false);

  useEffect(() => {
    setCrestFailed(false);
  }, [player?.id]);

  const posBadgeColor =
    slot.position === 'GK'
      ? 'bg-[#fbbf24]/20 text-[#fbbf24] border-[#fbbf24]/40'
      : slot.position === 'DEF'
      ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
      : slot.position === 'MID'
      ? 'bg-[#ccff00]/20 text-[#ccff00] border-[#ccff00]/40'
      : 'bg-red-500/20 text-red-400 border-red-500/40';

  const clubCode = player?.clubCode || player?.clubAbbreviation || (player?.club ? player.club.slice(0, 3).toUpperCase() : 'TB');

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
        isRevealed && isWinner
          ? accentColor === 'volt'
            ? 'bg-[#151c24] border-[#ccff00] shadow-[0_0_20px_rgba(204,255,0,0.3)] scale-[1.01]'
            : 'bg-[#22161a] border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] scale-[1.01]'
          : 'bg-black/40 border-white/5'
      }`}
    >
      <div className="flex items-center gap-3 overflow-hidden">
        {/* Photo Cutout & Crest Thumbnail Frame with Torso Zoom */}
        {player && isRevealed ? (
          <div className="w-12 h-12 rounded-xl bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center shrink-0 relative">
            {(player.imagePath || player.imageUrl) ? (
              <img
                src={player.imagePath || player.imageUrl}
                alt={player.name}
                className="w-full h-full object-cover object-center scale-100 filter contrast-110 drop-shadow"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#141824]">
                <User className="w-6 h-6 text-slate-500" />
              </div>
            )}
            {crestFailed ? (
              <span className="font-mono text-[8px] font-black px-1 py-0.5 rounded bg-black/80 text-white border border-white/20 absolute top-1 left-1 z-10 uppercase">
                {clubCode}
              </span>
            ) : (player.crestPath || player.clubCrestUrl) ? (
              <img
                src={player.crestPath || player.clubCrestUrl}
                alt={player.club}
                className="w-3.5 h-3.5 object-contain absolute top-1 left-1 filter drop-shadow z-10"
                onError={() => setCrestFailed(true)}
              />
            ) : null}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-black/30 border border-dashed border-white/10 flex items-center justify-center shrink-0">
            <span className="font-mono text-xs text-slate-600">--</span>
          </div>
        )}

        {/* Name, Season, and Position Tag */}
        <div className="truncate">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-mono font-black px-1.5 py-0.2 rounded border ${posBadgeColor}`}>
              {slot.position}
            </span>
            {player && isRevealed && (
              <span className="text-[10px] font-mono text-[#fbbf24] font-bold">
                {player.season}
              </span>
            )}
          </div>

          {player && isRevealed ? (
            <span className="font-sans font-black text-sm text-white uppercase truncate block leading-tight mt-0.5">
              {player.name}
            </span>
          ) : (
            <span className="text-xs font-mono text-slate-500 italic mt-0.5 block">
              {isRevealed ? 'VACANT SLOT' : 'LOCKED CARD'}
            </span>
          )}
        </div>
      </div>

      {/* Animated OVR Meter & Final Score Pill */}
      {isRevealed && (
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-20 bg-white/10 h-2.5 rounded-full overflow-hidden hidden sm:block">
            <div
              className={`h-full transition-all duration-700 ${
                isWinner
                  ? accentColor === 'volt'
                    ? 'bg-[#ccff00]'
                    : 'bg-red-500'
                  : 'bg-slate-400'
              }`}
              style={{ width: `${animatedNumber}%` }}
            />
          </div>

          <span
            className={`font-mono font-black text-sm md:text-base px-2.5 py-1 rounded-lg border shadow-sm ${
              isWinner
                ? accentColor === 'volt'
                  ? 'bg-[#ccff00] text-black border-[#ccff00]'
                  : 'bg-red-500 text-white border-red-500'
                : 'bg-white/5 text-slate-300 border-white/10'
            }`}
          >
            {animatedNumber}
          </span>
        </div>
      )}
    </div>
  );
};
