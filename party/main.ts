import { Server, getServerByName, routePartykitRequest } from 'partyserver';
import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  PartyRoom,
  PartyMember,
  GlobalPresence,
} from '../src/types/wsProtocol';
import { getDeckById } from '../src/data/decks';
import { FORMATION_PRESETS } from '../src/games/auction-draft/formations';
import type { FormationId } from '../src/games/auction-draft/types';
import {
  AUCTION_QUICK_MATCH_DECKS,
  DEFAULT_FORMATION_ID,
  buildAuctionLotSequence,
  computePositionOffsets,
  pickRandom,
  resolveAuctionFormations,
  toFormationId,
} from './auctionMatch';
import { generateLinkUpPuzzle, randomizeSlotConfiguration } from '../src/games/link-up/puzzleEngine';
import { generateClubSequence, generateClubSequenceForSchedule } from '../src/games/record-books/recordBooksEngine';
import { QUICK_MATCH_ROUNDS, risingDifficultySchedule } from '../src/utils/quickMatchRules';
import type { MatchDifficulty } from '../src/utils/quickMatchRules';
import { pickSecretPlayer, isCorrectImposterGuess } from '../src/games/football-imposter/imposterEngine';
import type { ImposterCategory } from '../src/games/football-imposter/types';
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

const IMPOSTER_CATEGORIES: ImposterCategory[] = [
  'All Players',
  'All-Time Legends',
  'Modern Superstars',
  'Premier League Icons',
  'Cult Heroes',
];

// Quick Match Imposter: categories whose secret player is drawn from well-known players only
const IMPOSTER_QUICK_MATCH_CATEGORIES: ImposterCategory[] = [
  'All Players',
  'All-Time Legends',
  'Modern Superstars',
  'Premier League Icons',
];

// Imposter: how long the server waits for the caught imposter's final guess (client clock is 30s)
const IMPOSTER_LAST_STAND_MS = 33000;

function toDifficulty(value: unknown): MatchDifficulty {
  return value === 'Easy' || value === 'Hard' ? value : 'Medium';
}

function clampRounds(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 15 ? n : fallback;
}

function generateAuthoritativeMatchData(modeId: string, members: PartyMember[], config?: any) {
  const normMode = normalizeModeId(modeId);
  let sharedData: any = {};
  const assignedRoles: Record<string, any> = {};
  // Server-only match secrets (never sent until the match logic reveals them)
  let privateData: any = null;

  try {
    const rising = config?.difficultyCurve === 'rising';
    if (normMode === 'criteria-rush') {
      // Quick Match rises Easy → Hard; Squad games keep the host's setup
      const totalRounds = rising ? QUICK_MATCH_ROUNDS : clampRounds(config?.totalRounds, 10);
      const schedule = rising ? risingDifficultySchedule(totalRounds) : null;
      const baseSlots =
        Array.isArray(config?.slotTypes) && config.slotTypes.length === 3 ? config.slotTypes : ['Club', 'Nation', 'Position'];
      const puzzles = [];
      const usedSeeds = new Set<string>();
      for (let r = 1; r <= totalRounds; r++) {
        const slots = !rising && config?.randomizeSlotsEachRound ? randomizeSlotConfiguration() : baseSlots;
        const difficulty = schedule ? schedule[r - 1] : toDifficulty(config?.difficulty);
        const p = generateLinkUpPuzzle(r, difficulty, slots, usedSeeds);
        usedSeeds.add(p.seedPlayer.id);
        puzzles.push(p);
      }
      sharedData = { puzzles, totalRounds };
    } else if (normMode === 'tally-race') {
      const totalRounds = rising ? QUICK_MATCH_ROUNDS : clampRounds(config?.totalRounds, 10);
      const clubSequence = rising
        ? generateClubSequenceForSchedule(risingDifficultySchedule(totalRounds))
        : generateClubSequence(toDifficulty(config?.difficulty), totalRounds);
      sharedData = { clubSequence, totalRounds, metric: 'Goals' };
    } else if (normMode === 'football-imposter') {
      const category: ImposterCategory = IMPOSTER_CATEGORIES.includes(config?.category)
        ? config.category
        : 'All-Time Legends';
      const secret = pickSecretPlayer(category, Array.isArray(config?.usedSecretIds) ? config.usedSecretIds : [], {
        wellKnownOnly: Boolean(config?.wellKnownOnly),
      });
      const humans = members.filter((m) => !m.isBot);
      const imposterId = humans[Math.floor(Math.random() * humans.length)]?.id || members[0]?.id || 'imposter';

      sharedData = {
        secretPlayerCategory: secret.category,
        totalRounds: config?.clueRounds || 2,
      };
      privateData = { imposterId, secretPlayer: secret };

      // The imposter's dossier keeps the shape of a real secret player but carries only the
      // vague hint and bluff lines; the identity stays on the server until the last stand ends.
      const redacted = {
        ...secret,
        id: 'classified',
        name: '???',
        position: '???',
        nationality: '???',
        flagUrl: '',
        primaryClub: '???',
        crestUrl: '',
        careerClubs: [],
        crewClues: [],
      };

      for (const m of members) {
        if (m.id === imposterId) {
          assignedRoles[m.id] = {
            role: 'imposter',
            isImposter: true,
            secretPlayer: redacted,
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
      const totalRounds = rising ? QUICK_MATCH_ROUNDS : clampRounds(config?.roundCount, 10);
      const timerSeconds = [0, 30, 45, 60].includes(config?.timerSeconds) ? config.timerSeconds : 60;
      const promptResult = drawMatchPrompts(totalRounds, [], {
        difficulties: rising ? risingDifficultySchedule(totalRounds) : undefined,
      });
      sharedData = { prompts: promptResult.prompts, totalRounds, timerSeconds };
    } else if (normMode === 'auction-draft') {
      const deck = getDeckById(config?.deckId);
      const formations = resolveAuctionFormations(members, config);
      const formationIds = members.slice(0, 2).map((m) => formations[m.id]);
      const cards = buildAuctionLotSequence(deck, formationIds);
      const startingBidderId = members[Math.floor(Math.random() * members.length)]?.id || members[0]?.id;
      sharedData = { cards, totalRounds: 10, startingBidderId, formationsByPlayer: formations };
      // Mirrored formations already compare like for like; only asymmetric ones need normalising
      if (new Set(formationIds).size > 1) sharedData.positionOffsets = computePositionOffsets(deck);
    }
  } catch (err) {
    console.error('[Added Time Match Engine] Failed to generate shared match data:', err);
  }

  return { sharedData, assignedRoles, privateData };
}

function generateDefaultModeConfig(normMode: string, roomId: string): any {
  if (normMode === 'criteria-rush' || normMode === 'link-up') {
    return {
      lobbyMode: 'host',
      roomCode: roomId,
      isRoomCodeMasked: true,
      difficulty: 'Medium',
      slotTypes: ['Club', 'Nation', 'Position'],
      randomizeSlotsEachRound: false,
      totalRounds: 10,
      difficultyCurve: 'rising',
      isMultiplayer: true,
    };
  }
  if (normMode === 'tally-race' || normMode === 'record-books') {
    return {
      lobbyMode: 'host',
      roomCode: roomId,
      isRoomCodeMasked: true,
      metric: 'Goals',
      difficulty: 'Medium',
      totalRounds: 10,
      difficultyCurve: 'rising',
      isMultiplayer: true,
    };
  }
  if (normMode === 'side_netting') {
    return {
      roundCount: 10,
      timerSeconds: 60,
      difficultyCurve: 'rising',
      isMultiplayer: true,
    };
  }
  if (normMode === 'football-imposter') {
    return {
      lobbyMode: 'host',
      roomCode: roomId,
      isRoomCodeMasked: true,
      category: pickRandom(IMPOSTER_QUICK_MATCH_CATEGORIES),
      clueRounds: 2,
      botCount: 4,
      rolePreference: 'random',
      imposterClueEnabled: true,
      wellKnownOnly: true,
      isMultiplayer: true,
    };
  }
  return {
    formationId: DEFAULT_FORMATION_ID,
    deckId: pickRandom(AUCTION_QUICK_MATCH_DECKS),
    mode: 'host',
    roomCode: roomId,
    isRoomCodeMasked: true,
    isMultiplayer: true,
  };
}

// ================= SESSION LIFECYCLE CONSTANTS =================

// How long a dropped player keeps their seat before they are treated as having left.
const RECONNECT_GRACE_MS = 15000;
// How long a matchmade player has to open their socket to the match room.
const MATCH_JOIN_DEADLINE_MS = 20000;
// Recent relayed game events kept per match, replayed to (re)joining players.
const MAX_REPLAY_EVENTS = 300;
const EPHEMERAL_GAME_ACTIONS = new Set(['player_typing', 'imposter_reaction']);

// ================= QUEUED ENTRY TYPE =================

interface QueuedClient {
  connectionId: string;
  playerId: string;
  name: string;
  modeId: string;
  queueType: 'duel' | 'ffa';
  queuedAt: number;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  /** Auction: the formation this player picked before queueing. */
  formationId?: FormationId;
}

// ================= MATCH SESSION TYPES =================

interface MatchSession {
  matchId: string;
  modeId: string;
  config: any;
  sharedData: any;
  assignedRoles: Record<string, any>;
  /** Snapshot of who is in the match. Never shrinks when players drop or leave. */
  roster: PartyMember[];
  hostId: string;
  /** Server-only secrets (e.g. Imposter identity + secret footballer). */
  privateData: any;
  /** Football Imposter verdict bookkeeping (server-authoritative). */
  imposter?: {
    verdict?: { eliminatedId: string | null; caught: boolean };
    lastStandDone?: boolean;
  };
}

interface InitMatchRequest {
  modeId: string;
  config: any;
  roster: PartyMember[];
  hostId: string;
  maxSlots: number;
}

// ================= MAIN CLOUDFLARE PARTYSERVER =================

export class TopBinsServer extends Server {
  // Global Matchmaker State (used when this.name === 'global-lobby')
  private duelQueues = new Map<string, QueuedClient[]>();

  // Squad / Game Room State (used when this.name !== 'global-lobby')
  private partyRoom: PartyRoom | null = null;
  private connToPlayerId = new Map<string, string>(); // conn.id -> playerId
  private match: MatchSession | null = null;
  private recentEvents: ServerToClientMessage[] = [];
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private matchSeq = 0;
  private imposterLastStandTimer: ReturnType<typeof setTimeout> | null = null;

  // Our own registry of live sockets keyed by player id. Clients reuse a stable id across
  // reconnects, and the newest socket for an id always wins, so a late close from a stale
  // socket can never evict the player's fresh connection.
  private sockets = new Map<string, Connection>();

  // Unique id stamp for every relayed game event. The random nonce changes whenever this
  // Durable Object instance restarts, so ids never repeat even if the sequence resets.
  private eventNonce = Math.random().toString(36).slice(2, 10);
  private eventSeq = 0;

  // HTTP Endpoint (health checks & platform pings)
  override async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health' || url.pathname === '/' || url.pathname.endsWith('/health')) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          edge: true,
          room: this.name,
          connections: this.sockets.size,
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

  // ================= MATCH ROOM BOOTSTRAP (RPC from the matchmaker) =================

  /**
   * Called by the global-lobby matchmaker (Durable Object RPC, not reachable from clients)
   * before any player is told about the room. Builds the one authoritative match from the
   * real roster; every player then receives their own game_init when they join.
   */
  async initMatch(req: InitMatchRequest): Promise<{ matchId: string }> {
    const roster = req.roster.map((m) => ({ ...m }));

    this.partyRoom = {
      roomId: this.name,
      hostId: req.hostId,
      maxSlots: req.maxSlots,
      visibility: 'public',
      members: roster.map((m) => ({ ...m, isConnected: Boolean(m.isBot) })),
      currentGame: { modeId: req.modeId, config: req.config, status: 'in-game' },
    };
    this.startMatch(req.modeId, req.config, roster, req.hostId);

    // A matched player who never opens the room is treated as having left.
    for (const m of roster) {
      if (m.isBot) continue;
      this.scheduleRemoval(m.id, MATCH_JOIN_DEADLINE_MS);
    }

    console.log(`[TopBinsServer Room ${this.name}] Match initialized for ${roster.length} players (${req.modeId})`);
    return { matchId: this.match!.matchId };
  }

  // ================= WEBSOCKET LIFECYCLE =================

  override async onConnect(conn: Connection, _ctx: ConnectionContext) {
    this.sockets.set(conn.id, conn);

    if (this.isGlobalLobby()) {
      // Send immediate presence snapshot to newly connected client
      this.sendToConn(conn, {
        type: 'presence_update',
        payload: { presence: this.computeGlobalPresence() },
      });
      return;
    }

    // Squad rooms share their current state on connect. Match rooms only talk to
    // roster members, after they identify themselves with join_party / rejoin_party.
    if (this.partyRoom && !this.isMatchRoom()) {
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

      if (this.isGlobalLobby()) {
        await this.handleGlobalLobbyMessage(sender, msg);
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
    // A newer socket already took over this identity: ignore the stale close.
    if (this.sockets.get(conn.id) !== conn) return;
    this.sockets.delete(conn.id);

    if (this.isGlobalLobby()) {
      this.removeClientFromQueues(conn.id);
      this.broadcastGlobalPresence();
      return;
    }

    // Squad Room Disconnect Handler: hold the seat for a grace period
    this.handleSquadSocketClosed(conn.id);
  }

  // ================= GLOBAL LOBBY & MATCHMAKER =================

  private async handleGlobalLobbyMessage(sender: Connection, msg: ClientToServerMessage) {
    switch (msg.type) {
      case 'join_queue': {
        const rawMode = msg.payload?.modeId || 'auction-draft';
        const normMode = normalizeModeId(rawMode);
        const queueType = msg.payload?.queueType || 'duel';
        const playerId = sender.id;
        const name = msg.payload?.playerName?.trim() || `BALLER_${playerId.slice(-3).toUpperCase()}`;
        const formationId = toFormationId(msg.payload?.formationId) || undefined;

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
            await this.launchEphemeralMatch(normMode, matchedClients, null, 'ffa');
            this.broadcastGlobalPresence();
            return;
          }

          // Under 3 players: broadcast staging counter
          for (const q of list) {
            const conn = this.getLiveConnection(q.connectionId);
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

          const challenger: QueuedClient = {
            connectionId: sender.id,
            playerId,
            name,
            modeId: normMode,
            queueType,
            queuedAt: Date.now(),
            formationId,
          };
          await this.launchEphemeralMatch(normMode, [waiting, challenger], null, queueType);
          console.log(`[PartyServer Matchmaker] Paired 1v1 ${waiting.name} vs ${name} in ${normMode}`);
          this.broadcastGlobalPresence();
          return;
        }

        // No waiting opponent: enqueue with 10.5 second AI bot fallback
        const timeoutTimer = setTimeout(() => {
          void this.handleBotFallback(sender.id, normMode, queueType);
        }, 10500);

        qList.push({
          connectionId: sender.id,
          playerId,
          name,
          modeId: normMode,
          queueType,
          queuedAt: Date.now(),
          timeoutTimer,
          formationId,
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

  private async handleBotFallback(connectionId: string, normMode: string, queueType: 'duel' | 'ffa') {
    if (normMode === 'football-imposter') return;

    const qList = this.duelQueues.get(normMode) || [];
    const entry = qList.find((q) => q.connectionId === connectionId);
    if (!entry) return;

    this.duelQueues.set(
      normMode,
      qList.filter((q) => q.connectionId !== connectionId)
    );

    if (!this.getLiveConnection(connectionId)) return;

    const botName = BOT_USERNAMES[Math.floor(Math.random() * BOT_USERNAMES.length)];
    const botId = `bot_${Math.random().toString(36).substring(2, 8)}`;

    console.log(`[PartyServer Matchmaker] 10s fallback for ${entry.name} -> Pairing with bot ${botName}`);
    await this.launchEphemeralMatch(normMode, [entry], { id: botId, name: botName }, queueType);
    this.broadcastGlobalPresence();
  }

  /**
   * Creates an ephemeral match room, initializes it with the real roster over RPC, and only
   * then points every matched player at it. The lobby never sends game_init itself: each
   * player receives exactly one authoritative game_init from the match room they join.
   */
  private async launchEphemeralMatch(
    normMode: string,
    humans: QueuedClient[],
    bot: { id: string; name: string } | null,
    queueType: 'duel' | 'ffa'
  ) {
    const roomId = `match_${normMode}_${generateRandomRoomId()}`;
    const now = Date.now();
    const roster: PartyMember[] = humans.map((c, idx) => ({
      id: c.playerId,
      name: c.name,
      isHost: idx === 0,
      isReady: true,
      avatarSeed: c.playerId,
      joinedAt: now,
    }));
    if (bot) {
      roster.push({
        id: bot.id,
        name: bot.name,
        isHost: false,
        isReady: true,
        avatarSeed: bot.id,
        joinedAt: now,
        isBot: true,
      });
    }
    const hostId = roster[0].id;
    const maxSlots = normMode === 'football-imposter' ? 8 : 2;
    const config = generateDefaultModeConfig(normMode, roomId);
    if (normMode === 'auction-draft') {
      // Each player keeps their own formation; the bot picks one at random
      const formationIds = Object.keys(FORMATION_PRESETS) as FormationId[];
      const formationsByPlayer: Record<string, FormationId> = {};
      for (const c of humans) formationsByPlayer[c.playerId] = c.formationId || DEFAULT_FORMATION_ID;
      if (bot) formationsByPlayer[bot.id] = pickRandom(formationIds);
      config.formationsByPlayer = formationsByPlayer;
      config.formationId = formationsByPlayer[roster[0].id];
    }

    let matchId: string;
    try {
      const stub = (await getServerByName((this.env as any).Main, roomId)) as any;
      ({ matchId } = await stub.initMatch({ modeId: normMode, config, roster, hostId, maxSlots }));
    } catch (err) {
      console.error(`[PartyServer Matchmaker] Failed to initialize match room ${roomId}:`, err);
      for (const c of humans) {
        const conn = this.getLiveConnection(c.connectionId);
        if (!conn) continue;
        this.sendToConn(conn, { type: 'error', payload: { message: 'Matchmaking failed. Please queue again.' } });
        this.sendToConn(conn, { type: 'queue_status', payload: { modeId: '', status: 'idle', elapsedSeconds: 0 } });
      }
      return;
    }

    const room: PartyRoom = {
      roomId,
      hostId,
      maxSlots,
      visibility: 'public',
      members: roster,
      currentGame: { modeId: normMode, config, status: 'in-game' },
    };

    humans.forEach((c, idx) => {
      const conn = this.getLiveConnection(c.connectionId);
      if (!conn) return;
      this.sendToConn(conn, {
        type: 'queue_status',
        payload: {
          modeId: normMode,
          status: bot ? 'timeout_bot' : 'matched',
          elapsedSeconds: bot ? 10 : 0,
          queueType,
        },
      });
      this.sendToConn(conn, {
        type: idx === 0 ? 'party_created' : 'party_joined',
        payload: { room, myPlayerId: c.playerId },
      });
      this.sendToConn(conn, {
        type: 'match_launched',
        payload: { modeId: normMode, config, roster, hostId, matchId },
      });
    });

    console.log(`[PartyServer Matchmaker] ${normMode} match formed for ${roster.length} players -> Room ${roomId}`);
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
        const conn = this.getLiveConnection(q.connectionId);
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
    this.broadcastToRoom({
      type: 'presence_update',
      payload: { presence: this.computeGlobalPresence() },
    });
  }

  // ================= SQUAD / GAME ROOMS =================

  private handleSquadRoomMessage(sender: Connection, msg: ClientToServerMessage) {
    const roomId = this.name;

    switch (msg.type) {
      case 'create_party': {
        if (this.isMatchRoom()) return;
        const hostName = msg.payload?.hostName?.trim() || `BALLER_${sender.id.slice(-3).toUpperCase()}`;

        // Never hijack a live party that happens to share the client-generated code
        if (this.partyRoom && this.partyRoom.members.some((m) => m.id !== sender.id && !m.isBot)) {
          this.sendToConn(sender, {
            type: 'party_disbanded',
            payload: { reason: `Party code [${roomId}] is already in use. Please host again.` },
          });
          return;
        }

        this.createSquad(sender, hostName, msg.payload?.maxSlots || 4, msg.payload?.visibility || 'private');
        break;
      }

      case 'join_party':
      case 'rejoin_party': {
        if (this.isMatchRoom()) {
          this.handleMatchRoomJoin(sender);
          return;
        }

        const isRejoin = msg.type === 'rejoin_party';
        const rejoin = isRejoin ? msg.payload : undefined;
        const playerName = msg.payload?.playerName?.trim() || `BALLER_${sender.id.slice(-3).toUpperCase()}`;
        const playerId = sender.id;

        if (!this.partyRoom) {
          // The room's state is gone (everyone left, or the server restarted). A returning
          // host re-opens the same code; anyone else is told the party no longer exists.
          if (rejoin?.wasHost) {
            this.createSquad(sender, playerName, rejoin.maxSlots || 4, rejoin.visibility || 'private');
            return;
          }
          this.sendToConn(sender, {
            type: 'party_disbanded',
            payload: { reason: isRejoin ? 'Your party is no longer active.' : `Party [${roomId}] was not found.` },
          });
          return;
        }

        const existing = this.partyRoom.members.find((m) => m.id === playerId);
        if (existing) {
          this.reattachMember(sender, existing);
        } else {
          if (this.partyRoom.members.length >= this.partyRoom.maxSlots) {
            this.sendToConn(sender, {
              type: 'party_disbanded',
              payload: { reason: `Party [${roomId}] is currently full.` },
            });
            return;
          }
          this.partyRoom.members.push({
            id: playerId,
            name: playerName,
            isHost: false,
            isReady: false,
            avatarSeed: 'guest_' + playerId,
            joinedAt: Date.now(),
            isConnected: true,
          });
          this.connToPlayerId.set(sender.id, playerId);
          console.log(`[TopBinsServer Room ${roomId}] ${playerName} joined party`);
        }

        this.sendToConn(sender, {
          type: 'party_joined',
          payload: { room: this.partyRoom, myPlayerId: playerId },
        });

        // Back into a match that is still running?
        if (this.isInActiveMatch(playerId)) {
          if (rejoin && rejoin.resumeMatch === false) {
            // The client lost its match state (e.g. page refresh): count it as leaving the match.
            this.forfeitFromMatch(playerId, 'left the match');
          } else {
            this.sendGameInit(sender);
            this.replayRecentEvents(sender);
          }
        }

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

      case 'set_member_prefs': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom.members.find((m) => m.id === playerId);
        const formationId = toFormationId(msg.payload?.formationId);
        if (member && formationId && member.formationId !== formationId) {
          member.formationId = formationId;
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

      case 'party_setup_sync': {
        if (!this.partyRoom) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        if (this.partyRoom.hostId !== playerId) return;

        const { modeId, settings } = msg.payload || {};
        if (!modeId || !settings) return;

        if (!(this.partyRoom as any).pendingSetup) {
          (this.partyRoom as any).pendingSetup = {};
        }
        (this.partyRoom as any).pendingSetup[modeId] = settings;

        this.broadcastToRoom({
          type: 'party_setup_update',
          payload: { modeId, settings },
        });
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
        this.cancelRemoval(kickTargetId);

        const targetConn = this.getLiveConnection(kickTargetId);
        if (targetConn) {
          this.sendToConn(targetConn, {
            type: 'party_kicked',
            payload: { reason: 'You were removed from the party by the host.' },
          });
        }

        this.broadcastToRoom({
          type: 'party_updated',
          payload: { room: this.partyRoom },
        });
        break;
      }

      case 'leave_party': {
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        this.removeMember(playerId, 'left');
        break;
      }

      case 'launch_match': {
        if (!this.partyRoom || this.isMatchRoom()) return;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        if (this.partyRoom.hostId !== playerId) return;

        const { modeId } = msg.payload;
        const normMode = normalizeModeId(modeId);
        let config: any = msg.payload.config;
        if (normMode === 'auction-draft') {
          // Squad Auction: every member drafts into the formation they picked themselves
          const hostFormation = toFormationId(config?.formationId) || DEFAULT_FORMATION_ID;
          const formationsByPlayer: Record<string, FormationId> = {};
          for (const m of this.partyRoom.members) {
            formationsByPlayer[m.id] = m.id === playerId ? hostFormation : toFormationId(m.formationId) || hostFormation;
          }
          config = { ...(config || {}), formationsByPlayer };
        }

        this.partyRoom.currentGame = {
          modeId: normMode,
          config,
          status: 'in-game',
        };

        const roster = this.partyRoom.members.map((m) => ({ ...m }));
        const match = this.startMatch(normMode, config, roster, this.partyRoom.hostId);

        console.log(`[TopBinsServer Room ${roomId}] Host launched match "${normMode}" for ${roster.length} players`);

        this.broadcastToRoom({
          type: 'match_launched',
          payload: { modeId: normMode, config, roster: match.roster, hostId: match.hostId, matchId: match.matchId },
        });

        for (const conn of this.liveConnections()) {
          const pId = this.connToPlayerId.get(conn.id) || conn.id;
          if (match.roster.some((m) => m.id === pId)) this.sendGameInit(conn);
        }
        break;
      }

      case 'game_action': {
        const { modeId, action, data } = msg.payload;
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom?.members.find((m) => m.id === playerId);

        if (action === 'match_restart') {
          this.handleRematchRequest(playerId);
          break;
        }
        if (this.handleImposterAction(playerId, action, data)) break;

        const event: ServerToClientMessage = {
          type: 'game_event',
          payload: {
            modeId,
            event: action,
            data,
            senderId: playerId,
            senderName: member?.name || 'Player',
            _eventId: `${this.eventNonce}-${++this.eventSeq}`,
          },
        };

        // Typing pings and floating reactions are ephemeral: never replay them on rejoin
        if (this.match && !EPHEMERAL_GAME_ACTIONS.has(action)) {
          this.recentEvents.push(event);
          if (this.recentEvents.length > MAX_REPLAY_EVENTS) {
            this.recentEvents.splice(0, this.recentEvents.length - MAX_REPLAY_EVENTS);
          }
        }

        this.broadcastToRoom(event);
        break;
      }

      case 'game_leave': {
        const isMatchRoom = this.isMatchRoom();
        const playerId = this.connToPlayerId.get(sender.id) || sender.id;
        const member = this.partyRoom?.members.find((m) => m.id === playerId);

        for (const conn of this.liveConnections()) {
          if (conn.id !== sender.id) {
            this.sendToConn(conn, {
              type: 'player_forfeit',
              payload: {
                playerId,
                playerName: member?.name || 'Opponent',
                reason: `${member?.name || 'Opponent'} forfeited the match.`,
              },
            });
            if (isMatchRoom) {
              this.sendToConn(conn, {
                type: 'party_disbanded',
                payload: { reason: 'Opponent forfeited. Match terminated.' },
              });
            }
          }
        }
        if (this.partyRoom?.currentGame) {
          this.partyRoom.currentGame.status = 'lobby';
        }
        this.endMatch();
        if (isMatchRoom) {
          this.closeRoom();
        }
        break;
      }
    }
  }

  // ================= ROOM / MATCH HELPERS =================

  private isGlobalLobby() {
    return this.name === 'global-lobby';
  }

  private isMatchRoom() {
    return this.name.startsWith('match_');
  }

  private createSquad(sender: Connection, hostName: string, maxSlots: number, visibility: 'private' | 'public') {
    const playerId = sender.id;
    this.connToPlayerId.set(sender.id, playerId);
    this.cancelAllRemovals();
    this.endMatch();

    this.partyRoom = {
      roomId: this.name,
      hostId: playerId,
      maxSlots,
      visibility,
      members: [
        {
          id: playerId,
          name: hostName,
          isHost: true,
          isReady: true,
          avatarSeed: 'host_' + playerId,
          joinedAt: Date.now(),
          isConnected: true,
        },
      ],
    };

    console.log(`[TopBinsServer Room ${this.name}] Party created by ${hostName}`);

    this.sendToConn(sender, {
      type: 'party_created',
      payload: { room: this.partyRoom, myPlayerId: playerId },
    });
  }

  private startMatch(modeId: string, config: any, roster: PartyMember[], hostId: string): MatchSession {
    const { sharedData, assignedRoles, privateData } = generateAuthoritativeMatchData(modeId, roster, config);
    this.clearImposterTimer();
    this.match = {
      matchId: `${this.eventNonce}-m${++this.matchSeq}`,
      modeId,
      config,
      sharedData,
      assignedRoles,
      roster,
      hostId,
      privateData,
      imposter: modeId === 'football-imposter' ? {} : undefined,
    };
    this.recentEvents = [];
    return this.match;
  }

  private endMatch() {
    this.clearImposterTimer();
    this.match = null;
    this.recentEvents = [];
  }

  private clearImposterTimer() {
    if (this.imposterLastStandTimer) clearTimeout(this.imposterLastStandTimer);
    this.imposterLastStandTimer = null;
  }

  /**
   * Rematch: only the host may ask. The server re-seeds a brand-new match for the same
   * roster, sends every member their new game_init, then tells everyone to restart, so all
   * clients replay identical content instead of each generating their own.
   */
  private handleRematchRequest(playerId: string) {
    const match = this.match;
    if (!match || playerId !== match.hostId) return;

    const prevSecretId = match.privateData?.secretPlayer?.id;
    const config =
      match.modeId === 'football-imposter' && prevSecretId
        ? { ...match.config, usedSecretIds: [...(match.config?.usedSecretIds || []), prevSecretId] }
        : match.config;

    const next = this.startMatch(match.modeId, config, match.roster, match.hostId);
    if (this.partyRoom?.currentGame) {
      this.partyRoom.currentGame.status = 'in-game';
    }

    for (const conn of this.liveConnections()) {
      const pId = this.connToPlayerId.get(conn.id) || conn.id;
      if (next.roster.some((m) => m.id === pId)) this.sendGameInit(conn);
    }
    this.broadcastServerEvent('match_restart', { matchId: next.matchId });
    console.log(`[TopBinsServer Room ${this.name}] Rematch seeded (${next.modeId})`);
  }

  /** Relays a server-originated game event to the whole room (and keeps it for replay). */
  private broadcastServerEvent(event: string, data: any) {
    if (!this.match) return;
    const msg: ServerToClientMessage = {
      type: 'game_event',
      payload: {
        modeId: this.match.modeId,
        event,
        data,
        senderId: 'server',
        senderName: 'SERVER',
        _eventId: `${this.eventNonce}-${++this.eventSeq}`,
      },
    };
    this.recentEvents.push(msg);
    if (this.recentEvents.length > MAX_REPLAY_EVENTS) {
      this.recentEvents.splice(0, this.recentEvents.length - MAX_REPLAY_EVENTS);
    }
    this.broadcastToRoom(msg);
  }

  /**
   * Football Imposter verdicts are decided here, because only the server knows who the
   * imposter is and who the secret footballer is. Returns true when the action was consumed.
   */
  private handleImposterAction(playerId: string, action: string, data: any): boolean {
    const match = this.match;
    if (!match || match.modeId !== 'football-imposter' || !match.privateData || !match.imposter) return false;
    const { imposterId, secretPlayer } = match.privateData;
    const state = match.imposter;

    if (action === 'imposter_verdict_request') {
      // First request wins; every client adopts the server's verdict
      if (state.verdict) return true;
      const eliminatedId: string | null =
        typeof data?.eliminatedId === 'string' && match.roster.some((m) => m.id === data.eliminatedId)
          ? data.eliminatedId
          : null;
      const caught = eliminatedId !== null && eliminatedId === imposterId;
      state.verdict = { eliminatedId, caught };

      this.broadcastServerEvent('imposter_verdict', {
        eliminatedId,
        caught,
        imposterId,
        // The secret footballer is only revealed once the imposter can no longer use it
        secretPlayer: caught ? undefined : secretPlayer,
      });

      if (caught) {
        this.clearImposterTimer();
        this.imposterLastStandTimer = setTimeout(() => {
          this.imposterLastStandTimer = null;
          this.resolveImposterLastStand('NO GUESS');
        }, IMPOSTER_LAST_STAND_MS);
      }
      return true;
    }

    if (action === 'imposter_last_stand_guess') {
      if (playerId !== imposterId) return true;
      this.resolveImposterLastStand(typeof data?.guess === 'string' ? data.guess : '');
      return true;
    }

    return false;
  }

  private resolveImposterLastStand(rawGuess: string) {
    const match = this.match;
    const state = match?.imposter;
    if (!match || !state?.verdict?.caught || state.lastStandDone) return;
    state.lastStandDone = true;
    this.clearImposterTimer();

    const guess = rawGuess.trim().slice(0, 80) || 'NO GUESS';
    const correct = guess !== 'NO GUESS' && isCorrectImposterGuess(guess, match.privateData.secretPlayer);
    this.broadcastServerEvent('imposter_last_stand_result', {
      guess,
      correct,
      secretPlayer: match.privateData.secretPlayer,
    });
  }

  private closeRoom() {
    this.cancelAllRemovals();
    this.partyRoom = null;
    this.endMatch();
  }

  private isInActiveMatch(playerId: string) {
    return Boolean(
      this.match &&
        this.partyRoom?.currentGame?.status === 'in-game' &&
        this.match.roster.some((m) => m.id === playerId)
    );
  }

  /** Match rooms only admit roster members, and resume them with their own game_init. */
  private handleMatchRoomJoin(sender: Connection) {
    const playerId = sender.id;
    const match = this.match;
    const room = this.partyRoom;

    if (!match || !room) {
      this.sendToConn(sender, { type: 'party_disbanded', payload: { reason: 'This match has already ended.' } });
      return;
    }
    if (!match.roster.some((m) => m.id === playerId && !m.isBot)) {
      this.sendToConn(sender, { type: 'party_disbanded', payload: { reason: 'You are not part of this match.' } });
      return;
    }
    const member = room.members.find((m) => m.id === playerId);
    if (!member) {
      this.sendToConn(sender, { type: 'party_disbanded', payload: { reason: 'You already left this match.' } });
      return;
    }

    this.reattachMember(sender, member);
    this.sendToConn(sender, {
      type: 'party_joined',
      payload: { room, myPlayerId: playerId },
    });
    this.sendGameInit(sender);
    this.replayRecentEvents(sender);
    this.broadcastToRoom({
      type: 'party_updated',
      payload: { room },
    });
  }

  private reattachMember(sender: Connection, member: PartyMember) {
    this.cancelRemoval(member.id);
    this.connToPlayerId.set(sender.id, member.id);
    member.isConnected = true;
  }

  private sendGameInit(conn: Connection) {
    const match = this.match;
    if (!match) return;
    const playerId = this.connToPlayerId.get(conn.id) || conn.id;
    this.sendToConn(conn, {
      type: 'game_init',
      payload: {
        modeId: match.modeId,
        config: match.config,
        sharedData: match.sharedData,
        assignedRole: match.assignedRoles[playerId],
        myPlayerId: playerId,
        roster: match.roster,
        hostId: match.hostId,
        matchId: match.matchId,
      },
    });
  }

  /** Re-sends this match's recent events; clients de-duplicate by _eventId. */
  private replayRecentEvents(conn: Connection) {
    for (const event of this.recentEvents) {
      this.sendToConn(conn, event);
    }
  }

  private handleSquadSocketClosed(connId: string) {
    const playerId = this.connToPlayerId.get(connId) || connId;
    this.connToPlayerId.delete(connId);

    const member = this.partyRoom?.members.find((m) => m.id === playerId);
    if (!member || !this.partyRoom) return;

    member.isConnected = false;
    this.broadcastToRoom({
      type: 'party_updated',
      payload: { room: this.partyRoom },
    });
    this.scheduleRemoval(playerId, RECONNECT_GRACE_MS);
  }

  private scheduleRemoval(playerId: string, delayMs: number) {
    this.cancelRemoval(playerId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      if (this.getLiveConnection(playerId)) return; // came back in time
      this.removeMember(playerId, 'disconnected');
    }, delayMs);
    this.disconnectTimers.set(playerId, timer);
  }

  private cancelRemoval(playerId: string) {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(playerId);
  }

  private cancelAllRemovals() {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
  }

  /** A squad member left the running match but stays in the squad. */
  private forfeitFromMatch(playerId: string, reasonVerb: string) {
    const member = this.partyRoom?.members.find((m) => m.id === playerId);
    if (this.partyRoom?.currentGame) {
      this.partyRoom.currentGame.status = 'lobby';
    }
    this.endMatch();
    for (const otherConn of this.liveConnections()) {
      if (otherConn.id === playerId) continue;
      this.sendToConn(otherConn, {
        type: 'player_forfeit',
        payload: {
          playerId,
          playerName: member?.name || 'Opponent',
          reason: `${member?.name || 'Opponent'} ${reasonVerb}.`,
        },
      });
    }
  }

  /** Removes a member for good: explicit leave, or reconnect grace expired. */
  private removeMember(playerId: string, cause: 'left' | 'disconnected') {
    this.cancelRemoval(playerId);
    if (!this.partyRoom) return;

    const member = this.partyRoom.members.find((m) => m.id === playerId);
    if (!member) return;

    const isMatchRoom = this.isMatchRoom();

    // If game was active, inform others
    const isInGame = this.partyRoom.currentGame?.status === 'in-game' || isMatchRoom;
    if (isInGame) {
      this.forfeitFromMatch(playerId, cause === 'left' ? 'left the match' : 'disconnected from the match');
    }

    const wasHost = this.partyRoom.hostId === playerId;
    this.partyRoom.members = this.partyRoom.members.filter((m) => m.id !== playerId);
    const humansLeft = this.partyRoom.members.filter((m) => !m.isBot).length;

    if (humansLeft === 0 || wasHost || isMatchRoom) {
      this.closeRoom();
      this.broadcastToRoom({
        type: 'party_disbanded',
        payload: { reason: wasHost ? 'Party Host disbanded the squad.' : (isMatchRoom ? 'Match ended. Squad disbanded.' : 'All members left.') },
      });
      console.log(`[TopBinsServer Room ${this.name}] Squad ended.`);
    } else {
      this.broadcastToRoom({
        type: 'party_updated',
        payload: { room: this.partyRoom },
      });
    }
  }

  // ================= SOCKET HELPERS =================

  private getLiveConnection(id: string): Connection | undefined {
    const conn = this.sockets.get(id);
    return conn && conn.readyState === 1 ? conn : undefined;
  }

  private *liveConnections(): Generator<Connection> {
    for (const conn of this.sockets.values()) {
      if (conn.readyState === 1) yield conn;
    }
  }

  // Helper to send typed message to specific connection
  private sendToConn(conn: Connection, message: ServerToClientMessage) {
    try {
      conn.send(JSON.stringify(message));
    } catch (err) {
      console.error('[PartyServer WS] Failed to send message:', err);
    }
  }

  // Helper to broadcast typed message to all connections in room
  private broadcastToRoom(message: ServerToClientMessage) {
    const raw = JSON.stringify(message);
    for (const conn of this.liveConnections()) {
      try {
        conn.send(raw);
      } catch {
        // socket is closing; its onClose will clean up
      }
    }
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
