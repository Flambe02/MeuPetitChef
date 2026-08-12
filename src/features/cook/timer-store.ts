import { create } from 'zustand';

/**
 * Cook-mode timers.
 *
 * Deliberately *not* a `setInterval` counting down a number: a backgrounded PWA
 * gets its timers throttled or frozen, and a 25-minute oven timer that lost
 * four minutes because the screen locked is worse than no timer at all.
 *
 * Instead we store an absolute `endsAt` and derive the remaining time on each
 * tick. The interval only drives re-renders; the clock is the source of truth.
 */
export interface TimerState {
  /** The step this timer belongs to, so the UI can place it. */
  stepId: string | null;
  /** Epoch ms when the timer fires. Null when idle. */
  endsAt: number | null;
  /** Seconds left when paused. Null while running. */
  pausedRemaining: number | null;
  totalSeconds: number;
  isRunning: boolean;
  hasFired: boolean;

  start: (stepId: string, seconds: number) => void;
  pause: () => void;
  resume: () => void;
  addSeconds: (seconds: number) => void;
  reset: () => void;
  markFired: () => void;
  /** Seconds remaining right now, floored at zero. */
  remaining: () => number;
}

export const useTimerStore = create<TimerState>((set, get) => ({
  stepId: null,
  endsAt: null,
  pausedRemaining: null,
  totalSeconds: 0,
  isRunning: false,
  hasFired: false,

  start: (stepId, seconds) =>
    set({
      stepId,
      endsAt: Date.now() + seconds * 1000,
      pausedRemaining: null,
      totalSeconds: seconds,
      isRunning: true,
      hasFired: false,
    }),

  pause: () => {
    const { endsAt, isRunning } = get();
    if (!isRunning || endsAt === null) return;
    set({
      isRunning: false,
      pausedRemaining: Math.max(0, Math.round((endsAt - Date.now()) / 1000)),
      endsAt: null,
    });
  },

  resume: () => {
    const { pausedRemaining } = get();
    if (pausedRemaining === null) return;
    set({ isRunning: true, endsAt: Date.now() + pausedRemaining * 1000, pausedRemaining: null });
  },

  /** "+1 minuto" while something browns a little longer than the recipe said. */
  addSeconds: (seconds) => {
    const { endsAt, pausedRemaining, totalSeconds, isRunning } = get();
    if (isRunning && endsAt !== null) {
      set({
        endsAt: endsAt + seconds * 1000,
        totalSeconds: totalSeconds + seconds,
        hasFired: false,
      });
    } else if (pausedRemaining !== null) {
      set({
        pausedRemaining: pausedRemaining + seconds,
        totalSeconds: totalSeconds + seconds,
        hasFired: false,
      });
    }
  },

  reset: () =>
    set({
      stepId: null,
      endsAt: null,
      pausedRemaining: null,
      totalSeconds: 0,
      isRunning: false,
      hasFired: false,
    }),

  markFired: () => set({ isRunning: false, endsAt: null, hasFired: true }),

  remaining: () => {
    const { endsAt, pausedRemaining, isRunning } = get();
    if (!isRunning) return pausedRemaining ?? 0;
    if (endsAt === null) return 0;
    return Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  },
}));
