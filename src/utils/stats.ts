import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The Locker Room: career stats kept in this browser (localStorage, no backend).
 * Arenas report each finished match with `useRecordMatch`; the hub reads them with `usePlayerStats`.
 */

export type StatsModeId = 'auction' | 'linkup' | 'recordbooks' | 'imposter' | 'sidenetting';
/** `solo` = a drill with no opponent (e.g. solo Side Netting): counts as played, never touches the streak. */
export type MatchOutcome = 'win' | 'loss' | 'draw' | 'solo';

export interface ModeStats {
  played: number;
  wins: number;
  /** Personal bests and running counters, keyed by the metric ids in MODE_METRICS. */
  metrics: Record<string, number>;
}

export interface PlayerStats {
  version: 1;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  lastPlayedAt: number | null;
  modes: Record<StatsModeId, ModeStats>;
}

interface MetricDef {
  key: string;
  label: string;
  /** high/low = personal best in that direction; count = running total. */
  kind: 'high' | 'low' | 'count';
  format: (v: number) => string;
}

export const MODE_METRICS: Record<StatsModeId, { title: string; accent: string; metrics: MetricDef[] }> = {
  auction: {
    title: '$20 Auction Draft',
    accent: '#ccff00',
    metrics: [{ key: 'rating', label: 'Best squad', kind: 'high', format: (v) => `${v.toFixed(1)} OVR` }],
  },
  linkup: {
    title: 'The Link-Up',
    accent: '#3dff8f',
    metrics: [
      { key: 'lock', label: 'Fastest link', kind: 'low', format: (v) => `${v.toFixed(1)}s` },
      { key: 'score', label: 'Best score', kind: 'high', format: (v) => `${v} pts` },
    ],
  },
  recordbooks: {
    title: 'The Record Books',
    accent: '#f59e0b',
    metrics: [{ key: 'goals', label: 'Biggest tally', kind: 'high', format: (v) => `${v} goals` }],
  },
  imposter: {
    title: 'Football Imposter',
    accent: '#ef4444',
    metrics: [{ key: 'bluffs', label: 'Bluffs won', kind: 'count', format: (v) => String(v) }],
  },
  sidenetting: {
    title: 'Side Netting',
    accent: '#00f0ff',
    metrics: [{ key: 'score', label: 'Best score', kind: 'high', format: (v) => `${v} pts` }],
  },
};

export const STATS_MODES = Object.keys(MODE_METRICS) as StatsModeId[];

const STORAGE_KEY = 'topbins_career_stats';
const CHANGE_EVENT = 'topbins:stats-change';

const emptyStats = (): PlayerStats => ({
  version: 1,
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  lastPlayedAt: null,
  modes: Object.fromEntries(STATS_MODES.map((m) => [m, { played: 0, wins: 0, metrics: {} }])) as Record<
    StatsModeId,
    ModeStats
  >,
});

let cache: PlayerStats | null = null;

export function getStats(): PlayerStats {
  if (cache) return cache;
  const base = emptyStats();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PlayerStats>;
      // Merge over defaults so older saves pick up modes added later
      cache = { ...base, ...saved, modes: { ...base.modes, ...(saved.modes || {}) } } as PlayerStats;
      return cache;
    }
  } catch {
    // Storage blocked or corrupt: start fresh
  }
  cache = base;
  return cache;
}

function save(next: PlayerStats) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: stats still update for this session
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface MatchRecord {
  mode: StatsModeId;
  outcome: MatchOutcome;
  /** Candidate personal bests (`high`/`low` metrics); undefined values are ignored. */
  bests?: Record<string, number | undefined>;
  /** Amounts to add to `count` metrics. */
  counts?: Record<string, number>;
}

export function recordMatch({ mode, outcome, bests = {}, counts = {} }: MatchRecord) {
  const prev = getStats();
  const defs = MODE_METRICS[mode].metrics;
  const modePrev = prev.modes[mode];
  const metrics = { ...modePrev.metrics };

  for (const def of defs) {
    if (def.kind === 'count') {
      const add = counts[def.key];
      if (add) metrics[def.key] = (metrics[def.key] ?? 0) + add;
      continue;
    }
    const v = bests[def.key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const old = metrics[def.key];
    if (old === undefined || (def.kind === 'high' ? v > old : v < old)) metrics[def.key] = v;
  }

  const won = outcome === 'win';
  const streak = won ? prev.streak + 1 : outcome === 'loss' ? 0 : prev.streak;
  save({
    ...prev,
    played: prev.played + 1,
    wins: prev.wins + (won ? 1 : 0),
    losses: prev.losses + (outcome === 'loss' ? 1 : 0),
    draws: prev.draws + (outcome === 'draw' ? 1 : 0),
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    lastPlayedAt: Date.now(),
    modes: { ...prev.modes, [mode]: { played: modePrev.played + 1, wins: modePrev.wins + (won ? 1 : 0), metrics } },
  });
}

/** Win rate over matches that had an opponent (solo drills excluded), 0-100. */
export function winRate(s: Pick<PlayerStats, 'wins' | 'losses' | 'draws'>) {
  const decided = s.wins + s.losses + s.draws;
  return decided ? Math.round((s.wins / decided) * 100) : 0;
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null; // another tab wrote: re-read
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePlayerStats(): PlayerStats {
  return useSyncExternalStore(subscribe, getStats, getStats);
}

/**
 * Records a match once each time `isOver` turns true (so a rematch records again).
 * `build` runs at that moment with the arena's latest state; returning null skips recording.
 */
export function useRecordMatch(isOver: boolean, build: () => MatchRecord | null) {
  const buildRef = useRef(build);
  const recordedRef = useRef(false);
  // Declared first so it runs before the effect below and hands it this render's state
  useEffect(() => {
    buildRef.current = build;
  });
  useEffect(() => {
    if (!isOver) {
      recordedRef.current = false;
      return;
    }
    if (recordedRef.current) return;
    recordedRef.current = true;
    const rec = buildRef.current();
    if (rec) recordMatch(rec);
  }, [isOver]);
}
