import rawRecordBooks from '../../data/recordBooksData.json';
import rawLinkUpPlayers from '../../data/linkUpDatabase.json';
import { levenshteinDistance, normalizeSearchText } from '../link-up/puzzleEngine';
import type {
  RecordBooksClubRecord,
  RecordBooksDifficulty,
  RecordBooksMetric,
  RecordBooksPlayerStat,
  RecordBooksSubmissionEval,
} from './types';

const CLUBS_DB: RecordBooksClubRecord[] = rawRecordBooks as RecordBooksClubRecord[];

export interface GlobalPlayerSearchItem {
  name: string;
  position?: string;
  normName: string;
  normSurname: string;
  normAliases: string[];
}

// Build a deduplicated searchable index of all players across Record Books + Link-Up DB
const SEARCH_INDEX: GlobalPlayerSearchItem[] = (() => {
  const map = new Map<string, { name: string; position?: string; aliases: Set<string> }>();

  for (const club of CLUBS_DB) {
    for (const entry of club.topGoals) {
      const key = normalizeSearchText(entry.name);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { name: entry.name, aliases: new Set(entry.aliases || []) });
      } else {
        const existing = map.get(key)!;
        for (const a of entry.aliases || []) existing.aliases.add(a);
      }
    }
  }

  const linkUpList = rawLinkUpPlayers as Array<{
    name: string;
    position?: string;
    commonName?: string;
    aliases?: string[];
  }>;
  for (const p of linkUpList) {
    const key = normalizeSearchText(p.name);
    if (!key) continue;
    if (!map.has(key)) {
      const aliases = new Set<string>(p.aliases || []);
      if (p.commonName) aliases.add(p.commonName);
      map.set(key, { name: p.name, position: p.position, aliases });
    } else {
      const existing = map.get(key)!;
      if (p.position && !existing.position) existing.position = p.position;
      if (p.commonName) existing.aliases.add(p.commonName);
      for (const a of p.aliases || []) existing.aliases.add(a);
    }
  }

  const items: GlobalPlayerSearchItem[] = [];
  for (const [normName, data] of map.entries()) {
    const parts = normName.split(' ');
    const normSurname = parts[parts.length - 1] || normName;
    const normAliases = Array.from(data.aliases).map(normalizeSearchText).filter(Boolean);
    items.push({
      name: data.name,
      position: data.position,
      normName,
      normSurname,
      normAliases,
    });
  }
  return items;
})();

/**
 * Selects a randomized sequence of clubs for the match based on the chosen difficulty.
 */
export function generateClubSequence(
  difficulty: RecordBooksDifficulty,
  totalRounds: number
): RecordBooksClubRecord[] {
  const tierClubs = CLUBS_DB.filter((c) => c.difficulty === difficulty);
  const pool = tierClubs.length >= totalRounds ? [...tierClubs] : [...CLUBS_DB];

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, totalRounds);
}

/**
 * One club per round at that round's tier (e.g. Quick Match's rising schedule), no repeats.
 */
export function generateClubSequenceForSchedule(schedule: RecordBooksDifficulty[]): RecordBooksClubRecord[] {
  const pool = [...CLUBS_DB];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const used = new Set<string>();
  const sequence: RecordBooksClubRecord[] = [];
  for (const difficulty of schedule) {
    const club =
      pool.find((c) => !used.has(c.slug) && c.difficulty === difficulty) || pool.find((c) => !used.has(c.slug));
    if (!club) break;
    used.add(club.slug);
    sequence.push(club);
  }
  return sequence;
}

/**
 * Instant fuzzy autocomplete across all footballers in the database.
 */
export function searchRecordBooksPlayers(
  query: string,
  limit = 7
): Array<{ name: string; position?: string }> {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery || cleanQuery.length < 3) return [];

  const tokens = cleanQuery.split(' ').filter(Boolean);
  const scored: Array<{ item: GlobalPlayerSearchItem; score: number }> = [];

  for (const item of SEARCH_INDEX) {
    let score = 0;

    if (
      item.normName === cleanQuery ||
      item.normSurname === cleanQuery ||
      item.normAliases.includes(cleanQuery)
    ) {
      score = 1000;
    } else if (item.normName.startsWith(cleanQuery)) {
      score = 860;
    } else if (
      item.normSurname.startsWith(cleanQuery) ||
      item.normAliases.some((a) => a.startsWith(cleanQuery))
    ) {
      score = 780;
    } else if (
      tokens.length > 1 &&
      tokens.every((t) => item.normName.includes(t) || item.normAliases.some((a) => a.includes(t)))
    ) {
      score = 680;
    } else if (
      item.normName.includes(cleanQuery) ||
      item.normAliases.some((a) => a.includes(cleanQuery))
    ) {
      score = 540;
    } else if (cleanQuery.length >= 4) {
      const maxTypos = cleanQuery.length >= 7 ? 2 : 1;
      const distSurname = levenshteinDistance(cleanQuery, item.normSurname);
      const distFull = levenshteinDistance(cleanQuery, item.normName);
      if (distSurname <= maxTypos || distFull <= maxTypos) {
        score = 400 - Math.min(distSurname, distFull) * 50;
      }
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => ({ name: s.item.name, position: s.item.position }));
}

/**
 * Evaluates a player submission against the current club's league-goal records.
 */
export function evaluateRecordBooksSubmission(
  rawInput: string,
  club: RecordBooksClubRecord,
  _metric: RecordBooksMetric
): RecordBooksSubmissionEval {
  const cleanInput = normalizeSearchText(rawInput);
  if (!cleanInput) {
    return {
      skipped: true,
      playerName: 'PASSED',
      statCount: 0,
      allTimeRank: null,
    };
  }

  const list: RecordBooksPlayerStat[] = club.topGoals;

  // 1. Check exact match on full name or alias in the club's record list
  for (let idx = 0; idx < list.length; idx++) {
    const entry = list[idx];
    const normName = normalizeSearchText(entry.name);
    const normAliases = (entry.aliases || []).map(normalizeSearchText);
    const nameParts = normName.split(' ');
    const surname = nameParts[nameParts.length - 1] || normName;

    if (
      normName === cleanInput ||
      surname === cleanInput ||
      normAliases.includes(cleanInput)
    ) {
      return {
        skipped: false,
        playerName: entry.name,
        statCount: entry.count,
        allTimeRank: idx + 1,
      };
    }
  }

  // 2. Check fuzzy Levenshtein match against the club's record list
  if (cleanInput.length >= 4) {
    const maxTypos = cleanInput.length >= 7 ? 2 : 1;
    for (let idx = 0; idx < list.length; idx++) {
      const entry = list[idx];
      const normName = normalizeSearchText(entry.name);
      const nameParts = normName.split(' ');
      const surname = nameParts[nameParts.length - 1] || normName;

      if (
        levenshteinDistance(cleanInput, normName) <= maxTypos ||
        levenshteinDistance(cleanInput, surname) <= maxTypos
      ) {
        return {
          skipped: false,
          playerName: entry.name,
          statCount: entry.count,
          allTimeRank: idx + 1,
        };
      }
    }
  }

  // 3. Not in the club's top records -> return 0
  const bestGlobalHit = searchRecordBooksPlayers(rawInput, 1);
  const displayPlayerName =
    bestGlobalHit.length > 0 ? bestGlobalHit[0].name : rawInput.trim().toUpperCase();

  return {
    skipped: false,
    playerName: displayPlayerName,
    statCount: 0,
    allTimeRank: null,
  };
}

/**
 * Checks if a candidate input or autocomplete name resolves to the same player
 * that was already locked in by the opponent.
 */
export function isSameRecordBooksPlayer(
  rawCandidate: string,
  lockedPlayerName: string | null | undefined,
  club: RecordBooksClubRecord,
  metric: RecordBooksMetric
): boolean {
  if (!lockedPlayerName || lockedPlayerName === 'PASSED') return false;
  const cleanCandidate = normalizeSearchText(rawCandidate);
  const cleanLocked = normalizeSearchText(lockedPlayerName);
  if (!cleanCandidate || !cleanLocked) return false;

  if (cleanCandidate === cleanLocked) return true;

  const evalCandidate = evaluateRecordBooksSubmission(rawCandidate, club, metric);
  if (
    !evalCandidate.skipped &&
    normalizeSearchText(evalCandidate.playerName) === cleanLocked
  ) {
    return true;
  }

  return false;
}

/**
 * Generates the Opponent / AI Scout's submission for the current club and metric,
 * avoiding any already-locked player name.
 */
export function generateRecordBooksOpponentSubmission(
  club: RecordBooksClubRecord,
  _metric: RecordBooksMetric,
  excludedPlayerName?: string | null
): RecordBooksSubmissionEval {
  const list: RecordBooksPlayerStat[] = club.topGoals;

  if (list.length === 0) {
    return {
      skipped: false,
      playerName: 'UNKNOWN',
      statCount: 0,
      allTimeRank: null,
    };
  }

  const normExcluded = excludedPlayerName ? normalizeSearchText(excludedPlayerName) : '';

  // Pick from ranks #1 to #14, avoiding the excluded player when possible
  const candidateIndices: number[] = [];
  const maxPool = Math.min(list.length, 14);
  for (let i = 0; i < maxPool; i++) {
    if (normalizeSearchText(list[i].name) !== normExcluded) {
      candidateIndices.push(i);
    }
  }

  const chosenIdx =
    candidateIndices.length > 0
      ? candidateIndices[Math.floor(Math.random() * candidateIndices.length)]
      : 0;
  const chosenEntry = list[chosenIdx];

  return {
    skipped: false,
    playerName: chosenEntry.name,
    statCount: chosenEntry.count,
    allTimeRank: chosenIdx + 1,
  };
}
