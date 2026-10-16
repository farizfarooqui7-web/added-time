import React from 'react';
import type { GameModeInfo } from '../types';
import { soundFX } from '../utils/audio';
import { useParty } from '../context/PartyContext';
import { Lock, User, Users, Zap } from 'lucide-react';

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
  soloLabel: string;
}

const CARTRIDGES: Record<string, CartridgeSpec> = {
  'auction-draft': {
    accent: '#ccff00',
    accent2: '#ccff00',
    code: '01',
    tagline: 'Twenty dollars, five slots, one rival. Bid live on every lot and build the stronger five-a-side.',
    specs: ['2 PLAYERS', '$20 BANKROLL', 'LIVE BIDDING'],
    mark: '$20',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
  'criteria-rush': {
    accent: '#3dff8f',
    accent2: '#00f0ff',
    code: '02',
    tagline: 'Three clues, one baller. Lock the link first and it is yours: your rival gets 30s to find another.',
    specs: ['1-8 PLAYERS', '10 ROUNDS', '30s STEAL CLOCK'],
    mark: '3/3',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
  'tally-race': {
    accent: '#f59e0b',
    accent2: '#fbbf24',
    code: '03',
    tagline: "Name a club's league scorers and bank their tallies. Deep cuts from the archive count just as much.",
    specs: ['1-4 PLAYERS', '10 CLUBS', 'LEAGUE GOALS'],
    mark: '#1',
    defaultTab: 'solo',
    soloLabel: 'SOLO',
  },
  'football-imposter': {
    accent: '#ef4444',
    accent2: '#10b981',
    code: '04',
    tagline: 'Everyone sees the secret footballer except one. Drop clues, read the room, vote out the imposter.',
    specs: ['3-8 PLAYERS', '2 CLUE ROUNDS', 'TRIBUNAL VOTE'],
    mark: '??',
    defaultTab: 'party',
    soloLabel: 'SANDBOX',
  },
  side_netting: {
    accent: '#00f0ff',
    accent2: '#00f0ff',
    code: '05',
    tagline: 'Obvious answers die in the box. The more obscure your pick, the deeper it tucks into the side netting.',
    specs: ['1-8 PLAYERS', '10 ROUNDS', 'OBSCURITY SCORING'],
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
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-slate-500 uppercase select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          Lobby open
        </span>
      );
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

  const renderCartridge = (mode: GameModeInfo, opts: { featured?: boolean; className?: string } = {}) => {
    const spec = CARTRIDGES[mode.id] || CARTRIDGES['auction-draft'];
    const lock = lockFor(mode);
    const isLocked = Boolean(lock);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    const actions: Array<{ tab: LaunchTab; label: string; icon: React.ElementType }> = [
      { tab: 'quickmatch', label: 'QUICK MATCH', icon: Zap },
      { tab: 'solo', label: spec.soloLabel, icon: User },
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
            <span className="w-px h-3 bg-white/15" />
            <span className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase truncate" style={{ color: spec.accent }}>
              {mode.badge}
            </span>
          </div>
          <span className={`shrink-0 whitespace-nowrap ${opts.featured ? '' : 'hidden xl:inline'}`}>{renderPresenceBadge(mode.id)}</span>
        </div>
        {!opts.featured && <div className="relative mt-2 whitespace-nowrap xl:hidden">{renderPresenceBadge(mode.id)}</div>}

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

        {/* Spec rail */}
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.07] pt-2.5 mb-3 font-mono text-[10px] tracking-[0.18em] text-slate-400">
          {spec.specs.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="w-1 h-1 rounded-full" style={{ background: spec.accent2, opacity: 0.6 }} />}
              <span>{s}</span>
            </React.Fragment>
          ))}
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
          <div className={`relative grid gap-2 grid-cols-2 ${opts.featured ? 'sm:grid-cols-3' : 'lg:grid-cols-3'}`}>
            {actions.map(({ tab, label, icon: Icon }, i) => (
              <button
                key={tab}
                type="button"
                onClick={(e) => {
                  stop(e);
                  handleLaunch(mode, tab);
                }}
                onKeyDown={stop}
                className={`bc-btn ${i === 0 ? 'bc-btn-primary' : 'bc-btn-ghost'} px-1 ${
                  i === 0 ? (opts.featured ? 'col-span-2 sm:col-span-1' : 'col-span-2 lg:col-span-1') : ''
                } h-10 rounded-lg inline-flex items-center justify-center gap-1.5 font-mono text-[10px] sm:text-[11px] font-black tracking-[0.12em] lg:tracking-[0.06em] cursor-pointer`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${opts.featured || i === 0 ? '' : 'lg:hidden 2xl:block'}`} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col gap-3 md:gap-4 pb-14 sm:pb-10">
      {/* Row A: featured Auction + Link-Up */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        {renderCartridge(auctionDraftMode, { featured: true, className: 'lg:col-span-2' })}
        {renderCartridge(linkUpMode)}
      </div>

      {/* Row B: Record Books, Imposter, Side Netting */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {renderCartridge(recordBooksMode)}
        {renderCartridge(imposterMode)}
        {renderCartridge(sideNettingMode)}
      </div>
    </div>
  );
};
