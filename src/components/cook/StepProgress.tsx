import { EQUIPMENT_THEME } from '@/domain/equipment';
import type { EquipmentType } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * The dash track along the bottom of cook mode.
 *
 * Each dash is tinted by *its own* step's appliance, so the run of blue near
 * the end tells you the oven is coming before you get there. Steps already done
 * are solid, the current one is wider, the rest are hairlines.
 */
export function StepProgress({
  steps,
  current,
  onSelect,
  className,
}: {
  steps: readonly { id: string; equipment: EquipmentType }[];
  current: number;
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-[7px] overflow-hidden', className)}>
      {steps.map((step, index) => {
        const accent = EQUIPMENT_THEME[step.equipment].colorVar;
        const isDone = index < current;
        const isCurrent = index === current;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Etapa ${index + 1} de ${steps.length}`}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'h-[3px] rounded-pill transition-all duration-[140ms] ease-signal',
              isCurrent ? 'w-8' : 'w-5',
            )}
            style={{
              background: isDone || isCurrent ? accent : 'var(--border-hairline)',
              opacity: isDone ? 0.45 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
