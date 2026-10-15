export type RecordBooksDifficulty = 'Easy' | 'Medium' | 'Hard';

/** League goals for the club (English Wikipedia infoboxes). Assists were removed: no reliable source. */
export type RecordBooksMetric = 'Goals';

export type RecordBooksLobbyMode = 'solo' | 'host' | 'join';

export interface RecordBooksPlayerStat {
  name: string;
  count: number;
  aliases: string[];
}

export interface RecordBooksClubRecord {
  name: string;
  slug: string;
  badgeUrl: string;
  difficulty: RecordBooksDifficulty;
  topGoals: RecordBooksPlayerStat[];
}

export interface RecordBooksMatchConfig {
  lobbyMode: RecordBooksLobbyMode;
  roomCode: string;
  isRoomCodeMasked: boolean;
  metric: RecordBooksMetric;
  difficulty: RecordBooksDifficulty;
  totalRounds: 5 | 10;
  isMultiplayer?: boolean;
  /** Public Quick Match: clubs drawn Easy → Medium → Hard. */
  difficultyCurve?: 'rising';
}

export interface RecordBooksSubmissionEval {
  skipped: boolean;
  playerName: string;
  statCount: number;
  allTimeRank: number | null; // 1-indexed rank if in club records, null if 0 / not in records
}

export interface RecordBooksRoundResult {
  roundNumber: number;
  club: RecordBooksClubRecord;
  metric: RecordBooksMetric;
  userEval: RecordBooksSubmissionEval;
  opponentEval: RecordBooksSubmissionEval;
}
