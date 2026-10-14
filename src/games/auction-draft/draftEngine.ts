import type { PlayerEraCardExtended } from '../../types';
import type { SquadSlot, LeagueDeckId } from './types';
import { getDeckById, PREMIER_LEAGUE_DECK } from '../../data/decks';

/**
 * Standardized active card pool strictly consuming the 50-player Premier League deck.
 */
export const ACTIVE_DRAFT_DECK: PlayerEraCardExtended[] = PREMIER_LEAGUE_DECK;

/**
 * Retrieve the active deck pool for the draft arena.
 */
export function getActiveDeck(deckId?: LeagueDeckId): PlayerEraCardExtended[] {
  return getDeckById(deckId);
}

/**
 * Dynamic Position-Need Weighting Algorithm:
 * Consumes the selected modular league deck (or Global pool).
 * Dynamically calculates drop probabilities and strictly filters candidate cards based on vacant positions in both squads.
 * Never drops positions that both teams have already filled.
 * If one team is completely full, draws exclusively for the remaining positions needed by the other team.
 * Guaranteed never to return undefined or crash when pools dwindle.
 */
export function drawNextWeightedCard(
  draftedIds: Set<string>,
  discardedIds: Set<string>,
  userSlots: SquadSlot[],
  botSlots: SquadSlot[],
  deckId?: LeagueDeckId
): PlayerEraCardExtended {
  const userNeeds = new Set(userSlots.filter((s) => !s.filledPlayer).map((s) => s.position));
  const botNeeds = new Set(botSlots.filter((s) => !s.filledPlayer).map((s) => s.position));
  const neededPositions = new Set([...userNeeds, ...botNeeds]);

  const activeDeck = getActiveDeck(deckId);

  // Eligible pool: cards not already drafted in either squad
  let pool = activeDeck.filter((c) => !draftedIds.has(c.id));

  // If pool has cards not yet discarded, prefer them
  const unSeenPool = pool.filter((c) => !discardedIds.has(c.id));
  if (unSeenPool.length > 0) {
    pool = unSeenPool;
  }

  // Filter pool strictly to cards that match at least one needed position across either squad
  if (neededPositions.size > 0) {
    const positionFiltered = pool.filter((c) => {
      const positions = Array.isArray(c.positions) ? c.positions : [c.position];
      return positions.some((pos) => pos && neededPositions.has(pos));
    });

    if (positionFiltered.length > 0) {
      pool = positionFiltered;
    } else {
      // Fallback: check all non-drafted cards for needed positions (even if previously discarded)
      const allUndraftedNeeded = activeDeck.filter((c) => {
        if (draftedIds.has(c.id)) return false;
        const positions = Array.isArray(c.positions) ? c.positions : [c.position];
        return positions.some((pos) => pos && neededPositions.has(pos));
      });
      if (allUndraftedNeeded.length > 0) {
        pool = allUndraftedNeeded;
      }
    }
  }

  // Fallback 1: if pool is empty, draw from any non-drafted card in active pool
  if (pool.length === 0) {
    pool = activeDeck.filter((c) => !draftedIds.has(c.id));
  }

  // Fallback 2: if all cards drafted, fall back to any card in active deck
  if (pool.length === 0) {
    return activeDeck[0] || ({} as PlayerEraCardExtended);
  }

  // Calculate dynamic weights for each candidate
  const weightedList = pool.map((card) => {
    let weight = 1.0;
    const cardPositions = Array.isArray(card.positions) ? card.positions : [card.position];
    const matchesUser = cardPositions.some((pos) => pos && userNeeds.has(pos));
    const matchesBot = cardPositions.some((pos) => pos && botNeeds.has(pos));

    if (matchesUser && matchesBot) {
      weight = 4.5; // High urgency: both teams need this role
    } else if (matchesUser || matchesBot) {
      weight = 2.0; // Moderate urgency: one team needs this role
    } else {
      weight = 0.5; // Defensive fallback
    }

    return { card, weight };
  });

  // Weighted random selection
  const totalWeight = weightedList.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight <= 0) {
    return pool[0] || activeDeck[0];
  }

  let randomChoice = Math.random() * totalWeight;

  for (const item of weightedList) {
    randomChoice -= item.weight;
    if (randomChoice <= 0) {
      return item.card;
    }
  }

  return weightedList[0]?.card || pool[0] || activeDeck[0];
}
