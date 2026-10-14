import type { PlayerEraCardExtended, PositionCategory } from '../../types';

export type FormationId = 'tactical-1-2-1-1' | 'balanced-1-1-2-1' | 'all-out-attack-1-1-1-2';

export interface FormationConfig {
  id: FormationId;
  name: string;
  formula: string; // e.g. "1-2-1-1"
  badge: string; // e.g. "TACTICAL"
  description: string;
  slots: PositionCategory[];
}

export interface SquadSlot {
  id: string; // e.g. "user-slot-0"
  position: PositionCategory;
  slotIndex: number;
  label: string; // e.g. "GK", "DEF 1", "DEF 2"
  filledPlayer?: PlayerEraCardExtended;
  cost?: number;
}

export interface ManagerState {
  id: string; // 'user' | 'gaffer'
  name: string;
  isBot: boolean;
  bankroll: number; // starts at $20
  slots: SquadSlot[];
  hasFolded: boolean; // folded for current lot
}

export type AuctionPhase =
  | 'preview' // brief intro before bidding starts
  | 'bidding' // timer active, taking bids
  | 'hammer' // lot ending / awarded animation
  | 'burned' // lot discarded because neither could/would take it
  | 'showdown'; // both squads full or deck exhausted

export interface AuctionEngineState {
  deck: PlayerEraCardExtended[];
  currentLotIndex: number;
  currentLot: PlayerEraCardExtended | null;
  currentBid: number;
  highBidderId: string | null;
  roundTimer: number; // in seconds
  phase: AuctionPhase;
  statusBanner: string;
  userState: ManagerState;
  botState: ManagerState;
  log: Array<{ id: string; text: string; time: string; type: 'bid' | 'pass' | 'win' | 'burn' }>;
}

export type LeagueDeckId =
  | 'global'
  | 'premier-league'
  | 'la-liga'
  | 'serie-a'
  | 'bundesliga';

export interface MatchConfig {
  formationId: FormationId;
  deckId?: LeagueDeckId;
  mode: 'solo' | 'host' | 'join';
  roomCode: string;
  isRoomCodeMasked: boolean;
  isMultiplayer?: boolean;
}
