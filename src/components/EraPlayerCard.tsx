import React, { useState, useEffect } from 'react';
import type { PlayerEraCardProps, PositionCategory } from '../types';
import { soundFX } from '../utils/audio';
import { User } from 'lucide-react';

export interface EraPlayerCardComponentProps extends PlayerEraCardProps {
  interactive?: boolean;
  isFlipped?: boolean;
  onFlipToggle?: () => void;
  className?: string;
  auctionBasePrice?: number;
  ovr?: number;
  showOvr?: boolean;
  stampText?: string | null;
  stampColor?: 'volt' | 'red' | 'amber';
  eraStats?: {
    appearances: number;
    goals: number;
    assists?: number;
    cleanSheets?: number;
    trophies: string[];
  };
}

export const EraPlayerCard: React.FC<EraPlayerCardComponentProps> = ({
  name = '',
  displayName,
  firstName,
  lastName,
  clubCode,
  clubAbbreviation,
  season = '2024',
  positions = [],
  club = 'Added Time',
  clubCrestUrl,
  crestPath,
  imageUrl,
  imagePath,
  interactive = true,
  isFlipped: controlledIsFlipped,
  onFlipToggle,
  className = '',
  stampText,
  stampColor = 'volt',
  eraStats,
}) => {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [crestError, setCrestError] = useState(false);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const finalCrestSrc = crestPath || clubCrestUrl || '';
  const finalImageSrc = imagePath || imageUrl || '';
  const [activeCrestSrc, setActiveCrestSrc] = useState(finalCrestSrc);

  useEffect(() => {
    setActiveCrestSrc(finalCrestSrc);
    setCrestError(false);
  }, [finalCrestSrc]);

  useEffect(() => {
    setImageError(false);
    setImageLoaded(true);
  }, [finalImageSrc]);

  const isFlipped = controlledIsFlipped !== undefined ? controlledIsFlipped : internalFlipped;

  const handleCardClick = () => {
    if (!interactive) return;
    soundFX.playCardFlip();
    if (onFlipToggle) {
      onFlipToggle();
    } else {
      setInternalFlipped(!internalFlipped);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || isFlipped) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotX = -((y - centerY) / centerY) * 6;
    const rotY = ((x - centerX) / centerX) * 6;
    setRotateX(rotX);
    setRotateY(rotY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  const formatPositions = (posList: PositionCategory[]) => {
    if (!Array.isArray(posList)) return '';
    return posList.join(' / ');
  };

  // Full 4-digit era season tag: e.g. "2018-2019", "2011-2012", "2007-2008"
  const formatSeason = (s: string = '') => {
    if (!s) return '2024';
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts[0]?.length === 4 && parts[1]?.length === 2) {
        return `${parts[0]}-${parts[0].slice(0, 2)}${parts[1]}`;
      }
      if (parts[0]?.length === 4 && parts[1]?.length === 4) {
        return `${parts[0]}-${parts[1]}`;
      }
    }
    return s;
  };

  // Derive first and last name if not explicitly provided
  const safeName = (displayName || name || 'UNKNOWN').trim();
  const nameParts = safeName ? safeName.split(' ') : [];
  const displayFirstName = firstName || (nameParts.length > 1 ? nameParts[0] : '');
  const displayLastName = lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : safeName);

  const safeClub = (club || 'ADDED TIME').toUpperCase();

  // Derive standard club abbreviation (e.g. LFC, FCB, RMA, CFC, MCFC, ACM, JUV, ARS)
  const displayClubAbbr =
    clubCode ||
    clubAbbreviation ||
    (safeClub.includes('LIVERPOOL')
      ? 'LFC'
      : safeClub.includes('BARCELONA')
      ? 'FCB'
      : safeClub.includes('REAL MADRID')
      ? 'RMA'
      : safeClub.includes('CHELSEA')
      ? 'CFC'
      : safeClub.includes('CITY')
      ? 'MCI'
      : safeClub.includes('UNITED')
      ? 'MUN'
      : safeClub.includes('MILAN')
      ? 'ACM'
      : safeClub.includes('JUVENTUS')
      ? 'JUV'
      : safeClub.includes('ARSENAL')
      ? 'ARS'
      : safeClub.includes('BAYERN')
      ? 'BAY'
      : safeClub.includes('TOTTENHAM')
      ? 'TOT'
      : safeClub.slice(0, 3).toUpperCase());

  // Parse stamp text into structured transfer seal fields
  const parseStampSeal = (raw: string) => {
    const upper = raw.toUpperCase().trim();
    const feeMatch = upper.match(/\(\$(\d+)\)/);
    const fee = feeMatch ? `$${feeMatch[1]}` : null;
    const isFree = upper.includes('FREE');

    if (upper.includes('YOU')) {
      return {
        topLabel: isFree ? 'UNCONTESTED SIGNING' : 'TRANSFER APPROVED',
        mainTitle: 'SOLD TO YOU',
        subBadge: isFree ? 'FREE CLAIM • $0' : `FEE PAID • ${fee || '$1'}`,
      };
    }
    if (upper.includes('GAFFER') || upper.includes('OPPONENT')) {
      return {
        topLabel: isFree ? 'OPPONENT CLAIM' : 'RIVAL ACQUISITION',
        mainTitle: 'SOLD TO GAFFER',
        subBadge: isFree ? 'FREE CLAIM • $0' : `FEE PAID • ${fee || '$1'}`,
      };
    }
    if (upper.includes('BURNED')) {
      return {
        topLabel: 'AUCTION CLOSED',
        mainTitle: 'LOT BURNED',
        subBadge: 'NO WINNING BID',
      };
    }
    return {
      topLabel: 'OFFICIAL SEAL',
      mainTitle: upper.replace(/\s*\(\$\d+\)/, ''),
      subBadge: fee ? `FEE • ${fee}` : 'CONFIRMED',
    };
  };

  return (
    <div
      className={`group relative select-none ${className}`}
      style={{ perspective: '1000px' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
    >
      {/* Physical Trading Card Aspect Ratio: Fixed aspect-[5/7] with max-height calc(50vh/var(--zoom,1)) */}
      <div
        className={`relative w-full aspect-[5/7] transition-transform duration-150 ease-out cursor-pointer ${
          interactive ? 'hover:scale-[1.01]' : ''
        }`}
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* ================= CARD FRONT ================= */}
        <div
          className={`absolute inset-0 w-full h-full bg-[#10141f] text-white flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-[#d4af37]/85 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(251,191,36,0.4)] transition-colors ${
            isFlipped ? 'hidden' : 'flex'
          }`}
        >
          {/* Prismatic Gold Geometric / Crystal Bezel Framing */}
          <div className="absolute inset-1.5 rounded-xl border border-[#fbbf24]/30 pointer-events-none z-20" />
          <div className="absolute inset-0 pointer-events-none card-metallic-sheen opacity-25 group-hover:opacity-40 transition-opacity z-20" />

          {/* Prismatic Geometric Corner Notches */}
          <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-[#fbbf24] pointer-events-none z-20" />
          <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-[#fbbf24] pointer-events-none z-20" />
          <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-[#fbbf24] pointer-events-none z-20" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-[#fbbf24] pointer-events-none z-20" />

          {/* Authentic Color-Coded Rubber Ink Transfer Stamp (Green for User, Red for Opponent, Amber for Burned) */}
          {stampText && (() => {
            const { topLabel, mainTitle, subBadge } = parseStampSeal(stampText);
            const isUserWin = stampColor === 'volt' || stampText.toUpperCase().includes('YOU');
            const isOpponentWin = stampColor === 'red' || stampText.toUpperCase().includes('GAFFER');

            const palette = isUserWin
              ? {
                  outerBorder: 'border-[#22c55e]',
                  innerBorder: 'border-[#4ade80]/80',
                  divider: 'border-[#22c55e]/70',
                  textMain: 'text-[#4ade80]',
                  textSub: 'text-[#22c55e]',
                  pillBg: 'bg-[#22c55e] text-[#041a0b]',
                  backdrop: 'rgba(5, 22, 12, 0.84)',
                  glow: '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 22px rgba(34, 197, 94, 0.35), inset 0 0 12px rgba(34, 197, 94, 0.18)',
                  inkShadow: '0 1px 0 rgba(21, 128, 61, 0.9), 0 0 8px rgba(34, 197, 94, 0.45)',
                }
              : isOpponentWin
              ? {
                  outerBorder: 'border-[#ef4444]',
                  innerBorder: 'border-[#f87171]/80',
                  divider: 'border-[#ef4444]/70',
                  textMain: 'text-[#f87171]',
                  textSub: 'text-[#ef4444]',
                  pillBg: 'bg-[#ef4444] text-[#1f0404]',
                  backdrop: 'rgba(26, 6, 8, 0.84)',
                  glow: '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 22px rgba(239, 68, 68, 0.35), inset 0 0 12px rgba(239, 68, 68, 0.18)',
                  inkShadow: '0 1px 0 rgba(185, 28, 28, 0.9), 0 0 8px rgba(239, 68, 68, 0.45)',
                }
              : {
                  outerBorder: 'border-[#f59e0b]',
                  innerBorder: 'border-[#fbbf24]/80',
                  divider: 'border-[#f59e0b]/70',
                  textMain: 'text-[#fbbf24]',
                  textSub: 'text-[#f59e0b]',
                  pillBg: 'bg-[#f59e0b] text-[#1c1002]',
                  backdrop: 'rgba(24, 15, 4, 0.84)',
                  glow: '0 10px 30px rgba(0, 0, 0, 0.8), 0 0 22px rgba(245, 158, 11, 0.35)',
                  inkShadow: '0 1px 0 rgba(180, 83, 9, 0.9), 0 0 8px rgba(245, 158, 11, 0.45)',
                };

            return (
              <div className="absolute inset-0 z-40 flex items-center justify-center p-2.5 pointer-events-none">
                {/* Inline SVG filter for authentic rubber ink edge texture */}
                <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
                  <defs>
                    <filter id="stamp-ink-rough" x="-5%" y="-5%" width="110%" height="110%">
                      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" result="noise" />
                      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                  </defs>
                </svg>

                <div
                  className={`relative -rotate-[12deg] rounded-lg border-[3.5px] ${palette.outerBorder} p-[3px] select-none w-[92%] max-w-[260px]`}
                  style={{
                    backgroundColor: palette.backdrop,
                    boxShadow: palette.glow,
                    animation: 'stampSlam 0.24s cubic-bezier(0.18, 0.89, 0.32, 1.18) forwards',
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  {/* Distressed porous ink grain overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none opacity-25 mix-blend-overlay rounded-md"
                    style={{
                      backgroundImage:
                        'radial-gradient(rgba(255,255,255,0.22) 1px, transparent 0), radial-gradient(rgba(0,0,0,0.5) 1px, transparent 0)',
                      backgroundSize: '6px 6px, 9px 9px',
                      backgroundPosition: '0 0, 3px 3px',
                    }}
                  />

                  {/* Inner Stamp Frame with Double Track */}
                  <div
                    className={`border-[1.5px] border-dashed ${palette.innerBorder} rounded-[5px] px-2.5 py-1.5 flex flex-col items-center justify-center text-center relative`}
                    style={{ filter: 'url(#stamp-ink-rough)' }}
                  >
                    {/* Top Micro-Header Strip */}
                    <div className={`w-full flex items-center justify-between gap-1 border-b-[1.5px] ${palette.divider} pb-0.5`}>
                      <span className={`text-[9px] leading-none font-black ${palette.textSub}`}>★</span>
                      <span className={`font-mono text-[8.5px] md:text-[9px] font-black tracking-[0.2em] uppercase ${palette.textSub}`}>
                        {topLabel}
                      </span>
                      <span className={`text-[9px] leading-none font-black ${palette.textSub}`}>★</span>
                    </div>

                    {/* Center Heavy Stencil Stamp Headline */}
                    <div
                      className={`font-sans font-black uppercase tracking-wider text-xl md:text-[22px] leading-none py-1.5 whitespace-nowrap ${palette.textMain}`}
                      style={{ textShadow: palette.inkShadow }}
                    >
                      {mainTitle}
                    </div>

                    {/* Bottom Inverted Ink Fee Ribbon */}
                    <div className={`w-full pt-1 border-t-[1.5px] ${palette.divider} flex items-center justify-center`}>
                      <span className={`w-full py-0.5 px-2 rounded-[3px] font-mono text-[10px] md:text-[11px] font-black tracking-[0.16em] uppercase ${palette.pillBg}`}>
                        ★ {subBadge} ★
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 1. TOP HEADER: Centered & Enlarged Season Era Header */}
          <div className="pt-3 px-3.5 pb-1 z-20 flex items-center justify-center w-full shrink-0">
            <span className="font-mono text-sm font-black tracking-widest text-amber-400 bg-black/85 border border-amber-400/60 px-3.5 py-1 rounded-md shadow-md">
              {formatSeason(season)}
            </span>
          </div>

          {/* 2. CENTER VISUAL: High-Resolution Cutout Centered cleanly between Era Badge & Nameplate */}
          <div
            className="relative flex-1 w-full overflow-hidden flex items-center justify-center pb-3"
            style={{
              background: 'radial-gradient(circle at 50% 55%, #1f283d 0%, #121622 55%, #0a0d14 100%)',
            }}
          >
            {/* Subtle Tonal Pitch Lines */}
            <svg
              className="absolute inset-0 w-full h-full stroke-white/[0.04] pointer-events-none z-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 200 240"
              preserveAspectRatio="xMidYMid slice"
            >
              <circle cx="100" cy="180" r="70" strokeWidth="1.5" />
              <line x1="20" y1="180" x2="180" y2="180" strokeWidth="1.5" />
            </svg>

            {/* Responsive Card Art Cutout Image (Clean Top Clearance, Generous Fill without Clipping) */}
            <div className="relative z-0 h-[76%] w-[88%] flex items-center justify-center">
              {finalImageSrc && !imageError && (
                <img
                  key={finalImageSrc}
                  src={finalImageSrc}
                  alt={`${name} (${season})`}
                  className={`w-full h-full object-contain object-center scale-105 pointer-events-none drop-shadow-2xl filter contrast-110 transition-opacity duration-150 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    setImageError(true);
                    setImageLoaded(true);
                  }}
                />
              )}

              {/* Graceful Fallback: High-Contrast Dark Silhouette Placeholder SVG with Initials */}
              {(imageError || !finalImageSrc) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 z-0">
                  <div className="w-24 h-24 bg-[#141824] border-2 border-slate-700/80 rounded-full flex items-center justify-center mb-2 shadow-inner">
                    <User className="w-12 h-12 text-slate-500" />
                  </div>
                  <span className="font-mono font-black text-sm text-[#ccff00] tracking-wider uppercase">
                    {displayName || name}
                  </span>
                  <span className="font-sans font-bold text-xs text-slate-400 uppercase mt-0.5">
                    {club}
                  </span>
                </div>
              )}
            </div>

            {/* Subtle dark gradient vignette over lower section of cutout for surname legibility */}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0a0d14] via-[#0a0d14]/75 to-transparent pointer-events-none z-[5]" />
          </div>

          {/* 3. LOWER TYPOGRAPHY: Compact first name stacked above massive bold athletic surname */}
          <div className="w-full text-center py-2 z-10 bg-gradient-to-t from-[#0a0d14] via-[#0a0d14]/95 to-transparent px-3 relative -mt-3">
            {displayFirstName && (
              <span className="font-sans font-bold text-[10px] tracking-widest text-slate-300 uppercase leading-none block mb-0.5 drop-shadow">
                {displayFirstName}
              </span>
            )}
            <h3 className="font-sans font-black text-2xl md:text-3xl tracking-tight text-white uppercase leading-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] truncate">
              {displayLastName}
            </h3>
          </div>

          {/* 4. BOTTOM FOOTER METADATA (Zero dollar amounts, zero OVR) */}
          <div className="z-10 bg-[#0a0d14] border-t border-[#fbbf24]/30 px-3.5 py-2.5 flex items-center justify-between">
            {/* Bottom-Left: Position badge in crisp athletic lettering */}
            <div className="flex items-center">
              <span className="font-sans font-black text-xs px-2.5 py-1 rounded bg-[#ccff00] text-black tracking-wider uppercase border border-[#ccff00]">
                {formatPositions(positions)}
              </span>
            </div>

            {/* Bottom-Center: Golden position tag and red club abbreviation */}
            <div className="flex flex-col items-center leading-none">
              <span className="font-mono text-[9px] font-black text-[#fbbf24] uppercase tracking-widest">
                {positions[0]}
              </span>
              <span className="font-sans text-xs font-black text-red-500 uppercase tracking-wider mt-0.5">
                {displayClubAbbr}
              </span>
            </div>

            {/* Bottom-Right: Official full-color club crest cutout badge with graceful text badge fallback */}
            <div className="flex items-center justify-end min-w-8 h-8">
              {activeCrestSrc && !crestError ? (
                <img
                  src={activeCrestSrc}
                  alt={club}
                  className="w-7 h-7 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  onError={() => {
                    if (activeCrestSrc.endsWith('.png')) {
                      setActiveCrestSrc(activeCrestSrc.replace(/\.png$/, '.svg'));
                    } else {
                      setCrestError(true);
                    }
                  }}
                />
              ) : (
                <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 text-white border border-white/20 uppercase tracking-wider">
                  {displayClubAbbr}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ================= CARD BACK ================= */}
        <div
          className={`absolute inset-0 w-full h-full bg-[#0d1017] text-white flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-neutral-700 p-4 ${
            isFlipped ? 'flex' : 'hidden'
          }`}
        >
          {/* Back Header */}
          <div className="border-b border-neutral-800 pb-2 flex items-center justify-between">
            <div>
              <h4 className="font-sans font-black text-2xl text-white uppercase leading-none">
                {name}
              </h4>
              <div className="text-[10px] font-mono text-neutral-400 uppercase mt-0.5">
                {club} • {formatSeason(season)}
              </div>
            </div>

            <span className="font-sans font-black text-xs text-black bg-[#fbbf24] px-2 py-0.5 rounded-sm">
              {displayClubAbbr}
            </span>
          </div>

          {/* Era Statistics */}
          <div className="my-auto py-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#12151e] border border-neutral-800 p-2 rounded-lg">
                <span className="block font-mono text-[9px] text-neutral-400">APPS</span>
                <span className="font-sans font-black text-2xl text-white">
                  {eraStats?.appearances ?? 48}
                </span>
              </div>
              <div className="bg-[#12151e] border border-neutral-800 p-2 rounded-lg">
                <span className="block font-mono text-[9px] text-neutral-400">
                  {positions[0] === 'GK' || positions[0] === 'DEF' ? 'CLEAN SH.' : 'GOALS'}
                </span>
                <span className="font-sans font-black text-2xl text-[#ccff00]">
                  {positions[0] === 'GK' || positions[0] === 'DEF'
                    ? eraStats?.cleanSheets ?? 24
                    : eraStats?.goals ?? 38}
                </span>
              </div>
              <div className="bg-[#12151e] border border-neutral-800 p-2 rounded-lg">
                <span className="block font-mono text-[9px] text-neutral-400">
                  {positions[0] === 'GK' ? 'SAVES' : 'ASSISTS'}
                </span>
                <span className="font-sans font-black text-2xl text-[#00f0ff]">
                  {positions[0] === 'GK' ? '142' : eraStats?.assists ?? 14}
                </span>
              </div>
            </div>

            {/* Campaign Honours */}
            <div>
              <span className="block text-[9px] font-mono text-neutral-400 uppercase tracking-wider mb-1">
                ERA HONOURS
              </span>
              <div className="space-y-1">
                {(eraStats?.trophies ?? ['UEFA Champions League', 'Domestic League']).map(
                  (trophy, idx) => (
                    <div
                      key={idx}
                      className="text-[10px] font-mono bg-[#12151e] border-l-2 border-[#fbbf24] px-2 py-0.5 text-neutral-200 truncate"
                    >
                      ★ {trophy}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Back Footer */}
          <div className="border-t border-neutral-800 pt-2 flex items-center justify-between text-[10px] font-mono text-neutral-500">
            <span>POSITION: [ {formatPositions(positions)} ]</span>
            <span className="text-[#00f0ff] font-bold">ADDED TIME MINT</span>
          </div>
        </div>
      </div>
    </div>
  );
};
