import { useEffect, useRef, useCallback } from 'react';

interface UseArenaBackGuardOptions {
  isMatchOver: boolean;
  onTriggerForfeit: () => void;
  onExitArena: () => void;
  arenaKey?: string;
}

export function useArenaBackGuard({
  isMatchOver,
  onTriggerForfeit,
  onExitArena,
  arenaKey = 'match',
}: UseArenaBackGuardOptions) {
  const isMatchOverRef = useRef(isMatchOver);
  isMatchOverRef.current = isMatchOver;

  const onTriggerForfeitRef = useRef(onTriggerForfeit);
  onTriggerForfeitRef.current = onTriggerForfeit;

  const onExitArenaRef = useRef(onExitArena);
  onExitArenaRef.current = onExitArena;

  const hasPushedStateRef = useRef(false);

  useEffect(() => {
    // Only push once when entering the arena
    if (!hasPushedStateRef.current) {
      window.history.pushState(
        { arena: arenaKey, timestamp: Date.now() },
        '',
        window.location.href
      );
      hasPushedStateRef.current = true;
    }

    const handlePopState = () => {
      if (!isMatchOverRef.current) {
        // Intercept back navigation during active gameplay:
        // Restore the history stack entry so the user stays in the arena
        window.history.pushState(
          { arena: arenaKey, timestamp: Date.now() },
          '',
          window.location.href
        );
        // Trigger the forfeit confirmation modal
        onTriggerForfeitRef.current();
      } else {
        // Match is finished (summary / game over screen):
        // Allow the back navigation to smoothly return to the Hub
        onExitArenaRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [arenaKey]);

  // Clean exit helper when user explicitly confirms forfeit or returns to hub
  const handleCleanExit = useCallback(() => {
    // Replace URL state back to base path cleanly without stacking
    window.history.replaceState(null, '', window.location.pathname);
    onExitArenaRef.current();
  }, []);

  return { handleCleanExit };
}
