import { FORMATION_PRESETS } from '../src/games/auction-draft/formations';
import type { FormationId, LeagueDeckId } from '../src/games/auction-draft/types';
import type { PartyMember } from '../src/types/wsProtocol';
import type { PlayerEraCardExtended, PositionCategory } from '../src/types';

// Quick Match Auction: one league deck per match, announced in the intro
export const AUCTION_QUICK_MATCH_DECKS: LeagueDeckId[] = ['premier-league', 'la-liga', 'serie-a', 'bundesliga'];
export const DEFAULT_FORMATION_ID: FormationId = 'balanced-1-1-2-1';
const AUCTION_POSITIONS: PositionCategory[] = ['GK', 'DEF', 'MID', 'ATK'];

export function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function toFormationId(value: unknown): FormationId | null {
  return typeof value === 'string' && value in FORMATION_PRESETS ? (value as FormationId) : null;
}

/** Each roster member's own formation (asymmetric Auction matches), falling back to the shared one. */
export function resolveAuctionFormations(members: PartyMember[], config?: any): Record<string, FormationId> {
  const fallback = toFormationId(config?.formationId) || DEFAULT_FORMATION_ID;
  const chosen = config?.formationsByPlayer || {};
  const out: Record<string, FormationId> = {};
  for (const m of members) out[m.id] = toFormationId(chosen[m.id]) || fallback;
  return out;
}

/**
 * Fixed lot order for a multiplayer Auction. The opening lots cover both squads' combined
 * position needs plus one spare per position, so neither side is starved and every position
 * stays contested (all formations field at least one of each). The rest of the deck follows
 * as a shuffled tail for lots that go unsold, then a second pass re-deals the needed positions
 * (clients treat a card that was already signed as a dead lot), so thin decks such as the
 * four-keeper Premier League deck cannot run dry; positions nobody needs are dealt last.
 */
export function buildAuctionLotSequence(deck: PlayerEraCardExtended[], formationIds: FormationId[]): PlayerEraCardExtended[] {
  const need: Record<PositionCategory, number> = { GK: 0, DEF: 0, MID: 0, ATK: 0 };
  for (const id of formationIds) for (const pos of FORMATION_PRESETS[id].slots) need[pos] += 1;

  const byPos: Record<PositionCategory, PlayerEraCardExtended[]> = { GK: [], DEF: [], MID: [], ATK: [] };
  for (const card of shuffled(deck)) {
    if (card.position && byPos[card.position]) byPos[card.position].push(card);
  }

  const core: PlayerEraCardExtended[] = [];
  for (const pos of AUCTION_POSITIONS) {
    if (need[pos] > 0) core.push(...byPos[pos].splice(0, need[pos] + 1));
  }
  const neededTail = AUCTION_POSITIONS.filter((pos) => need[pos] > 0).flatMap((pos) => byPos[pos]);
  const unneededTail = AUCTION_POSITIONS.filter((pos) => need[pos] === 0).flatMap((pos) => byPos[pos]);
  const needed = deck.filter((c) => c.position && need[c.position] > 0);
  return [...shuffled(core), ...shuffled(neededTail), ...shuffled(needed), ...shuffled(unneededTail)];
}

/**
 * Position-normalised scoring for asymmetric formations: each card's OVR is shifted by how far
 * its position's deck average sits from the whole deck's average (e.g. strikers rate higher).
 */
export function computePositionOffsets(deck: PlayerEraCardExtended[]): Record<PositionCategory, number> {
  const overall = deck.reduce((sum, c) => sum + c.ovr, 0) / Math.max(1, deck.length);
  const offsets: Record<PositionCategory, number> = { GK: 0, DEF: 0, MID: 0, ATK: 0 };
  for (const pos of AUCTION_POSITIONS) {
    const cards = deck.filter((c) => c.position === pos);
    if (cards.length === 0) continue;
    const mean = cards.reduce((sum, c) => sum + c.ovr, 0) / cards.length;
    offsets[pos] = Math.round((overall - mean) * 10) / 10;
  }
  return offsets;
}
