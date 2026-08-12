import { useEffect, useRef, useState } from 'react';

/**
 * Keeps the screen on while cooking.
 *
 * The concept document lists "écran toujours allumé" as a cook-mode
 * requirement: nobody wants to unlock a phone with oily hands between steps.
 *
 * The Screen Wake Lock API is not universal (notably older iOS), so this
 * degrades silently — the hook reports whether it actually holds a lock.
 */
export function useWakeLock(enabled: boolean): { isSupported: boolean; isActive: boolean } {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!isSupported || !enabled) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setIsActive(true);
        sentinel.addEventListener('release', () => setIsActive(false));
      } catch {
        // Denied (battery saver, no user gesture). Cooking still works.
        setIsActive(false);
      }
    };

    // The browser drops the lock whenever the tab is hidden; re-take it on return.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sentinelRef.current?.released !== false) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinelRef.current?.release().catch(() => undefined);
      sentinelRef.current = null;
      setIsActive(false);
    };
  }, [enabled, isSupported]);

  return { isSupported, isActive };
}
