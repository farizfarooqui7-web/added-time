import { getStats, type MatchOutcome } from './stats';

/**
 * Post-match share cards ("the Wordle effect"): short emoji summaries players paste into group chats.
 * Builders read the streak at share time, after the arena has already recorded the match.
 */

export const SITE_URL = 'https://added-time.vercel.app';

const head = (game: string) => `Added Time [90+] ⚽ ${game}`;

const verdict = (outcome: MatchOutcome, us: string | number, them: string | number) =>
  outcome === 'win' ? `🏆 WON ${us}–${them}` : outcome === 'loss' ? `💀 LOST ${us}–${them}` : `🤝 DRAW ${us}–${them}`;

const streakTag = () => {
  const s = getStats().streak;
  return s > 0 ? `🔥 Streak: ${s}` : null;
};

const join = (lines: Array<string | null | false | undefined>) => lines.filter(Boolean).join('\n');
const statLine = (parts: Array<string | null | false | undefined>) => parts.filter(Boolean).join(' | ') || null;

// ---------------------------------------------------------------- Link-Up
export type LinkUpRoundMark = 'verified' | 'partial' | 'miss' | 'skip';
const LINK_EMOJI: Record<LinkUpRoundMark, string> = { verified: '🟩', partial: '🟨', miss: '🟥', skip: '⬛' };

export function linkUpShareText(o: {
  outcome: MatchOutcome;
  userScore: number;
  opponentScore: number;
  opponentName: string;
  rounds: LinkUpRoundMark[];
  fastestLock?: number;
}) {
  const verified = o.rounds.filter((r) => r === 'verified').length;
  return join([
    head('The Link-Up'),
    `${verdict(o.outcome, o.userScore, o.opponentScore)} vs ${o.opponentName}`,
    o.rounds.map((r) => LINK_EMOJI[r]).join(''),
    statLine([
      `⚡ ${verified}/${o.rounds.length} links verified`,
      o.fastestLock !== undefined && `⏱️ Fastest: ${o.fastestLock.toFixed(1)}s`,
      streakTag(),
    ]),
    `Can you beat me? 👉 ${SITE_URL}`,
  ]);
}

// ---------------------------------------------------------------- Auction Draft
const POS_EMOJI: Record<string, string> = { GK: '🧤', DEF: '🛡️', MID: '🎯', ATK: '⚡' };

export function auctionShareText(o: {
  outcome: MatchOutcome;
  rating: number;
  opponentRating: number;
  bankLeft: number;
  squad: Array<{ position: string; name: string; cost?: number }>;
}) {
  return join([
    head('$20 Auction Draft'),
    `${verdict(o.outcome, o.rating.toFixed(1), o.opponentRating.toFixed(1))} squad OVR`,
    ...o.squad.map(
      (p) => `${POS_EMOJI[p.position] ?? '•'} ${p.position} ${p.name}${p.cost !== undefined ? ` ($${p.cost})` : ''}`
    ),
    statLine([`💰 $${o.bankLeft} left in the bank`, streakTag()]),
    `Can you beat my squad? 👉 ${SITE_URL}`,
  ]);
}

// ---------------------------------------------------------------- Record Books
export function recordBooksShareText(o: {
  outcome: MatchOutcome;
  userTotal: number;
  opponentTotal: number;
  opponentName: string;
  unit: string;
  /** Per club: did you outscore your rival on it? */
  rounds: Array<'win' | 'loss' | 'draw'>;
}) {
  const roundEmoji = { win: '🟩', loss: '🟥', draw: '🟨' } as const;
  const clubsWon = o.rounds.filter((r) => r === 'win').length;
  return join([
    head('The Record Books'),
    `${verdict(o.outcome, o.userTotal, o.opponentTotal)} ${o.unit} vs ${o.opponentName}`,
    o.rounds.map((r) => roundEmoji[r]).join(''),
    statLine([`📚 Won ${clubsWon}/${o.rounds.length} clubs`, streakTag()]),
    `Know your club's scorers? 👉 ${SITE_URL}`,
  ]);
}

// ---------------------------------------------------------------- Football Imposter
export function imposterShareText(o: { wasImposter: boolean; won: boolean; secretName: string; players: number }) {
  const story = o.wasImposter
    ? o.won
      ? '😈 I was the IMPOSTER and got away with it'
      : '🚨 I was the IMPOSTER… and got caught'
    : o.won
    ? '🔎 We caught the imposter'
    : '🕵️ The imposter fooled us all';
  return join([
    head('Football Imposter'),
    story,
    `🤫 Secret player: ${o.secretName}`,
    statLine([`👥 ${o.players} players`, streakTag()]),
    `Can you spot the imposter? 👉 ${SITE_URL}`,
  ]);
}

// ---------------------------------------------------------------- Side Netting
const DEPTH_EMOJI: Record<string, string> = {
  Miss: '⬛',
  'Tap-In': '🟥',
  'Starter XI': '🟧',
  'Cult Hero': '🟨',
  "Streets Won't Forget": '🟩',
  "Ballon d'Or Knowledge": '🟪',
};

export function sideNettingShareText(o: {
  outcome: MatchOutcome;
  score: number;
  opponentScore?: number;
  opponentName?: string;
  rounds: string[]; // tier per round
}) {
  const deepCuts = o.rounds.filter((t) => t === "Streets Won't Forget" || t === "Ballon d'Or Knowledge").length;
  return join([
    head('Side Netting'),
    o.outcome === 'solo'
      ? `🎯 ${o.score} pts • ${o.rounds.length} rounds`
      : `${verdict(o.outcome, `${o.score} pts`, o.opponentScore ?? 0)}${o.opponentName ? ` vs ${o.opponentName}` : ''}`,
    o.rounds.map((t) => DEPTH_EMOJI[t] ?? '⬛').join(''),
    statLine([`🕳️ ${deepCuts} deep cut${deepCuts === 1 ? '' : 's'}`, streakTag()]),
    `How obscure can you go? 👉 ${SITE_URL}`,
  ]);
}

// ---------------------------------------------------------------- Delivery
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Phones get the native share sheet (WhatsApp, iMessage…); desktops copy to the clipboard. */
export async function shareResult(text: string): Promise<ShareResult> {
  const isTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (isTouch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // Share sheet unavailable: fall back to copying
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    // Clipboard API blocked (http, old browsers): legacy copy
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok ? 'copied' : 'failed';
}
