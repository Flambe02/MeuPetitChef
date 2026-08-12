import { brand } from '@/config/brand';

/** mm:ss — the cook-mode timer readout. */
export function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** "25 min" / "1 h 15" — how durations read on cards and headers. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

export function formatServings(count: number): string {
  return count === 1 ? '1 porção' : `${count} porções`;
}

export function formatKcal(kcal: number | null): string {
  return kcal === null ? '—' : `${Math.round(kcal)} kcal`;
}

export function formatGrams(grams: number | null): string {
  return grams === null ? '—' : `${Math.round(grams)} g`;
}

const dateFormatter = new Intl.DateTimeFormat(brand.locale, { day: '2-digit', month: 'short' });
const weekdayFormatter = new Intl.DateTimeFormat(brand.locale, { weekday: 'long' });

export function formatShortDate(date: Date | string): string {
  return dateFormatter.format(typeof date === 'string' ? new Date(date) : date);
}

export function formatWeekday(date: Date | string): string {
  const label = weekdayFormatter.format(typeof date === 'string' ? new Date(date) : date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** ISO date (YYYY-MM-DD) in local time — Postgres `date` columns want this. */
export function toISODate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
