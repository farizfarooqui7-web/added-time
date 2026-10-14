import type { PlayerEraCardExtended } from '../../types';
import type { LeagueDeckId } from '../../games/auction-draft/types';
import { PREMIER_LEAGUE_DECK } from './premierLeague';
import { LA_LIGA_DECK } from './laLiga';
import { SERIE_A_DECK } from './serieA';
import { BUNDESLIGA_DECK } from './bundesliga';

export { PREMIER_LEAGUE_DECK } from './premierLeague';
export { LA_LIGA_DECK } from './laLiga';
export { SERIE_A_DECK } from './serieA';
export { BUNDESLIGA_DECK } from './bundesliga';

// Combined 200-player Global pool
export const GLOBAL_DECK: PlayerEraCardExtended[] = [
  ...PREMIER_LEAGUE_DECK,
  ...LA_LIGA_DECK,
  ...SERIE_A_DECK,
  ...BUNDESLIGA_DECK,
];

export interface DeckMetadata {
  id: LeagueDeckId;
  name: string;
  count: number;
  description: string;
}

export function getDeckById(deckId?: LeagueDeckId): PlayerEraCardExtended[] {
  switch (deckId) {
    case 'premier-league':
      return PREMIER_LEAGUE_DECK;
    case 'la-liga':
      return LA_LIGA_DECK;
    case 'serie-a':
      return SERIE_A_DECK;
    case 'bundesliga':
      return BUNDESLIGA_DECK;
    case 'global':
      return GLOBAL_DECK;
    default:
      return PREMIER_LEAGUE_DECK;
  }
}

export function getAvailableDecks(): DeckMetadata[] {
  return [
    {
      id: 'global',
      name: 'GLOBAL ALL-STARS',
      count: GLOBAL_DECK.length,
      description: 'Comprehensive 200-card pool uniting the greatest eras across all top leagues.',
    },
    {
      id: 'premier-league',
      name: 'PREMIER LEAGUE',
      count: PREMIER_LEAGUE_DECK.length,
      description: 'Iconic legends and record-breakers from Premier League history.',
    },
    {
      id: 'la-liga',
      name: 'LA LIGA',
      count: LA_LIGA_DECK.length,
      description: 'Galacticos, tiki-taka masters, and Spanish top-flight legends.',
    },
    {
      id: 'serie-a',
      name: 'SERIE A',
      count: SERIE_A_DECK.length,
      description: 'The golden defensive masters and attacking geniuses of Italian football.',
    },
    {
      id: 'bundesliga',
      name: 'BUNDESLIGA',
      count: BUNDESLIGA_DECK.length,
      description: 'German football powerhouses, treble winners, and Bundesliga masters.',
    },
  ];
}
