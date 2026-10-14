export type PositionCategory = 'GK' | 'DEF' | 'MID' | 'ATK';

export interface PlayerEraCardProps {
  id: string;
  name: string;
  displayName?: string;
  season: string; // e.g. "2011-2012"
  position?: PositionCategory;
  positions: PositionCategory[]; // e.g. ['ATK'] or ['MID', 'ATK']
  club: string;
  clubCode?: string;
  clubAbbreviation?: string;
  clubCrestUrl?: string;
  crestPath?: string;
  league?: string;
  tags?: string[];
  nation?: string;
  nationFlagUrl?: string;
  imageUrl?: string;
  imagePath?: string;
  campaignTag?: string; // e.g. "TREBLE CAMPAIGN" or "PRIME"
  ovr?: number; // authentic 80-99 OVR
  basePrice?: number;
  firstName?: string;
  lastName?: string;
}

export interface PlayerEraCardExtended extends PlayerEraCardProps {
  displayName?: string;
  jerseyNumber?: number;
  auctionBasePrice?: number; // e.g. 5 for $5
  ovr: number; // authentic 80-99 OVR
  eraStats?: {
    appearances: number;
    goals: number;
    assists?: number;
    cleanSheets?: number;
    trophies: string[];
  };
}

export type GameModeId =
  | 'auction-draft'
  | 'criteria-rush'
  | 'tally-race'
  | 'football-imposter'
  | 'side_netting';

export interface GameModeInfo {
  id: GameModeId;
  title: string;
  badge: string;
  desc: string;
  accent: 'volt' | 'purple' | 'gold' | 'crimson' | 'cyan';
  playerRange: string;
  roundCount: string;
  timeLimit: string;
  rulesSummary: string[];
}
