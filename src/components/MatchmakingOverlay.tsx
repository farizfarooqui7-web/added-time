import React from 'react';
import { useParty } from '../context/PartyContext';
import { soundFX } from '../utils/audio';
import { Zap, Clock, X, CheckCircle2 } from 'lucide-react';

interface MatchmakingOverlayProps {
  onCancel?: (modeId: string | null) => void;
}

export const MatchmakingOverlay: React.FC<MatchmakingOverlayProps> = ({ onCancel }) => {
  const { queueState, leaveQueue } = useParty();

  if (!queueState.isQueued && queueState.status !== 'matched') {
    return null;
  }

  const handleCancel = () => {
    soundFX.playClick(600);
    const activeModeId = queueState.modeId;
    leaveQueue();
    if (onCancel) onCancel(activeModeId);
  };

  const modeDisplayName =
    queueState.modeId === 'auction-draft'
      ? '$20 Auction Draft'
      : queueState.modeId === 'criteria-rush' || queueState.modeId === 'link-up'
      ? 'The Link-Up'
      : queueState.modeId === 'tally-race' || queueState.modeId === 'record-books'
      ? 'The Record Books'
      : queueState.modeId === 'football-imposter'
      ? 'Football Imposter'
      : queueState.modeId === 'side_netting'
      ? 'Side Netting'
      : 'Quick Match';

  const isMatched = queueState.status === 'matched';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-md rounded-[32px] bg-[#0c1018] border border-white/10 p-7 sm:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)] flex flex-col items-center text-center overflow-hidden">
        {/* Ambient Top Glow */}
        <div
          className={`pointer-events-none absolute -top-24 inset-x-0 mx-auto w-56 h-56 rounded-full blur-3xl transition-colors duration-500 ${
            isMatched ? 'bg-[#ccff00]/25' : 'bg-[#00f0ff]/20'
          }`}
        />

        {/* Radar Pulse / Spinner */}
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full border-2 animate-ping opacity-35 ${
              isMatched ? 'border-[#ccff00]' : 'border-[#00f0ff]'
            }`}
          />
          <div
            className={`w-18 h-18 rounded-3xl border flex items-center justify-center shadow-lg transition-all duration-300 ${
              isMatched
                ? 'bg-[#ccff00]/15 border-[#ccff00]/40 text-[#ccff00] shadow-[0_0_30px_rgba(204,255,0,0.35)]'
                : 'bg-[#00f0ff]/10 border-[#00f0ff]/30 text-[#00f0ff] shadow-[0_0_30px_rgba(0,240,255,0.25)]'
            }`}
          >
            {isMatched ? (
              <CheckCircle2 className="w-9 h-9 animate-bounce" />
            ) : (
              <Zap className="w-9 h-9 animate-pulse fill-current" />
            )}
          </div>
        </div>

        {/* Mode Tag */}
        <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest bg-white/[0.06] border border-white/10 text-neutral-300 mb-2">
          {modeDisplayName} • {queueState.modeId === 'football-imposter' ? 'PUBLIC STAGING (3-8 PLAYERS)' : queueState.queueType === 'ffa' ? '8-PLAYER PUBLIC STAGING' : '1v1 DROP-IN DUEL'}
        </span>

        {/* Title */}
        <h2 className="font-display text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mb-2">
          {isMatched
            ? queueState.modeId === 'football-imposter' ? 'SQUAD ASSEMBLED!' : 'OPPONENT MATCHED!'
            : queueState.modeId === 'football-imposter' ? 'STAGING ROOM ACTIVE' : 'SEARCHING FOR OPPONENT...'}
        </h2>

        {/* Staging / Timer Info */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          {queueState.modeId === 'football-imposter' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#ff2a5f]/15 border border-[#ff2a5f]/40 font-mono text-xs text-[#ff2a5f]">
              <span className="w-2 h-2 rounded-full bg-[#ff2a5f] animate-pulse" />
              <span>BALLERS:</span>
              <span className="font-bold text-white tabular-nums">
                {queueState.joinedCount || 1} / 3+ REQUIRED
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 border border-white/10 font-mono text-xs text-neutral-400">
            <Clock className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>TIME:</span>
            <span className="text-white font-bold tabular-nums">
              00:{queueState.elapsedSeconds < 10 ? `0${queueState.elapsedSeconds}` : queueState.elapsedSeconds}
            </span>
          </div>
        </div>

        <p className="text-xs font-mono text-neutral-400 leading-relaxed mb-6 max-w-xs">
          {isMatched
            ? 'Locking in match seeds and entering live stadium arena...'
            : queueState.modeId === 'football-imposter'
            ? 'Waiting for at least 3 players. Invite teammates using your squad room code to start immediately!'
            : 'Pinging live active players. Automatic AI bot fallback activates at 10s so you never wait in empty queues.'}
        </p>

        {/* Cancel Button */}
        {!isMatched && (
          <button
            type="button"
            onClick={handleCancel}
            className="w-full py-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-red-500/40 text-neutral-300 hover:text-red-400 font-sans font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>CANCEL SEARCH</span>
          </button>
        )}
      </div>
    </div>
  );
};
