import React from 'react';
import type { GameModeInfo } from '../types';
import { soundFX } from '../utils/audio';
import { useParty } from '../context/PartyContext';
import { PublicSquadsStrip } from './PublicSquads';
import { ChevronRight, Lock, User, Users, Zap } from 'lucide-react';

interface BentoGridProps {
  modes: GameModeInfo[];
  onLaunchMode: (mode: GameModeInfo, tab?: 'solo' | 'quickmatch' | 'party') => void;
}

type LaunchTab = 'solo' | 'quickmatch' | 'party';

interface CartridgeSpec {
  /** Signature accent, mirrored from the game's arena. */
  accent: string;
  /** Secondary accent for details (Imposter's emerald, Link-Up's cyan). */
  accent2: string;
  code: string;
  tagline: string;
  specs: string[];
  /** Big quiet watermark in the corner: the card's one piece of "art". */
  mark: string;
  defaultTab: LaunchTab;
  /** Omitted when the mode has no solo entry (Imposter needs 3+ players). */
  soloLabel?: string;
}

const CARTRIDGES: Record<string, CartridgeSpec> = {
  'auction-draft': {
    accent: '#ccff00',
    accent2: '#ccff00',
    code: '01',
    tagline: 'Twenty dollars, five slots, one rival. Bid live on every lot and build the stronger five-a-side.',
    specs: ['2 PLAYERS'],
    mark: '$20',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
  'criteria-rush': {
    accent: '#3dff8f',
    accent2: '#00f0ff',
    code: '02',
    tagline: 'Three clues, one baller. Lock the link first and it is yours: your rival gets 30s to find another.',
    specs: ['1-8 PLAYERS'],
    mark: '3/3',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
  'tally-race': {
    accent: '#f59e0b',
    accent2: '#fbbf24',
    code: '03',
    tagline: "Name a club's league scorers and bank their tallies. Deep cuts from the archive count just as much.",
    specs: ['1-4 PLAYERS'],
    mark: '#1',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
  'football-imposter': {
    accent: '#ef4444',
    accent2: '#10b981',
    code: '04',
    tagline: 'Everyone sees the secret footballer except one. Drop clues, read the room, vote out the imposter.',
    specs: ['3-8 PLAYERS'],
    mark: '??',
    defaultTab: 'party',
  },
  side_netting: {
    accent: '#00f0ff',
    accent2: '#00f0ff',
    code: '05',
    tagline: 'Obvious answers die in the box. The more obscure your pick, the deeper it tucks into the side netting.',
    specs: ['1-8 PLAYERS'],
    mark: '100',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
};


export const BentoGrid: React.FC<BentoGridProps> = ({ modes, onLaunchMode }) => {
  const { party, presence } = useParty();
  const isActualParty = party.isActive && !party.roomCode?.startsWith('match_');
  const squadSize = isActualParty ? party.members.length : 1;

  // Capacity restrictions when party is active
  const isAuctionBlocked = isActualParty && squadSize > 2;
  const isRecordBooksBlocked = isActualParty && squadSize > 4;
  const isImposterBlocked = isActualParty && squadSize < 3;

  const auctionDraftMode = modes.find((m) => m.id === 'auction-draft') || modes[0];
  const linkUpMode = modes.find((m) => m.id === 'criteria-rush') || modes[1];
  const recordBooksMode = modes.find((m) => m.id === 'tally-race') || modes[2];
  const imposterMode = modes.find((m) => m.id === 'football-imposter') || modes[3];
  const sideNettingMode = modes.find((m) => m.id === 'side_netting') || modes[4];

  const lockFor = (mode: GameModeInfo): { title: string; detail: string } | null => {
    if (mode.id === 'auction-draft' && isAuctionBlocked) {
      return { title: 'SQUAD TOO LARGE · MAX 2', detail: `Head-to-head duel only. Your squad has ${squadSize} ballers.` };
    }
    if (mode.id === 'tally-race' && isRecordBooksBlocked) {
      return { title: 'SQUAD TOO LARGE · MAX 4', detail: `Supports up to 4 players. Your squad has ${squadSize} ballers.` };
    }
    if (mode.id === 'football-imposter' && isImposterBlocked) {
      return {
        title: 'NEEDS 3+ PLAYERS',
        detail: `Social deduction needs a crowd. Your squad has ${squadSize} baller${squadSize === 1 ? '' : 's'}.`,
      };
    }
    return null;
  };

  const handleLaunch = (mode: GameModeInfo, tab: LaunchTab = 'solo') => {
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

  const renderPresenceBadge = (modeKey: string) => {
    const modeData = presence[modeKey];
    const searching = modeData?.searching || 0;
    const inGame = modeData?.inGame || 0;

    if (searching + inGame <= 0) {
      return null; // nobody around: no badge
    }

    const Dot = ({ color }: { color: string }) => (
      <span className="relative flex h-1.5 w-1.5">
        <span className="bc-radar absolute inline-flex h-full w-full rounded-full" style={{ background: color }} />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      </span>
    );

    return (
      <span className="inline-flex items-center gap-3 font-mono text-[10px] tracking-[0.18em] uppercase select-none">
        {searching > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <Dot color="#fbbf24" />
            {searching} in queue
          </span>
        )}
        {inGame > 0 && (
          <span className="inline-flex items-center gap-1.5 text-emerald-300">
            <Dot color="#34d399" />
            {inGame} playing
          </span>
        )}
      </span>
    );
  };

  /**
   * Phone tile: one tap opens the game's setup sheet, where Solo / Quick Match / Squad live.
   * Keeps all five games on a single screen instead of five tall cards.
   */
  const renderMobileTile = (mode: GameModeInfo, featured = false) => {
    const spec = CARTRIDGES[mode.id] || CARTRIDGES['auction-draft'];
    const lock = lockFor(mode);
    const presence = presenceFor(mode.id);
    return (
      <button
        type="button"
        onClick={() => handleLaunch(mode, spec.defaultTab)}
        aria-label={`${mode.title}${lock ? ` (locked: ${lock.title})` : ''}`}
        style={{ ['--acc' as string]: spec.accent, ['--acc2' as string]: spec.accent2 } as React.CSSProperties}
        className={`bc-scope hub-card ${lock ? 'is-locked' : ''} relative overflow-hidden rounded-xl text-left flex flex-col justify-between p-3.5 active:scale-[0.98] transition-transform w-full self-stretch ${
          featured ? 'min-h-[136px]' : 'min-h-[126px]'
        }`}
      >
        <div className="bc-rail absolute inset-x-0 top-0 h-[2px]" />
        <div className="bc-sheen absolute inset-0 pointer-events-none" />
        <span
          aria-hidden
          className={`hub-mark absolute right-2 -bottom-2 font-athletic italic font-black leading-none select-none pointer-events-none ${
            featured ? 'text-[110px]' : 'text-[72px]'
          }`}
        >
          {spec.mark}
        </span>

        <div className="relative flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase truncate" style={{ color: spec.accent }}>
            {spec.specs[0]}
          </span>
          {presence && (
            <span className="shrink-0 inline-flex items-center gap-1 font-mono text-[9px] font-bold tracking-[0.12em] text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
              {presence}
            </span>
          )}
        </div>

        <div className="relative">
          <h2
            className={`font-athletic italic font-black uppercase text-white leading-[0.88] tracking-tight ${
              featured ? 'text-[38px]' : 'text-[26px]'
            }`}
          >
            {mode.title}
          </h2>
          <p className={`mt-1.5 text-slate-400 leading-snug ${featured ? 'text-[12px] max-w-[80%]' : 'text-[11px] line-clamp-3'}`}>
            {spec.tagline}
          </p>
        </div>

        <div className="relative flex items-center justify-between gap-2">
          {lock ? (
            <span className="bc-lock-stripes inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2 py-1 font-mono text-[9px] font-black tracking-[0.12em] text-amber-300">
              <Lock className="w-3 h-3" />
              {lock.title.replace('SQUAD TOO LARGE · ', '')}
            </span>
          ) : (
            <span />
          )}
          {!lock && (
            <span
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: spec.accent, color: '#06080c' }}
            >
              <ChevronRight className="w-4 h-4" />
            </span>
          )}
        </div>
      </button>
    );
  };

  /** Short live-presence label for phone tiles ("3 LIVE"), or null when nobody is around. */
  const presenceFor = (modeKey: string): string | null => {
    const m = presence[modeKey];
    const total = (m?.searching || 0) + (m?.inGame || 0);
    return total > 0 ? `${total} LIVE` : null;
  };

  const renderCartridge = (mode: GameModeInfo, opts: { featured?: boolean; className?: string } = {}) => {
    const spec = CARTRIDGES[mode.id] || CARTRIDGES['auction-draft'];
    const lock = lockFor(mode);
    const isLocked = Boolean(lock);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    const presenceBadge = renderPresenceBadge(mode.id);
    const actions: Array<{ tab: LaunchTab; label: string; icon: React.ElementType }> = [
      { tab: 'quickmatch', label: 'QUICK MATCH', icon: Zap },
      ...(spec.soloLabel ? [{ tab: 'solo' as const, label: spec.soloLabel, icon: User }] : []),
      { tab: 'party', label: 'SQUAD', icon: Users },
    ];
    // The mode's natural entry point leads; Imposter starts from the squad lobby
    actions.sort((a, b) => (a.tab === spec.defaultTab ? -1 : b.tab === spec.defaultTab ? 1 : 0));

    return (
      <div
        role="button"
        tabIndex={isLocked ? -1 : 0}
        aria-disabled={isLocked}
        aria-label={`${mode.title}${isLocked ? ` (locked: ${lock?.title})` : ''}`}
        onClick={() => handleLaunch(mode, spec.defaultTab)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleLaunch(mode, spec.defaultTab);
          }
        }}
        style={{ ['--acc' as string]: spec.accent, ['--acc2' as string]: spec.accent2 } as React.CSSProperties}
        className={`bc-scope hub-card ${isLocked ? 'is-locked cursor-not-allowed' : 'cursor-pointer'} relative overflow-hidden rounded-xl flex flex-col ${
          opts.featured ? 'p-5 md:p-7' : 'p-5'
        } ${opts.className || ''}`}
      >
        {/* Accent rail + quiet corner atmosphere */}
        <div className="bc-rail absolute inset-x-0 top-0 h-[2px]" />
        <div className="bc-sheen absolute inset-0 pointer-events-none" />
        <span
          aria-hidden
          className={`hub-mark absolute right-4 bottom-2 font-athletic italic font-black leading-none select-none pointer-events-none ${
            opts.featured ? 'text-[130px] md:text-[170px]' : 'text-[96px]'
          }`}
        >
          {spec.mark}
        </span>

        {/* Header: code, badge, live telemetry */}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-[10px] font-bold text-slate-500 tracking-[0.2em]">{spec.code}</span>
          </div>
          {presenceBadge && (
            <span className={`shrink-0 whitespace-nowrap ${opts.featured ? '' : 'hidden xl:inline'}`}>{presenceBadge}</span>
          )}
        </div>
        {!opts.featured && presenceBadge && <div className="relative mt-2 whitespace-nowrap xl:hidden">{presenceBadge}</div>}

        {/* Title + tagline */}
        <div className={`relative flex-1 flex flex-col justify-center ${opts.featured ? 'py-4 md:py-6' : 'py-3'}`}>
          <h2
            className={`font-athletic italic font-black uppercase text-white leading-[0.9] tracking-tight ${
              opts.featured ? 'text-5xl md:text-[64px]' : 'text-[34px] md:text-[38px]'
            }`}
          >
            {mode.title}
          </h2>
          <p className={`mt-2 text-slate-400 leading-snug ${opts.featured ? 'text-sm md:text-[15px] max-w-md' : 'text-[13px] max-w-sm'}`}>
            {spec.tagline}
          </p>
        </div>

        {/* Player count */}
        <div
          className="relative border-t border-white/[0.07] pt-2.5 mb-3 font-mono text-[10px] font-bold tracking-[0.18em]"
          style={{ color: spec.accent }}
        >
          {spec.specs[0]}
        </div>

        {/* Actions, or the capacity lockout */}
        {isLocked && lock ? (
          <div
            onClick={(e) => {
              stop(e);
              soundFX.playVoltBuzz();
            }}
            className="bc-lock-stripes relative flex items-center gap-3 rounded-lg border border-amber-500/35 px-3 py-2.5"
          >
            <span className="w-8 h-8 shrink-0 rounded-md bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-400" />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[11px] font-black tracking-[0.18em] text-amber-300">{lock.title}</span>
              <span className="block text-[11px] text-slate-400 leading-snug">{lock.detail}</span>
            </span>
          </div>
        ) : (
          // Labels adapt to the card's own width (container query in index.css), so nothing truncates
          <div className="bc-actions relative">
            <div className="bc-actions-grid">
            {actions.map(({ tab, label, icon: Icon }, i) => (
              <button
                key={tab}
                type="button"
                onClick={(e) => {
                  stop(e);
                  handleLaunch(mode, tab);
                }}
                onKeyDown={stop}
                className={`bc-btn bc-act ${i === 0 ? 'bc-btn-primary' : 'bc-btn-ghost'} px-1 h-10 rounded-lg inline-flex items-center justify-center gap-1.5 font-mono font-black cursor-pointer`}
              >
                <Icon className={`bc-act-icon ${i === 0 ? '' : 'is-secondary'} w-3.5 h-3.5 shrink-0`} />
                <span className="truncate">{label}</span>
              </button>
            ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-3 md:gap-4 max-sm:flex-1 pb-0 sm:pb-10">
      <PublicSquadsStrip />

      {/* ================= PHONES: app-style launcher, all five games on one screen ================= */}
      <div className="sm:hidden flex-1 flex flex-col gap-2">
        <div className="flex-[1.1] min-h-[136px] flex">{renderMobileTile(auctionDraftMode, true)}</div>
        <div className="flex-[2] min-h-[256px] grid grid-cols-2 grid-rows-2 gap-2">
          {renderMobileTile(linkUpMode)}
          {renderMobileTile(recordBooksMode)}
          {renderMobileTile(imposterMode)}
          {renderMobileTile(sideNettingMode)}
        </div>
      </div>

      {/* ================= TABLET / DESKTOP ================= */}
      <div className="hidden sm:flex flex-col gap-3 md:gap-4 ">
        {/* Row A: featured Auction + Link-Up */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 ">
          {renderCartridge(auctionDraftMode, { featured: true, className: 'lg:col-span-2' })}
          {renderCartridge(linkUpMode)}
        </div>

        {/* Row B: Record Books, Imposter, Side Netting */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 ">
          {renderCartridge(recordBooksMode)}
          {renderCartridge(imposterMode)}
          {renderCartridge(sideNettingMode)}
        </div>
      </div>
    </div>
  );
};
