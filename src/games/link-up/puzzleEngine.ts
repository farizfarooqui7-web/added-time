import rawDatabase from '../../data/linkUpDatabase.json';
import type {
  LinkUpClue,
  LinkUpClubEntry,
  LinkUpDifficulty,
  LinkUpPlayerEvaluation,
  LinkUpPlayerRecord,
  LinkUpPosition,
  LinkUpPuzzle,
  LinkUpSlotType,
} from './types';
import {
  getClubAbbreviation,
  getClubCrestUrl,
  getNationFlagUrl,
  NATION_CODES,
  POSITION_META,
} from './clubAssets';

// Normalised on load: a record missing an optional array (e.g. a hand-added player without aliases)
// used to throw inside search and blank out every autocomplete result.
const DATABASE: LinkUpPlayerRecord[] = (rawDatabase as Partial<LinkUpPlayerRecord>[]).map((p) => ({
  ...p,
  aliases: p.aliases ?? [],
  commonName: p.commonName ?? p.name,
  clubs: p.clubs ?? [],
  difficulty: p.difficulty ?? 'Hard',
})) as LinkUpPlayerRecord[];

export function getAllLinkUpPlayers(): LinkUpPlayerRecord[] {
  return DATABASE;
}

/**
 * Strips accents/diacritics and normalizes text for fuzzy search and open validation.
 */
export function normalizeSearchText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Levenshtein edit distance between two normalized strings for typo tolerance.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export { isValidSlotConfiguration, updateSlotConfiguration, randomizeSlotConfiguration } from './slotConfig';

const CLUB_CANONICAL_SLUGS: Record<string, string> = {
  'fc-barcelona': 'barcelona',
  'barcelona': 'barcelona',
  'real-madrid': 'real-madrid',
  'manchester-united': 'manchester-united',
  'man-utd': 'manchester-united',
  'manchester-city': 'manchester-city',
  'man-city': 'manchester-city',
  'bayern-munich': 'bayern-munich',
  'bayern-munchen': 'bayern-munich',
  'atletico-madrid': 'atletico-madrid',
  'inter-milan': 'inter-milan',
  'inter': 'inter-milan',
  'internazionale': 'inter-milan',
  'ac-milan': 'ac-milan',
  'milan': 'ac-milan',
  'paris-saint-germain': 'paris-saint-germain',
  'psg': 'paris-saint-germain',
  'borussia-dortmund': 'borussia-dortmund',
  'dortmund': 'borussia-dortmund',
  'tottenham-hotspur': 'tottenham-hotspur',
  'tottenham': 'tottenham-hotspur',
  'spurs': 'tottenham-hotspur',
  'sporting-cp': 'sporting-cp',
  'sporting-lisbon': 'sporting-cp',
  'athletic-bilbao': 'athletic-bilbao',
  'athletic-club': 'athletic-bilbao',
  'west-ham-united': 'west-ham-united',
  'west-ham': 'west-ham-united',
  'newcastle-united': 'newcastle-united',
  'newcastle': 'newcastle-united',
  'wolverhampton-wanderers': 'wolverhampton-wanderers',
  'wolves': 'wolverhampton-wanderers',
  'olympique-de-marseille': 'olympique-marseille',
  'olympique-marseille': 'olympique-marseille',
  'marseille': 'olympique-marseille',
  'olympique-lyonnais': 'olympique-lyon',
  'olympique-lyon': 'olympique-lyon',
  'lyon': 'olympique-lyon',
  'as-monaco': 'as-monaco',
  'monaco': 'as-monaco',
  'as-roma': 'as-roma',
  'roma': 'as-roma',
  'bayer-leverkusen': 'bayer-leverkusen',
  'leverkusen': 'bayer-leverkusen',
  'werder-bremen': 'werder-bremen',
  'bremen': 'werder-bremen',
  'vfl-wolfsburg': 'wolfsburg',
  'wolfsburg': 'wolfsburg',
  'fc-schalke-04': 'schalke-04',
  'schalke-04': 'schalke-04',
  'schalke': 'schalke-04',
  'vfb-stuttgart': 'vfb-stuttgart',
  'stuttgart': 'vfb-stuttgart',
  'rb-leipzig': 'rb-leipzig',
  'leipzig': 'rb-leipzig',
  'real-betis': 'real-betis',
  'betis': 'real-betis',
  'real-sociedad': 'real-sociedad',
  'sociedad': 'real-sociedad',
  'celta-vigo': 'celta-vigo',
  'celta': 'celta-vigo',
  'deportivo-la-coruna': 'deportivo-la-coruna',
  'deportivo': 'deportivo-la-coruna',
  'fc-porto': 'fc-porto',
  'porto': 'fc-porto',
  'psv-eindhoven': 'psv-eindhoven',
  'psv': 'psv-eindhoven',
};

const NATION_ALIASES: Record<string, string> = {
  'usa': 'united states',
  'united states': 'united states',
  'united states of america': 'united states',
  'ivory coast': 'ivory coast',
  "cote d'ivoire": 'ivory coast',
  'ireland': 'republic of ireland',
  'republic of ireland': 'republic of ireland',
  'dr congo': 'dr congo',
  'democratic republic of the congo': 'dr congo',
  'congo dr': 'dr congo',
  'bosnia': 'bosnia and herzegovina',
  'bosnia and herzegovina': 'bosnia and herzegovina',
  'south korea': 'south korea',
  'korea republic': 'south korea',
};

/**
 * Checks whether a player satisfies a single clue.
 */
export function doesPlayerSatisfySingleClue(
  player: LinkUpPlayerRecord,
  clue: LinkUpClue
): boolean {
  if (clue.type === 'Club') {
    const clueSlugNorm = clue.slug
      ? CLUB_CANONICAL_SLUGS[clue.slug.toLowerCase().trim()] || clue.slug.toLowerCase().trim()
      : '';
    const clueValNorm = normalizeSearchText(clue.value);

    // Exact club identity only: substring matching used to let e.g. "Nacional" match
    // "Atlético Nacional" or "Red Star" match "Red Star Belgrade".
    return player.clubs.some((c) => {
      const cSlugNorm = c.slug
        ? CLUB_CANONICAL_SLUGS[c.slug.toLowerCase().trim()] || c.slug.toLowerCase().trim()
        : '';
      if (clueSlugNorm && cSlugNorm) return clueSlugNorm === cSlugNorm;
      return clueValNorm === normalizeSearchText(c.name);
    });
  }
  if (clue.type === 'Nation') {
    const clueValNorm = clue.value.toLowerCase().trim();
    const canonClue = NATION_ALIASES[clueValNorm] || clueValNorm;

    const natNorm = player.nationality.toLowerCase().trim();
    const canonNat = NATION_ALIASES[natNorm] || natNorm;
    if (canonNat === canonClue) return true;

    // Dual internationals count for every senior national team they represented
    const others = [player.secondaryNationality, ...(player.nationalTeams || [])];
    return others.some((n) => {
      if (!n) return false;
      const norm = n.toLowerCase().trim();
      return (NATION_ALIASES[norm] || norm) === canonClue;
    });
  }
  if (clue.type === 'Position') {
    return player.position === clue.value || player.secondaryPosition === clue.value;
  }
  return false;
}

/**
 * Checks whether a given player record satisfies all 3 puzzle clues.
 */
export function doesPlayerSatisfyClues(
  player: LinkUpPlayerRecord,
  clues: [LinkUpClue, LinkUpClue, LinkUpClue]
): boolean {
  return clues.every((clue) => doesPlayerSatisfySingleClue(player, clue));
}

/**
 * Open Validator: Returns EVERY player in the database who legitimately satisfies all 3 clues.
 */
export function findAllValidPlayers(
  clues: [LinkUpClue, LinkUpClue, LinkUpClue]
): LinkUpPlayerRecord[] {
  return DATABASE.filter((player) => doesPlayerSatisfyClues(player, clues));
}

/**
 * Builds a structured LinkUpClue from a club entry.
 */
function buildClubClue(slotIndex: 0 | 1 | 2, club: LinkUpClubEntry): LinkUpClue {
  return {
    slotIndex,
    type: 'Club',
    value: club.name,
    slug: club.slug,
    subLabel: 'CLUB CAREER',
    badgeText: getClubAbbreviation(club.name),
    crestUrl: getClubCrestUrl(club.slug),
    tier: club.tier || 'Medium',
  };
}

/**
 * Builds a structured LinkUpClue from a nationality.
 */
function buildNationClue(slotIndex: 0 | 1 | 2, nationality: string): LinkUpClue {
  const meta = NATION_CODES[nationality];
  return {
    slotIndex,
    type: 'Nation',
    value: nationality,
    subLabel: 'NATIONAL TEAM',
    badgeText: meta?.code || nationality.slice(0, 3).toUpperCase(),
    flagUrl: getNationFlagUrl(nationality),
    tier: meta?.tier || 'Medium',
  };
}

/**
 * Builds a structured LinkUpClue from a primary position.
 */
function buildPositionClue(slotIndex: 0 | 1 | 2, position: LinkUpPosition): LinkUpClue {
  const meta = POSITION_META[position];
  return {
    slotIndex,
    type: 'Position',
    value: position,
    subLabel: 'PRIMARY ROLE',
    badgeText: meta?.fullName || position,
    tier: 'Easy',
  };
}

/**
 * Selects N distinct clubs from a seed player's career, weighted toward the target difficulty tier.
 */
function pickClubsForDifficulty(
  clubs: LinkUpClubEntry[],
  count: number,
  difficulty: LinkUpDifficulty
): LinkUpClubEntry[] {
  if (clubs.length <= count) {
    return [...clubs];
  }

  // Easy mode: strictly prioritize Tier 1 giant clubs (Real Madrid, Barca, Man Utd, Liverpool, Bayern, etc.)
  if (difficulty === 'Easy') {
    const easyClubs = clubs.filter((c) => (c.tier || 'Medium') === 'Easy');
    if (easyClubs.length >= count) {
      const shuffled = [...easyClubs].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count);
    }
    const sorted = [...clubs].sort((a, b) => {
      const aScore = a.tier === 'Easy' ? 100 : a.tier === 'Medium' ? 10 : 1;
      const bScore = b.tier === 'Easy' ? 100 : b.tier === 'Medium' ? 10 : 1;
      return bScore - aScore;
    });
    return sorted.slice(0, count);
  }

  // Score each club by how well it matches the requested difficulty
  const scored = clubs.map((club) => {
    const cTier = club.tier || 'Medium';
    let weight = 1;
    if (difficulty === 'Medium') {
      weight = cTier === 'Medium' ? 10 : cTier === 'Easy' ? 4 : 3;
    } else {
      weight = cTier === 'Hard' ? 12 : cTier === 'Medium' ? 5 : 1;
    }
    return { club, score: weight * (0.65 + Math.random() * 0.7) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((s) => s.club);
}

/**
 * Reverse-Seeding Puzzle Generator:
 * 1. Filters the database for seed players matching the requested difficulty tier and having enough clubs.
 * 2. Extracts the 3 requested attributes from the seed player to guarantee at least 1 valid answer.
 * 3. Runs `findAllValidPlayers` across the entire database so ANY matching player is accepted.
 */
export function generateLinkUpPuzzle(
  roundNumber: number,
  difficulty: LinkUpDifficulty,
  requestedSlots: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType],
  usedSeedPlayerIds: Set<string> = new Set()
): LinkUpPuzzle {
  // Enforce at most 1 Position slot
  const safeSlots: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType] = [...requestedSlots];
  let seenPosition = false;
  for (let i = 0; i < 3; i++) {
    if (safeSlots[i] === 'Position') {
      if (seenPosition) {
        safeSlots[i] = 'Club';
      }
      seenPosition = true;
    }
  }

  // Note: If the user configured multiple 'Nation' slots (e.g. Nation + Nation + Club),
  // a single player only has 1 primary nationality unless dual-national. To avoid duplicate identical Nation cards
  // while still honoring the seed player's real career, if more than 1 Nation slot is selected and the player
  // doesn't have a secondaryNationality, we convert the extra Nation slot into a Club slot so all 3 clues are distinct.
  const nationIndices = safeSlots
    .map((t, idx) => (t === 'Nation' ? idx : -1))
    .filter((idx) => idx !== -1);
  if (nationIndices.length > 1) {
    for (let k = 1; k < nationIndices.length; k++) {
      safeSlots[nationIndices[k]] = 'Club';
    }
  }

  const requiredClubs = Math.max(1, safeSlots.filter((s) => s === 'Club').length);

  // Filter candidate seed players by club count & difficulty tier
  const allEligibleByClubs = DATABASE.filter(
    (p) => p.clubs.length >= requiredClubs && !usedSeedPlayerIds.has(p.id)
  );

  const tierCandidates = allEligibleByClubs.filter((p) => {
    if (difficulty === 'Easy') {
      const easyClubs = p.clubs.filter((c) => (c.tier || 'Medium') === 'Easy');
      const hasEnoughEasyClubs = easyClubs.length >= requiredClubs;
      const nationTier = NATION_CODES[p.nationality]?.tier || 'Medium';
      return p.difficulty === 'Easy' && hasEnoughEasyClubs && nationTier === 'Easy';
    }
    if (difficulty === 'Medium') {
      const hasMediumClub = p.clubs.some((c) => c.tier === 'Medium');
      const nationTier = NATION_CODES[p.nationality]?.tier || 'Medium';
      return (
        (p.difficulty === 'Medium' && (hasMediumClub || nationTier === 'Medium')) ||
        (p.difficulty === 'Easy' && hasMediumClub && nationTier === 'Medium')
      );
    }
    // Hard
    const hasHardClub = p.clubs.some((c) => c.tier === 'Hard');
    const nationTier = NATION_CODES[p.nationality]?.tier || 'Hard';
    return p.difficulty === 'Hard' || hasHardClub || nationTier === 'Hard';
  });

  const pool =
    tierCandidates.length > 0
      ? tierCandidates
      : allEligibleByClubs.length > 0
      ? allEligibleByClubs
      : DATABASE.filter((p) => p.clubs.length >= 1);

  let bestPuzzle: LinkUpPuzzle | null = null;
  const attempts = difficulty === 'Easy' ? 12 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const seedPlayer = pool[Math.floor(Math.random() * pool.length)];
    const chosenClubs = pickClubsForDifficulty(seedPlayer.clubs, requiredClubs, difficulty);

    let clubCursor = 0;
    const clues = safeSlots.map((slotType, idx) => {
      const slotIdx = idx as 0 | 1 | 2;
      if (slotType === 'Club') {
        const club = chosenClubs[clubCursor % chosenClubs.length] || seedPlayer.clubs[0];
        clubCursor++;
        return buildClubClue(slotIdx, club);
      }
      if (slotType === 'Nation') {
        return buildNationClue(slotIdx, seedPlayer.nationality);
      }
      return buildPositionClue(slotIdx, seedPlayer.position);
    }) as [LinkUpClue, LinkUpClue, LinkUpClue];

    const validPlayers = findAllValidPlayers(clues);
    // Ensure seedPlayer is always in validPlayers
    if (!validPlayers.some((vp) => vp.id === seedPlayer.id)) {
      validPlayers.unshift(seedPlayer);
    }

    const puzzle: LinkUpPuzzle = {
      id: `linkup-${roundNumber}-${Date.now()}-${attempt}`,
      roundNumber,
      difficulty,
      slotTypes: safeSlots,
      clues,
      seedPlayer,
      validPlayers,
    };

    if (difficulty === 'Easy') {
      // In easy mode, prefer puzzles that offer multiple valid intuitive answers
      if (validPlayers.length >= 3) {
        return puzzle;
      }
      if (!bestPuzzle || validPlayers.length > bestPuzzle.validPlayers.length) {
        bestPuzzle = puzzle;
      }
    } else {
      return puzzle;
    }
  }

  return bestPuzzle || {
    id: `linkup-${roundNumber}-${Date.now()}`,
    roundNumber,
    difficulty,
    slotTypes: safeSlots,
    clues: [
      buildClubClue(0, pool[0]?.clubs[0] || { name: 'Real Madrid', slug: 'real-madrid', tier: 'Easy' }),
      buildNationClue(1, 'France'),
      buildPositionClue(2, 'FWD'),
    ],
    seedPlayer: pool[0],
    validPlayers: [pool[0]],
  };
}

/**
 * Autocomplete search across all 2,500+ players with fuzzy & nickname support.
 */
export function searchPlayersAutocomplete(
  query: string,
  limit = 8
): LinkUpPlayerRecord[] {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery || cleanQuery.length < 2) return [];

  const queryTokens = cleanQuery.split(' ').filter(Boolean);
  const results: Array<{ player: LinkUpPlayerRecord; score: number }> = [];

  for (const player of DATABASE) {
    const normName = normalizeSearchText(player.name);
    const normCommon = normalizeSearchText(player.commonName);
    const normAliases = player.aliases.map(normalizeSearchText);

    let bestScore = 0;

    // 1. Exact full match on name, commonName, or alias
    if (
      normName === cleanQuery ||
      normCommon === cleanQuery ||
      normAliases.includes(cleanQuery)
    ) {
      bestScore = 1000;
    }
    // 2. Prefix match on full name or common name
    else if (normName.startsWith(cleanQuery) || normCommon.startsWith(cleanQuery)) {
      bestScore = 850;
    }
    // 3. Word/surname prefix match
    else if (
      normName.split(' ').some((w) => w.startsWith(cleanQuery)) ||
      normAliases.some((a) => a.startsWith(cleanQuery))
    ) {
      bestScore = 750;
    }
    // 4. Multi-token match (e.g. "kdb", "kun aguero", "roberto baggio")
    else if (
      queryTokens.length > 1 &&
      queryTokens.every((t) => normName.includes(t) || normAliases.some((a) => a.includes(t)))
    ) {
      bestScore = 680;
    }
    // 5. Substring match
    else if (
      normName.includes(cleanQuery) ||
      normCommon.includes(cleanQuery) ||
      normAliases.some((a) => a.includes(cleanQuery))
    ) {
      bestScore = 550;
    }
    // 6. Fuzzy Levenshtein typo tolerance on surname or full name (for queries >= 4 chars)
    else if (cleanQuery.length >= 4) {
      const nameParts = normName.split(' ');
      const surname = nameParts[nameParts.length - 1] || normName;
      const distSurname = levenshteinDistance(cleanQuery, surname);
      const distFull = levenshteinDistance(cleanQuery, normName);
      const maxAllowed = cleanQuery.length >= 7 ? 2 : 1;
      if (distSurname <= maxAllowed || distFull <= maxAllowed) {
        bestScore = 400 - Math.min(distSurname, distFull) * 50;
      }
    }

    if (bestScore > 0) {
      // Boost Easy/famous players slightly in autocomplete ties
      const tierBonus =
        player.difficulty === 'Easy' ? 30 : player.difficulty === 'Medium' ? 15 : 0;
      results.push({ player, score: bestScore + tierBonus });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.player);
}

/**
 * Computes points awarded for meeting 0, 1, 2, or 3 criteria.
 */
export function computePointsForCriteria(
  criteriaMetCount: 0 | 1 | 2 | 3,
  difficulty: LinkUpDifficulty
): number {
  if (criteriaMetCount === 0) return 0;
  const diffBonus = difficulty === 'Hard' ? 50 : difficulty === 'Medium' ? 25 : 0;
  if (criteriaMetCount === 3) return 300 + diffBonus;
  if (criteriaMetCount === 2) return 100;
  return 25;
}

/**
 * Evaluates a specific player record against all 3 clues of a puzzle.
 */
export function evaluatePlayerRecord(
  player: LinkUpPlayerRecord,
  puzzle: LinkUpPuzzle
): LinkUpPlayerEvaluation {
  const matchedSlotIndices: number[] = [];
  puzzle.clues.forEach((clue, idx) => {
    if (doesPlayerSatisfySingleClue(player, clue)) {
      matchedSlotIndices.push(idx);
    }
  });

  const criteriaMetCount = matchedSlotIndices.length as 0 | 1 | 2 | 3;
  const isLinkVerified = criteriaMetCount === 3;
  const pointsAwarded = computePointsForCriteria(criteriaMetCount, puzzle.difficulty);

  return {
    skipped: false,
    playerName: player.name,
    matchedPlayer: player,
    criteriaMetCount,
    matchedSlotIndices,
    pointsAwarded,
    isLinkVerified,
  };
}

/**
 * Evaluates a user's submitted text or selected player against the 3 puzzle criteria.
 * Supports fuzzy matching, nicknames, and surnames, and prioritizes matching valid answers first.
 */
export function evaluatePlayerSubmission(
  rawInput: string,
  puzzle: LinkUpPuzzle,
  explicitPlayer?: LinkUpPlayerRecord
): LinkUpPlayerEvaluation {
  if (explicitPlayer) {
    return evaluatePlayerRecord(explicitPlayer, puzzle);
  }

  const cleanInput = normalizeSearchText(rawInput);
  if (!cleanInput) {
    return {
      skipped: true,
      playerName: 'SKIPPED',
      criteriaMetCount: 0,
      matchedSlotIndices: [],
      pointsAwarded: 0,
      isLinkVerified: false,
    };
  }

  // Step 1: Check if input matches ANY player in puzzle.validPlayers (exact, alias, surname, or fuzzy)
  for (const vp of puzzle.validPlayers) {
    const normName = normalizeSearchText(vp.name);
    const normCommon = normalizeSearchText(vp.commonName);
    const normAliases = vp.aliases.map(normalizeSearchText);
    const nameParts = normName.split(' ');
    const surname = nameParts[nameParts.length - 1] || normName;

    if (
      normName === cleanInput ||
      normCommon === cleanInput ||
      surname === cleanInput ||
      normAliases.includes(cleanInput)
    ) {
      return evaluatePlayerRecord(vp, puzzle);
    }

    if (cleanInput.length >= 4) {
      const maxTypos = cleanInput.length >= 7 ? 2 : 1;
      if (
        levenshteinDistance(cleanInput, normName) <= maxTypos ||
        levenshteinDistance(cleanInput, normCommon) <= maxTypos ||
        levenshteinDistance(cleanInput, surname) <= maxTypos
      ) {
        return evaluatePlayerRecord(vp, puzzle);
      }
    }
  }

  // Step 2: Check top autocomplete candidates and pick the one that satisfies the most criteria
  const autocompleteHits = searchPlayersAutocomplete(rawInput, 8);
  if (autocompleteHits.length > 0) {
    let bestEval = evaluatePlayerRecord(autocompleteHits[0], puzzle);
    for (let i = 1; i < autocompleteHits.length; i++) {
      const candidateEval = evaluatePlayerRecord(autocompleteHits[i], puzzle);
      if (candidateEval.criteriaMetCount > bestEval.criteriaMetCount) {
        bestEval = candidateEval;
      }
    }
    return bestEval;
  }

  // Step 3: Unrecognized name
  return {
    skipped: false,
    playerName: rawInput.trim().toUpperCase(),
    criteriaMetCount: 0,
    matchedSlotIndices: [],
    pointsAwarded: 0,
    isLinkVerified: false,
  };
}

/**
 * Generates the opponent's submitted answer for head-to-head comparison after both players submit.
 * Note: If the user skipped the round, we pick a realistic partial/alternate answer so we do not spoil the exact 3/3 answer.
 */
export function generateOpponentSubmission(
  puzzle: LinkUpPuzzle,
  userEval?: LinkUpPlayerEvaluation | null,
  excludedPlayerId?: string | null
): LinkUpPlayerEvaluation {
  const excludeId = excludedPlayerId || userEval?.matchedPlayer?.id;
  // If the user skipped, do not spoil the 3/3 answer; have opponent submit a 2/3 or 1/3 candidate
  const roll = userEval?.skipped ? 0.85 : Math.random();

  if (roll < 0.72 && puzzle.validPlayers.length > 0) {
    const others = puzzle.validPlayers.filter(
      (vp) => vp.id !== excludeId
    );
    const pool = others.length > 0 ? others : puzzle.validPlayers;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return evaluatePlayerRecord(picked, puzzle);
  }

  // Find a 2/3 or 1/3 partial match player from the database
  const twoMatchPool: LinkUpPlayerRecord[] = [];
  const oneMatchPool: LinkUpPlayerRecord[] = [];

  for (let i = 0; i < DATABASE.length; i++) {
    const p = DATABASE[i];
    if (p.id === excludeId) continue;
    let count = 0;
    for (const c of puzzle.clues) {
      if (doesPlayerSatisfySingleClue(p, c)) count++;
    }
    if (count === 2) {
      twoMatchPool.push(p);
      if (twoMatchPool.length >= 25) break;
    } else if (count === 1 && oneMatchPool.length < 25) {
      oneMatchPool.push(p);
    }
  }

  if (twoMatchPool.length > 0) {
    const picked = twoMatchPool[Math.floor(Math.random() * twoMatchPool.length)];
    return evaluatePlayerRecord(picked, puzzle);
  }

  if (oneMatchPool.length > 0) {
    const picked = oneMatchPool[Math.floor(Math.random() * oneMatchPool.length)];
    return evaluatePlayerRecord(picked, puzzle);
  }

  return evaluatePlayerRecord(DATABASE[0], puzzle);
}

