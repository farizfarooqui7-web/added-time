import type { PlayerEraCardExtended } from '../../types';
import type { ManagerState } from './types';
import { canManagerAcceptCard } from './formations';

export interface BotDecision {
  shouldBid: boolean;
  bidAmount?: number;
  delayMs?: number;
  reason: 'position-filled' | 'bankrupt' | 'already-high' | 'overpriced' | 'outbid-capacity' | 'bidding' | 'folded';
}

/**
 * Intelligent bidding decision engine for "The Gaffer" [AI].
 */
export function evaluateBotBid(
  botState: ManagerState,
  userState: ManagerState,
  lot?: PlayerEraCardExtended | null,
  currentBid: number = 0,
  highBidderId: string | null = null
): BotDecision {
  if (!lot || !lot.positions) {
    return { shouldBid: false, reason: 'folded' };
  }
  // Pure accounting: Bankroll = 20 - sum of won slot costs
  const botSpent = botState.slots.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  const botBankroll = Math.max(0, 20 - botSpent);
  const userSpent = userState.slots.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  const userBankroll = Math.max(0, 20 - userSpent);

  // 1. Check if bot has already folded on this lot
  if (botState.hasFolded) {
    return { shouldBid: false, reason: 'folded' };
  }

  // 2. Can bot accept this position?
  if (!canManagerAcceptCard(botState.slots, lot)) {
    return { shouldBid: false, reason: 'position-filled' };
  }

  // 3. Bankrupt check
  if (botBankroll <= 0) {
    return { shouldBid: false, reason: 'bankrupt' };
  }

  // 4. Already holding the high bid
  if (highBidderId === botState.id) {
    return { shouldBid: false, reason: 'already-high' };
  }

  const minNextBid = currentBid === 0 ? 1 : currentBid + 1;

  // 5. Check if next minimum bid exceeds bankroll
  if (minNextBid > botBankroll) {
    return { shouldBid: false, reason: 'outbid-capacity' };
  }

  // 6. Valuation calculation
  const baseValue = lot.auctionBasePrice ?? lot.basePrice ?? 4;
  const emptySlotsCount = botState.slots.filter((s) => !s.filledPlayer).length;
  
  // Need urgency: if only 1 slot left for this position, willingness increases
  const urgencyBonus = emptySlotsCount === 1 ? 2 : emptySlotsCount === 2 ? 1 : 0;

  // Marquee star bonus for $5+ players (Messi, Ronaldo, Zidane, Maldini, Henry)
  const starBonus = baseValue >= 5 ? 1 : 0;

  // Budget discipline: bot tries to keep at least $1 per remaining empty slot
  const mentalReserve = Math.max(0, emptySlotsCount - 1);
  const maxSafeSpend = Math.max(1, botBankroll - mentalReserve);

  // Maximum willing to pay for this specific lot
  let maxWillingToPay = Math.min(
    botBankroll,
    Math.max(1, Math.min(maxSafeSpend, baseValue + urgencyBonus + starBonus))
  );

  // Special scenario: User is bankrupt ($0)
  // If user cannot bid, bot just needs to bid $1 or current minimum to lock the player!
  if (userBankroll <= 0 && currentBid === 0) {
    return {
      shouldBid: true,
      bidAmount: 1,
      delayMs: 1000 + Math.floor(Math.random() * 800),
      reason: 'bidding',
    };
  }

  // Check if current bid already exceeded bot's willingness
  if (minNextBid > maxWillingToPay) {
    return { shouldBid: false, reason: 'overpriced' };
  }

  // Choose bid increment: usually +$1, occasionally +$2 if bot has high bankroll and wants to exert pressure
  let calculatedBid = minNextBid;
  if (botState.bankroll >= 10 && maxWillingToPay >= minNextBid + 1 && Math.random() < 0.25) {
    calculatedBid = minNextBid + 1;
  }

  // Humanized reaction delay (0.8s to 2.0s)
  const delayMs = 900 + Math.floor(Math.random() * 1100);

  return {
    shouldBid: true,
    bidAmount: calculatedBid,
    delayMs,
    reason: 'bidding',
  };
}
