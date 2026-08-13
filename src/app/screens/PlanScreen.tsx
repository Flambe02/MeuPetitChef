import { ChevronLeft, ChevronRight, ShoppingBasket, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { AddMealSheet } from '@/components/plan/AddMealSheet';
import { DaySelector } from '@/components/plan/DaySelector';
import { DaySummary } from '@/components/plan/DaySummary';
import { EmptySlotCard } from '@/components/plan/EmptySlotCard';
import { GenerateWeekSheet } from '@/components/plan/GenerateWeekSheet';
import { MealCard } from '@/components/plan/MealCard';
import { MealMenuSheet } from '@/components/plan/MealMenuSheet';
import { VarietyCard } from '@/components/plan/VarietyCard';
import { WeekSummaryCard } from '@/components/plan/WeekSummaryCard';
import { Button } from '@/components/ui/Button';
import { Card, DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { brand } from '@/config/brand';
import type { MealPlanGenerationMode, MealSlot } from '@/domain/types';
import {
  useCreateShoppingListFromWeek,
  useGenerateWeek,
  useImproveWeek,
  useWeekPlan,
} from '@/features/planning/hooks';
import { useProfile } from '@/features/profile/hooks';
import { useLanguage } from '@/lib/i18n/language-context';
import { parseISODate, toISODate } from '@/lib/format';
import { startOfWeek, weekDates } from '@/lib/planning/dates';
import { computeDailyNutrition, computeWeeklyNutrition } from '@/lib/planning/nutrition';
import type { GenerationPreferences, PlannedEntry } from '@/lib/planning/types';
import { computeWeeklyVariety } from '@/lib/planning/variety';

const MEAL_SLOTS: MealSlot[] = ['almoco', 'jantar'];

const monthFormatter = new Intl.DateTimeFormat(brand.locale, { month: 'short' });
const weekdayFormatter = new Intl.DateTimeFormat(brand.locale, { weekday: 'short' });

function monthLabel(date: Date): string {
  return monthFormatter.format(date).toUpperCase().replace('.', '');
}

/** "17 . 23 AGO" — or "29 JUN . 5 JUL" across a month boundary. */
function headerRange(weekStart: Date, weekEnd: Date): string {
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getDate()} . ${weekEnd.getDate()} ${monthLabel(weekEnd)}`;
  }
  return `${weekStart.getDate()} ${monthLabel(weekStart)} . ${weekEnd.getDate()} ${monthLabel(weekEnd)}`;
}

function dayLabel(date: Date): string {
  return `${weekdayFormatter.format(date).toUpperCase().replace('.', '')} ${date.getDate()}`;
}

const DEFAULT_PREFERENCES: GenerationPreferences = {
  meals: ['almoco', 'jantar'],
  priorities: [],
  noCookDays: [],
};

export default function PlanScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const SLOT_LABEL: Partial<Record<MealSlot, string>> = {
    almoco: t('plan.lunch'),
    jantar: t('plan.dinner'),
  };
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEnd = dates[6]!;

  const { data: profile } = useProfile();
  const mode = profile?.chef_mode ?? 'normal';

  const { entries, mealPlan } = useWeekPlan(weekStart);
  const generateWeek = useGenerateWeek();
  const improveWeek = useImproveWeek();
  const createShoppingList = useCreateShoppingListFromWeek();

  const [generateSheetOpen, setGenerateSheetOpen] = useState(false);
  const [addTarget, setAddTarget] = useState<{ date: Date; slot: MealSlot } | null>(null);
  const [menuTarget, setMenuTarget] = useState<PlannedEntry | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const generationMode: MealPlanGenerationMode = mealPlan.data?.generation_mode ?? 'equilibrada';
  const preferences: GenerationPreferences =
    (mealPlan.data?.generation_preferences as unknown as GenerationPreferences | null) ?? DEFAULT_PREFERENCES;

  const byDayAndSlot = useMemo(() => {
    const map = new Map<string, PlannedEntry>();
    for (const planned of entries.data ?? []) {
      map.set(`${planned.entry.plan_date}:${planned.entry.slot}`, planned);
    }
    return map;
  }, [entries.data]);

  const weekIsEmpty = entries.isSuccess && (entries.data?.length ?? 0) === 0;

  const dailyNutrition = useMemo(
    () => dates.map((date) => {
      const dayEntries = (entries.data ?? []).filter((planned) => planned.entry.plan_date === toISODate(date));
      return computeDailyNutrition(dayEntries, mode);
    }),
    [dates, entries.data, mode],
  );
  const weeklyNutrition = useMemo(() => computeWeeklyNutrition(dailyNutrition), [dailyNutrition]);
  const variety = useMemo(() => computeWeeklyVariety(entries.data ?? []), [entries.data]);

  const runImprove = () => {
    improveWeek.mutate(
      { weekStart, mode, generationMode, preferences },
      {
        onSuccess: (result) =>
          setFeedback(
            t('plan.keptAndReorganized', {
              kept: result.keptCount,
              filled: result.filledCount,
            }),
          ),
      },
    );
  };

  return (
    <div className="animate-in px-5 pt-1 pb-24">
      <header className="pt-3">
        <h1 className="font-display text-[30px] font-bold tracking-[-0.03em] text-ink">
          {t('nav.plan')}
        </h1>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            aria-label={t('plan.previousWeek')}
            onClick={() => setWeekStart((current) => addDays(current, -7))}
            className="flex size-9 items-center justify-center rounded-lg border border-hairline text-ink"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek())}
            className="font-mono text-[13px] tracking-[0.08em] text-ink uppercase"
          >
            {headerRange(weekStart, weekEnd)}
          </button>
          <button
            type="button"
            aria-label={t('plan.nextWeek')}
            onClick={() => setWeekStart((current) => addDays(current, 7))}
            className="flex size-9 items-center justify-center rounded-lg border border-hairline text-ink"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>

        {profile ? (
          <p className="mt-2 text-center text-small text-ink-muted">
            {[
              profile.daily_kcal_goal
                ? t('plan.kcalPerDay', { kcal: profile.daily_kcal_goal })
                : null,
              profile.default_servings === 1
                ? t('plan.onePerson')
                : t('plan.peopleCount', { count: profile.default_servings }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <Button size="lg" block onClick={() => setGenerateSheetOpen(true)}>
            <Sparkles aria-hidden className="size-4.5" strokeWidth={2} />
            {t('plan.buildMyWeek')}
          </Button>
          {!weekIsEmpty ? (
            <Button
              variant="ghost"
              size="sm"
              block
              disabled={improveWeek.isPending}
              onClick={runImprove}
            >
              {improveWeek.isPending ? t('plan.improving') : t('plan.improveMyWeek')}
            </Button>
          ) : null}
        </div>

        {feedback ? (
          <Card className="mt-3 p-3">
            <p className="text-small text-ink">{feedback}</p>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="mt-1 text-[12px] font-semibold text-ink-muted underline underline-offset-4"
            >
              {t('plan.close')}
            </button>
          </Card>
        ) : null}
      </header>

      <div className="mt-4">
        <DaySelector dates={dates} />
      </div>

      {entries.isPending ? <Spinner label={t('plan.loadingWeek')} /> : null}
      {entries.isError ? <ErrorState error={entries.error} onRetry={() => void entries.refetch()} /> : null}

      {weekIsEmpty ? (
        <EmptyState
          className="mt-6"
          title={t('plan.emptyWeekTitle')}
          description={t('plan.emptyWeekDescription')}
          action={
            <div className="mt-2 flex w-full flex-col gap-2">
              <Button block onClick={() => setGenerateSheetOpen(true)}>
                {t('plan.buildMyWeek')}
              </Button>
              <Button
                variant="ghost"
                block
                onClick={() =>
                  document.getElementById('plan-day-0')?.scrollIntoView({ behavior: 'smooth' })
                }
              >
                {t('plan.planManually')}
              </Button>
            </div>
          }
        />
      ) : null}

      {!entries.isPending && !entries.isError && !weekIsEmpty ? (
        <>
          <div className="mt-2 flex flex-col gap-7">
            {dates.map((date, dayIndex) => (
              <section key={date.toISOString()} id={`plan-day-${dayIndex}`} className="scroll-mt-14">
                <DataLabel className="mb-2 block">{dayLabel(date)}</DataLabel>

                <div className="flex flex-col gap-3">
                  {MEAL_SLOTS.map((slot) => {
                    const planned = byDayAndSlot.get(`${toISODate(date)}:${slot}`);
                    return (
                      <div key={slot}>
                        <p className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                          {SLOT_LABEL[slot]}
                        </p>
                        {planned ? (
                          <MealCard
                            planned={planned}
                            mode={mode}
                            onOpenMenu={() => setMenuTarget(planned)}
                            onOpenRecipe={
                              planned.recipe
                                ? () => navigate(routes.recipe(planned.recipe!.slug))
                                : undefined
                            }
                          />
                        ) : (
                          <EmptySlotCard onClick={() => setAddTarget({ date, slot })} />
                        )}
                      </div>
                    );
                  })}
                </div>

                <DaySummary nutrition={dailyNutrition[dayIndex]!} profile={profile ?? null} />
              </section>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-4">
            <WeekSummaryCard entries={entries.data ?? []} nutrition={weeklyNutrition} />
            <VarietyCard report={variety} onImprove={runImprove} />

            <Button
              variant="ghost"
              block
              disabled={createShoppingList.isPending}
              onClick={() =>
                createShoppingList.mutate(
                  { weekStart, mode },
                  {
                    onSuccess: (count) =>
                      setFeedback(
                        count > 0 ? t('plan.shoppingListUpdated') : t('plan.noRecipesForList'),
                      ),
                  },
                )
              }
            >
              <ShoppingBasket aria-hidden className="size-4.5" strokeWidth={1.75} />
              {createShoppingList.isPending ? t('plan.creatingList') : t('plan.createShoppingList')}
            </Button>
          </div>
        </>
      ) : null}

      <GenerateWeekSheet
        open={generateSheetOpen}
        onClose={() => setGenerateSheetOpen(false)}
        profile={profile ?? null}
        isPending={generateWeek.isPending}
        onSubmit={(input) =>
          generateWeek.mutate(
            { weekStart, mode, ...input },
            {
              onSuccess: () => {
                setGenerateSheetOpen(false);
                setFeedback(t('plan.weekReady'));
              },
            },
          )
        }
      />

      {addTarget ? (
        <AddMealSheet
          open
          onClose={() => setAddTarget(null)}
          date={addTarget.date}
          slot={addTarget.slot}
          mode={mode}
          weekEntries={entries.data ?? []}
          generationMode={generationMode}
          preferences={preferences}
        />
      ) : null}

      {menuTarget ? (
        <MealMenuSheet
          open
          onClose={() => setMenuTarget(null)}
          planned={menuTarget}
          weekDates={dates}
          tomorrowIsFree={
            !byDayAndSlot.has(
              `${toISODate(addDays(parseISODate(menuTarget.entry.plan_date), 1))}:${menuTarget.entry.slot}`,
            )
          }
          onTrocarReceita={() =>
            setAddTarget({ date: parseISODate(menuTarget.entry.plan_date), slot: menuTarget.entry.slot })
          }
        />
      ) : null}
    </div>
  );
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}
