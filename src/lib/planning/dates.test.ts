import { describe, expect, it } from 'vitest';

import { parseISODate, toISODate } from '@/lib/format';

import { startOfWeek, weekDates, weekRange } from './dates';

describe('startOfWeek', () => {
  it('is Monday-first: a Wednesday lands on that week\'s Monday', () => {
    // 2026-08-19 is a Wednesday.
    const monday = startOfWeek(new Date(2026, 7, 19));
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(7);
    expect(monday.getDate()).toBe(17);
    expect(monday.getDay()).toBe(1); // Monday
  });

  it('a Sunday belongs to the week that started the Monday before it', () => {
    // 2026-08-23 is a Sunday, still inside the 17–23 week.
    const monday = startOfWeek(new Date(2026, 7, 23));
    expect(monday.getDate()).toBe(17);
  });

  it('a Monday is its own week start', () => {
    const monday = startOfWeek(new Date(2026, 7, 17));
    expect(monday.getDate()).toBe(17);
  });

  it('zeroes the clock', () => {
    const monday = startOfWeek(new Date(2026, 7, 19, 23, 45, 10));
    expect(monday.getHours()).toBe(0);
    expect(monday.getMinutes()).toBe(0);
    expect(monday.getSeconds()).toBe(0);
  });

  it('crosses a month boundary correctly', () => {
    // 2026-09-02 is a Wednesday; that week starts 2026-08-31.
    const monday = startOfWeek(new Date(2026, 8, 2));
    expect(monday.getMonth()).toBe(7);
    expect(monday.getDate()).toBe(31);
  });

  it('crosses a year boundary correctly', () => {
    // 2027-01-01 is a Friday; that week starts 2026-12-28.
    const monday = startOfWeek(new Date(2027, 0, 1));
    expect(monday.getFullYear()).toBe(2026);
    expect(monday.getMonth()).toBe(11);
    expect(monday.getDate()).toBe(28);
  });
});

describe('weekDates', () => {
  it('returns exactly seven consecutive days starting at weekStart', () => {
    const monday = startOfWeek(new Date(2026, 7, 19));
    const dates = weekDates(monday);
    expect(dates).toHaveLength(7);
    expect(dates.map((d) => d.getDate())).toEqual([17, 18, 19, 20, 21, 22, 23]);
    expect(dates[6]!.getDay()).toBe(0); // Sunday
  });
});

describe('weekRange', () => {
  it('start is Monday, end is the following Sunday', () => {
    const range = weekRange(startOfWeek(new Date(2026, 7, 19)));
    expect(toISODate(range.start)).toBe('2026-08-17');
    expect(toISODate(range.end)).toBe('2026-08-23');
  });
});

describe('toISODate / parseISODate round-trip', () => {
  it('survives a timezone offset unlike a naive new Date(isoString) parse', () => {
    const original = new Date(2026, 7, 17); // local midnight, Aug 17
    const iso = toISODate(original);
    expect(iso).toBe('2026-08-17');

    const parsed = parseISODate(iso);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(17);
    // The bug this guards against: new Date('2026-08-17') parses as UTC
    // midnight, which in any timezone behind UTC reads back as August 16.
    expect(parsed.getTime()).toBe(original.getTime());
  });
});
