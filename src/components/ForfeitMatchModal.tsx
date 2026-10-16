import React, { useEffect } from 'react';
import { ArrowLeft, LogOut, ShieldAlert } from 'lucide-react';
import { soundFX } from '../utils/audio';

interface ForfeitMatchModalProps {
  isOpen: boolean;
  onStay: () => void;
  onForfeit: () => void;
  title?: string;
  description?: string;
}

export const ForfeitMatchModal: React.FC<ForfeitMatchModalProps> = ({
  isOpen,
  onStay,
  onForfeit,
  title = 'Forfeit Match?',
  description = 'Are you sure you want to leave? Your active progress and match points will be discarded.',
}) => {
  // Escape keeps you in the match (the safe choice)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        soundFX.playClick(650);
        onStay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onStay]);

  if (!isOpen) return null;

  const handleStay = () => {
    soundFX.playClick(650);
    onStay();
  };

  const handleForfeit = () => {
    soundFX.playVoltBuzz();
    onForfeit();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forfeit-title"
      className="bc-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ['--acc' as string]: '#ef4444' } as React.CSSProperties}
        className="bc-scope bc-panel relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
      >
        <div className="bc-rail absolute inset-x-0 top-0 h-[2px]" />
        <div className="bc-lock-stripes absolute inset-x-0 top-0 h-16 opacity-60 pointer-events-none [mask-image:linear-gradient(to_bottom,black,transparent)]" />

        <div className="relative px-6 pt-6 pb-5">
          <div className="flex items-center gap-2.5 font-mono text-[10px] font-bold tracking-[0.22em] uppercase">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400">Match in progress</span>
          </div>
          <h3
            id="forfeit-title"
            className="mt-2 font-athletic italic font-black text-4xl uppercase text-white leading-[0.9] tracking-tight"
          >
            {title}
          </h3>
          <p className="mt-3 text-[13px] text-slate-400 leading-snug">{description}</p>
        </div>

        <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-2 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-white/[0.07] bg-black/30">
          <button
            type="button"
            onClick={handleStay}
            autoFocus
            style={{ ['--acc' as string]: '#ccff00' } as React.CSSProperties}
            className="bc-scope bc-btn bc-btn-primary sm:order-2 h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Stay in match
          </button>
          <button
            type="button"
            onClick={handleForfeit}
            className="bc-btn sm:order-1 h-11 rounded-lg inline-flex items-center justify-center gap-2 border border-red-500/45 text-red-300 hover:bg-red-500 hover:text-white hover:border-red-500 font-mono text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Leave &amp; forfeit
          </button>
        </div>
      </div>
    </div>
  );
};
