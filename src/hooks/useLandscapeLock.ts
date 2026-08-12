import { useEffect, useSyncExternalStore } from 'react';

/**
 * Asks the device to stay landscape, and reports when it refuses.
 *
 * Cook mode and the recipe spread are drawn across the width. Rendered in a
 * portrait viewport they do not merely look cramped — the title collides with
 * the appliance tag, the instruction breaks one word per line and the vessel
 * slides under the text.
 *
 * `screen.orientation.lock()` genuinely works in an installed PWA on Android,
 * which is why the manifest declares `orientation: 'any'` rather than locking
 * the whole app to portrait. It is unavailable on iOS and rejects in a plain
 * browser tab, so the caller must still handle `isPortrait` — the lock is an
 * optimisation, never the guarantee.
 */
const QUERY = '(orientation: portrait)';

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function useLandscapeLock(): { isPortrait: boolean } {
  const isPortrait = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );

  useEffect(() => {
    // `Partial`, because the DOM lib types `lock`/`unlock` as always present
    // while Safari ships neither.
    const orientation = window.screen?.orientation as Partial<ScreenOrientation> | undefined;
    // Rejects on iOS and outside fullscreen. That is expected, not an error:
    // the rotate prompt is the fallback.
    void orientation?.lock?.('landscape').catch(() => undefined);
    return () => orientation?.unlock?.();
  }, []);

  return { isPortrait };
}
