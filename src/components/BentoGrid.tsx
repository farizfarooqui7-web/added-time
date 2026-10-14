import React from 'react';
import type { GameModeInfo } from '../types';
import { soundFX } from '../utils/audio';
import { useParty } from '../context/PartyContext';
import { ArrowRight, Flame, Zap, Target, Lock } from 'lucide-react';

interface BentoGridProps {
  modes: GameModeInfo[];
  onLaunchMode: (mode: GameModeInfo, tab?: 'solo' | 'quickmatch' | 'party') => void;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ modes, onLaunchMode }) => {
  const { party, presence } = useParty();
  const squadSize = party.isActive ? party.members.length : 1;

  // Capacity restrictions when party is active
  const isAuctionBlocked = party.isActive && squadSize > 2;
  const isRecordBooksBlocked = party.isActive && squadSize > 4;
  const isImposterBlocked = party.isActive && squadSize < 3;

  const auctionDraftMode = modes.find((m) => m.id === 'auction-draft') || modes[0];
  const linkUpMode = modes.find((m) => m.id === 'criteria-rush') || modes[1];
  const recordBooksMode = modes.find((m) => m.id === 'tally-race') || modes[2];
  const imposterMode = modes.find((m) => m.id === 'football-imposter') || modes[3];
  const sideNettingMode = modes.find((m) => m.id === 'side_netting') || modes[4];

  const renderPresenceBadge = (modeKey: string) => {
    const modeData = presence[modeKey];
    const searching = modeData?.searching || 0;
    const inGame = modeData?.inGame || 0;
    const total = searching + inGame;

    if (total <= 0) return null;

    let label = `${total} playing`;
    if (searching > 0 && inGame === 0) {
      label = `${searching} in queue`;
    } else if (inGame > 0 && searching === 0) {
      label = `${inGame} playing`;
    } else if (searching > 0 && inGame > 0) {
      label = `${total} active`;
    }

    return (
      <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-neutral-400 select-none">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </span>
        <span className="font-medium tracking-tight text-neutral-300">
          {label}
        </span>
      </div>
    );
  };

  const handleLaunch = (mode: GameModeInfo, tab: 'solo' | 'quickmatch' | 'party' = 'solo') => {
    // Check if mode is capacity-blocked for current squad
    if (mode.id === 'auction-draft' && isAuctionBlocked) {
      soundFX.playVoltBuzz();
      return;
    }
    if (mode.id === 'tally-race' && isRecordBooksBlocked) {
      soundFX.playVoltBuzz();
      return;
    }
    if (mode.id === 'football-imposter' && isImposterBlocked) {
      soundFX.playVoltBuzz();
      return;
    }

    soundFX.playClick(750);
    onLaunchMode(mode, tab);
  };

  return (
    <div className="w-full flex flex-col gap-5 md:gap-6 my-auto">
      {/* ================= ROW A: TOP FEATURED BLOCK (SPLIT 65% / 35%) ================= */}
      <div className="w-full flex flex-col md:flex-row gap-5 md:gap-6 min-h-[350px] md:min-h-[370px]">
        {/* CARD A: 65% WIDTH - $20 AUCTION DRAFT (ACID VOLT / LIME YELLOW) */}
        <div
          onClick={() => handleLaunch(auctionDraftMode, 'solo')}
          className={`w-full md:w-[65%] relative rounded-3xl overflow-hidden bg-[#10131a] border shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-6 md:p-8 flex flex-col justify-between group transition-all duration-300 ${
            isAuctionBlocked
              ? 'border-amber-500/30 cursor-not-allowed opacity-90'
              : 'border-white/5 cursor-pointer hover:border-[#ccff00]/40 hover:-translate-y-0.5'
          }`}
        >
          {/* Subtle Ambient Night Pitch Glow */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/90 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#10131a] via-[#10131a]/80 to-transparent pointer-events-none" />

          {/* Clean Tactical Bankroll & 5-Slot Formation Artwork */}
          <div className="absolute right-0 bottom-0 top-0 w-1/2 pointer-events-none overflow-hidden hidden sm:flex items-center justify-end pr-8">
            {/* Glowing $20 Digital Counter Watermark */}
            <div className="absolute right-4 font-mono font-black text-8xl md:text-9xl text-[#ccff00]/[0.06] tracking-tighter select-none">
              $20
            </div>

            {/* Tactical 5-Slot Formation Silhouettes on Mini-Pitch Board */}
            <div className="relative z-10 w-64 h-52 p-4 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-sm flex flex-col justify-between shadow-2xl transition-transform duration-300 group-hover:scale-105">
              {/* Pitch Line markings */}
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-[1px] bg-white/5" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/5" />

              {/* Slot 5: ATK (Top) */}
              <div className="flex justify-center">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ccff00]/10 border border-[#ccff00]/30 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00]" />
                  <span className="font-mono text-[10px] font-bold text-[#ccff00]">SLOT 5: ATK</span>
                </div>
              </div>

              {/* Slots 3 & 4: MID (Middle Duo) */}
              <div className="flex justify-around px-2">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  <span className="font-mono text-[9px] text-slate-300">MID</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  <span className="font-mono text-[9px] text-slate-300">MID</span>
                </div>
              </div>

              {/* Slots 1 & 2: DEF & GK (Bottom) */}
              <div className="flex justify-around px-4">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                  <span className="font-mono text-[9px] text-slate-300">DEF</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fbbf24]/10 border border-[#fbbf24]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
                  <span className="font-mono text-[9px] text-[#fbbf24]">GK</span>
                </div>
              </div>

              {/* Bankroll Footer Indicator */}
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>STARTING SALARY:</span>
                <span className="text-[#ccff00] font-bold">$20.00</span>
              </div>
            </div>
          </div>

          {/* Top Row: Rounded Micro-Pills */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ccff00] text-black text-xs font-sans font-bold uppercase tracking-wider shadow-[0_2px_10px_rgba(204,255,0,0.3)]">
                <Flame className="w-3.5 h-3.5 fill-black" />
                Featured Mode
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400 hidden sm:inline">5 Rounds</span>
              {renderPresenceBadge('auction-draft')}
            </div>
          </div>

          {/* Middle: Title & Generic Mode Description */}
          <div className="relative z-10 my-auto py-4 max-w-md">
            <h2 className="font-sans font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.05] mb-2.5 group-hover:text-[#ccff00] transition-colors">
              $20 Auction Draft
            </h2>
            <p className="text-slate-400 text-sm font-sans leading-relaxed">
              Manage your $20 bankroll across 5 rounds. Outbid your opponent to construct the ultimate 5-a-side dream squad.
            </p>
          </div>

          {/* Bottom Action Pill: Single Acid Volt Button with ArrowRight */}
          <div className="relative z-10 flex items-center pt-3 border-t border-white/5">
            <button
              type="button"
              disabled={isAuctionBlocked}
              onClick={(e) => {
                e.stopPropagation();
                handleLaunch(auctionDraftMode, 'solo');
              }}
              className={`px-5 py-2.5 rounded-full font-sans font-bold text-xs uppercase tracking-wide transition-all flex items-center gap-2 ${
                isAuctionBlocked
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-[#ccff00] hover:bg-[#b8e600] text-black shadow-[0_4px_16px_rgba(204,255,0,0.25)] hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <span>{isAuctionBlocked ? 'LOCKED' : 'ENTER DRAFT'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Capacity Blocked Overlay */}
          {isAuctionBlocked && (
            <div className="absolute inset-0 z-20 bg-[#080b12]/85 backdrop-blur-[3px] rounded-3xl flex flex-col items-center justify-center p-6 text-center border border-amber-500/30">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                <Lock className="w-6 h-6" />
              </div>
              <span className="font-display text-base font-black uppercase text-amber-300 tracking-wider">
                Party Too Large (Max 2 Players)
              </span>
              <p className="text-xs font-mono text-neutral-400 mt-1 max-w-sm">
                $20 Auction Draft is strictly a 2-player head-to-head duel. Current squad has {squadSize} ballers.
              </p>
              <div className="mt-3 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                Reduce party to 2 or launch Link-Up / Imposter
              </div>
            </div>
          )}
        </div>

        {/* CARD B: 35% WIDTH - THE LINK-UP (SPEED TRIVIA, ELECTRIC VIOLET) */}
        <div
          onClick={() => handleLaunch(linkUpMode, 'solo')}
          className="w-full md:w-[35%] relative rounded-3xl overflow-hidden bg-[#10131a] border border-white/5 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-6 md:p-8 flex flex-col justify-between group cursor-pointer transition-all duration-300 hover:border-purple-500/40 hover:-translate-y-0.5"
        >
          {/* Violet Tactical Radar Rings Texture */}
          <div className="absolute inset-0 opacity-25 pointer-events-none">
            <svg
              className="w-full h-full stroke-purple-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 300 300"
            >
              <circle cx="240" cy="60" r="140" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="240" cy="60" r="90" strokeWidth="1" />
              <circle cx="240" cy="60" r="40" strokeWidth="1.5" />
              <line x1="100" y1="60" x2="300" y2="60" strokeWidth="1" />
              <line x1="240" y1="0" x2="240" y2="200" strokeWidth="1" />
            </svg>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/15 via-transparent to-[#10131a] pointer-events-none" />

          {/* Top Pill Badge (Purple) */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-sans font-bold uppercase tracking-wider shadow-[0_2px_10px_rgba(168,85,247,0.25)] flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-purple-400 fill-purple-400" />
              Speed Trivia
            </span>
            {renderPresenceBadge('criteria-rush')}
          </div>

          {/* Middle: Title & Description */}
          <div className="relative z-10 my-auto py-3">
            <h3 className="font-sans font-extrabold text-2xl sm:text-3xl text-white tracking-tight leading-snug mb-2 group-hover:text-purple-300 transition-colors">
              The Link-Up
            </h3>
            <p className="text-slate-400 text-sm font-sans leading-relaxed">
              Club + Nation + Position. Customize your 3-slot career matrix and lock the connecting baller.
            </p>
          </div>

          {/* Bottom Action Pill */}
          <div className="relative z-10 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">1-8 Players</span>
            <div className="px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-sans font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 shadow-[0_4px_12px_rgba(168,85,247,0.35)] transition-all">
              <span>Play Speed Duel</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* ================= ROW B: THE BOTTOM GAME SHELF (3 EXPANDED LANDSCAPE CARDS) ================= */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 min-h-[220px] md:min-h-[235px]">
        {/* CARD 1: THE RECORD BOOKS (STAT VAULT, TROPHY GOLD) */}
        <div
          onClick={() => handleLaunch(recordBooksMode, 'solo')}
          className={`relative rounded-3xl overflow-hidden bg-[#10131a] border shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-6 flex flex-col justify-between group transition-all duration-300 ${
            isRecordBooksBlocked
              ? 'border-amber-500/30 cursor-not-allowed opacity-90'
              : 'border-white/5 cursor-pointer hover:border-amber-400/40 hover:-translate-y-1'
          }`}
        >
          {/* Moody Golden Trophy Silhouette & Spotlight Texture */}
          <div className="absolute right-3 top-3 bottom-0 w-1/3 pointer-events-none opacity-20 flex items-center justify-center">
            <svg
              className="w-28 h-28 text-amber-400 fill-current drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]"
              viewBox="0 0 24 24"
            >
              <path d="M19 4h-3V2H8v2H5c-1.1 0-2 .9-2 2v2c0 3.3 2.7 6 6 6h.5c.9 1.4 2.3 2.3 3.9 2.7L12 19H9v2h6v-2h-3l-1.4-2.3c1.6-.4 3-1.3 3.9-2.7h.5c3.3 0 6-2.7 6-6V6c0-1.1-.9-2-2-2zm-14 4V6h3v4.8C6.2 10.3 5 9.3 5 8zm14 0c0 1.3-1.2 2.3-3 2.8V6h3v2z" />
            </svg>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/85 to-transparent pointer-events-none" />

          {/* Top Pill & Icon */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-sans font-bold uppercase tracking-wider shadow-[0_2px_8px_rgba(251,191,36,0.2)]">
              Stat Vault
            </span>
            {renderPresenceBadge('tally-race')}
          </div>

          {/* Middle Content */}
          <div className="relative z-10 my-auto py-2">
            <h4 className="font-sans font-extrabold text-xl md:text-2xl text-white tracking-tight group-hover:text-amber-300 transition-colors">
              The Record Books
            </h4>
            <p className="text-slate-400 text-xs font-sans mt-1 line-clamp-2">
              Snatch Europe's all-time top goalscorers before your opponent locks them down.
            </p>
          </div>

          {/* Bottom Row: Player Count + Gold Launch Pill */}
          <div className="relative z-10 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">1-4 PLAYERS</span>
            <button
              type="button"
              disabled={isRecordBooksBlocked}
              className={`font-semibold text-xs px-3.5 py-1.5 rounded-full transition-all shadow-sm flex items-center gap-1 ${
                isRecordBooksBlocked
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-amber-400 hover:bg-amber-300 text-black group-hover:scale-105 cursor-pointer'
              }`}
            >
              <span>{isRecordBooksBlocked ? 'LOCKED' : 'OPEN THE BOOKS'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Capacity Blocked Overlay */}
          {isRecordBooksBlocked && (
            <div className="absolute inset-0 z-20 bg-[#080b12]/85 backdrop-blur-[3px] rounded-3xl flex flex-col items-center justify-center p-5 text-center border border-amber-500/30">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                <Lock className="w-5 h-5" />
              </div>
              <span className="font-display text-sm font-black uppercase text-amber-300 tracking-wider">
                Party Too Large (Max 4 Players)
              </span>
              <p className="text-[11px] font-mono text-neutral-400 mt-1 max-w-xs">
                The Record Books supports up to 4 players. Current squad has {squadSize} ballers.
              </p>
            </div>
          )}
        </div>

        {/* CARD 2: FOOTBALL IMPOSTER (SOCIAL DEDUCTION, CRIMSON RED) */}
        <div
          onClick={() => handleLaunch(imposterMode, 'party')}
          className={`relative rounded-3xl overflow-hidden bg-[#10131a] border shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-6 flex flex-col justify-between group transition-all duration-300 ${
            isImposterBlocked
              ? 'border-red-500/30 cursor-not-allowed opacity-90'
              : 'border-white/5 cursor-pointer hover:border-red-500/40 hover:-translate-y-1'
          }`}
        >
          {/* Pitch Chalkboard Background */}
          <div className="absolute right-3 top-2 bottom-0 w-2/5 pointer-events-none opacity-30 flex items-center justify-center">
            <div className="relative w-36 h-28 border border-white/10 rounded-xl bg-black/40 p-2">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-white/5" />
              <div className="absolute left-4 top-4 w-2 h-2 rounded-full bg-slate-300" />
              <div className="absolute left-8 bottom-4 w-2 h-2 rounded-full bg-slate-300" />
              <div className="absolute right-12 top-6 w-2 h-2 rounded-full bg-slate-300" />
              <div className="absolute left-14 top-12 w-2 h-2 rounded-full bg-slate-300" />
              <div className="absolute right-4 bottom-4 flex items-center justify-center">
                <Target className="w-6 h-6 text-red-500 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/85 to-transparent pointer-events-none" />

          {/* Top Pill & Icon */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 text-[11px] font-sans font-bold uppercase tracking-wider shadow-[0_2px_8px_rgba(239,68,68,0.2)]">
              Social Deduction
            </span>
            {renderPresenceBadge('football-imposter')}
          </div>

          {/* Middle Content */}
          <div className="relative z-10 my-auto py-2">
            <h4 className="font-sans font-extrabold text-xl md:text-2xl text-white tracking-tight group-hover:text-red-300 transition-colors">
              Football Imposter
            </h4>
            <p className="text-slate-400 text-xs font-sans mt-1 line-clamp-2">
              One fake in the squad. Drop niche clues and spot the spy.
            </p>
          </div>

          {/* Bottom Row: Player Count + Red Launch Pill */}
          <div className="relative z-10 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">3-8 PLAYERS</span>
            <button
              type="button"
              disabled={isImposterBlocked}
              className={`font-semibold text-xs px-3.5 py-1.5 rounded-full transition-all shadow-sm flex items-center gap-1 ${
                isImposterBlocked
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-400 text-white group-hover:scale-105 cursor-pointer'
              }`}
            >
              <span>{isImposterBlocked ? 'LOCKED' : 'SPOT THE SPY'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Capacity Blocked Overlay */}
          {isImposterBlocked && (
            <div className="absolute inset-0 z-20 bg-[#080b12]/85 backdrop-blur-[3px] rounded-3xl flex flex-col items-center justify-center p-5 text-center border border-red-500/30">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                <Lock className="w-5 h-5" />
              </div>
              <span className="font-display text-sm font-black uppercase text-red-300 tracking-wider">
                Requires 3+ Players
              </span>
              <p className="text-[11px] font-mono text-neutral-400 mt-1 max-w-xs">
                Social deduction requires at least 3 players. Current squad has {squadSize} baller{squadSize === 1 ? '' : 's'}.
              </p>
              <div className="mt-2.5 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-[10px] font-mono text-red-300 uppercase">
                Invite more teammates to unlock
              </div>
            </div>
          )}
        </div>

        {/* CARD 3: SIDE NETTING (OBSCURITY TRIVIA, ELECTRIC CYAN) */}
        <div
          onClick={() => handleLaunch(sideNettingMode, 'solo')}
          className="relative rounded-3xl overflow-hidden bg-[#10131a] border border-white/5 shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-6 flex flex-col justify-between group cursor-pointer transition-all duration-300 hover:border-cyan-400/40 hover:-translate-y-1"
        >
          {/* Decorative net background */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#10131a] via-[#10131a]/80 to-transparent pointer-events-none" />
          {/* Top Pill & Icon */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-sans font-bold uppercase tracking-wider shadow-[0_2px_8px_rgba(0,240,255,0.2)]">
              Obscurity Trivia
            </span>
            {renderPresenceBadge('side_netting')}
          </div>

          {/* Middle Content */}
          <div className="relative z-10 my-auto py-2">
            <h4 className="font-sans font-extrabold text-xl md:text-2xl text-white tracking-tight group-hover:text-cyan-300 transition-colors">
              SIDE NETTING
            </h4>
            <p className="text-slate-400 text-xs font-sans mt-1 line-clamp-2">
              Target the rarest, most obscure answers. Deep cuts claim maximum points.
            </p>
          </div>

          {/* Bottom Row: Player Count + Cyan Launch Pill */}
          <div className="relative z-10 pt-3 border-t border-white/5 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">1-8 PLAYERS</span>
            <button
              type="button"
              className="bg-cyan-400 text-black font-semibold text-xs px-3.5 py-1.5 rounded-full hover:bg-cyan-300 transition-all shadow-sm flex items-center gap-1 group-hover:scale-105 cursor-pointer"
            >
              <span>AIM FOR SIDE NETTING</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
