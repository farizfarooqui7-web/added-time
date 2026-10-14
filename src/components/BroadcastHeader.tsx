import React, { useState } from 'react';
import { Volume2, VolumeX, Users, Crown } from 'lucide-react';
import { soundFX } from '../utils/audio';
import { useParty } from '../context/PartyContext';

interface BroadcastHeaderProps {
  onHostPartyClick?: () => void;
  onJoinCodeClick?: () => void;
}

export const BroadcastHeader: React.FC<BroadcastHeaderProps> = ({
  onHostPartyClick,
  onJoinCodeClick,
}) => {
  const [muted, setMuted] = useState(soundFX.getMuted());
  const { party, togglePartyHost, toggleJoinCode, toggleDrawer } = useParty();

  const handleToggleSfx = () => {
    const isMuted = soundFX.toggleMute();
    setMuted(isMuted);
    if (!isMuted) soundFX.playClick(600);
  };

  const handleHost = () => {
    if (onHostPartyClick) {
      onHostPartyClick();
    } else {
      togglePartyHost();
    }
  };

  const handleJoin = () => {
    soundFX.playClick(750);
    if (onJoinCodeClick) {
      onJoinCodeClick();
    } else {
      toggleJoinCode();
    }
  };

  const handleOpenActiveParty = () => {
    soundFX.playClick(800);
    toggleDrawer();
  };

  return (
    <header className="w-full shrink-0 flex items-center justify-between py-2 mb-2 gap-2">
      {/* Left: Neutral Dark Slate with Orange Active Dot */}
      <div className="flex items-center justify-start shrink-0">
        <button
          type="button"
          onClick={handleToggleSfx}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 text-xs font-mono transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] cursor-pointer"
          title={muted ? 'Enable Sound FX' : 'Mute Sound FX'}
        >
          {muted ? (
            <>
              <VolumeX className="w-3.5 h-3.5 text-neutral-500" />
              <span className="hidden sm:inline text-[11px] text-neutral-400 uppercase tracking-wider">SFX OFF</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b00] animate-pulse" />
              <Volume2 className="w-3.5 h-3.5 text-neutral-300" />
              <span className="hidden sm:inline text-[11px] text-neutral-200 uppercase tracking-wider">SFX ON</span>
            </>
          )}
        </button>
      </div>

      {/* Center: Minimalist Centered "ADDED TIME" Logo with 90+ Stoppage Board Accent */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 select-none group truncate">
          <span className="font-sans font-black text-lg sm:text-2xl md:text-3xl tracking-tight text-white uppercase drop-shadow-[0_2px_12px_rgba(255,255,255,0.08)] truncate">
            ADDED TIME
          </span>
          <div className="flex items-center px-1 sm:px-1.5 py-0.5 rounded bg-[#0a0d14] border border-[#ff6b00]/60 shadow-[0_0_10px_rgba(255,107,0,0.3)] shrink-0">
            <span className="font-mono text-[10px] sm:text-xs font-black tracking-tight text-[#ff6b00]">
              90+
            </span>
          </div>
        </div>
      </div>

      {/* Right: Flush Action Triggers [HOST] & [JOIN CODE] or Glowing Active Party Pill */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
        {party.isActive ? (
          /* Glowing Active Party Pill: SQUAD (2/4) • [CODE] */
          <button
            type="button"
            onClick={handleOpenActiveParty}
            className="min-h-[38px] sm:min-h-[44px] flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-[#121824] hover:bg-[#182030] border border-[#ccff00]/50 text-white shadow-[0_0_20px_rgba(204,255,0,0.25)] hover:shadow-[0_0_25px_rgba(204,255,0,0.4)] transition-all cursor-pointer hover:scale-105 active:scale-95 group"
            title="Open Active Squad Lobby Drawer"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ccff00] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ccff00]" />
            </span>
            <div className="flex items-center gap-1 font-mono text-[11px] sm:text-xs font-bold">
              {party.isCurrentUserHost ? (
                <Crown className="w-3 h-3 text-[#ccff00]" />
              ) : (
                <Users className="w-3 h-3 text-cyan-400" />
              )}
              <span className="text-white uppercase tracking-wider">
                ({party.members.length}/{party.maxSlots})
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-[#ccff00] font-black tracking-widest">
                {party.isCodeMasked ? '••••' : party.roomCode}
              </span>
            </div>
          </button>
        ) : (
          /* Flush Top Action Buttons: [HOST] and [JOIN CODE] */
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleHost}
              className="min-h-[38px] sm:min-h-[44px] bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black uppercase text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-full shadow-lg shadow-[#ccff00]/25 transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1"
              title="Create a new Squad Lobby"
            >
              <span>[ HOST ]</span>
            </button>

            <button
              type="button"
              onClick={handleJoin}
              className="min-h-[38px] sm:min-h-[44px] bg-[#ff6b00] hover:bg-[#e65f00] text-black font-sans font-black uppercase text-[11px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-full shadow-lg shadow-[#ff6b00]/25 transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1"
              title="Join a Squad via Room Code"
            >
              <span className="hidden sm:inline">[ JOIN CODE ]</span>
              <span className="sm:hidden">[ JOIN ]</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
