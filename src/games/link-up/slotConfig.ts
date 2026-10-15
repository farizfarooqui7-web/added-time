// Slot configuration helpers. Kept apart from puzzleEngine so the setup modal does not pull
// the Link-Up player database into the main bundle.
import type { LinkUpSlotType } from './types';

/**
 * Validates that 'Position' appears at most once across the 3 slots.
 */
export function isValidSlotConfiguration(
  slots: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType]
): boolean {
  const posCount = slots.filter((s) => s === 'Position').length;
  return posCount <= 1;
}

/**
 * Updates a single slot while strictly enforcing the rule that 'Position' can appear at most once.
 * If the user selects 'Position' on `slotIndex` while another slot already has 'Position',
 * the other slot automatically switches to 'Club'.
 */
export function updateSlotConfiguration(
  currentSlots: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType],
  slotIndex: 0 | 1 | 2,
  newType: LinkUpSlotType
): [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType] {
  const next: [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType] = [...currentSlots];
  if (newType === 'Position') {
    for (let i = 0; i < 3; i++) {
      if (i !== slotIndex && next[i] === 'Position') {
        next[i] = 'Club';
      }
    }
  }
  next[slotIndex] = newType;
  return next;
}

/**
 * Generates a randomized 3-slot configuration while respecting the single-position rule.
 */
export function randomizeSlotConfiguration(): [LinkUpSlotType, LinkUpSlotType, LinkUpSlotType] {
  const presets: Array<[LinkUpSlotType, LinkUpSlotType, LinkUpSlotType]> = [
    ['Club', 'Club', 'Nation'],
    ['Club', 'Club', 'Club'],
    ['Club', 'Club', 'Position'],
    ['Club', 'Nation', 'Position'],
    ['Club', 'Nation', 'Club'],
    ['Nation', 'Club', 'Position'],
    ['Position', 'Club', 'Club'],
  ];
  const chosen = [...presets[Math.floor(Math.random() * presets.length)]] as [
    LinkUpSlotType,
    LinkUpSlotType,
    LinkUpSlotType
  ];
  // Shuffle order
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}
