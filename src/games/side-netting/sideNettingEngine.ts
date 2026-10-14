import { SIDE_NETTING_PROMPTS } from './promptsData';
import type {
  SideNettingAnswer,
  SideNettingPrompt,
  SideNettingRoundSubmission,
} from './types';

/**
 * Normalizes strings by removing accents, non-alphanumeric chars, and converting to lowercase.
 */
export function normalizeTriviaText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Compute Levenshtein distance for typo forgiveness.
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: an + 1 }, () => new Array(bn + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[i][0] = i;
  for (let j = 0; j <= bn; j++) matrix[0][j] = j;

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[an][bn];
}

/**
 * Compute Jaro-Winkler string similarity (0.0 to 1.0) for fuzzy spell-checking.
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1.length === 0 || s2.length === 0) return 0;
  if (s1 === s2) return 1;
  const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let m = 0;
  for (let i = 0; i < s1.length; i++) {
    const low = Math.max(0, i - range);
    const high = Math.min(i + range + 1, s2.length);
    for (let j = low; j < high; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        m++;
        break;
      }
    }
  }
  if (m === 0) return 0;
  let k = 0, numTrans = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1Matches[i]) {
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) numTrans++;
      k++;
    }
  }
  const weight = (m / s1.length + m / s2.length + (m - numTrans / 2) / m) / 3;
  let p = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) p++;
    else break;
  }
  return weight + p * 0.1 * (1 - weight);
}

/**
 * Evaluates whether an input matches a given target name or its aliases.
 */
function matchesTarget(inputNorm: string, targetName: string, aliases: string[] = []): boolean {
  const targetNorm = normalizeTriviaText(targetName);
  if (!inputNorm || !targetNorm) return false;

  // 1. Exact normalized match
  if (inputNorm === targetNorm) return true;

  // 2. Check all explicit aliases
  for (const alias of aliases) {
    const aliasNorm = normalizeTriviaText(alias);
    if (inputNorm === aliasNorm) return true;
    if (aliasNorm.length >= 4 && levenshtein(inputNorm, aliasNorm) <= 1) return true;
    if (aliasNorm.length >= 7 && (levenshtein(inputNorm, aliasNorm) <= 2 || jaroWinkler(inputNorm, aliasNorm) >= 0.88)) return true;
  }

  // 3. Surname match (e.g. user typed "Hazard" for "Eden Hazard")
  const targetTokens = targetNorm.split(' ');
  const surname = targetTokens[targetTokens.length - 1];
  if (surname && surname.length >= 3 && inputNorm === surname) return true;

  // 4. First name + Last name without middle names
  if (targetTokens.length >= 3) {
    const simpleFull = `${targetTokens[0]} ${surname}`;
    if (inputNorm === simpleFull) return true;
  }

  // 5. Typo tolerance on surname or full name
  if (targetNorm.length >= 5 && levenshtein(inputNorm, targetNorm) <= 1) return true;
  if (surname && surname.length >= 4 && levenshtein(inputNorm, surname) <= 1) return true;

  // 6. Longer names typo tolerance (e.g. "Szczesny", "Ibrahimovic", "Lewandowski")
  if (surname && surname.length >= 7 && (levenshtein(inputNorm, surname) <= 2 || jaroWinkler(inputNorm, surname) >= 0.88)) return true;
  if (targetNorm.length >= 9 && (levenshtein(inputNorm, targetNorm) <= 2 || jaroWinkler(inputNorm, targetNorm) >= 0.88)) return true;

  return false;
}

import rawLinkUpPlayers from '../../data/linkUpDatabase.json';

interface RawPlayer {
  id: string;
  name: string;
  position?: string;
  commonName?: string;
  aliases?: string[];
}
const ALL_PLAYERS_DB = rawLinkUpPlayers as RawPlayer[];

/**
 * Determines whether a prompt is asking for a person/player vs a club, country, stadium, or other entity.
 */
export function isPlayerTargetPrompt(prompt: SideNettingPrompt): boolean {
  const t = prompt.prompt.toLowerCase();

  // Explicit non-person indicators
  if (/\b(equipment|gear|ball|balls|stadium|stadiums|arena|ground|sponsor|sponsors|term|terms|trophy|badge|crest|kit manufacturer)\b/i.test(t)) {
    return false;
  }
  if (/\b(country|countries|nation|nations|club|clubs)\b/i.test(t) && !/\b(who|footballer|player|goalkeeper|manager|defender|striker)\b/i.test(t)) {
    return false;
  }

  return (
    /\b(footballer|player|goalkeeper|keeper|manager|coach|referee|official|linesman|defender|midfielder|forward|striker|winger|centurion|scorer|goalscorer|captain|winner|ballon d'or|golden boy|golden boot|puskas|legend)\b/i.test(t) ||
    /\bwho (played|scored|started|wore|won|made|was|has|captained|represented)\b/i.test(t)
  );
}

/**
 * Searches for a typo correction / "did you mean" suggestion.
 * NOTE: Autocorrect searches prompt.answers first for all questions,
 * and only falls back to ALL_PLAYERS_DB if the prompt is asking for a person/player.
 * Club, stadium, country, and equipment questions will NEVER incorrectly suggest player names.
 */
export function findDidYouMeanTriviaAnswer(
  rawInput: string,
  prompt: SideNettingPrompt
): { hasCorrection: boolean; suggestedName: string; answer: SideNettingAnswer | null } {
  const cleanInput = normalizeTriviaText(rawInput);
  if (!cleanInput || cleanInput.length < 3) {
    return { hasCorrection: false, suggestedName: '', answer: null };
  }

  // 1. Exact match to a prompt answer or alias
  for (const ans of prompt.answers) {
    if (matchesTarget(cleanInput, ans.text, ans.aliases)) {
      if (cleanInput === normalizeTriviaText(ans.text)) {
        return { hasCorrection: false, suggestedName: ans.text, answer: ans };
      }
      return { hasCorrection: true, suggestedName: ans.text, answer: ans };
    }
  }

  // 2. Fuzzy search inside the current prompt's answer pool first
  let bestPromptAnswer: SideNettingAnswer | null = null;
  let bestPromptName = '';
  let bestPromptScore = 0;
  const isSingleWordInput = !cleanInput.includes(' ');

  for (const ans of prompt.answers) {
    const candidates = [ans.text, ...(ans.aliases || [])];
    for (const cand of candidates) {
      const candNorm = normalizeTriviaText(cand);
      const candTokens = candNorm.split(' ');
      const candSurname = candTokens[candTokens.length - 1];
      const candHasSpace = candNorm.includes(' ');

      if (candNorm === cleanInput || (candSurname && candSurname === cleanInput)) {
        return { hasCorrection: true, suggestedName: ans.text, answer: ans };
      }

      // If user typed a single word, do NOT compare to a multi-word string with large length difference
      const scoreFull = (isSingleWordInput && candHasSpace) ? 0 : jaroWinkler(cleanInput, candNorm);
      const scoreSur = candSurname && candSurname.length >= 3 ? jaroWinkler(cleanInput, candSurname) : 0;
      const scoreFirst = candTokens.length > 1 && candTokens[0].length >= 3 ? jaroWinkler(cleanInput, candTokens[0]) : 0;

      const distFull = (isSingleWordInput && candHasSpace) ? 99 : levenshtein(cleanInput, candNorm);
      const distSur = candSurname && candSurname.length >= 3 ? levenshtein(cleanInput, candSurname) : 99;

      let matchScore = Math.max(scoreFull, scoreSur, scoreFirst);
      if (distFull <= 2 || distSur <= 2) matchScore = Math.max(matchScore, 0.85);
      if (cleanInput.length >= 8 && (distFull <= 3 || distSur <= 3)) matchScore = Math.max(matchScore, 0.80);

      // Digraph phonetic forgiveness (e.g. "sczenzney" -> matches "szczesny")
      if (cleanInput.startsWith('sc') && (candNorm.includes('sz') || candSurname.includes('sz'))) {
        const scClean = cleanInput.replace(/^sc/, 'sz').replace(/nz/g, 'sz');
        if (candNorm.includes(scClean) || candSurname.includes(scClean) || jaroWinkler(scClean, candSurname) >= 0.74) {
          matchScore = Math.max(matchScore, 0.85);
        }
      }

      if (matchScore > bestPromptScore && matchScore >= 0.77) {
        bestPromptScore = matchScore;
        bestPromptAnswer = ans;
        bestPromptName = ans.text;
      }
    }
  }

  if (bestPromptAnswer && bestPromptName) {
    return {
      hasCorrection: true,
      suggestedName: bestPromptName,
      answer: bestPromptAnswer,
    };
  }

  // 3. If prompt is NOT for a player (e.g. club, country, stadium, equipment), DO NOT fallback to player DB!
  if (!isPlayerTargetPrompt(prompt)) {
    return { hasCorrection: false, suggestedName: '', answer: null };
  }

  // 4. Fallback: Search the 3,400+ global player database for typos (e.g. user typed "mesi", "sczenzney", "craisitnao")
  let bestDbName = '';
  let bestDbScore = 0;

  for (const p of ALL_PLAYERS_DB) {
    const pNames = [p.name, ...(p.aliases || [])];
    for (const name of pNames) {
      const pNorm = normalizeTriviaText(name);
      const pTokens = pNorm.split(' ');
      const pSurname = pTokens[pTokens.length - 1];
      const pHasSpace = pNorm.includes(' ');

      if (cleanInput === pNorm || (pSurname && cleanInput === pSurname)) {
        return { hasCorrection: false, suggestedName: p.name, answer: null };
      }

      // If user typed a single word, do NOT compare to a multi-word string with large length difference
      const scoreFull = (isSingleWordInput && pHasSpace) ? 0 : jaroWinkler(cleanInput, pNorm);
      const scoreSur = pSurname && pSurname.length >= 3 ? jaroWinkler(cleanInput, pSurname) : 0;
      const scoreFirst = pTokens.length > 1 && pTokens[0].length >= 3 ? jaroWinkler(cleanInput, pTokens[0]) : 0;

      const distFull = (isSingleWordInput && pHasSpace) ? 99 : levenshtein(cleanInput, pNorm);
      const distSur = pSurname && pSurname.length >= 3 ? levenshtein(cleanInput, pSurname) : 99;

      let score = Math.max(scoreFull, scoreSur, scoreFirst);
      if (distFull <= 2 || distSur <= 2) score = Math.max(score, 0.85);
      if (cleanInput.length >= 8 && (distFull <= 3 || distSur <= 3)) score = Math.max(score, 0.80);

      // Polish digraph forgiveness
      if (cleanInput.startsWith('sc') && (pNorm.includes('sz') || pSurname.includes('sz'))) {
        const scClean = cleanInput.replace(/^sc/, 'sz').replace(/nz/g, 'sz');
        if (pNorm.includes(scClean) || pSurname.includes(scClean) || jaroWinkler(scClean, pSurname) >= 0.74) {
          score = Math.max(score, 0.85);
        }
      }

      if (score > bestDbScore && score >= 0.77) {
        bestDbScore = score;
        bestDbName = p.name;
      }
    }
  }

  if (bestDbName && normalizeTriviaText(bestDbName) !== cleanInput) {
    return {
      hasCorrection: true,
      suggestedName: bestDbName,
      answer: null,
    };
  }

  return { hasCorrection: false, suggestedName: '', answer: null };
}

/**
 * Autocomplete search across Side Netting prompt answers and full footballers database.
 * Requires at least 3 characters. Prioritizes matching answers from the prompt.
 */
export function searchSideNettingPlayers(
  query: string,
  prompt?: SideNettingPrompt,
  limit = 7
): Array<{ name: string; position?: string }> {
  const clean = normalizeTriviaText(query);
  if (!clean || clean.length < 3) return [];

  const seen = new Set<string>();
  const results: Array<{ name: string; position?: string; score: number }> = [];

  // Position lookup map
  const playerPosMap = new Map<string, string>();
  for (const p of ALL_PLAYERS_DB) {
    if (p.position) {
      playerPosMap.set(normalizeTriviaText(p.name), p.position);
      if (p.commonName) playerPosMap.set(normalizeTriviaText(p.commonName), p.position);
      for (const a of p.aliases || []) {
        playerPosMap.set(normalizeTriviaText(a), p.position);
      }
    }
  }

  // 1. Search prompt.answers first (if available)
  if (prompt?.answers) {
    for (const ans of prompt.answers) {
      const normText = normalizeTriviaText(ans.text);
      const aliases = (ans.aliases || []).map(normalizeTriviaText);
      const parts = normText.split(' ');
      const surname = parts[parts.length - 1];

      let score = 0;
      if (normText === clean || aliases.includes(clean)) {
        score = 1100;
      } else if (normText.startsWith(clean)) {
        score = 950;
      } else if (surname && surname.startsWith(clean)) {
        score = 900;
      } else if (aliases.some((a) => a.startsWith(clean))) {
        score = 880;
      } else if (normText.includes(clean) || aliases.some((a) => a.includes(clean))) {
        score = 750;
      } else if (clean.length >= 4) {
        const distSur = surname && surname.length >= 3 ? levenshtein(clean, surname) : 99;
        const distFull = levenshtein(clean, normText);
        if (distSur <= 1 || distFull <= 1) {
          score = 650;
        }
      }

      if (score > 0 && !seen.has(normText)) {
        seen.add(normText);
        const pos = playerPosMap.get(normText);
        results.push({ name: ans.text, position: pos, score });
      }
    }
  }

  // 2. Search ALL_PLAYERS_DB
  for (const p of ALL_PLAYERS_DB) {
    const normName = normalizeTriviaText(p.name);
    if (seen.has(normName)) continue;

    const normCommon = p.commonName ? normalizeTriviaText(p.commonName) : '';
    const normAliases = (p.aliases || []).map(normalizeTriviaText);
    const parts = normName.split(' ');
    const surname = parts[parts.length - 1];

    let score = 0;
    if (normName === clean || normCommon === clean || normAliases.includes(clean)) {
      score = 1000;
    } else if (normName.startsWith(clean) || normCommon.startsWith(clean)) {
      score = 850;
    } else if (surname && surname.startsWith(clean)) {
      score = 800;
    } else if (normAliases.some((a) => a.startsWith(clean))) {
      score = 780;
    } else if (normName.includes(clean) || normAliases.some((a) => a.includes(clean))) {
      score = 600;
    } else if (clean.length >= 4) {
      const distSur = surname && surname.length >= 3 ? levenshtein(clean, surname) : 99;
      const distFull = levenshtein(clean, normName);
      if (distSur <= 1 || distFull <= 1) {
        score = 500;
      }
    }

    if (score > 0) {
      seen.add(normName);
      results.push({ name: p.name, position: p.position, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => ({ name: r.name, position: r.position }));
}

/**
 * Evaluates a user submission against all valid answers in a prompt.
 */
export function evaluateAnswer(
  rawInput: string,
  prompt: SideNettingPrompt
): SideNettingRoundSubmission {
  const trimmed = rawInput.trim();
  const inputNorm = normalizeTriviaText(trimmed);

  if (!inputNorm) {
    return {
      rawInput: trimmed,
      matchedAnswer: null,
      isValid: false,
      score: 0,
      depthMeters: 0,
      tier: 'Miss',
      submittedAtMs: Date.now(),
    };
  }

  // Check each answer in the prompt
  for (const ans of prompt.answers) {
    if (matchesTarget(inputNorm, ans.text, ans.aliases)) {
      // Depth calculation based on 5 knowledge tiers:
      // Tap-In (5 pts) -> 250m
      // Starter XI (30 pts) -> 1,200m
      // Cult Hero (50 pts) -> 2,100m
      // Streets Won't Forget (85 pts) -> 3,400m
      // Ballon d'Or Knowledge (100 pts) -> 4,000m
      let depthMeters = Math.min(4000, Math.round(ans.rarityScore * 40));
      if (ans.rarityScore === 5) depthMeters = 250;
      else if (ans.rarityScore === 30) depthMeters = 1200;
      else if (ans.rarityScore === 50) depthMeters = 2100;
      else if (ans.rarityScore === 85) depthMeters = 3400;
      else if (ans.rarityScore === 100) depthMeters = 4000;

      return {
        rawInput: trimmed,
        matchedAnswer: ans,
        isValid: true,
        score: ans.rarityScore,
        depthMeters,
        tier: ans.tier,
        submittedAtMs: Date.now(),
      };
    }
  }

  // No match = invalid / miss
  return {
    rawInput: trimmed,
    matchedAnswer: null,
    isValid: false,
    score: 0,
    depthMeters: 0,
    tier: 'Miss',
    submittedAtMs: Date.now(),
  };
}

/**
 * Draws a randomized batch of prompts using Fisher-Yates shuffle, excluding recently played questions
 * to guarantee zero repeats across matches until the entire 225+ question bank is cycled.
 */
export function drawMatchPrompts(
  count: number,
  excludeIds: string[] = []
): { prompts: SideNettingPrompt[]; updatedExcludedIds: string[] } {
  let available = SIDE_NETTING_PROMPTS.filter((p) => !excludeIds.includes(p.id));

  let currentExcluded = [...excludeIds];
  if (available.length < count) {
    available = [...SIDE_NETTING_PROMPTS];
    currentExcluded = [];
  }

  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  const selected = available.slice(0, Math.min(count, available.length));
  const newExcluded = [...currentExcluded, ...selected.map((p) => p.id)];

  return { prompts: selected, updatedExcludedIds: newExcluded };
}

/**
 * Calculates Ball Knower rating title based on average obscurity score and depth.
 */
export function getBallKnowerRating(avgScore: number, maxDepth: number): {
  title: string;
  badgeClass: string;
  desc: string;
} {
  if (avgScore >= 80 || maxDepth >= 3500) {
    return {
      title: 'BALLON D\'OR PURIST',
      badgeClass: 'bg-yellow-500/20 text-yellow-300 border-yellow-400',
      desc: 'Legendary ball knowledge! You struck thunderbolts across the full pitch into the side netting with pure recall.',
    };
  }
  if (avgScore >= 60 || maxDepth >= 2600) {
    return {
      title: 'STREETS WON\'T FORGET SCHOLAR',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-400',
      desc: 'Elite tactical range! You drilled through three-quarter training cones with unforgettable cult answers.',
    };
  }
  if (avgScore >= 40 || maxDepth >= 1800) {
    return {
      title: 'CULT HERO AFICIONADO',
      badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400',
      desc: 'Solid technique. You cleared the midfield cones and sent shots well past the routine answers.',
    };
  }
  if (avgScore >= 20 || maxDepth >= 800) {
    return {
      title: 'STARTER XI REGULAR',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400',
      desc: 'Decent tactical knowledge. Time to aim for more obscure targets down the training pitch.',
    };
  }
  return {
    title: 'TAP-IN MERCHANT',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400',
    desc: 'You stuck to the 6-yard box and obvious surface tap-ins. Time to strike for the side netting!',
  };
}
