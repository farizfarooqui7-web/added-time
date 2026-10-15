export type LinkUpDifficulty = 'Easy' | 'Medium' | 'Hard';

export type LinkUpSlotType = 'Club' | 'Nation' | 'Position';

export type LinkUpPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export type LinkUpLobbyMode = 'solo' | 'host' | 'join';

export interface LinkUpClubEntry {
  name: string;
  slug: string;
  tier?: LinkUpDifficulty;
}

export interface LinkUpPlayerRecord {
  id: string;
  name: string;
  commonName: string;
  aliases: string[];
  position: LinkUpPosition;
  secondaryPosition?: LinkUpPosition;
  nationality: string;
  secondaryNationality?: string;
  /** Every senior national team the player represented (dual internationals). */
  nationalTeams?: string[];
  clubs: LinkUpClubEntry[];
  difficulty: LinkUpDifficulty;
}

export interface LinkUpClue {
  slotIndex: 0 | 1 | 2;
  type: LinkUpSlotType;
  value: string;       // e.g. "Real Madrid", "France", "MID"
  slug?: string;       // e.g. "real-madrid" for clubs
  subLabel: string;    // e.g. "CLUB CAREER", "NATIONAL TEAM", "PRIMARY ROLE"
  badgeText?: string;  // e.g. "RMA", "FRA", "MIDFIELDER"
  crestUrl?: string;   // local club crest image path
  flagUrl?: string;    // local nation flag image path
  tier?: LinkUpDifficulty;
}

export interface LinkUpPuzzle {
  id: string;
  roundNumber: number;
  difficulty: LinkUpDifficulty;
  slotTypes: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType];
  clues: [LinkUpClue, LinkUpClue, LinkUpClue];
  seedPlayer: LinkUpPlayerRecord;
  validPlayers: LinkUpPlayerRecord[];
}

export interface LinkUpMatchConfig {
  lobbyMode: LinkUpLobbyMode;
  roomCode: string;
  isRoomCodeMasked: boolean;
  difficulty: LinkUpDifficulty;
  slotTypes: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType];
  randomizeSlotsEachRound: boolean;
  totalRounds: number;
  isMultiplayer?: boolean;
  /** Public Quick Match: rounds 1–3 Easy, 4–7 Medium, 8–10 Hard. */
  difficultyCurve?: 'rising';
}

export interface LinkUpPlayerEvaluation {
  skipped: boolean;
  playerName: string;
  matchedPlayer?: LinkUpPlayerRecord;
  criteriaMetCount: number; // 0, 1, 2, or 3
  matchedSlotIndices: number[]; // e.g. [0, 1, 2]
  pointsAwarded: number;
  isLinkVerified: boolean; // true when 3/3 criteria met
}

export interface LinkUpRoundResult {
  roundNumber: number;
  puzzle: LinkUpPuzzle;
  userEval: LinkUpPlayerEvaluation;
  opponentEval: LinkUpPlayerEvaluation;
}

