export interface PartyMember {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  avatarSeed: string;
  joinedAt: number;
  /** Server-simulated opponent (matchmaking bot fallback); never connects. */
  isBot?: boolean;
  /** False while the player is inside their reconnect grace period. */
  isConnected?: boolean;
  /** Auction: the formation this member picked for Squad matches. */
  formationId?: string;
}

export interface PartyRoom {
  roomId: string;
  hostId: string;
  maxSlots: number;
  visibility?: 'private' | 'public';
  members: PartyMember[];
  currentGame?: {
    modeId: string;
    config?: unknown;
    status: 'lobby' | 'in-game';
  };
}

export type ClientToServerMessage =
  | { type: 'create_party'; payload: { hostName?: string; maxSlots?: number; visibility?: 'private' | 'public' } }
  | { type: 'join_party'; payload: { roomId: string; playerName?: string } }
  | {
      type: 'rejoin_party';
      payload: {
        roomId: string;
        playerName?: string;
        /** Lets a returning host re-open the squad if the room's state was lost. */
        wasHost?: boolean;
        maxSlots?: number;
        visibility?: 'private' | 'public';
        /** False when the client no longer holds the running match (e.g. after a page refresh). */
        resumeMatch?: boolean;
      };
    }
  | { type: 'toggle_ready'; payload?: Record<string, never> }
  | { type: 'update_name'; payload: { name: string } }
  | { type: 'set_member_prefs'; payload: { formationId?: string } }
  | { type: 'expand_slots'; payload?: { newMax?: number } }
  | { type: 'kick_member'; payload: { memberId: string } }
  | { type: 'leave_party'; payload?: Record<string, never> }
  | { type: 'launch_match'; payload: { modeId: string; config?: unknown } }
  | { type: 'party_setup_sync'; payload: { modeId: string; settings: any } }
  | { type: 'game_action'; payload: { modeId: string; action: string; data?: any } }
  | { type: 'game_leave'; payload?: Record<string, never> }
  | { type: 'join_queue'; payload: { modeId: string; playerName?: string; queueType?: 'duel' | 'ffa'; formationId?: string } }
  | { type: 'leave_queue'; payload?: Record<string, never> };

/** Who is in a match. Fixed at launch: it does not shrink when players drop or leave. */
export interface MatchRosterInfo {
  matchId: string;
  roster: PartyMember[];
  hostId: string;
}

export interface ModePresence {
  searching: number;
  inGame: number;
}

export type GlobalPresence = Record<string, ModePresence>;

export type ServerToClientMessage =
  | { type: 'party_created'; payload: { room: PartyRoom; myPlayerId: string } }
  | { type: 'party_joined'; payload: { room: PartyRoom; myPlayerId: string } }
  | { type: 'party_updated'; payload: { room: PartyRoom } }
  | { type: 'party_setup_update'; payload: { modeId: string; settings: any } }
  | { type: 'match_launched'; payload: { modeId: string; config?: unknown } & Partial<MatchRosterInfo> }
  | {
      type: 'game_init';
      payload: { modeId: string; config?: any; sharedData: any; assignedRole?: any; myPlayerId?: string } & Partial<MatchRosterInfo>;
    }
  | { type: 'game_state_update'; payload: { modeId: string; state: any } }
  | { type: 'game_event'; payload: { modeId: string; event: string; data?: any; senderId?: string; senderName?: string; _eventId?: string } }
  | { type: 'player_forfeit'; payload: { playerId: string; playerName: string; reason: string } }
  | { type: 'presence_update'; payload: { presence: GlobalPresence } }
  | { type: 'queue_status'; payload: { modeId: string; status: 'queued' | 'matched' | 'timeout_bot' | 'idle'; elapsedSeconds: number; queueType?: string; joinedCount?: number; requiredCount?: number } }
  | { type: 'party_disbanded'; payload: { reason: string } }
  | { type: 'party_kicked'; payload: { reason: string } }
  | { type: 'error'; payload: { message: string } };
