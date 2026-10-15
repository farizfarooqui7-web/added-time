/**
 * Public Quick Match ruleset (Link-Up, Record Books, Side Netting): a fixed 10-round match
 * whose difficulty rises as it goes. Solo and Squad games keep using their setup options.
 */
export type MatchDifficulty = 'Easy' | 'Medium' | 'Hard';

export const QUICK_MATCH_ROUNDS = 10;

/** Rounds 1–3 Easy, 4–7 Medium, 8–10 Hard (1-based round number). */
export function risingDifficulty(roundNumber: number): MatchDifficulty {
  if (roundNumber <= 3) return 'Easy';
  if (roundNumber <= 7) return 'Medium';
  return 'Hard';
}

export function risingDifficultySchedule(totalRounds = QUICK_MATCH_ROUNDS): MatchDifficulty[] {
  return Array.from({ length: totalRounds }, (_, i) => risingDifficulty(i + 1));
}
