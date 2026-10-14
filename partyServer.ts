import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  PartyRoom,
  PartyMember,
  GlobalPresence,
} from './src/types/wsProtocol';
import { PREMIER_LEAGUE_DECK } from './src/data/decks';
import { generateLinkUpPuzzle } from './src/games/link-up/puzzleEngine';
import { generateClubSequence } from './src/games/record-books/recordBooksEngine';
import { pickSecretPlayer } from './src/games/football-imposter/imposterEngine';
import { drawMatchPrompts } from './src/games/side-netting/sideNettingEngine';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
const HOST = '0.0.0.0';

interface ClientSession {
  socket: WebSocket;
  playerId: string;
  roomId?: string;
  name: string;
  isQueued?: boolean;
  queuedModeId?: string;
  queuedType?: 'duel' | 'ffa';
  queuedAt?: number;
}

const clients = new Map<WebSocket, ClientSession>();
const rooms = new Map<string, PartyRoom>();

interface QueuedEntry {
  session: ClientSession;
  modeId: string;
  queueType: 'duel' | 'ffa';
  queuedAt: number;
  timeoutTimer?: NodeJS.Timeout;
}

// Lightweight HTTP server for Cloud Health Checks (Railway, Render, Fly.io, etc.)
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';
  if (url === '/' || url === '/health' || url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'top-bins-ws',
        uptime: Math.floor(process.uptime()),
        activeRooms: rooms.size,
        activeClients: clients.size,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server });

server.listen(PORT, HOST, () => {
  console.log(`[Added Time WS] Party WebSocket server running on http://${HOST}:${PORT} (Health check: /health)`);
});

const duelQueues = new Map<string, QueuedEntry[]>();

const CANONICAL_MODES = [
  'auction-draft',
  'criteria-rush',
  'tally-race',
  'football-imposter',
  'side_netting',
];

const BOT_USERNAMES = [
  'TacticalGaffer',
  'VolleyKing99',
  'ElMago_10',
  'OffsideTrap',
  'CleanSheetKing',
  'TikiTakaDon',
  'NetBuster88',
  'RabonaRebel',
  'ScoutMaster',
  'ZonalMarking',
];

function normalizeModeId(modeId: string): string {
  if (modeId === 'link-up' || modeId === 'criteria-rush') return 'criteria-rush';
  if (modeId === 'record-books' || modeId === 'tally-race') return 'tally-race';
  if (modeId === 'side_netting') return 'side_netting';
  if (modeId === 'football-imposter') return 'football-imposter';
  if (modeId === 'auction-draft') return 'auction-draft';
  return modeId;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomId() : code;
}

function send(socket: WebSocket, message: ServerToClientMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastToRoom(roomId: string, message: ServerToClientMessage) {
  for (const session of clients.values()) {
    if (session.roomId === roomId && session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(JSON.stringify(message));
    }
  }
}

function broadcastGlobalPresence() {
  const presence: GlobalPresence = {};

  for (const mode of CANONICAL_MODES) {
    // Count real searching players
    const qList = duelQueues.get(mode) || [];
    const realSearching = qList.length;

    // Count real in-game players
    let realInGame = 0;
    for (const room of rooms.values()) {
      if (room.currentGame?.status === 'in-game' && normalizeModeId(room.currentGame.modeId) === mode) {
        realInGame += room.members.length;
      }
    }

    presence[mode] = {
      searching: realSearching,
      inGame: realInGame,
    };
  }

  const msg: ServerToClientMessage = {
    type: 'presence_update',
    payload: { presence },
  };

  for (const session of clients.values()) {
    if (session.socket.readyState === WebSocket.OPEN) {
      send(session.socket, msg);
    }
  }
}

// Periodic presence broadcast every 3 seconds
setInterval(() => {
  broadcastGlobalPresence();
}, 3000);

// Authoritative Match Seed Generator
function generateAuthoritativeMatchData(modeId: string, members: PartyMember[]) {
  const normMode = normalizeModeId(modeId);
  let sharedData: any = {};
  const assignedRoles: Record<string, any> = {};

  try {
    if (normMode === 'criteria-rush') {
      const puzzles = [];
      const usedSeeds = new Set<string>();
      for (let r = 1; r <= 5; r++) {
        const p = generateLinkUpPuzzle(r, 'Medium', ['Club', 'Nation', 'Position'], usedSeeds);
        usedSeeds.add(p.seedPlayer.id);
        puzzles.push(p);
      }
      sharedData = { puzzles, totalRounds: 5 };
    } else if (normMode === 'tally-race') {
      const clubSequence = generateClubSequence('Medium', 5);
      sharedData = { clubSequence, totalRounds: 5 };
    } else if (normMode === 'football-imposter') {
      const secret = pickSecretPlayer('Global Icons');
      const memberIds = members.map((m) => m.id);
      const imposterIdx = Math.floor(Math.random() * memberIds.length);
      const imposterId = memberIds[imposterIdx];

      sharedData = {
        secretPlayerCategory: secret.category,
        totalRounds: 2,
      };

      for (const m of members) {
        if (m.id === imposterId) {
          assignedRoles[m.id] = {
            role: 'imposter',
            isImposter: true,
            secretPlayer: {
              category: secret.category,
              name: '???',
              commonName: '???',
              clue1: 'BLUFF YOUR SQUAD',
              clue2: 'STAY HIDDEN',
            },
          };
        } else {
          assignedRoles[m.id] = {
            role: 'detective',
            isImposter: false,
            secretPlayer: secret,
          };
        }
      }
    } else if (normMode === 'side_netting') {
      const promptResult = drawMatchPrompts(10, []);
      sharedData = { prompts: promptResult.prompts, totalRounds: 10 };
    } else if (normMode === 'auction-draft') {
      const shuffled = [...PREMIER_LEAGUE_DECK].sort(() => Math.random() - 0.5).slice(0, 15);
      sharedData = { cards: shuffled, totalRounds: 5 };
    }
  } catch (err) {
    console.error('[Added Time WS] Failed to generate shared match data:', err);
  }

  return { sharedData, assignedRoles };
}

// Launch an ephemeral matched room between human & human or human & AI bot
function launchEphemeralMatch(
  player1: ClientSession,
  player2: { id: string; name: string; isBot?: boolean; socket?: WebSocket },
  modeId: string,
  queueType: 'duel' | 'ffa' = 'duel'
) {
  const normMode = normalizeModeId(modeId);
  const roomId = `match_${normMode}_${generateRoomId()}`;

  const member1: PartyMember = {
    id: player1.playerId,
    name: player1.name,
    isHost: true,
    isReady: true,
    avatarSeed: player1.playerId,
    joinedAt: Date.now(),
  };

  const member2: PartyMember = {
    id: player2.id,
    name: player2.name,
    isHost: false,
    isReady: true,
    avatarSeed: player2.id,
    joinedAt: Date.now(),
  };

  const room: PartyRoom = {
    roomId,
    hostId: player1.playerId,
    maxSlots: queueType === 'ffa' ? 8 : 2,
    visibility: 'public',
    members: [member1, member2],
    currentGame: {
      modeId: normMode,
      status: 'in-game',
    },
  };

  rooms.set(roomId, room);
  player1.roomId = roomId;
  player1.isQueued = false;
  player1.queuedModeId = undefined;

  if (player2.socket) {
    const p2Session = clients.get(player2.socket);
    if (p2Session) {
      p2Session.roomId = roomId;
      p2Session.isQueued = false;
      p2Session.queuedModeId = undefined;
    }
  }

  console.log(`[Added Time Matchmaking] Paired ${player1.name} vs ${player2.name} in mode ${normMode} (Room ${roomId})`);

  // Inform players of match found
  send(player1.socket, {
    type: 'queue_status',
    payload: { modeId: normMode, status: 'matched', elapsedSeconds: 0, queueType },
  });

  send(player1.socket, {
    type: 'party_created',
    payload: { room, myPlayerId: player1.playerId },
  });

  if (player2.socket) {
    send(player2.socket, {
      type: 'queue_status',
      payload: { modeId: normMode, status: 'matched', elapsedSeconds: 0, queueType },
    });

    send(player2.socket, {
      type: 'party_joined',
      payload: { room, myPlayerId: player2.id },
    });
  }

  // Generate and broadcast authoritative match data
  const { sharedData, assignedRoles } = generateAuthoritativeMatchData(normMode, room.members);

  broadcastToRoom(roomId, {
    type: 'match_launched',
    payload: { modeId: normMode, config: { isMultiplayer: true } },
  });

  send(player1.socket, {
    type: 'game_init',
    payload: {
      modeId: normMode,
      config: { isMultiplayer: true },
      sharedData,
      assignedRole: assignedRoles[player1.playerId],
      myPlayerId: player1.playerId,
    },
  });

  if (player2.socket) {
    send(player2.socket, {
      type: 'game_init',
      payload: {
        modeId: normMode,
        config: { isMultiplayer: true },
        sharedData,
        assignedRole: assignedRoles[player2.id],
        myPlayerId: player2.id,
      },
    });
  }

  broadcastGlobalPresence();
}

// Launch a multiplayer match with 3+ real human players (used for Football Imposter drop-in)
function launchGroupMatch(players: ClientSession[], modeId: string) {
  const normMode = normalizeModeId(modeId);
  const roomId = `match_${normMode}_${generateRoomId()}`;

  const members: PartyMember[] = players.map((p, idx) => ({
    id: p.playerId,
    name: p.name,
    isHost: idx === 0,
    isReady: true,
    avatarSeed: p.playerId,
    joinedAt: Date.now(),
  }));

  const room: PartyRoom = {
    roomId,
    hostId: players[0].playerId,
    maxSlots: 8,
    visibility: 'public',
    members,
    currentGame: {
      modeId: normMode,
      status: 'in-game',
    },
  };

  rooms.set(roomId, room);

  for (const p of players) {
    p.roomId = roomId;
    p.isQueued = false;
    p.queuedModeId = undefined;

    send(p.socket, {
      type: 'queue_status',
      payload: { modeId: normMode, status: 'matched', elapsedSeconds: 0, queueType: 'ffa' },
    });

    send(p.socket, {
      type: p === players[0] ? 'party_created' : 'party_joined',
      payload: { room, myPlayerId: p.playerId },
    });
  }

  const { sharedData, assignedRoles } = generateAuthoritativeMatchData(normMode, room.members);

  broadcastToRoom(roomId, {
    type: 'match_launched',
    payload: { modeId: normMode, config: { isMultiplayer: true } },
  });

  for (const p of players) {
    send(p.socket, {
      type: 'game_init',
      payload: {
        modeId: normMode,
        config: { isMultiplayer: true },
        sharedData,
        assignedRole: assignedRoles[p.playerId],
        myPlayerId: p.playerId,
      },
    });
  }

  broadcastGlobalPresence();
  console.log(`[Added Time Matchmaking] Group match launched for ${players.length} players in mode ${normMode} (Room ${roomId})`);
}

function handleBotFallback(session: ClientSession, modeId: string, queueType: 'duel' | 'ffa') {
  const normMode = normalizeModeId(modeId);

  // Specifically disabled for Football Imposter (social deduction requires real human players)
  if (normMode === 'football-imposter') return;

  const qList = duelQueues.get(normMode) || [];
  const idx = qList.findIndex((q) => q.session.playerId === session.playerId);
  if (idx === -1) return; // Already matched or cancelled

  duelQueues.set(
    normMode,
    qList.filter((q) => q.session.playerId !== session.playerId)
  );

  const botName = BOT_USERNAMES[Math.floor(Math.random() * BOT_USERNAMES.length)];
  const botId = 'bot_' + Math.random().toString(36).substring(2, 8);

  console.log(`[Added Time Matchmaking] 10s queue timeout for ${session.name}. Pairing with AI Bot: ${botName}`);

  send(session.socket, {
    type: 'queue_status',
    payload: { modeId: normMode, status: 'timeout_bot', elapsedSeconds: 10, queueType },
  });

  launchEphemeralMatch(session, { id: botId, name: botName, isBot: true }, normMode, queueType);
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const playerId = 'player_' + Math.random().toString(36).substring(2, 9);
  const session: ClientSession = {
    socket: ws,
    playerId,
    name: 'BALLER_' + playerId.slice(-3).toUpperCase(),
  };
  clients.set(ws, session);

  // Send immediate presence snapshot upon connection
  const presence: GlobalPresence = {};
  for (const mode of CANONICAL_MODES) {
    const qList = duelQueues.get(mode) || [];
    presence[mode] = { searching: qList.length, inGame: 0 };
  }
  send(ws, { type: 'presence_update', payload: { presence } });

  ws.on('message', (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientToServerMessage;
      handleMessage(session, msg);
    } catch (err) {
      console.error('[Added Time WS] Invalid packet:', err);
      send(ws, { type: 'error', payload: { message: 'Invalid packet received' } });
    }
  });

  ws.on('close', () => {
    handleDisconnect(session);
    clients.delete(ws);
    broadcastGlobalPresence();
  });
});

function handleMessage(session: ClientSession, msg: ClientToServerMessage) {
  switch (msg.type) {
    case 'join_queue': {
      const rawMode = msg.payload?.modeId || 'auction-draft';
      const normMode = normalizeModeId(rawMode);
      const queueType = msg.payload?.queueType || 'duel';
      const playerName = msg.payload?.playerName?.trim();

      if (playerName) session.name = playerName;

      // Leave any existing party or queue first
      if (session.roomId) handleLeaveParty(session);
      removeClientFromQueues(session);

      session.isQueued = true;
      session.queuedModeId = normMode;
      session.queuedType = queueType;
      session.queuedAt = Date.now();

      // ================= FOOTBALL IMPOSTER (NO BOT FALLBACK, 3+ REAL PLAYERS) =================
      if (normMode === 'football-imposter') {
        const rawList = duelQueues.get('football-imposter') || [];
        const activeList = rawList.filter((q) => q.session.socket.readyState === WebSocket.OPEN);

        activeList.push({
          session,
          modeId: normMode,
          queueType: 'ffa',
          queuedAt: Date.now(),
        });

        // When 3 or more real ballers have entered the staging queue, launch!
        if (activeList.length >= 3) {
          const playersToLaunch = activeList.map((q) => q.session);
          duelQueues.set('football-imposter', []);
          launchGroupMatch(playersToLaunch, 'football-imposter');
          return;
        }

        // Less than 3 players: keep them in staging and notify all waiting members
        duelQueues.set('football-imposter', activeList);

        for (const q of activeList) {
          send(q.session.socket, {
            type: 'queue_status',
            payload: {
              modeId: 'football-imposter',
              status: 'queued',
              elapsedSeconds: Math.floor((Date.now() - q.queuedAt) / 1000),
              queueType: 'ffa',
              joinedCount: activeList.length,
              requiredCount: 3,
            },
          });
        }

        console.log(`[Added Time Matchmaking] ${session.name} entered Imposter staging (${activeList.length}/3 players joined)`);
        broadcastGlobalPresence();
        break;
      }

      // ================= 1v1 DUEL QUEUES (10.5s AI BOT FALLBACK) =================
      const qList = duelQueues.get(normMode) || [];

      // Check if another human player is already waiting
      const waiting = qList.shift();
      if (waiting && waiting.session.socket.readyState === WebSocket.OPEN) {
        if (waiting.timeoutTimer) clearTimeout(waiting.timeoutTimer);
        duelQueues.set(normMode, qList);
        launchEphemeralMatch(waiting.session, { id: session.playerId, name: session.name, socket: session.socket }, normMode, queueType);
        return;
      }

      // No opponent waiting: enter queue with 10.5 second fallback timer
      const timeoutTimer = setTimeout(() => {
        handleBotFallback(session, normMode, queueType);
      }, 10500);

      duelQueues.set(normMode, [...qList, {
        session,
        modeId: normMode,
        queueType,
        queuedAt: Date.now(),
        timeoutTimer,
      }]);

      send(session.socket, {
        type: 'queue_status',
        payload: { modeId: normMode, status: 'queued', elapsedSeconds: 0, queueType },
      });

      console.log(`[Added Time Matchmaking] ${session.name} entered queue for ${normMode} (${queueType})`);
      broadcastGlobalPresence();
      break;
    }

    case 'leave_queue': {
      removeClientFromQueues(session);
      send(session.socket, {
        type: 'queue_status',
        payload: { modeId: session.queuedModeId || '', status: 'idle', elapsedSeconds: 0 },
      });
      session.isQueued = false;
      session.queuedModeId = undefined;
      broadcastGlobalPresence();
      break;
    }

    case 'create_party': {
      removeClientFromQueues(session);
      if (session.roomId) {
        handleLeaveParty(session);
      }

      const roomId = generateRoomId();
      const hostName = msg.payload?.hostName?.trim() || session.name;
      session.name = hostName;
      session.roomId = roomId;

      const hostMember: PartyMember = {
        id: session.playerId,
        name: hostName,
        isHost: true,
        isReady: true,
        avatarSeed: 'host_' + session.playerId,
        joinedAt: Date.now(),
      };

      const room: PartyRoom = {
        roomId,
        hostId: session.playerId,
        maxSlots: msg.payload?.maxSlots || 4,
        visibility: msg.payload?.visibility || 'private',
        members: [hostMember],
      };

      rooms.set(roomId, room);
      console.log(`[Added Time WS] Party created: ${roomId} by ${hostName}`);

      send(session.socket, {
        type: 'party_created',
        payload: { room, myPlayerId: session.playerId },
      });
      break;
    }

    case 'join_party': {
      removeClientFromQueues(session);
      if (session.roomId) {
        handleLeaveParty(session);
      }

      const { roomId, playerName } = msg.payload;
      const cleanCode = roomId.trim().toUpperCase();
      const room = rooms.get(cleanCode);

      if (!room) {
        send(session.socket, {
          type: 'error',
          payload: { message: `Party [${cleanCode}] not found.` },
        });
        return;
      }

      if (room.members.length >= room.maxSlots) {
        send(session.socket, {
          type: 'error',
          payload: { message: `Party [${cleanCode}] is currently full.` },
        });
        return;
      }

      const name = playerName?.trim() || session.name;
      session.name = name;
      session.roomId = cleanCode;

      const newMember: PartyMember = {
        id: session.playerId,
        name,
        isHost: false,
        isReady: false,
        avatarSeed: 'guest_' + session.playerId,
        joinedAt: Date.now(),
      };

      room.members.push(newMember);
      console.log(`[Added Time WS] ${name} joined party ${cleanCode}`);

      send(session.socket, {
        type: 'party_joined',
        payload: { room, myPlayerId: session.playerId },
      });

      broadcastToRoom(cleanCode, {
        type: 'party_updated',
        payload: { room },
      });
      break;
    }

    case 'toggle_ready': {
      if (!session.roomId) return;
      const room = rooms.get(session.roomId);
      if (!room) return;

      const member = room.members.find((m) => m.id === session.playerId);
      if (member) {
        member.isReady = !member.isReady;
        broadcastToRoom(session.roomId, {
          type: 'party_updated',
          payload: { room },
        });
      }
      break;
    }

    case 'update_name': {
      const newName = msg.payload?.name?.trim();
      if (!newName) return;
      session.name = newName;

      if (session.roomId) {
        const room = rooms.get(session.roomId);
        if (room) {
          const member = room.members.find((m) => m.id === session.playerId);
          if (member) {
            member.name = newName;
            broadcastToRoom(session.roomId, {
              type: 'party_updated',
              payload: { room },
            });
          }
        }
      }
      break;
    }

    case 'expand_slots': {
      if (!session.roomId) return;
      const room = rooms.get(session.roomId);
      if (!room || room.hostId !== session.playerId) return;

      const target = msg.payload?.newMax || Math.min(8, room.maxSlots + 2);
      if (target > room.maxSlots && target <= 8) {
        room.maxSlots = target;
        broadcastToRoom(session.roomId, {
          type: 'party_updated',
          payload: { room },
        });
      }
      break;
    }

    case 'kick_member': {
      if (!session.roomId) return;
      const room = rooms.get(session.roomId);
      if (!room || room.hostId !== session.playerId) return;

      const kickTargetId = msg.payload?.memberId;
      if (!kickTargetId || kickTargetId === session.playerId) return;

      room.members = room.members.filter((m) => m.id !== kickTargetId);

      for (const client of clients.values()) {
        if (client.playerId === kickTargetId) {
          client.roomId = undefined;
          send(client.socket, {
            type: 'party_kicked',
            payload: { reason: 'You were removed from the party by the host.' },
          });
          break;
        }
      }

      broadcastToRoom(session.roomId, {
        type: 'party_updated',
        payload: { room },
      });
      break;
    }

    case 'leave_party': {
      handleLeaveParty(session);
      break;
    }

    case 'launch_match': {
      if (!session.roomId) return;
      const room = rooms.get(session.roomId);
      if (!room || room.hostId !== session.playerId) return;

      const { modeId, config } = msg.payload;
      const normMode = normalizeModeId(modeId);

      room.currentGame = {
        modeId: normMode,
        config,
        status: 'in-game',
      };

      console.log(`[Added Time WS] Host ${session.name} launched match "${normMode}" in room ${session.roomId}`);

      broadcastToRoom(session.roomId, {
        type: 'match_launched',
        payload: { modeId: normMode, config },
      });

      const { sharedData, assignedRoles } = generateAuthoritativeMatchData(normMode, room.members);

      for (const client of clients.values()) {
        if (client.roomId === session.roomId && client.socket.readyState === WebSocket.OPEN) {
          send(client.socket, {
            type: 'game_init',
            payload: {
              modeId: normMode,
              config,
              sharedData,
              assignedRole: assignedRoles[client.playerId],
              myPlayerId: client.playerId,
            },
          });
        }
      }
      broadcastGlobalPresence();
      break;
    }

    case 'game_action': {
      if (!session.roomId) return;
      const room = rooms.get(session.roomId);
      if (!room) return;

      const { modeId, action, data } = msg.payload;

      for (const client of clients.values()) {
        if (client.roomId === session.roomId && client.socket.readyState === WebSocket.OPEN) {
          send(client.socket, {
            type: 'game_event',
            payload: {
              modeId,
              event: action,
              data,
              senderId: session.playerId,
              senderName: session.name,
            },
          });
        }
      }
      break;
    }

    case 'game_leave': {
      if (!session.roomId) return;
      const roomId = session.roomId;
      const room = rooms.get(roomId);
      if (!room) return;

      const isMatchRoom = roomId.startsWith('match_') || room.visibility === 'public';

      if (room.currentGame?.status === 'in-game' || isMatchRoom) {
        if (room.currentGame) room.currentGame.status = 'lobby';
        for (const client of clients.values()) {
          if (client.roomId === roomId && client.playerId !== session.playerId && client.socket.readyState === WebSocket.OPEN) {
            send(client.socket, {
              type: 'player_forfeit',
              payload: {
                playerId: session.playerId,
                playerName: session.name,
                reason: `${session.name} forfeited the match.`,
              },
            });
            if (isMatchRoom) {
              send(client.socket, {
                type: 'party_disbanded',
                payload: { reason: 'Opponent forfeited. Match terminated.' },
              });
            }
          }
        }
      }

      if (isMatchRoom) {
        rooms.delete(roomId);
        session.roomId = undefined;
      }
      break;
    }
  }
}

function removeClientFromQueues(session: ClientSession) {
  let wasInImposter = false;
  for (const [mode, list] of duelQueues.entries()) {
    const remaining: QueuedEntry[] = [];
    for (const q of list) {
      if (q.session.playerId === session.playerId) {
        if (q.timeoutTimer) clearTimeout(q.timeoutTimer);
        if (mode === 'football-imposter') wasInImposter = true;
      } else {
        remaining.push(q);
      }
    }
    duelQueues.set(mode, remaining);
  }

  // If a player left the Imposter staging lobby, alert the remaining players
  if (wasInImposter) {
    const imposterList = duelQueues.get('football-imposter') || [];
    for (const q of imposterList) {
      send(q.session.socket, {
        type: 'queue_status',
        payload: {
          modeId: 'football-imposter',
          status: 'queued',
          elapsedSeconds: Math.floor((Date.now() - q.queuedAt) / 1000),
          queueType: 'ffa',
          joinedCount: imposterList.length,
          requiredCount: 3,
        },
      });
    }
  }
}

function handleLeaveParty(session: ClientSession) {
  if (!session.roomId) return;
  const roomId = session.roomId;
  const room = rooms.get(roomId);
  session.roomId = undefined;

  if (!room) return;

  const isMatchRoom = roomId.startsWith('match_') || room.visibility === 'public';

  if (room.currentGame?.status === 'in-game' || isMatchRoom) {
    if (room.currentGame) room.currentGame.status = 'lobby';
    for (const client of clients.values()) {
      if (client.roomId === roomId && client.playerId !== session.playerId && client.socket.readyState === WebSocket.OPEN) {
        send(client.socket, {
          type: 'player_forfeit',
          payload: {
            playerId: session.playerId,
            playerName: session.name,
            reason: `${session.name} disconnected from the match.`,
          },
        });
        if (isMatchRoom) {
          send(client.socket, {
            type: 'party_disbanded',
            payload: { reason: 'Opponent left. Match ended.' },
          });
        }
      }
    }
  }

  const wasHost = room.hostId === session.playerId;
  room.members = room.members.filter((m) => m.id !== session.playerId);

  if (room.members.length === 0 || wasHost || isMatchRoom) {
    rooms.delete(roomId);
    broadcastToRoom(roomId, {
      type: 'party_disbanded',
      payload: { reason: wasHost ? 'Party Host disbanded the squad.' : (isMatchRoom ? 'Match ended. Squad disbanded.' : 'All members left.') },
    });
    console.log(`[Added Time WS] Room ${roomId} disbanded.`);
  } else {
    broadcastToRoom(roomId, {
      type: 'party_updated',
      payload: { room },
    });
  }
}

function handleDisconnect(session: ClientSession) {
  removeClientFromQueues(session);
  if (session.roomId) {
    handleLeaveParty(session);
  }
}
