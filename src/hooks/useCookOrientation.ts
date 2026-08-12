import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Which way cook mode faces, and whether the app is allowed to turn it.
 *
 * Landscape earns its place: the dials sit beside the instruction, the vessel
 * has room, and nothing important falls below the fold. But a phone propped
 * against a jar stands upright, some tablets refuse to rotate at all, and iOS
 * ignores `orientation.lock()` outright — so demanding landscape meant showing a
 * "turn your phone" wall to people whose phone was exactly where they wanted it.
 *
 * Both layouts are drawn now, and this decides between them:
 *
 *   * `auto`  — ask the device for landscape, and follow it wherever it lands.
 *     The lock works in an installed PWA on Android and silently does not
 *     elsewhere, which is why the portrait layout is a real layout and not a
 *     fallback.
 *   * `livre` — never ask. Cook in whatever orientation the phone is already in.
 *
 * The choice is per device rather than per profile: it is about how this phone
 * is propped up in this kitchen, not about who is cooking. It therefore lives in
 * `localStorage` and needs no migration.
 */
export type OrientationMode = 'auto' | 'livre';

const STORAGE_KEY = 'mpc.cook.orientation';
const PORTRAIT_QUERY = '(orientation: portrait)';

/* ---------------------------------------------------------------------------
 * The stored preference
 * ------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function readMode(): OrientationMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'livre' ? 'livre' : 'auto';
  } catch {
    // Private browsing on iOS throws rather than returning null.
    return 'auto';
  }
}

function writeMode(mode: OrientationMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // A preference that cannot be stored still applies for this session.
  }
  for (const listener of listeners) listener();
}

function subscribeMode(callback: () => void): () => void {
  listeners.add(callback);
  // Another tab, or another cook screen mounted at the same time.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

/* ---------------------------------------------------------------------------
 * The actual orientation
 * ------------------------------------------------------------------------- */

function subscribeOrientation(callback: () => void): () => void {
  const media = window.matchMedia(PORTRAIT_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export interface CookOrientation {
  isPortrait: boolean;
  mode: OrientationMode;
  toggle: () => void;
}

export function useCookOrientation(): CookOrientation {
  const isPortrait = useSyncExternalStore(
    subscribeOrientation,
    () => window.matchMedia(PORTRAIT_QUERY).matches,
    // Server/prerender: portrait is the safer guess for a phone-first app.
    () => true,
  );

  const serverMode = (): OrientationMode => 'auto';
  const mode = useSyncExternalStore(subscribeMode, readMode, serverMode);

  useEffect(() => {
    // `Partial`, because the DOM lib types `lock`/`unlock` as always present
    // while Safari ships neither.
    const orientation = window.screen?.orientation as Partial<ScreenOrientation> | undefined;

    if (mode === 'auto') {
      // Rejects on iOS and outside fullscreen. Expected, not an error: the
      // portrait layout is what happens next.
      void orientation?.lock?.('landscape').catch(() => undefined);
      return () => orientation?.unlock?.();
    }

    orientation?.unlock?.();
    return undefined;
  }, [mode]);

  const toggle = useCallback(() => {
    writeMode(readMode() === 'auto' ? 'livre' : 'auto');
  }, []);

  return { isPortrait, mode, toggle };
}
