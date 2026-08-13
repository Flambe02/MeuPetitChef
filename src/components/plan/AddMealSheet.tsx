import { Minus, Recycle, Search, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Spinner } from '@/components/ui/states';
import type { ChefMode, MealPlanGenerationMode, MealSlot } from '@/domain/types';
import { useRecipeSearch } from '@/features/recipes/hooks';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/pt';
import { toISODate } from '@/lib/format';
import type { GenerationPreferences, PlannedEntry } from '@/lib/planning/types';

import {
  useSetEatingOutEntry,
  useSetLeftoverEntry,
  useSetRecipeEntry,
  useSetSkippedEntry,
  useSuggestForSlot,
} from '@/features/planning/hooks';

type View = 'menu' | 'search' | 'suggest' | 'leftover';

const SLOT_LABEL_KEY: Record<MealSlot, TranslationKey> = {
  cafe: 'addMeal.slotCafe',
  almoco: 'addMeal.slotAlmoco',
  lanche: 'addMeal.slotLanche',
  jantar: 'addMeal.slotJantar',
  ceia: 'addMeal.slotCeia',
};

/**
 * "Adicionar almoço/jantar" — the empty-slot menu, and every one of its five
 * outcomes in the same sheet: choosing a recipe never leaves it for the full
 * search screen (the brief is explicit that this flow must stay shallow).
 */
export function AddMealSheet({
  open,
  onClose,
  date,
  slot,
  mode,
  weekEntries,
  generationMode,
  preferences,
}: {
  open: boolean;
  onClose: () => void;
  date: Date;
  slot: MealSlot;
  mode: ChefMode;
  weekEntries: PlannedEntry[];
  generationMode: MealPlanGenerationMode;
  preferences: GenerationPreferences;
}) {
  const { t } = useLanguage();
  const [view, setView] = useState<View>('menu');
  const [term, setTerm] = useState('');
  const deferredTerm = useDeferredValue(term);

  const setRecipe = useSetRecipeEntry();
  const setLeftover = useSetLeftoverEntry();
  const setEatingOut = useSetEatingOutEntry();
  const setSkipped = useSetSkippedEntry();
  const suggest = useSuggestForSlot();

  const search = useRecipeSearch({ query: deferredTerm.trim() || undefined, mode });

  const reset = () => {
    setView('menu');
    setTerm('');
    suggest.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  const pickRecipe = (recipeId: string) => {
    setRecipe.mutate({ date, slot, recipeId, mode }, { onSuccess: close });
  };

  const leftoverSources = weekEntries.filter(
    (planned) =>
      planned.entry.entry_type === 'recipe' &&
      planned.recipe !== null &&
      planned.entry.plan_date <= toISODate(date),
  );

  return (
    <BottomSheet open={open} onClose={close} title={t('addMeal.title', { slot: t(SLOT_LABEL_KEY[slot]) })}>
      {view === 'menu' ? (
        <div className="flex flex-col gap-1">
          <MenuAction icon={Search} label={t('addMeal.chooseRecipe')} onClick={() => setView('search')} />
          <MenuAction
            icon={Sparkles}
            label={t('addMeal.suggestForMe')}
            onClick={() => {
              setView('suggest');
              suggest.mutate({ weekStart: date, mode, generationMode, preferences, date, slot });
            }}
          />
          {leftoverSources.length > 0 ? (
            <MenuAction icon={Recycle} label={t('addMeal.leftovers')} onClick={() => setView('leftover')} />
          ) : null}
          <MenuAction
            icon={UtensilsCrossed}
            label={t('addMeal.eatingOut')}
            onClick={() => setEatingOut.mutate({ date, slot }, { onSuccess: close })}
          />
          <MenuAction
            icon={Minus}
            label={t('addMeal.noMeal')}
            onClick={() => setSkipped.mutate({ date, slot }, { onSuccess: close })}
          />
        </div>
      ) : null}

      {view === 'search' ? (
        <div className="flex flex-col gap-3">
          <input
            type="search"
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('addMeal.searchPlaceholder')}
            aria-label={t('addMeal.searchAriaLabel')}
            className="h-11 w-full rounded-lg border border-hairline bg-inset px-3 text-body text-ink outline-none"
          />
          {search.isPending ? <Spinner /> : null}
          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {search.data?.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => pickRecipe(recipe.id)}
                className="flex items-center gap-3 rounded-lg border border-hairline p-2 text-left"
              >
                <div className="size-12 shrink-0 overflow-hidden rounded-md bg-inset">
                  {recipe.heroImageUrl ? (
                    <img src={recipe.heroImageUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <span className="min-w-0 flex-1 truncate text-small font-medium text-ink">{recipe.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {view === 'suggest' ? (
        <div className="flex flex-col gap-2">
          {suggest.isPending ? <Spinner label={t('addMeal.searchingSuggestions')} /> : null}
          {suggest.data?.map(({ recipe, label }) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => pickRecipe(recipe.id)}
              className="flex items-center gap-3 rounded-lg border border-hairline p-2 text-left"
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-md bg-inset">
                {recipe.heroImageUrl ? (
                  <img src={recipe.heroImageUrl} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-medium text-ink">{recipe.title}</span>
                <span className="mt-0.5 block text-[11px] text-rouge">{label}</span>
              </span>
            </button>
          ))}
          {suggest.data?.length === 0 ? (
            <p className="py-4 text-center text-small text-ink-muted">
              {t('addMeal.nothingAvailable')}
            </p>
          ) : null}
        </div>
      ) : null}

      {view === 'leftover' ? (
        <div className="flex flex-col gap-2">
          {leftoverSources.map((planned) => (
            <button
              key={planned.entry.id}
              type="button"
              onClick={() =>
                setLeftover.mutate(
                  { date, slot, parentEntryId: planned.entry.id, recipeId: planned.entry.recipe_id },
                  { onSuccess: close },
                )
              }
              className="flex items-center gap-3 rounded-lg border border-hairline p-2 text-left"
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-md bg-inset">
                {planned.recipe?.heroImageUrl ? (
                  <img src={planned.recipe.heroImageUrl} alt="" className="size-full object-cover" />
                ) : null}
              </div>
              <span className="min-w-0 flex-1 truncate text-small font-medium text-ink">
                {planned.recipe?.title}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </BottomSheet>
  );
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Search;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-2 py-3 text-left text-body text-ink"
    >
      <Icon aria-hidden className="size-5 text-ink-secondary" strokeWidth={1.75} />
      {label}
    </button>
  );
}
