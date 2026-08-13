import { Plus } from 'lucide-react';

/** A slot with no `meal_plan_entries` row at all yet — not the same thing as `entry_type: 'skipped'`. */
export function EmptySlotCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline py-4 text-body font-medium text-ink-muted"
    >
      <Plus aria-hidden className="size-4" strokeWidth={1.75} />
      Adicionar
    </button>
  );
}
