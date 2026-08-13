import { useState } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { DataLabel } from '@/components/ui/Card';
import type { MealPlanGenerationMode, MealSlot, Profile } from '@/domain/types';
import { GENERATION_MODES, GENERATION_PRIORITIES } from '@/lib/planning/constants';
import type { GenerationPreferences } from '@/lib/planning/types';
import { cn } from '@/lib/cn';

const WEEKDAY_LETTER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;
const MEALS: { slot: MealSlot; label: string }[] = [
  { slot: 'almoco', label: 'Almoço' },
  { slot: 'jantar', label: 'Jantar' },
];

function objectiveLine(profile: Profile | null): string | null {
  if (!profile?.daily_kcal_goal) return null;
  return profile.daily_protein_goal_g
    ? `${String(profile.daily_kcal_goal)} kcal/dia · ${String(profile.daily_protein_goal_g)} g proteína`
    : `${String(profile.daily_kcal_goal)} kcal/dia`;
}

/**
 * "Como você quer sua semana?" — one bottom sheet, everything the profile
 * already knows pre-filled, the goal under ten seconds to "Criar minha
 * semana" per the brief. Only feeds `useGenerateWeek` ("Montar minha
 * semana"); "Melhorar minha semana" re-runs with whatever this sheet last
 * saved to `meal_plans`, no second round of questions.
 */
export function GenerateWeekSheet({
  open,
  onClose,
  profile,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  isPending: boolean;
  onSubmit: (input: {
    generationMode: MealPlanGenerationMode;
    preferences: GenerationPreferences;
  }) => void;
}) {
  const [generationMode, setGenerationMode] = useState<MealPlanGenerationMode>('equilibrada');
  const [meals, setMeals] = useState<MealSlot[]>(['almoco', 'jantar']);
  const [priorities, setPriorities] = useState<string[]>(
    GENERATION_PRIORITIES.filter((p) => p.defaultChecked).map((p) => p.id),
  );
  const [noCookDays, setNoCookDays] = useState<number[]>([]);

  const toggleMeal = (slot: MealSlot) =>
    setMeals((current) => {
      if (current.includes(slot)) return current.length > 1 ? current.filter((s) => s !== slot) : current;
      return [...current, slot];
    });

  const togglePriority = (id: string) =>
    setPriorities((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));

  const toggleNoCookDay = (index: number) =>
    setNoCookDays((current) => (current.includes(index) ? current.filter((d) => d !== index) : [...current, index]));

  const objective = objectiveLine(profile);

  return (
    <BottomSheet open={open} onClose={onClose} title="Como você quer sua semana?">
      <div className="flex flex-col gap-5">
        <section>
          <DataLabel>Objetivo</DataLabel>
          <p className="mt-2 text-body text-ink">
            {objective ? `Manter meu objetivo atual — ${objective}` : 'Sem meta nutricional definida no perfil.'}
          </p>
        </section>

        <section>
          <DataLabel>Intenção</DataLabel>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {GENERATION_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setGenerationMode(entry.id)}
                aria-pressed={generationMode === entry.id}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left',
                  generationMode === entry.id ? 'border-rouge bg-inset' : 'border-hairline',
                )}
              >
                <span className="block text-small font-semibold text-ink">{entry.label}</span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">{entry.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <DataLabel>Refeições</DataLabel>
          <div className="mt-2 flex gap-2">
            {MEALS.map(({ slot, label }) => (
              <label
                key={slot}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2',
                  meals.includes(slot) ? 'border-rouge bg-inset' : 'border-hairline',
                )}
              >
                <input
                  type="checkbox"
                  checked={meals.includes(slot)}
                  onChange={() => toggleMeal(slot)}
                  className="size-4 accent-rouge"
                />
                <span className="text-small text-ink">{label}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <DataLabel>Prioridades</DataLabel>
          <div className="mt-2 flex flex-col gap-2">
            {GENERATION_PRIORITIES.map((priority) => (
              <label key={priority.id} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={priorities.includes(priority.id)}
                  onChange={() => togglePriority(priority.id)}
                  className="size-4 accent-rouge"
                />
                <span className="text-small text-ink">{priority.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <DataLabel>Dias que não preciso cozinhar</DataLabel>
          <div className="mt-2 flex justify-between">
            {WEEKDAY_LETTER.map((letter, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={noCookDays.includes(index)}
                onClick={() => toggleNoCookDay(index)}
                className={cn(
                  'flex size-9 items-center justify-center rounded-pill font-mono text-[11px] uppercase',
                  noCookDays.includes(index) ? 'bg-rouge text-porcelain-100' : 'bg-inset text-ink-muted',
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </section>

        <Button
          size="lg"
          block
          disabled={isPending}
          onClick={() => {
            onSubmit({ generationMode, preferences: { meals, priorities, noCookDays } });
          }}
        >
          {isPending ? 'Montando…' : 'Criar minha semana'}
        </Button>
      </div>
    </BottomSheet>
  );
}
