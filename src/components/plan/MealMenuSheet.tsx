import { Lock, Minus, Plus, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import type { MealSlot } from '@/domain/types';
import {
  useClearEntry,
  useMoveEntry,
  useSetEntryCooked,
  useSetEntryLocked,
  useSetEntryServings,
  useSetLeftoverEntry,
} from '@/features/planning/hooks';
import { parseISODate } from '@/lib/format';
import type { PlannedEntry } from '@/lib/planning/types';
import { cn } from '@/lib/cn';

type View = 'menu' | 'move' | 'servings';

const WEEKDAY_LETTER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;
const MEALS: { slot: MealSlot; label: string }[] = [
  { slot: 'almoco', label: 'Almoço' },
  { slot: 'jantar', label: 'Jantar' },
];

/** The "⋯" on a filled card — every action §MENU asks for, in one sheet. */
export function MealMenuSheet({
  open,
  onClose,
  planned,
  weekDates,
  tomorrowIsFree,
  onTrocarReceita,
}: {
  open: boolean;
  onClose: () => void;
  planned: PlannedEntry;
  weekDates: Date[];
  /** Whether tomorrow's same slot has no entry yet — gates "Criar sobra para amanhã". */
  tomorrowIsFree: boolean;
  onTrocarReceita: () => void;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>('menu');
  const [moveTo, setMoveTo] = useState<{ date: Date; slot: MealSlot } | null>(null);
  const [servings, setServings] = useState(planned.entry.servings);

  const clearEntry = useClearEntry();
  const setLocked = useSetEntryLocked();
  const setCooked = useSetEntryCooked();
  const moveEntry = useMoveEntry();
  const setServingsMutation = useSetEntryServings();
  const setLeftover = useSetLeftoverEntry();

  const { entry, recipe } = planned;
  const isRecipeLike = entry.entry_type === 'recipe' || entry.entry_type === 'leftover';

  const close = () => {
    setView('menu');
    onClose();
  };

  const createLeftoverTomorrow = () => {
    const tomorrow = parseISODate(entry.plan_date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setLeftover.mutate(
      { date: tomorrow, slot: entry.slot, parentEntryId: entry.id, recipeId: entry.recipe_id },
      { onSuccess: close },
    );
  };

  return (
    <BottomSheet open={open} onClose={close}>
      {view === 'menu' ? (
        <div className="flex flex-col gap-1">
          {recipe ? (
            <Action label="Ver receita" onClick={() => void navigate(routes.recipe(recipe.slug))} />
          ) : null}
          {entry.entry_type !== 'leftover' ? (
            <Action
              label="Trocar receita"
              onClick={() => {
                close();
                onTrocarReceita();
              }}
            />
          ) : null}
          <Action label="Mover para outro dia" onClick={() => setView('move')} />
          {isRecipeLike ? (
            <Action label="Alterar porções" onClick={() => setView('servings')} />
          ) : null}
          {entry.entry_type === 'recipe' && tomorrowIsFree ? (
            <Action label="Criar sobra para amanhã" onClick={createLeftoverTomorrow} />
          ) : null}
          <Action
            icon={entry.locked ? Unlock : Lock}
            label={entry.locked ? 'Desbloquear' : 'Bloquear escolha'}
            onClick={() => setLocked.mutate({ id: entry.id, locked: !entry.locked }, { onSuccess: close })}
          />
          {isRecipeLike ? (
            <Action
              label={entry.status === 'cooked' ? 'Desfazer "já comi"' : 'Já comi'}
              onClick={() =>
                setCooked.mutate({ id: entry.id, cooked: entry.status !== 'cooked' }, { onSuccess: close })
              }
            />
          ) : null}
          <Action
            tone="danger"
            label="Retirar da semana"
            onClick={() => clearEntry.mutate(entry.id, { onSuccess: close })}
          />
        </div>
      ) : null}

      {view === 'move' ? (
        <div className="flex flex-col gap-5">
          <div>
            <p className="mb-2 text-small text-ink-muted">Dia</p>
            <div className="flex justify-between">
              {weekDates.map((date, index) => (
                <button
                  key={date.toISOString()}
                  type="button"
                  aria-pressed={moveTo?.date.getTime() === date.getTime()}
                  onClick={() => setMoveTo((current) => ({ date, slot: current?.slot ?? entry.slot }))}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-pill font-mono text-[11px] uppercase',
                    moveTo?.date.getTime() === date.getTime()
                      ? 'bg-rouge text-porcelain-100'
                      : 'bg-inset text-ink-muted',
                  )}
                >
                  {WEEKDAY_LETTER[index]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-small text-ink-muted">Refeição</p>
            <div className="flex gap-2">
              {MEALS.map(({ slot, label }) => (
                <button
                  key={slot}
                  type="button"
                  aria-pressed={moveTo?.slot === slot}
                  onClick={() => setMoveTo((current) => (current ? { ...current, slot } : { date: weekDates[0]!, slot }))}
                  className={cn(
                    'rounded-lg border px-4 py-2 text-small',
                    moveTo?.slot === slot ? 'border-rouge bg-inset text-ink' : 'border-hairline text-ink-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Button
            block
            disabled={!moveTo || moveEntry.isPending}
            onClick={() => {
              if (!moveTo) return;
              moveEntry.mutate({ id: entry.id, date: moveTo.date, slot: moveTo.slot }, { onSuccess: close });
            }}
          >
            Mover
          </Button>
          {moveEntry.isError ? (
            <p className="text-small text-rouge">Já existe algo nesse horário.</p>
          ) : null}
        </div>
      ) : null}

      {view === 'servings' ? (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-5">
            <button
              type="button"
              aria-label="Menos porções"
              disabled={servings <= 1}
              onClick={() => setServings((current) => Math.max(1, current - 1))}
              className="flex size-10 items-center justify-center rounded-pill border border-hairline text-ink disabled:opacity-40"
            >
              <Minus aria-hidden className="size-4" />
            </button>
            <span className="font-display text-display-s text-ink">{servings}</span>
            <button
              type="button"
              aria-label="Mais porções"
              onClick={() => setServings((current) => Math.min(30, current + 1))}
              className="flex size-10 items-center justify-center rounded-pill border border-hairline text-ink"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
          <Button
            block
            disabled={setServingsMutation.isPending}
            onClick={() => setServingsMutation.mutate({ id: entry.id, servings }, { onSuccess: close })}
          >
            Salvar
          </Button>
        </div>
      ) : null}
    </BottomSheet>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon?: typeof Lock;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-3 text-left text-body',
        tone === 'danger' ? 'text-rouge' : 'text-ink',
      )}
    >
      {Icon ? <Icon aria-hidden className="size-4.5 shrink-0" strokeWidth={1.75} /> : null}
      {label}
    </button>
  );
}
