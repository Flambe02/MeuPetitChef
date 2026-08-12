/**
 * The sound a finished timer makes.
 *
 * Synthesised with WebAudio rather than shipped as a file: it is three sine
 * beeps, an asset would be another network round trip for the service worker to
 * cache, and this works offline by construction.
 *
 * Why it exists at all: cook mode used to signal only with `navigator.vibrate`,
 * which Safari on iOS does not implement. On the platform this PWA is most
 * likely installed on, a 25-minute oven timer reached zero in total silence.
 */
let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/**
 * Three rising beeps. Must be called from a user gesture at least once before
 * it can play — browsers suspend audio contexts created without one, which is
 * why cook mode primes it when the cook taps "Iniciar".
 */
export function playTimerChime(): void {
  const ctx = getContext();
  if (!ctx) return;
  void ctx.resume();

  const now = ctx.currentTime;
  [880, 1108.73, 1318.51].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    const start = now + index * 0.18;
    // Ramped, not switched: an abrupt gain change clicks.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  });
}

/** Unlocks audio while we still have a user gesture to do it in. */
export function primeAudio(): void {
  const ctx = getContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}
