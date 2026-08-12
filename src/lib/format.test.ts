import { describe, expect, it } from 'vitest';

import { formatDuration, formatKcal, formatServings, formatTimer, toISODate } from './format';

describe('formatTimer', () => {
  it('pads to mm:ss', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(65)).toBe('01:05');
    expect(formatTimer(1500)).toBe('25:00');
  });

  it('never renders a negative clock', () => {
    expect(formatTimer(-5)).toBe('00:00');
  });
});

describe('formatDuration', () => {
  it('stays in minutes under an hour', () => {
    expect(formatDuration(25)).toBe('25 min');
  });

  it('switches to hours past 60', () => {
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(75)).toBe('1 h 15');
  });

  it('renders an em dash for unknown', () => {
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatServings', () => {
  it('agrees in number', () => {
    expect(formatServings(1)).toBe('1 porção');
    expect(formatServings(4)).toBe('4 porções');
  });
});

describe('formatKcal', () => {
  it('rounds', () => {
    expect(formatKcal(389.6)).toBe('390 kcal');
  });
});

describe('toISODate', () => {
  it('keeps the local calendar day', () => {
    // Late-evening local time must not roll over to the next UTC day.
    const date = new Date(2026, 7, 9, 23, 30);
    expect(toISODate(date)).toBe('2026-08-09');
  });
});
