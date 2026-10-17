import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flame, Trophy, X } from 'lucide-react';
import { MODE_METRICS, STATS_MODES, usePlayerStats, winRate } from '../utils/stats';
import { soundFX } from '../utils/audio';

export const OPEN_LOCKER_EVENT = 'topbins:open-locker';

/** Opens the Locker Room from anywhere (header trophy, phone tab bar). */
export const openLockerRoom = () => window.dispatchEvent(new Event(OPEN_LOCKER_EVENT));

const savedName = () => {
  try {
    return localStorage.getItem('topbins_player_name')?.trim() || '';
  } catch {
    return '';
  }
};

/** Career dossier: overall record, streaks and personal bests per game, all from this browser. */
export const LockerRoom: React.FC = () => {
  const [open, setOpen] = useState(false);
  const stats = usePlayerStats();

  useEffect(() => {
    const onOpen = () => {
      soundFX.playCardFlip();
      setOpen(true);
    };
    window.addEventListener(OPEN_LOCKER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LOCKER_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const close = () => {
    soundFX.playClick(500);
    setOpen(false);
  };
  const rate = winRate(stats);
  const name = savedName() || 'Rookie';
  const record = `${stats.wins}W · ${stats.losses}L · ${stats.draws}D`;

  // Portalled to <body> so no hub stacking context can draw over it
  return createPortal(
    <div
      onClick={close}
      className="bc-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-5 bg-black/80 backdrop-blur-md select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Locker Room"
        style={{ ['--acc' as string]: '#ccff00', ['--acc2' as string]: '#00f0ff' } as React.CSSProperties}
        className="bc-scope bc-panel relative w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[calc(94dvh/var(--zoom,1))] sm:max-h-[calc(90dvh/var(--zoom,1))]"
      >
        <div className="bc-rail absolute inset-x-0 top-0 h-[2px] z-10" />

        {/* Header */}
        <div className="relative shrink-0 px-5 sm:px-7 pt-5 pb-4 border-b border-white/[0.07] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-500">Career dossier</span>
            <h2 className="mt-1.5 font-athletic italic font-black uppercase text-white text-4xl sm:text-5xl leading-[0.9] tracking-tight">
              Locker Room
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close Locker Room"
            className="bc-btn bc-btn-ghost shrink-0 w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-5 sm:px-7 py-5 flex flex-col gap-5">
          {/* Player card */}
          <div className="relative shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#11151d] to-[#07090d] p-4 sm:p-5">
            <div className="absolute inset-y-0 left-0 w-[3px] bg-[#ccff00]" />
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500">Player</span>
                <div className="font-athletic italic font-black uppercase text-white text-3xl sm:text-4xl leading-none truncate max-w-[14ch]">
                  {name}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-[10px] font-black tracking-[0.12em] uppercase ${
                      stats.streak > 0
                        ? 'border-[#ff6b00]/60 bg-[#ff6b00]/15 text-[#ffb37a]'
                        : 'border-white/10 bg-white/[0.04] text-slate-400'
                    }`}
                  >
                    <Flame className="w-3 h-3" />
                    {stats.streak} win streak
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 bg-white/[0.04] font-mono text-[10px] font-black tracking-[0.12em] uppercase text-slate-400">
                    <Trophy className="w-3 h-3" />
                    Best {stats.bestStreak}
                  </span>
                </div>
              </div>

              <div className="flex items-end gap-5 sm:gap-7">
                <div>
                  <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500">Win rate</span>
                  <span className="font-athletic italic font-black text-5xl sm:text-6xl leading-none text-[#ccff00] tabular-nums">
                    {rate}
                    <span className="text-2xl sm:text-3xl">%</span>
                  </span>
                </div>
                <div className="pb-1">
                  <span className="block font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500">Played</span>
                  <span className="font-athletic italic font-black text-3xl leading-none text-white tabular-nums">{stats.played}</span>
                  <span className="block mt-1 font-mono text-[10px] tracking-[0.12em] text-slate-400 tabular-nums">{record}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Per-game records */}
          <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {STATS_MODES.map((mode, i) => {
              const meta = MODE_METRICS[mode];
              const m = stats.modes[mode];
              return (
                <div
                  key={mode}
                  className={`relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-3 ${
                    i === STATS_MODES.length - 1 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: meta.accent }} />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-athletic italic font-black uppercase text-lg text-white leading-none truncate">{meta.title}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.12em] tabular-nums" style={{ color: meta.accent }}>
                      {m.wins}/{m.played} WON
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                    {meta.metrics.map((def) => {
                      const v = m.metrics[def.key];
                      return (
                        <div key={def.key} className="min-w-0">
                          <span className="block font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-slate-500">{def.label}</span>
                          <span className="font-mono text-sm font-black text-slate-100 tabular-nums">
                            {v === undefined ? '—' : def.format(v)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {stats.played === 0 && (
            <p className="text-center font-mono text-[11px] tracking-[0.12em] uppercase text-slate-500">
              Finish a match to start your career.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
