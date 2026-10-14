export type ImposterLobbyMode = 'sandbox' | 'host' | 'join';

export type ImposterCategory =
  | 'All Players'
  | 'All-Time Legends'
  | 'Modern Superstars'
  | 'Premier League Icons'
  | 'Cult Heroes';

export type ImposterRolePreference = 'random' | 'crew' | 'imposter';

export interface ImposterMatchConfig {
  lobbyMode: ImposterLobbyMode;
  roomCode: string;
  isRoomCodeMasked: boolean;
  category: ImposterCategory;
  clueRounds: 1 | 2;
  botCount: 3 | 4 | 5;
  rolePreference: ImposterRolePreference;
  imposterClueEnabled: boolean;
  isMultiplayer?: boolean;
}

export interface ImposterSecretPlayer {
  id: string;
  name: string;
  position: string;
  nationality: string;
  flagUrl: string;
  primaryClub: string;
  crestUrl: string;
  careerClubs: string[];
  category: ImposterCategory;
  imposterVagueClue: string; // Single, very vague clue
  crewClues: string[];
  imposterBluffClues: string[];
}

export interface ImposterParticipant {
  id: string;
  name: string;
  isUser: boolean;
  isImposter: boolean;
  avatarBg: string;
  avatarText: string;
  reactionBadgeClass: string;
  initials: string;
  title: string;
}

export interface ImposterClueEntry {
  id: string;
  participantId: string;
  participantName: string;
  round: 1 | 2;
  text: string;
}

export interface ImposterChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColorClass?: string;
  text: string;
  isSystem?: boolean;
}

export interface FloatingReaction {
  id: string;
  label: string;
  senderName: string;
  badgeClass: string;
  textColorClass: string;
  leftPercent: number;
  topPercent: number;
}

