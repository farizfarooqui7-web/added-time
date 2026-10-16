import React from 'react';
import { AlertTriangle, ArrowRight, Trophy } from 'lucide-react';
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
    <div className="bc-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md select-none">
      <div
        role="dialog"
        aria-modal="true"
        style={{ ['--acc' as string]: '#ccff00' } as React.CSSProperties}
        className="bc-scope bc-panel relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
      >
        <div className="bc-rail absolute inset-x-0 top-0 h-[2px]" />
        <div className="bc-sheen absolute inset-0 pointer-events-none" />
        <Trophy
          aria-hidden
          className="absolute -right-6 -bottom-6 w-40 h-40 pointer-events-none"
          style={{ color: '#ccff00', opacity: 0.05 }}
        />

        <div className="relative px-6 pt-6 pb-5">
          <div className="flex items-center gap-2.5 font-mono text-[10px] font-bold tracking-[0.22em] uppercase">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-amber-300">Match terminated</span>
          </div>
          <h2 className="mt-2 font-athletic italic font-black text-4xl uppercase text-white leading-[0.9] tracking-tight">
            Win by forfeit
          </h2>
          <p className="mt-3 text-[13px] text-slate-400 leading-snug">
            <span className="text-[#ccff00] font-bold">{forfeitEvent.playerName}</span> disconnected or left the arena.
          </p>
          <div className="mt-4 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-[11px] text-slate-400">
            {forfeitEvent.reason || 'Player disconnected from the squad.'}
          </div>
        </div>

        <div className="relative px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-white/[0.07] bg-black/30">
          <button
            type="button"
            onClick={() => {
              soundFX.playHammer();
              onReturnToHub();
            }}
            className="bc-btn bc-btn-primary w-full h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer"
          >
            Return to main hub
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
