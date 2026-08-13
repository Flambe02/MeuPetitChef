import type { WeekRange } from './types';

/**
 * Pure date helpers for the planner — moved here (from `features/planning`,
 * which never had a `hooks.ts` and was never actually imported) so both the
 * engine and the feature layer share one definition instead of two.
 *
 * Local time throughout: a meal belongs to the day the person is on, not to
 * UTC's. `startOfWeek` zeroes the clock in local time, and every date built
 * from it inherits that — the classic "week flips a day early/late" bug is a
 * timezone-offset bug, and there is no `.toISOString()` anywhere in this file
 * to reintroduce one.
 */

/** Monday of the week containing `date`. The planner is Monday-first. */
export function startOfWeek(date: Date = new Date()): Date {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7; // 0 = Monday
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });
}

export function weekRange(weekStart: Date): WeekRange {
  const dates = weekDates(weekStart);
  return { start: dates[0]!, end: dates[6]! };
}
