import type { PlayerEraCardExtended, PositionCategory } from '../../types';
import type { FormationConfig, FormationId, SquadSlot, LeagueDeckId } from './types';
export { PREMIER_LEAGUE_DECK } from '../../data/decks/premierLeague';

export function cardMatchesLeagueDeck(card: PlayerEraCardExtended, deckId?: LeagueDeckId): boolean {
  if (!deckId || deckId === 'global') return true;
  if (card.league) {
    const l = card.league.toLowerCase();
    if (deckId === 'premier-league' && l.includes('premier')) return true;
    if (deckId === 'la-liga' && l.includes('la liga')) return true;
    if (deckId === 'serie-a' && l.includes('serie a')) return true;
    if (deckId === 'bundesliga' && l.includes('bundesliga')) return true;
  }
  const club = card.club.toUpperCase();

  switch (deckId) {
    case 'premier-league':
      return (
        club.includes('CHELSEA') ||
        club.includes('LIVERPOOL') ||
        club.includes('MANCHESTER') ||
        club.includes('CITY') ||
        club.includes('UNITED') ||
        club.includes('ARSENAL') ||
        club.includes('TOTTENHAM') ||
        club.includes('NEWCASTLE')
      );
    case 'la-liga':
      return (
        club.includes('REAL MADRID') ||
        club.includes('BARCELONA') ||
        club.includes('ATLETICO') ||
        club.includes('VALENCIA') ||
        club.includes('SEVILLA')
      );
    case 'serie-a':
      return (
        club.includes('JUVENTUS') ||
        club.includes('MILAN') ||
        club.includes('INTER') ||
        club.includes('ROMA') ||
        club.includes('NAPOLI')
      );
    case 'bundesliga':
      return (
        club.includes('BAYERN') ||
        club.includes('DORTMUND') ||
        club.includes('LEVERKUSEN') ||
        club.includes('LEIPZIG')
      );
    default:
      return true;
  }
}

export const FORMATION_PRESETS: Record<FormationId, FormationConfig> = {
  'tactical-1-2-1-1': {
    id: 'tactical-1-2-1-1',
    name: 'Tactical (1-2-1-1)',
    formula: '1-2-1-1',
    badge: 'TACTICAL',
    description: '1 GK • 2 DEF • 1 MID • 1 ATK. Defensive rigidity with a solitary pivot anchor.',
    slots: ['GK', 'DEF', 'DEF', 'MID', 'ATK'],
  },
  'balanced-1-1-2-1': {
    id: 'balanced-1-1-2-1',
    name: 'Balanced (1-1-2-1)',
    formula: '1-1-2-1',
    badge: 'BALANCED',
    description: '1 GK • 1 DEF • 2 MID • 1 ATK. Fluid dual-midfield control for maximum tempo.',
    slots: ['GK', 'DEF', 'MID', 'MID', 'ATK'],
  },
  'all-out-attack-1-1-1-2': {
    id: 'all-out-attack-1-1-1-2',
    name: 'All-Out Attack (1-1-1-2)',
    formula: '1-1-1-2',
    badge: 'ALL-OUT ATTACK',
    description: '1 GK • 1 DEF • 1 MID • 2 ATK. High-voltage front two designed to break defensive blocks.',
    slots: ['GK', 'DEF', 'MID', 'ATK', 'ATK'],
  },
};

export function buildEmptySquad(managerId: string, formation: FormationConfig): SquadSlot[] {
  const counts: Record<PositionCategory, number> = { GK: 0, DEF: 0, MID: 0, ATK: 0 };
  return formation.slots.map((pos, idx) => {
    counts[pos] += 1;
    const label = `${pos} ${counts[pos] > 1 ? `#${counts[pos]}` : ''}`.trim();
    return {
      id: `${managerId}-slot-${idx}`,
      position: pos,
      slotIndex: idx,
      label,
    };
  });
}

/**
 * Check if the manager has at least one vacant slot that matches any of the player's positions.
 * Handles dual-position players (e.g. ['MID', 'ATK']). Completely null-safe.
 */
export function canManagerAcceptCard(slots: SquadSlot[], player?: PlayerEraCardExtended | null): boolean {
  if (!player || !player.positions || !Array.isArray(player.positions)) return false;
  return slots.some(
    (slot) => !slot.filledPlayer && player.positions.includes(slot.position)
  );
}

/**
 * Find the first open slot matching the player's eligible positions. Completely null-safe.
 */
export function findFirstEligibleSlotIndex(slots: SquadSlot[], player?: PlayerEraCardExtended | null): number {
  if (!player || !player.positions || !Array.isArray(player.positions)) return -1;
  return slots.findIndex(
    (slot) => !slot.filledPlayer && player.positions.includes(slot.position)
  );
}

/**
 * Assign a won player to the first matching open slot in the manager's squad.
 */
export function assignCardToSlot(
  slots: SquadSlot[],
  player: PlayerEraCardExtended,
  cost: number
): SquadSlot[] {
  if (!player) return slots;
  const targetIdx = findFirstEligibleSlotIndex(slots, player);
  if (targetIdx === -1) return slots;

  return slots.map((s, idx) => {
    if (idx === targetIdx) {
      return {
        ...s,
        filledPlayer: player,
        cost,
      };
    }
    return s;
  });
}

/**
 * Returns true if all slots are filled.
 */
export function isSquadFull(slots: SquadSlot[]): boolean {
  return slots.every((slot) => Boolean(slot.filledPlayer));
}

/**
 * Returns count of filled slots (0 to 5).
 */
export function getSquadFilledCount(slots: SquadSlot[]): number {
  return slots.filter((slot) => Boolean(slot.filledPlayer)).length;
}

/**
 * Calculate Squad Average OVR (0-100 scale, 1 decimal place, e.g. 94.2 OVR).
 */
export function getSquadAverageOvr(slots: SquadSlot[]): number {
  const filled = slots.filter((slot) => Boolean(slot.filledPlayer));
  if (filled.length === 0) return 0;
  const total = filled.reduce((acc, slot) => acc + (slot.filledPlayer?.ovr ?? 85), 0);
  return parseFloat((total / filled.length).toFixed(1));
}

export { drawNextWeightedCard, ACTIVE_DRAFT_DECK, getActiveDeck } from './draftEngine';
