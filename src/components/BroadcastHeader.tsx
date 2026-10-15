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
    <header className="relative w-full shrink-0 flex items-center justify-between py-2 mb-2 min-h-[44px]">
      {/* Left: Neutral Dark Slate with SFX Toggle & Social Icons */}
      <div className="flex items-center justify-start shrink-0 gap-1.5 sm:gap-2 z-10">
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

        {/* X / Twitter */}
        <a
          href="https://x.com/AddedTime90"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => soundFX.playClick(700)}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-900/60 border border-neutral-800 hover:border-neutral-500 text-neutral-400 hover:text-white transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] flex items-center justify-center group"
          title="Follow @AddedTime90 on X"
          aria-label="Follow Added Time on X"
        >
          <svg className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>

        {/* TikTok */}
        <a
          href="https://www.tiktok.com/@added.time90"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => soundFX.playClick(700)}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-900/60 border border-neutral-800 hover:border-cyan-400/50 text-neutral-400 hover:text-[#00f0ff] transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] flex items-center justify-center group"
          title="Follow @added.time90 on TikTok"
          aria-label="Follow Added Time on TikTok"
        >
          <svg className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
          </svg>
        </a>
      </div>

      {/* Center: Absolute Pixel-Perfect Center "ADDED TIME" */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <div className="flex items-center gap-2 sm:gap-2.5 select-none group pointer-events-auto">
          <span className="font-athletic font-black text-2xl sm:text-3xl md:text-4xl tracking-tight uppercase text-white whitespace-nowrap">
            ADDED TIME
          </span>
          <div className="flex items-center px-1.5 sm:px-2 py-0.5 rounded bg-[#0a0d14] border-2 border-[#ff6b00] shadow-[0_0_16px_rgba(255,107,0,0.55)] shrink-0">
            <span className="font-mono text-[11px] sm:text-xs md:text-sm font-black tracking-tight text-[#ff6b00]">
              90+
            </span>
          </div>
        </div>
      </div>

      {/* Right: Flush Action Triggers [HOST] & [JOIN CODE] or Glowing Active Party Pill */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0 z-10">
        {party.isActive && !party.roomCode?.startsWith('match_') && party.visibility !== 'public' ? (
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
              {party.isCurrentUserHost && (
                <>
                  <span className="text-neutral-500">•</span>
                  <span className="text-[#ccff00] font-black tracking-widest">
                    {party.isCodeMasked ? '••••' : party.roomCode}
                  </span>
                </>
              )}
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
