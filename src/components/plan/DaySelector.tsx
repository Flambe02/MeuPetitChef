import { cn } from '@/lib/cn';

const WEEKDAY_LETTER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The sticky "S T Q Q S S D" row. Scrolls the matching day section into view
 * rather than switching a tab — the screen is one continuous week, not seven
 * separate pages, so navigation here has to feel like a jump, not a route
 * change.
 */
export function DaySelector({ dates }: { dates: Date[] }) {
  const today = new Date();

  return (
    <div
      className="sticky top-0 z-10 -mx-5 flex justify-between border-b border-hairline bg-base/95 px-5 py-2 backdrop-blur"
      role="tablist"
      aria-label="Dias da semana"
    >
      {dates.map((date, index) => {
        const isToday = isSameDay(date, today);
        return (
          <button
            key={date.toISOString()}
            type="button"
            role="tab"
            onClick={() =>
              document.getElementById(`plan-day-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="flex flex-col items-center gap-1 px-1.5 py-1"
          >
            <span
              className={cn(
                'font-mono text-[10px] tracking-[0.1em] uppercase',
                isToday ? 'text-rouge' : 'text-ink-muted',
              )}
            >
              {WEEKDAY_LETTER[index]}
            </span>
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-pill text-small font-semibold',
                isToday ? 'bg-rouge text-porcelain-100' : 'text-ink',
              )}
            >
              {date.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
