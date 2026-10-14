import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { soundFX } from '../utils/audio';
import type { GlobalPresence } from '../types/wsProtocol';

export const getWsUrl = (): string => {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim();
  }
  if (typeof window !== 'undefined' && window.location) {
    if (window.location.protocol === 'https:' || import.meta.env.PROD) {
      return `wss://${window.location.host}`;
    }
    const hostname = window.location.hostname || 'localhost';
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `wss://${window.location.host}`;
    }
    return 'ws://localhost:3001';
  }
  return 'ws://localhost:3001';
};

export interface PartyMember {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  avatarSeed: string;
  joinedAt: number;
}

export interface PartyState {
  isActive: boolean;
  roomCode: string;
  isCodeMasked: boolean;
  maxSlots: number;
  visibility?: 'private' | 'public';
  members: PartyMember[];
  isCurrentUserHost: boolean;
  currentUserId: string;
}

export interface RemoteMatchLaunch {
  modeId: string;
  config?: unknown;
  timestamp: number;
}

export type PartyDockView = 'host-setup' | 'join';

export interface GameInitPayload {
  modeId: string;
  config?: any;
  sharedData: any;
  assignedRole?: any;
  myPlayerId?: string;
}

export interface GameEventPayload {
  modeId: string;
  event: string;
  data?: any;
  senderId?: string;
  senderName?: string;
}

export interface PlayerForfeitPayload {
  playerId: string;
  playerName: string;
  reason: string;
}

export interface MatchmakingQueueState {
  isQueued: boolean;
  modeId: string | null;
  queueType?: string;
  elapsedSeconds: number;
  status: 'idle' | 'queued' | 'matched' | 'timeout_bot';
  joinedCount?: number;
  requiredCount?: number;
}

interface PartyContextType {
  party: PartyState;
  playerName: string;
  updatePlayerName: (name: string) => void;
  isDrawerOpen: boolean;
  dockView: PartyDockView;
  setDockView: (view: PartyDockView) => void;
  drawerInitialFocusJoin: boolean;
  openDrawer: (view?: PartyDockView) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  togglePartyHost: () => void;
  toggleJoinCode: () => void;
  hostNewParty: (customName?: string, visibility?: 'private' | 'public') => void;
  joinPartyWithCode: (code: string, nickname?: string) => Promise<boolean> | boolean;
  leaveParty: () => void;
  toggleReady: () => void;
  toggleCodeMask: () => void;
  kickMember: (memberId: string) => void;
  expandSlots: (newMax?: number) => void;
  launchMatch: (modeId: string, config?: unknown) => void;
  lastRemoteMatch: RemoteMatchLaunch | null;
  clearRemoteMatch: () => void;
  // Matchmaking & Live Presence
  presence: GlobalPresence;
  queueState: MatchmakingQueueState;
  joinQueue: (modeId: string, queueType?: 'duel' | 'ffa') => void;
  leaveQueue: () => void;
  // Live in-game multiplayer sync
  gameInitData: GameInitPayload | null;
  lastGameEvent: GameEventPayload | null;
  playerForfeitEvent: PlayerForfeitPayload | null;
  sendGameAction: (modeId: string, action: string, data?: any) => void;
  sendGameLeave: () => void;
  clearForfeit: () => void;
  // Solo Escape Hatch state & modal helpers
  isSoloEscapeModalOpen: boolean;
  pendingLaunchCallback: (() => void) | null;
  triggerSoloEscapeHatch: (onLaunchSolo: () => void) => void;
  dismissSoloEscapeHatch: () => void;
  confirmSoloEscapeHatch: () => void;
  wsConnected: boolean;
}

const DEFAULT_PARTY: PartyState = {
  isActive: false,
  roomCode: '',
  isCodeMasked: true, // Default masked to prevent stream-sniping
  maxSlots: 4,
  visibility: 'private',
  members: [],
  isCurrentUserHost: false,
  currentUserId: 'user-local',
};

const PartyContext = createContext<PartyContextType | null>(null);

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getStoredPlayerName(): string {
  try {
    const saved = localStorage.getItem('topbins_player_name');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore
  }
  return '';
}

export const PartyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playerName, setPlayerNameState] = useState<string>(getStoredPlayerName);
  const [party, setParty] = useState<PartyState>(() => {
    try {
      const saved = localStorage.getItem('topbins_party_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.isActive && parsed.roomCode) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_PARTY;
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dockView, setDockView] = useState<PartyDockView>('host-setup');
  const [drawerInitialFocusJoin, setDrawerInitialFocusJoin] = useState(false);
  const [lastRemoteMatch, setLastRemoteMatch] = useState<RemoteMatchLaunch | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // In-game live multiplayer synchronization state
  const [gameInitData, setGameInitData] = useState<GameInitPayload | null>(null);
  const [lastGameEvent, setLastGameEvent] = useState<GameEventPayload | null>(null);
  const [playerForfeitEvent, setPlayerForfeitEvent] = useState<PlayerForfeitPayload | null>(null);

  // Matchmaking & Live Presence state
  const [presence, setPresence] = useState<GlobalPresence>({
    'auction-draft': { searching: 0, inGame: 0 },
    'criteria-rush': { searching: 0, inGame: 0 },
    'tally-race': { searching: 0, inGame: 0 },
    'football-imposter': { searching: 0, inGame: 0 },
    'side_netting': { searching: 0, inGame: 0 },
  });

  const [queueState, setQueueState] = useState<MatchmakingQueueState>({
    isQueued: false,
    modeId: null,
    queueType: undefined,
    elapsedSeconds: 0,
    status: 'idle',
  });

  // Matchmaking queue timer incrementer
  useEffect(() => {
    if (!queueState.isQueued) return;
    const interval = setInterval(() => {
      setQueueState((prev) => (prev.isQueued ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, [queueState.isQueued]);

  // Solo Escape Hatch modal state
  const [isSoloEscapeModalOpen, setIsSoloEscapeModalOpen] = useState(false);
  const [pendingLaunchCallback, setPendingLaunchCallback] = useState<(() => void) | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const joinQueue = (modeId: string, queueType: 'duel' | 'ffa' = 'duel') => {
    soundFX.playClick(800);
    setQueueState({
      isQueued: true,
      modeId,
      queueType,
      elapsedSeconds: 0,
      status: 'queued',
    });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join_queue',
          payload: { modeId, queueType, playerName },
        })
      );
    }
  };

  const leaveQueue = () => {
    soundFX.playClick(600);
    setQueueState({
      isQueued: false,
      modeId: null,
      queueType: undefined,
      elapsedSeconds: 0,
      status: 'idle',
    });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'leave_queue',
        })
      );
    }
  };

  // Update Player Name
  const updatePlayerName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPlayerNameState(trimmed);
    try {
      localStorage.setItem('topbins_player_name', trimmed);
    } catch {
      // ignore
    }

    // If connected to WS, notify server
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'update_name',
          payload: { name: trimmed },
        })
      );
    }

    // Also update locally in state
    setParty((prev) => {
      if (!prev.isActive) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === prev.currentUserId ? { ...m, name: trimmed } : m
        ),
      };
    });
  };

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('topbins_party_state', JSON.stringify(party));
    } catch {
      // ignore
    }
  }, [party]);

  // Real-Time WebSocket connection
  useEffect(() => {
    let isMounted = true;

    const connectWs = () => {
      const wsUrl = getWsUrl();
      try {
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          // If we had an active room in state, try to re-join it on reconnect
          if (party.isActive && party.roomCode) {
            socket.send(
              JSON.stringify({
                type: 'join_party',
                payload: { roomId: party.roomCode, playerName },
              })
            );
          }
        };

        socket.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
          } catch (err) {
            console.error('[Party WS] Failed to parse message:', err);
          }
        };

        socket.onerror = () => {
          // Handled quietly without breaking UI
          if (isMounted) setWsConnected(false);
        };

        socket.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          // Attempt reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
        };
      } catch {
        if (isMounted) {
          setWsConnected(false);
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleWsMessage = (msg: { type: string; payload?: any }) => {
    switch (msg.type) {
      case 'party_created': {
        const { room, myPlayerId } = msg.payload;
        setParty({
          isActive: true,
          roomCode: room.roomId,
          isCodeMasked: true,
          maxSlots: room.maxSlots || 4,
          visibility: room.visibility || 'private',
          members: room.members,
          isCurrentUserHost: true,
          currentUserId: myPlayerId,
        });
        soundFX.playLobbyReady();
        break;
      }

      case 'party_joined': {
        const { room, myPlayerId } = msg.payload;
        const isHost = room.hostId === myPlayerId;
        setParty({
          isActive: true,
          roomCode: room.roomId,
          isCodeMasked: true,
          maxSlots: room.maxSlots || 4,
          visibility: room.visibility || 'private',
          members: room.members,
          isCurrentUserHost: isHost,
          currentUserId: myPlayerId,
        });
        soundFX.playLobbyReady();
        break;
      }

      case 'party_updated': {
        const { room } = msg.payload;
        setParty((prev) => {
          const isHost = room.hostId === prev.currentUserId;
          return {
            ...prev,
            isActive: true,
            roomCode: room.roomId,
            maxSlots: room.maxSlots || prev.maxSlots,
            visibility: room.visibility || prev.visibility || 'private',
            members: room.members,
            isCurrentUserHost: isHost,
          };
        });
        break;
      }

      case 'match_launched': {
        const { modeId, config } = msg.payload;
        soundFX.playPhaseShift();
        setQueueState({
          isQueued: false,
          modeId: null,
          queueType: undefined,
          elapsedSeconds: 0,
          status: 'idle',
        });
        setLastRemoteMatch({
          modeId,
          config,
          timestamp: Date.now(),
        });
        break;
      }

      case 'presence_update': {
        if (msg.payload?.presence) {
          setPresence(msg.payload.presence);
        }
        break;
      }

      case 'queue_status': {
        const { modeId, status, elapsedSeconds, queueType, joinedCount, requiredCount } = msg.payload || {};
        setQueueState({
          isQueued: status === 'queued',
          modeId: status === 'idle' ? null : modeId,
          queueType,
          elapsedSeconds: elapsedSeconds || 0,
          status,
          joinedCount,
          requiredCount,
        });
        if (status === 'matched') {
          soundFX.playSuccess();
        }
        break;
      }

      case 'game_init': {
        setGameInitData(msg.payload);
        break;
      }

      case 'game_event': {
        setLastGameEvent(msg.payload);
        break;
      }

      case 'player_forfeit': {
        setPlayerForfeitEvent(msg.payload);
        soundFX.playVoltBuzz();
        break;
      }

      case 'party_disbanded': {
        soundFX.playClick(450);
        setParty(DEFAULT_PARTY);
        setGameInitData(null);
        setLastGameEvent(null);
        break;
      }

      case 'party_kicked': {
        soundFX.playVoltBuzz();
        setParty(DEFAULT_PARTY);
        setGameInitData(null);
        setLastGameEvent(null);
        break;
      }

      case 'error': {
        console.warn('[Party WS Error]:', msg.payload?.message);
        break;
      }
    }
  };

  const sendGameAction = (modeId: string, action: string, data?: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'game_action',
          payload: { modeId, action, data },
        })
      );
    }
  };

  const sendGameLeave = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'game_leave',
        })
      );
    }
    setGameInitData(null);
    setLastGameEvent(null);
  };

  const clearForfeit = () => {
    setPlayerForfeitEvent(null);
  };

  const openDrawer = (view?: PartyDockView) => {
    soundFX.playCardFlip();
    if (view) {
      setDockView(view);
      setDrawerInitialFocusJoin(view === 'join');
    }
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    soundFX.playClick(600);
    setIsDrawerOpen(false);
  };

  const toggleDrawer = () => {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  };

  const togglePartyHost = () => {
    if (isDrawerOpen) {
      if (party.isActive) {
        closeDrawer();
        return;
      }
      if (dockView === 'host-setup') {
        closeDrawer();
        return;
      }
      setDockView('host-setup');
    } else {
      if (party.isActive) {
        openDrawer();
      } else {
        openDrawer('host-setup');
      }
    }
  };

  const toggleJoinCode = () => {
    if (isDrawerOpen) {
      if (!party.isActive && dockView === 'join') {
        closeDrawer();
        return;
      }
      setDockView('join');
      setDrawerInitialFocusJoin(true);
    } else {
      openDrawer('join');
    }
  };

  const hostNewParty = (customName?: string, visibility: 'private' | 'public' = 'private') => {
    soundFX.playLobbyReady();
    const chosenName = (customName && customName.trim())
      ? customName.trim().toUpperCase()
      : (playerName && playerName.trim() ? playerName.trim().toUpperCase() : 'HOST');

    if (chosenName !== playerName) {
      updatePlayerName(chosenName);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'create_party',
          payload: { hostName: chosenName, maxSlots: 4, visibility },
        })
      );
    } else {
      // Local fallback mode
      const newCode = generateRoomCode();
      const hostUser: PartyMember = {
        id: 'user-local',
        name: chosenName,
        isHost: true,
        isReady: true,
        avatarSeed: 'host-1',
        joinedAt: Date.now(),
      };

      setParty({
        isActive: true,
        roomCode: newCode,
        isCodeMasked: true,
        maxSlots: 4,
        visibility,
        members: [hostUser],
        isCurrentUserHost: true,
        currentUserId: 'user-local',
      });
    }

    setIsDrawerOpen(true);
  };

  const joinPartyWithCode = (code: string, nickname?: string): boolean => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 3) return false;

    const chosenName = (nickname && nickname.trim()) ? nickname.trim().toUpperCase() : (playerName || 'GUEST');
    if (chosenName !== playerName) {
      updatePlayerName(chosenName);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join_party',
          payload: { roomId: cleanCode, playerName: chosenName },
        })
      );
    } else {
      // Local fallback mode
      soundFX.playHammer();
      const hostUser: PartyMember = {
        id: 'member-host',
        name: 'SQUAD HOST',
        isHost: true,
        isReady: true,
        avatarSeed: 'host-1',
        joinedAt: Date.now() - 30000,
      };

      const meGuest: PartyMember = {
        id: 'user-local',
        name: chosenName,
        isHost: false,
        isReady: false,
        avatarSeed: 'guest-me',
        joinedAt: Date.now(),
      };

      setParty({
        isActive: true,
        roomCode: cleanCode,
        isCodeMasked: true,
        maxSlots: 4,
        visibility: 'private',
        members: [hostUser, meGuest],
        isCurrentUserHost: false,
        currentUserId: 'user-local',
      });
    }

    setIsDrawerOpen(true);
    return true;
  };

  const leaveParty = () => {
    soundFX.playClick(500);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'leave_party',
        })
      );
    }
    setParty(DEFAULT_PARTY);
    setIsDrawerOpen(false);
  };

  const toggleReady = () => {
    soundFX.playLobbyReady();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'toggle_ready',
        })
      );
    }
    setParty((prev) => {
      if (!prev.isActive) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === prev.currentUserId ? { ...m, isReady: !m.isReady } : m
        ),
      };
    });
  };

  const toggleCodeMask = () => {
    soundFX.playClick(700);
    setParty((prev) => ({
      ...prev,
      isCodeMasked: !prev.isCodeMasked,
    }));
  };

  const kickMember = (memberId: string) => {
    if (!party.isCurrentUserHost || memberId === party.currentUserId) return;
    soundFX.playClick(450);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'kick_member',
          payload: { memberId },
        })
      );
    }
    setParty((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== memberId),
    }));
  };

  const expandSlots = (newMax?: number) => {
    if (!party.isCurrentUserHost) return;
    const targetMax = newMax || Math.min(8, party.maxSlots + 2);
    if (targetMax <= party.maxSlots || targetMax > 8) return;

    soundFX.playCardFlip();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'expand_slots',
          payload: { newMax: targetMax },
        })
      );
    }
    setParty((prev) => ({
      ...prev,
      maxSlots: targetMax,
    }));
  };

  const launchMatch = (modeId: string, config?: unknown) => {
    if (!party.isCurrentUserHost) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'launch_match',
          payload: { modeId, config },
        })
      );
    }
  };

  const clearRemoteMatch = () => {
    setLastRemoteMatch(null);
  };

  const triggerSoloEscapeHatch = (onLaunchSolo: () => void) => {
    soundFX.playVoltBuzz();
    setPendingLaunchCallback(() => onLaunchSolo);
    setIsSoloEscapeModalOpen(true);
  };

  const dismissSoloEscapeHatch = () => {
    soundFX.playClick(600);
    setIsSoloEscapeModalOpen(false);
    setPendingLaunchCallback(null);
  };

  const confirmSoloEscapeHatch = () => {
    soundFX.playHammer();
    const launchCb = pendingLaunchCallback;
    leaveParty();
    setIsSoloEscapeModalOpen(false);
    setPendingLaunchCallback(null);
    if (launchCb) {
      launchCb();
    }
  };

  return (
    <PartyContext.Provider
      value={{
        party,
        playerName,
        updatePlayerName,
        isDrawerOpen,
        dockView,
        setDockView,
        drawerInitialFocusJoin,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        togglePartyHost,
        toggleJoinCode,
        hostNewParty,
        joinPartyWithCode,
        leaveParty,
        toggleReady,
        toggleCodeMask,
        kickMember,
        expandSlots,
        launchMatch,
        lastRemoteMatch,
        clearRemoteMatch,
        gameInitData,
        lastGameEvent,
        playerForfeitEvent,
        sendGameAction,
        sendGameLeave,
        clearForfeit,
        isSoloEscapeModalOpen,
        pendingLaunchCallback,
        triggerSoloEscapeHatch,
        dismissSoloEscapeHatch,
        confirmSoloEscapeHatch,
        wsConnected,
        presence,
        queueState,
        joinQueue,
        leaveQueue,
      }}
    >
      {children}
    </PartyContext.Provider>
  );
};

export const useParty = (): PartyContextType => {
  const ctx = useContext(PartyContext);
  if (!ctx) {
    throw new Error('useParty must be used within a PartyProvider');
  }
  return ctx;
};

export function useGameSync(targetModeId: string) {
  const {
    party,
    playerName,
    gameInitData,
    lastGameEvent,
    playerForfeitEvent,
    clearForfeit,
    sendGameAction,
    sendGameLeave,
  } = useParty();

  const isMultiplayer = party.isActive && party.members.length > 1;
  const isHost = party.isCurrentUserHost;
  const myPlayerId = party.currentUserId;
  const opponent = party.members.find((m) => m.id !== myPlayerId);

  const isMatchMode = (mode?: string) => {
    if (!mode) return false;
    if (mode === targetModeId) return true;
    if ((targetModeId === 'link-up' || targetModeId === 'criteria-rush') && (mode === 'link-up' || mode === 'criteria-rush')) return true;
    if ((targetModeId === 'record-books' || targetModeId === 'tally-race') && (mode === 'record-books' || mode === 'tally-race')) return true;
    return false;
  };

  const sendAction = useCallback(
    (action: string, data?: any) => {
      if (isMultiplayer) {
        sendGameAction(targetModeId, action, data);
      }
    },
    [isMultiplayer, sendGameAction, targetModeId]
  );

  return {
    isMultiplayer,
    isHost,
    myPlayerId,
    myPlayerName: playerName,
    opponent,
    partyMembers: party.members,
    gameInitData: isMatchMode(gameInitData?.modeId) ? gameInitData : null,
    lastGameEvent: isMatchMode(lastGameEvent?.modeId) ? lastGameEvent : null,
    playerForfeitEvent,
    clearForfeit,
    sendAction,
    sendGameLeave,
  };
}
