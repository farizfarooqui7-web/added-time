import React from 'react';
import { useParty } from '../context/PartyContext';
import { ShieldAlert, LogOut, X } from 'lucide-react';

export const SoloEscapeHatchModal: React.FC = () => {
  const {
    isSoloEscapeModalOpen,
    dismissSoloEscapeHatch,
    confirmSoloEscapeHatch,
  } = useParty();

  if (!isSoloEscapeModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0c101a] border border-amber-500/40 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Amber Ambient Glow */}
        <div
          className="pointer-events-none absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display text-lg font-black uppercase text-white leading-tight">
                GUEST PERMISSION LOCKED
              </h3>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                PARTY HOST EXCLUSIVE ACTION
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissSoloEscapeHatch}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Message */}
        <div className="rounded-2xl bg-black/40 border border-white/10 p-4 mb-6">
          <p className="text-sm text-neutral-200 leading-relaxed font-sans">
            Only the party host can launch matches. Would you like to leave the party to play solo?
          </p>
          <p className="text-[11px] font-mono text-neutral-400 mt-2">
            Leaving will disconnect you from this party room code and immediately start your solo practice session.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={dismissSoloEscapeHatch}
            className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-sans font-bold text-xs uppercase tracking-wider transition-all cursor-pointer hover:text-white"
          >
            STAY IN PARTY
          </button>

          <button
            type="button"
            onClick={confirmSoloEscapeHatch}
            className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.35)] transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LEAVE & PLAY SOLO</span>
          </button>
        </div>
      </div>
    </div>
  );
};
