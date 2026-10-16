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

  const iconBtn =
    'bc-btn bc-btn-ghost w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white cursor-pointer';
  const hasSquad = party.isActive && !party.roomCode?.startsWith('match_') && party.visibility !== 'public';

  return (
    <header
      style={{ ['--acc' as string]: '#ccff00' } as React.CSSProperties}
      className="bc-scope relative w-full shrink-0 flex items-center justify-between gap-3 pb-3 border-b border-white/[0.07]"
    >
      {/* Wordmark: broadcast bug */}
      <div className="flex items-center gap-2.5 min-w-0 select-none">
        <span className="hidden sm:block w-1 h-8 bg-[#ff6b00]" />
        <div className="leading-none">
          <div className="flex items-center gap-2">
            <span className="font-athletic italic font-black text-[28px] sm:text-[34px] tracking-tight uppercase text-white whitespace-nowrap">
              Added Time
            </span>
            <span className="px-1.5 py-0.5 rounded-[3px] bg-[#ff6b00] font-mono text-[11px] sm:text-xs font-black text-black tracking-tight">
              90+
            </span>
          </div>
          <span className="hidden sm:block mt-1 font-mono text-[9px] tracking-[0.32em] text-slate-500 uppercase">
            Football trivia · live
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={handleToggleSfx}
          className={iconBtn}
          title={muted ? 'Enable Sound FX' : 'Mute Sound FX'}
          aria-label={muted ? 'Enable sound effects' : 'Mute sound effects'}
        >
          {muted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* X / Twitter */}
        <a
          href="https://x.com/AddedTime90"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => soundFX.playClick(700)}
          className={`${iconBtn} hidden sm:flex`}
          title="Follow @AddedTime90 on X"
          aria-label="Follow Added Time on X"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>

        {/* TikTok */}
        <a
          href="https://www.tiktok.com/@added.time90"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => soundFX.playClick(700)}
          className={`${iconBtn} hidden sm:flex`}
          title="Follow @added.time90 on TikTok"
          aria-label="Follow Added Time on TikTok"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
          </svg>
        </a>

        <span className="hidden sm:block w-px h-6 bg-white/10 mx-1" />

        {hasSquad ? (
          /* Active squad: size, role and room code; opens the Party Dock */
          <button
            type="button"
            onClick={handleOpenActiveParty}
            className="bc-btn h-9 flex items-center gap-2 px-3 rounded-lg border border-[#ccff00]/50 bg-[#ccff00]/[0.08] hover:bg-[#ccff00]/15 text-white cursor-pointer"
            title="Open Active Squad Lobby Drawer"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="bc-radar absolute inline-flex h-full w-full rounded-full bg-[#ccff00]" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ccff00]" />
            </span>
            {party.isCurrentUserHost ? <Crown className="w-3.5 h-3.5 text-[#ccff00]" /> : <Users className="w-3.5 h-3.5 text-cyan-400" />}
            <span className="font-mono text-[11px] font-bold tracking-[0.12em]">
              SQUAD {party.members.length}/{party.maxSlots}
            </span>
            {party.isCurrentUserHost && (
              <span className="hidden sm:inline font-mono text-[11px] font-black tracking-[0.2em] text-[#ccff00]">
                {party.isCodeMasked ? '••••' : party.roomCode}
              </span>
            )}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleHost}
              className="bc-btn bc-btn-primary h-9 px-3 sm:px-4 rounded-lg font-mono text-[11px] font-black tracking-[0.14em] cursor-pointer"
              title="Create a new Squad Lobby"
            >
              HOST
            </button>
            <button
              type="button"
              onClick={handleJoin}
              style={{ ['--acc' as string]: '#ff6b00' } as React.CSSProperties}
              className="bc-scope bc-btn h-9 px-3 sm:px-4 rounded-lg border border-[#ff6b00]/60 text-[#ff8a33] hover:bg-[#ff6b00] hover:text-black font-mono text-[11px] font-black tracking-[0.14em] cursor-pointer"
              title="Join a Squad via Room Code"
            >
              <span className="hidden sm:inline">JOIN CODE</span>
              <span className="sm:hidden">JOIN</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
};
