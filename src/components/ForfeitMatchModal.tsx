import React from 'react';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-[#0c1018] border border-white/10 p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.9)] flex flex-col items-center text-center overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Ambient Top Glow */}
        <div className="pointer-events-none absolute -top-24 inset-x-0 mx-auto w-48 h-48 rounded-full blur-3xl bg-rose-500/20" />

        {/* Warning Badge */}
        <div className="relative w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.25)]">
          <ShieldAlert className="w-7 h-7" />
        </div>

        {/* Title */}
        <h3
          id="forfeit-title"
          className="font-sans font-black text-2xl text-white uppercase tracking-tight mb-2"
        >
          {title}
        </h3>

        {/* Description */}
        <p className="text-xs sm:text-sm font-sans text-neutral-300 leading-relaxed mb-6 max-w-sm">
          {description}
        </p>

        {/* Action Buttons */}
        <div className="w-full flex flex-col-reverse sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={handleForfeit}
            className="w-full sm:w-1/2 min-h-[44px] py-3 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 hover:border-rose-500 text-rose-300 hover:text-white font-sans font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(244,63,94,0.2)] active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>Leave &amp; Forfeit</span>
          </button>

          <button
            type="button"
            onClick={handleStay}
            className="w-full sm:w-1/2 min-h-[44px] py-3 px-4 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(204,255,0,0.3)] active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Stay in Match</span>
          </button>
        </div>
      </div>
    </div>
  );
};
