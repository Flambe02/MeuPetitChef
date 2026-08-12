import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimerStore } from './timer-store';

describe('useTimerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00Z'));
    useTimerStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down from an absolute deadline', () => {
    useTimerStore.getState().start('step-1', 600);
    expect(useTimerStore.getState().remaining()).toBe(600);

    vi.advanceTimersByTime(90_000);
    expect(useTimerStore.getState().remaining()).toBe(510);
  });

  it('survives the app being frozen — no drift while backgrounded', () => {
    useTimerStore.getState().start('step-1', 300);
    // Simulate the tab being suspended for four minutes with no ticks at all.
    vi.setSystemTime(new Date('2026-08-09T12:04:00Z'));
    expect(useTimerStore.getState().remaining()).toBe(60);
  });

  it('never returns a negative remaining', () => {
    useTimerStore.getState().start('step-1', 10);
    vi.advanceTimersByTime(60_000);
    expect(useTimerStore.getState().remaining()).toBe(0);
  });

  it('pauses and resumes without losing time', () => {
    const store = useTimerStore.getState();
    store.start('step-1', 600);
    vi.advanceTimersByTime(100_000);
    useTimerStore.getState().pause();

    expect(useTimerStore.getState().remaining()).toBe(500);

    // Ten minutes go by while paused; nothing should tick down.
    vi.advanceTimersByTime(600_000);
    expect(useTimerStore.getState().remaining()).toBe(500);

    useTimerStore.getState().resume();
    vi.advanceTimersByTime(50_000);
    expect(useTimerStore.getState().remaining()).toBe(450);
  });

  it('adds a minute while running', () => {
    useTimerStore.getState().start('step-1', 120);
    useTimerStore.getState().addSeconds(60);
    expect(useTimerStore.getState().remaining()).toBe(180);
    expect(useTimerStore.getState().totalSeconds).toBe(180);
  });

  it('adds a minute while paused', () => {
    useTimerStore.getState().start('step-1', 120);
    useTimerStore.getState().pause();
    useTimerStore.getState().addSeconds(60);
    expect(useTimerStore.getState().remaining()).toBe(180);
  });

  it('ignores resume when nothing is paused', () => {
    useTimerStore.getState().resume();
    expect(useTimerStore.getState().isRunning).toBe(false);
  });
});
