import { useEffect, useState } from 'react';

/**
 * Keyboard-aware viewport for phones.
 *
 * Android Chrome (with `interactive-widget=resizes-content` in index.html) shrinks the layout
 * viewport when the on-screen keyboard opens. iOS Safari does not: it only shrinks the *visual*
 * viewport and pans the page under the keyboard. To make both behave the same, this keeps two
 * things in sync with `window.visualViewport`:
 *   --app-h      the height actually visible above the keyboard (arena roots size to it)
 *   --kb-offset  how much of the layout viewport's bottom the keyboard covers (iOS; 0 on Android),
 *                so bottom-anchored sheets can sit on top of the keyboard instead of under it
 *   html.kb-open set while the keyboard is up (the `kb:` Tailwind variant compacts layouts)
 */
export function installViewportTracking() {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const vv = window.visualViewport;
  // Tallest viewport seen at the current width = "no keyboard" height (Android resizes innerHeight too)
  let fullHeight = window.innerHeight;
  let lastWidth = window.innerWidth;

  const isTyping = () => {
    const el = document.activeElement as HTMLElement | null;
    return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable));
  };

  const update = () => {
    if (window.innerWidth !== lastWidth) {
      lastWidth = window.innerWidth;
      fullHeight = window.innerHeight; // rotation / resize: reset the baseline
    }
    fullHeight = Math.max(fullHeight, window.innerHeight);
    const visible = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--app-h', `${Math.round(visible)}px`);
    const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--kb-offset', `${Math.round(covered)}px`);
    const keyboardOpen = isTyping() && fullHeight - visible > 140;
    root.classList.toggle('kb-open', keyboardOpen);
    // iOS pans the page to reveal the input; our screens already fit the visible area, so pin it
    if (keyboardOpen && vv && vv.offsetTop > 0) window.scrollTo(0, 0);
  };

  update();
  vv?.addEventListener('resize', update);
  vv?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  window.addEventListener('focusin', () => setTimeout(update, 60));
  window.addEventListener('focusout', () => setTimeout(update, 60));
}


/** True on phone-width screens (below Tailwind's `sm`), kept live across resizes/rotation. */
export function useIsPhone(maxWidth = 639) {
  const query = `(max-width: ${maxWidth}px)`;
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [isPhone, setIsPhone] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setIsPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return isPhone;
}
