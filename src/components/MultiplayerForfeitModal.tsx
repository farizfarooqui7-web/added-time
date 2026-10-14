import React from 'react';
import { Trophy, AlertTriangle, ArrowRight } from 'lucide-react';
import { soundFX } from '../utils/audio';

interface MultiplayerForfeitModalProps {
  forfeitEvent: { playerId: string; playerName: string; reason: string } | null;
  onReturnToHub: () => void;
}

export const MultiplayerForfeitModal: React.FC<MultiplayerForfeitModalProps> = ({
  forfeitEvent,
  onReturnToHub,
}) => {
  React.useEffect(() => {
    if (forfeitEvent) {
      soundFX.playVictoryFanfare();
    }
  }, [forfeitEvent]);

  if (!forfeitEvent) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0f1420] border border-[#ccff00]/40 p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col items-center text-center space-y-4">
        {/* Glow */}
        <div className="pointer-events-none absolute -top-20 inset-x-0 mx-auto w-48 h-48 rounded-full bg-[#ccff00]/20 blur-3xl" />

        {/* Icon */}
        <div className="relative w-16 h-16 rounded-2xl bg-[#ccff00]/15 border border-[#ccff00]/40 text-[#ccff00] flex items-center justify-center shadow-[0_0_25px_rgba(204,255,0,0.3)]">
          <Trophy className="w-8 h-8 fill-current" />
        </div>

        <div>
          <span className="px-3 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300 inline-flex items-center gap-1 mb-2">
            <AlertTriangle className="w-3 h-3" />
            <span>MATCH TERMINATED</span>
          </span>
          <h2 className="font-display text-2xl font-black text-white uppercase tracking-tight">
            OPPONENT FORFEITED
          </h2>
          <p className="text-sm font-sans text-neutral-300 mt-1.5 leading-relaxed">
            <strong className="text-[#ccff00] font-bold">{forfeitEvent.playerName}</strong> has disconnected or left the arena. You win by forfeit!
          </p>
        </div>

        <div className="w-full p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-xs text-neutral-400">
          {forfeitEvent.reason || 'Player disconnected from the squad.'}
        </div>

        <button
          type="button"
          onClick={() => {
            soundFX.playHammer();
            onReturnToHub();
          }}
          className="w-full py-3.5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(204,255,0,0.35)] transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
        >
          <span>RETURN TO MAIN HUB</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
