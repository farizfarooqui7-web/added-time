import { useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/**
 * Put on an answer console: tapping its buttons (Lock, Skip, a suggestion) keeps focus in the
 * answer box, so the keyboard doesn't drop for a split second on every tap (Android closes it).
 */
export const keepTypingFocus = (e: ReactPointerEvent | ReactMouseEvent) => {
  if ((e.target as HTMLElement).closest('button')) e.preventDefault();
};

/**
 * Keeps the phone keyboard up across rounds in typing games.
 *
 * Between rounds the real answer box unmounts or locks, which closes the keyboard, and iOS refuses
 * to reopen it without a fresh tap. `hold()` moves focus to an invisible input *inside* the
 * submitting tap/Enter (a user gesture, so iOS allows it); the keyboard stays open through the
 * result screen, and the next round's `inputRef.focus()` takes focus straight back.
 * Enter pressed while holding calls `onEnter` (e.g. "next round").
 */
export function useKeyboardKeeper(onEnter?: () => void) {
  const keeperRef = useRef<HTMLInputElement | null>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;

  /** Call in the submit/skip handler, before the answer box goes away. */
  const hold = useCallback(() => {
    if (!isPhone()) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement) || active === keeperRef.current) return; // keyboard not up
    keeperRef.current?.focus({ preventScroll: true });
  }, []);

  const keeper = (
    <input
      ref={keeperRef}
      aria-hidden="true"
      tabIndex={-1}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      enterKeyHint="next"
      value=""
      onChange={() => {}}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnterRef.current?.();
        }
      }}
      // 16px font stops iOS zooming; fully transparent, unclickable, but still focusable
      className="fixed left-0 bottom-0 w-px h-px opacity-0 pointer-events-none text-[16px]"
    />
  );

  return { hold, keeper };
}
