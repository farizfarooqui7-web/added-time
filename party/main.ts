import { Server, routePartykitRequest } from 'partyserver';
import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  PartyRoom,
  PartyMember,
  GlobalPresence,
} from '../src/types/wsProtocol';
import { PREMIER_LEAGUE_DECK } from '../src/data/decks';
import { generateLinkUpPuzzle } from '../src/games/link-up/puzzleEngine';
import { generateClubSequence } from '../src/games/record-books/recordBooksEngine';
import { pickSecretPlayer } from '../src/games/football-imposter/imposterEngine';
import { drawMatchPrompts } from '../src/games/side-netting/sideNettingEngine';

// ================= CONSTANTS & NORMALIZATION =================

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

function generateRandomRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

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
    console.error('[Added Time Match Engine] Failed to generate shared match data:', err);
  }

  return { sharedData, assignedRoles };
}

// ================= QUEUED ENTRY TYPE =================

interface QueuedClient {
  connectionId: string;
  playerId: string;
  name: string;
  modeId: string;
  queueType: 'duel' | 'ffa';
  queuedAt: number;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

// ================= MAIN CLOUDFLARE PARTYSERVER =================

export class TopBinsServer extends Server {
  // Global Matchmaker State (used when this.name === 'global-lobby')
  private duelQueues = new Map<string, QueuedClient[]>();
  private searchingPresence = new Map<string, number>();

  // Squad / Game Room State (used when this.name !== 'global-lobby')
  private partyRoom: PartyRoom | null = null;
  private connToPlayerId = new Map<string, string>(); // conn.id -> playerId

  // HTTP Endpoint (health checks & platform pings)
  override async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health' || url.pathname === '/' || url.pathname.endsWith('/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          edge: true,
          room: this.name,
          connections: [...this.getConnections()].length,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return new Response('Not Found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // ================= WEBSOCKET LIFECYCLE =================

  override async onConnect(conn: Connection, ctx: ConnectionContext) {
    const isGlobalLobby = this.name === 'global-lobby';

    if (isGlobalLobby) {
      // Send immediate presence snapshot to newly connected client
      this.sendToConn(conn, {
        type: 'presence_update',
        payload: { presence: this.computeGlobalPresence() },
      });
      return;
    }

    // Squad / Game Room: if party exists, send state
    if (this.partyRoom) {
      this.sendToConn(conn, {
        type: 'party_updated',
        payload: { room: this.partyRoom },
      });
    }
  }

  override async onMessage(sender: Connection, message: WSMessage) {
    if (typeof message !== 'string') return;

    try {
      const msg = JSON.parse(message) as ClientToServerMessage;
      const isGlobalLobby = this.name === 'global-lobby';

      if (isGlobalLobby) {
        this.handleGlobalLobbyMessage(sender, msg);
      } else {
        this.handleSquadRoomMessage(sender, msg);
      }
    } catch (err) {
      console.error('[PartyServer WS] Error handling message:', err);
      this.sendToConn(sender, {
        type: 'error',
        payload: { message: 'Invalid packet received' },
      });
    }
  }

  override async onClose(conn: Connection) {
    const isGlobalLobby = this.name === 'global-lobby';

    if (isGlobalLobby) {
      this.removeClientFromQueues(conn.id);
      this.broadcastGlobalPresence();
      return;
    }

    // Squad Room Disconnect Handler
    this.handleSquadPlayerDisconnect(conn);
  }

  // ================= GLOBAL LOBBY & MATCHMAKER =================

  private handleGlobalLobbyMessage(sender: Connection, msg: ClientToServerMessage) {
    switch (msg.type) {
      case 'join_queue': {
        const rawMode = msg.payload?.modeId || 'auction-draft';
        const normMode = normalizeModeId(rawMode);
        const queueType = msg.payload?.queueType || 'duel';
        const playerId = sender.id;
        const name = msg.payload?.playerName?.trim() || `BALLER_${playerId.slice(-3).toUpperCase()}`;

        // Remove from existing queues first
        this.removeClientFromQueues(sender.id);

        // ================= FOOTBALL IMPOSTER (NO BOTS, 3+ REAL PLAYERS) =================
        if (normMode === 'football-imposter') {
          const list = this.duelQueues.get('football-imposter') || [];
          list.push({
            connectionId: sender.id,
            playerId,
            name,
            modeId: normMode,
            queueType: 'ffa',
            queuedAt: Date.now(),
          });
          this.duelQueues.set('football-imposter', list);

          // If 3 or more real players have gathered in staging: launch ephemeral match!
          if (list.length >= 3) {
            const matchedClients = [...list];
            this.duelQueues.set('football-imposter', []);
            const ephemeralRoomId = `match_${generateRandomRoomId()}`;

            for (let i = 0; i < matchedClients.length; i++) {
              const c = matchedClients[i];
              const conn = this.getConnection(c.connectionId);
              if (conn) {
                this.sendToConn(conn, {
                  type: 'queue_status',
                  payload: {
                    modeId: normMode,
                    status: 'matched',
                    elapsedSeconds: 0,
                    queueType: 'ffa',
                  },
                });

                // Direct to target room
                this.sendToConn(conn, {
                  type: i === 0 ? 'party_created' : 'party_joined',
                  payload: {
                    room: {
                      roomId: ephemeralRoomId,
                      hostId: matchedClients[0].playerId,
                      maxSlots: 8,
                      visibility: 'public',
                      members: matchedClients.map((m, idx) => ({
                        id: m.playerId,
                        name: m.name,
                        isHost: idx === 0,
                        isReady: true,
                        avatarSeed: m.playerId,
                        joinedAt: Date.now(),
                      })),
                      currentGame: { modeId: normMode, status: 'in-game' },
                    },
                    myPlayerId: c.playerId,
                  },
                });

                this.sendToConn(conn, {
                  type: 'match_launched',
                  payload: { modeId: normMode, config: { isMultiplayer: true } },
                });
              }
            }

            console.log(`[PartyServer Matchmaker] Imposter match formed for ${matchedClients.length} players -> Room ${ephemeralRoomId}`);
            this.broadcastGlobalPresence();
            return;
          }

          // Under 3 players: broadcast staging counter
          for (const q of list) {
            const conn = this.getConnection(q.connectionId);
            if (conn) {
              this.sendToConn(conn, {
                type: 'queue_status',
                payload: {
                  modeId: 'football-imposter',
                  status: 'queued',
                  elapsedSeconds: Math.floor((Date.now() - q.queuedAt) / 1000),
                  queueType: 'ffa',
                  joinedCount: list.length,
                  requiredCount: 3,
                },
              });
            }
          }

          this.broadcastGlobalPresence();
          return;
        }

        // ================= 1v1 DUEL QUEUES (10.5s AI BOT FALLBACK) =================
        const qList = this.duelQueues.get(normMode) || [];
        const waiting = qList.shift();

        if (waiting) {
          if (waiting.timeoutTimer) clearTimeout(waiting.timeoutTimer);
          this.duelQueues.set(normMode, qList);

          const ephemeralRoomId = `match_${generateRandomRoomId()}`;
          const waitingConn = this.getConnection(waiting.connectionId);

          const member1: PartyMember = {
            id: waiting.playerId,
            name: waiting.name,
            isHost: true,
            isReady: true,
            avatarSeed: waiting.playerId,
            joinedAt: Date.now(),
          };

          const member2: PartyMember = {
            id: playerId,
            name,
            isHost: false,
            isReady: true,
            avatarSeed: playerId,
            joinedAt: Date.now(),
          };

          const ephemeralRoom: PartyRoom = {
            roomId: ephemeralRoomId,
            hostId: waiting.playerId,
            maxSlots: 2,
            visibility: 'public',
            members: [member1, member2],
            currentGame: { modeId: normMode, status: 'in-game' },
          };

          // Notify Player 1
          if (waitingConn) {
            this.sendToConn(waitingConn, {
              type: 'queue_status',
              payload: { modeId: normMode, status: 'matched', elapsedSeconds: 0, queueType },
            });
            this.sendToConn(waitingConn, {
              type: 'party_created',
              payload: { room: ephemeralRoom, myPlayerId: waiting.playerId },
            });
            this.sendToConn(waitingConn, {
              type: 'match_launched',
              payload: { modeId: normMode, config: { isMultiplayer: true } },
            });
          }

          // Notify Player 2
          this.sendToConn(sender, {
            type: 'queue_status',
            payload: { modeId: normMode, status: 'matched', elapsedSeconds: 0, queueType },
          });
          this.sendToConn(sender, {
            type: 'party_joined',
            payload: { room: ephemeralRoom, myPlayerId: playerId },
          });
          this.sendToConn(sender, {
            type: 'match_launched',
            payload: { modeId: normMode, config: { isMultiplayer: true } },
          });

          // Generate authoritative shared match data
          const { sharedData, assignedRoles } = generateAuthoritativeMatchData(normMode, ephemeralRoom.members);

          if (waitingConn) {
            this.sendToConn(waitingConn, {
              type: 'game_init',
              payload: {
                modeId: normMode,
                config: { isMultiplayer: true },
                sharedData,
                assignedRole: assignedRoles[waiting.playerId],
                myPlayerId: waiting.playerId,
              },
            });
          }

          this.sendToConn(sender, {
            type: 'game_init',
            payload: {
              modeId: normMode,
              config: { isMultiplayer: true },
              sharedData,
              assignedRole: assignedRoles[playerId],
              myPlayerId: playerId,
            },
          });

          console.log(`[PartyServer Matchmaker] Paired 1v1 ${waiting.name} vs ${name} in ${normMode} -> Room ${ephemeralRoomId}`);
          this.broadcastGlobalPresence();
          return;
        }

        // No waiting opponent: enqueue with 10.5 second AI bot fallback
        const timeoutTimer = setTimeout(() => {
          this.handleBotFallback(sender.id, playerId, name, normMode, queueType);
        }, 10500);

        qList.push({
          connectionId: sender.id,
          playerId,
          name,
          modeId: normMode,
          queueType,
          queuedAt: Date.now(),
          timeoutTimer,
        });

        this.duelQueues.set(normMode, qList);

        this.sendToConn(sender, {
          type: 'queue_status',
          payload: { modeId: normMode, status: 'queued', elapsedSeconds: 0, queueType },
        });

        console.log(`[PartyServer Matchmaker] ${name} entered queue for ${normMode} (${queueType})`);
        this.broadcastGlobalPresence();
        break;
      }

      case 'leave_queue': {
        this.removeClientFromQueues(sender.id);
        this.sendToConn(sender, {
          type: 'queue_status',
          payload: { modeId: '', status: 'idle', elapsedSeconds: 0 },
        });
        this.broadcastGlobalPresence();
        break;
      }
    }
  }

  private handleBotFallback(
    connectionId: string,
    playerId: string,
    name: string,
    normMode: string,
    queueType: 'duel' | 'ffa'
  ) {
    if (normMode === 'football-imposter') return;

    const qList = this.duelQueues.get(normMode) || [];
    const idx = qList.findIndex((q) => q.connectionId === connectionId);
    if (idx === -1) return;

    this.duelQueues.set(
      normMode,
      qList.filter((q) => q.connectionId !== connectionId)
    );

    const conn = this.getConnection(connectionId);
    if (!conn) return;

    const botName = BOT_USERNAMES[Math.floor(Math.random() * BOT_USERNAMES.length)];
    const botId = `bot_${Math.random().toString(36).substring(2, 8)}`;
    const ephemeralRoomId = `match_${generateRandomRoomId()}`;

    const member1: PartyMember = {
      id: playerId,
      name,
      isHost: true,
      isReady: true,
      avatarSeed: playerId,
      joinedAt: Date.now(),
    };

    const member2: PartyMember = {
      id: botId,
      name: botName,
      isHost: false,
      isReady: true,
      avatarSeed: botId,
      joinedAt: Date.now(),
    };

    const ephemeralRoom: PartyRoom = {
      roomId: ephemeralRoomId,
      hostId: playerId,
      maxSlots: 2,
      visibility: 'public',
      members: [member1, member2],
      currentGame: { modeId: normMode, status: 'in-game' },
    };

    console.log(`[PartyServer Matchmaker] 10s fallback for ${name} -> Pairing with bot ${botName}`);

    this.sendToConn(conn, {
      type: 'queue_status',
      payload: { modeId: normMode, status: 'timeout_bot', elapsedSeconds: 10, queueType },
    });

    this.sendToConn(conn, {
      type: 'party_created',
      payload: { room: ephemeralRoom, myPlayerId: playerId },
    });

    this.sendToConn(conn, {
      type: 'match_launched',
      payload: { modeId: normMode, config: { isMultiplayer: true } },
    });

    const { sharedData, assignedRoles } = generateAuthoritativeMatchData(normMode, ephemeralRoom.members);

    this.sendToConn(conn, {
      type: 'game_init',
      payload: {
        modeId: normMode,
        config: { isMultiplayer: true },
        sharedData,
        assignedRole: assignedRoles[playerId],
        myPlayerId: playerId,
      },
    });

    this.broadcastGlobalPresence();
  }

  private removeClientFromQueues(connectionId: string) {
    let wasInImposter = false;

    for (const [mode, list] of this.duelQueues.entries()) {
      const remaining: QueuedClient[] = [];
      for (const q of list) {
        if (q.connectionId === connectionId) {
          if (q.timeoutTimer) clearTimeout(q.timeoutTimer);
          if (mode === 'football-imposter') wasInImposter = true;
        } else {
          remaining.push(q);
        }
      }
      this.duelQueues.set(mode, remaining);
    }

    if (wasInImposter) {
      const imposterList = this.duelQueues.get('football-imposter') || [];
      for (const q of imposterList) {
        const conn = this.getConnection(q.connectionId);
        if (conn) {
          this.sendToConn(conn, {
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
  }

  private computeGlobalPresence(): GlobalPresence {
    const presence: GlobalPresence = {};
    for (const mode of CANONICAL_MODES) {
      const qList = this.duelQueues.get(mode) || [];
      presence[mode] = {
        searching: qList.length,
        inGame: 0,
      };
    }
    return presence;
  }

  private broadcastGlobalPresence() {
    const msg: ServerToClientMessage = {
      type: 'presence_update',
      payload: { presence: this.computeGlobalPresence() },
    };
    this.broadcast(JSON.stringify(msg));
  }

  // ================= SQUAD / GAME ROOMS =================

  private handleSquadRoomMessage(sender: Connection, msg: ClientToServerMessage) {
    const roomId = this.name;

    switch (msg.type) {
      case 'create_party': {
        const hostName = msg.payload?.hostName?.trim() || `BALLER_${sender.id.slice(-3).toUpperCase()}`;
        const playerId = sender.id;
        this.connToPlayerId.set(sender.id, playerId);

        const hostMember: PartyMember = {
          id: playerId,
          name: hostName,
          isHost: true,
          isReady: true,
          avatarSeed: 'host_' + playerId,
          joinedAt: Date.now(),
        };

        this.partyRoom = {
          roomId,
          hostId: playerId,
          maxSlots: msg.payload?.maxSlots || 4,
          visibility: msg.payload?.visibility || 'private',
          members: [hostMember],
        };

        console.log(`[TopBinsServer Room ${roomId}] Party created by ${hostName}`);

        this.sendToConn(sender, {
          type: 'party_created',
          payload: { room: this.partyRoom, myPlayerId: playerId },
        });
        break;
      }

      case 'join_party': {
        const playerName = msg.payload?.playerName?.trim() || `BALLER_${sender.id.slice(-3).toUpperCase()}`;
        const playerId = sender.id;
        this.connToPlayerId.set(sender.id, playerId);

        if (!this.partyRoom) {
          // Room does not exist yet: initialize with this sender as host
          const hostMember: PartyMember = {
            id: playerId,
            name: playerName,
            isHost: true,
            isReady: true,
            avatarSeed: 'host_' + playerId,
            joinedAt: Date.now(),
          };
          this.partyRoom = {
            roomId,
            hostId: playerId,
            maxSlots: 4,
            visibility: 'private',
            members: [hostMember],
          };

          this.sendToConn(sender, {
            type: 'party_created',
            payload: { room: this.partyRoom, myPlayerId: playerId },
          });
          return;
        }

        // Room exists: check capacity
        if (this.partyRoom.members.length >= this.partyRoom.maxSlots) {
          this.sendToConn(sender, {
            type: 'error',
            payload: { message: `Party [${roomId}] is currently full.` },
          });
          return;
        }

        // Check if member already present
        const existing = this.partyRoom.members.find((m) => m.id === playerId);
        if (!existing) {
          const newMember: PartyMember = {
            id: playerId,
            name: playerName,
            isHost: false,
            isReady: false,
            avatarSeed: 'guest_' + playerId,
            joinedAt: Date.now(),
          };
          this.partyRoom.members.push(newMember);
        }

        console.log(`[TopBinsServer Room ${roomId}] ${playerName} joined party`);

        this.sendToConn(sender, {
          type: 'party_joined',
          payload: { room: this.partyRoom, myPlayerId: playerId },
        });

        this.broadcastToRoom({
          type: 'party_updated',
          payload: { room: this.partyRoom },
        });
        break;
      }

      case 'toggle_ready': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom.members.find((m) => m.id === playerId);
        if (member) {
          member.isReady = !member.isReady;
          this.broadcastToRoom({
            type: 'party_updated',
            payload: { room: this.partyRoom },
          });
        }
        break;
      }

      case 'update_name': {
        const newName = msg.payload?.name?.trim();
        if (!newName || !this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom.members.find((m) => m.id === playerId);
        if (member) {
          member.name = newName;
          this.broadcastToRoom({
            type: 'party_updated',
            payload: { room: this.partyRoom },
          });
        }
        break;
      }

      case 'expand_slots': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        if (this.partyRoom.hostId !== playerId) return;

        const target = msg.payload?.newMax || Math.min(8, this.partyRoom.maxSlots + 2);
        if (target > this.partyRoom.maxSlots && target <= 8) {
          this.partyRoom.maxSlots = target;
          this.broadcastToRoom({
            type: 'party_updated',
            payload: { room: this.partyRoom },
          });
        }
        break;
      }

      case 'kick_member': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        if (this.partyRoom.hostId !== playerId) return;

        const kickTargetId = msg.payload?.memberId;
        if (!kickTargetId || kickTargetId === playerId) return;

        this.partyRoom.members = this.partyRoom.members.filter((m) => m.id !== kickTargetId);

        // Find connection for kicked target
        for (const [connId, pId] of this.connToPlayerId.entries()) {
          if (pId === kickTargetId) {
            const targetConn = this.getConnection(connId);
            if (targetConn) {
              this.sendToConn(targetConn, {
                type: 'party_kicked',
                payload: { reason: 'You were removed from the party by the host.' },
              });
            }
          }
        }

        this.broadcastToRoom({
          type: 'party_updated',
          payload: { room: this.partyRoom },
        });
        break;
      }

      case 'leave_party': {
        this.handleSquadPlayerDisconnect(sender);
        break;
      }

      case 'launch_match': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        if (this.partyRoom.hostId !== playerId) return;

        const { modeId, config } = msg.payload;
        const normMode = normalizeModeId(modeId);

        this.partyRoom.currentGame = {
          modeId: normMode,
          config,
          status: 'in-game',
        };

        console.log(`[TopBinsServer Room ${roomId}] Host launched match "${normMode}"`);

        this.broadcastToRoom({
          type: 'match_launched',
          payload: { modeId: normMode, config },
        });

        const { sharedData, assignedRoles } = generateAuthoritativeMatchData(normMode, this.partyRoom.members);

        for (const conn of this.getConnections()) {
          const pId = this.connToPlayerId.get(conn.id) || conn.id;
          this.sendToConn(conn, {
            type: 'game_init',
            payload: {
              modeId: normMode,
              config,
              sharedData,
              assignedRole: assignedRoles[pId],
              myPlayerId: pId,
            },
          });
        }
        break;
      }

      case 'game_action': {
        const { modeId, action, data } = msg.payload;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom?.members.find((m) => m.id === playerId);

        this.broadcastToRoom({
          type: 'game_event',
          payload: {
            modeId,
            event: action,
            data,
            senderId: playerId,
            senderName: member?.name || 'Player',
          },
        });
        break;
      }

      case 'game_leave': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom.members.find((m) => m.id === playerId);

        if (this.partyRoom.currentGame?.status === 'in-game') {
          this.partyRoom.currentGame.status = 'lobby';
          for (const conn of this.getConnections()) {
            if (conn.id !== sender.id) {
              this.sendToConn(conn, {
                type: 'player_forfeit',
                payload: {
                  playerId,
                  playerName: member?.name || 'Player',
                  reason: `${member?.name || 'Player'} forfeited the match.`,
                },
              });
            }
          }
        }
        break;
      }
    }
  }

  private handleSquadPlayerDisconnect(conn: Connection) {
    if (!this.partyRoom) return;
    const playerId = this.connToPlayerId.get(conn.id) || conn.id;
    const member = this.partyRoom.members.find((m) => m.id === playerId);
    this.connToPlayerId.delete(conn.id);

    // If game was active, inform others
    if (this.partyRoom.currentGame?.status === 'in-game') {
      this.partyRoom.currentGame.status = 'lobby';
      for (const otherConn of this.getConnections()) {
        if (otherConn.id !== conn.id) {
          this.sendToConn(otherConn, {
            type: 'player_forfeit',
            payload: {
              playerId,
              playerName: member?.name || 'Player',
              reason: `${member?.name || 'Player'} disconnected from the match.`,
            },
          });
        }
      }
    }

    const wasHost = this.partyRoom.hostId === playerId;
    this.partyRoom.members = this.partyRoom.members.filter((m) => m.id !== playerId);

    if (this.partyRoom.members.length === 0 || wasHost) {
      this.partyRoom = null;
      this.broadcastToRoom({
        type: 'party_disbanded',
        payload: { reason: wasHost ? 'Party Host disbanded the squad.' : 'All members left.' },
      });
      console.log(`[TopBinsServer Room ${this.name}] Squad disbanded.`);
    } else {
      this.broadcastToRoom({
        type: 'party_updated',
        payload: { room: this.partyRoom },
      });
    }
  }

  // Helper to send typed message to specific connection
  private sendToConn(conn: Connection, message: ServerToClientMessage) {
    conn.send(JSON.stringify(message));
  }

  // Helper to broadcast typed message to all connections in room
  private broadcastToRoom(message: ServerToClientMessage) {
    this.broadcast(JSON.stringify(message));
  }
}

// ================= DEFAULT EXPORT FETCH HANDLER =================

export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          edge: true,
          service: 'top-bins-partyserver',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return (
      (await routePartykitRequest(request, env)) ||
      new Response('Not Found', { status: 404 })
    );
  },
};
