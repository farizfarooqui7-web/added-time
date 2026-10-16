import React from 'react';
import { Lock, X } from 'lucide-react';
import { soundFX } from '../../utils/audio';

/**
 * Shared frame for every game's setup pop-up, in the hub's broadcast style. Each game passes its
 * signature accent; tiles, pathways and rails read it through the --acc custom property.
 */

interface SetupShellProps {
  isOpen?: boolean;
  accent: string;
  accent2?: string;
  code: string;
  badge: string;
  title: string;
  tagline: string;
  onClose: () => void;
  /** Watermark in the header corner. */
  mark?: string;
  children: React.ReactNode;
  /** Pathway buttons, pinned under the scrolling options. */
  footer?: React.ReactNode;
}

export const SetupShell: React.FC<SetupShellProps> = ({
  accent,
  accent2,
  code,
  badge,
  title,
  tagline,
  onClose,
  mark,
  children,
  footer,
}) => (
  <div
    onClick={() => {
      soundFX.playClick(500);
      onClose();
    }}
    className="bc-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-5 bg-black/80 backdrop-blur-md select-none"
  >
    <div
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} setup`}
      style={{ ['--acc' as string]: accent, ['--acc2' as string]: accent2 || accent } as React.CSSProperties}
      className="bc-scope bc-panel relative w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[90dvh]"
    >
      <div className="bc-rail absolute inset-x-0 top-0 h-[2px] z-10" />
      <div className="bc-sheen absolute inset-x-0 top-0 h-40 pointer-events-none" />

      {/* Header */}
      <div className="relative shrink-0 px-5 sm:px-7 pt-5 pb-4 border-b border-white/[0.07] overflow-hidden">
        {mark && (
          <span
            aria-hidden
            className="absolute right-14 -bottom-6 font-athletic italic font-black text-[120px] leading-none select-none pointer-events-none"
            style={{ color: accent, opacity: 0.06 }}
          >
            {mark}
          </span>
        )}
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 font-mono text-[10px] font-bold tracking-[0.22em] uppercase">
              <span className="text-slate-500">{code}</span>
              <span className="w-px h-3 bg-white/15" />
              <span style={{ color: accent }}>{badge}</span>
            </div>
            <h2 className="mt-2 font-athletic italic font-black uppercase text-white text-4xl sm:text-5xl leading-[0.9] tracking-tight">
              {title}
            </h2>
            <p className="mt-2 text-[13px] text-slate-400 leading-snug max-w-lg">{tagline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup"
            className="bc-btn bc-btn-ghost shrink-0 w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Options */}
      <div className="relative flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 py-5 flex flex-col gap-5">{children}</div>

      {/* Pathways */}
      {footer && (
        <div className="relative shrink-0 px-5 sm:px-7 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/[0.07] bg-black/30">
          <span className="block mb-2.5 font-mono text-[10px] font-bold tracking-[0.22em] text-slate-500 uppercase">
            Choose your pathway
          </span>
          {footer}
        </div>
      )}
    </div>
  </div>
);

export const GuestNotice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bc-lock-stripes flex items-center justify-between gap-3 rounded-lg border border-amber-500/35 px-3 py-2">
    <span className="text-[12px] text-amber-200">{children}</span>
    <span className="shrink-0 font-mono text-[9px] font-black tracking-[0.2em] text-amber-400">HOST CONTROLS</span>
  </div>
);

export const SetupSection: React.FC<{
  index: string;
  label: string;
  hint?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}> = ({ index, label, hint, aside, children }) => (
  <section className="flex flex-col gap-2.5">
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.22em] uppercase">
        <span style={{ color: 'var(--acc)' }}>{index}</span>
        <span className="text-slate-300">{label}</span>
      </span>
      {aside ?? (hint && <span className="font-mono text-[10px] tracking-[0.12em] text-slate-500 truncate">{hint}</span>)}
    </div>
    {children}
  </section>
);

interface OptionTileProps {
  selected: boolean;
  onClick: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  tag?: React.ReactNode;
  icon?: React.ElementType;
  disabled?: boolean;
  className?: string;
}

export const OptionTile: React.FC<OptionTileProps> = ({ selected, onClick, title, sub, tag, icon: Icon, disabled, className }) => (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={selected}
    onClick={onClick}
    className={`bc-tile ${selected ? 'is-selected' : ''} relative text-left rounded-lg px-3 py-2.5 flex flex-col gap-1 cursor-pointer ${className || ''}`}
  >
    <span className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: selected ? 'var(--acc)' : '#94a3b8' }} />}
        <span className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-white truncate">{title}</span>
      </span>
      {tag ? (
        <span className="shrink-0 font-mono text-[9px] font-bold tracking-[0.14em] text-slate-400">{tag}</span>
      ) : (
        selected && <span className="bc-tick shrink-0 w-1.5 h-1.5 rounded-full" />
      )}
    </span>
    {sub && <span className="text-[11px] text-slate-400 leading-snug">{sub}</span>}
  </button>
);

interface PathwayButtonProps {
  onClick?: () => void;
  icon: React.ElementType;
  title: string;
  desc: string;
  chip?: string;
  primary?: boolean;
  locked?: boolean;
  disabled?: boolean;
}

export const PathwayButton: React.FC<PathwayButtonProps> = ({ onClick, icon: Icon, title, desc, chip, primary, locked, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || locked}
    className={`bc-path ${primary ? 'is-primary' : ''} rounded-lg px-3.5 py-3 text-left flex flex-col gap-1 cursor-pointer min-w-0`}
  >
    <span className="flex items-start justify-between gap-2 w-full">
      <span className="flex items-center gap-2 min-w-0">
        {locked ? <Lock className="w-4 h-4 shrink-0" /> : <Icon className="w-4 h-4 shrink-0" style={primary ? undefined : { color: 'var(--acc)' }} />}
        <span className={`font-mono text-[11px] font-black uppercase tracking-[0.1em] leading-tight ${primary ? '' : 'text-white'}`}>{title}</span>
      </span>
      {chip && (
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[9px] font-black tracking-[0.12em] ${
            primary ? 'bg-black/15' : 'bg-white/[0.06] text-slate-300'
          }`}
        >
          {chip}
        </span>
      )}
    </span>
    <span className={`text-[11px] leading-snug ${primary ? 'text-black/70' : 'text-slate-400'}`}>{desc}</span>
  </button>
);

export const PathwayGrid: React.FC<{ children: React.ReactNode; cols?: 2 | 3 | 4 }> = ({ children, cols = 3 }) => (
  <div
    className={`grid grid-cols-1 gap-2.5 ${
      cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cols === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
    }`}
  >
    {children}
  </div>
);

/** Small toolbar toggle/action used in section headers (shuffle, auto-randomize...). */
export const ChipButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon?: React.ElementType;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, icon: Icon, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={`bc-tile ${active ? 'is-selected' : ''} h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.12em] uppercase text-slate-200 cursor-pointer`}
  >
    {Icon && <Icon className="w-3 h-3" style={{ color: 'var(--acc)' }} />}
    {children}
  </button>
);
