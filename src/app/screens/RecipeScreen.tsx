import { BookOpen, Check, ImagePlus, Pencil, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { routes } from '@/app/routes';
import { FavoriteButton } from '@/components/FavoriteButton';
import { DataLabel } from '@/components/ui/Card';
import { RecipeImage } from '@/components/ui/RecipeImage';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { CHEF_MODES } from '@/domain/chef-modes';
import { EQUIPMENT_THEME, equipmentLabel, visibleEquipment } from '@/domain/equipment';
import { formatAmount, scaleLine, servingFactor } from '@/domain/scaling';
import type { ChefMode, EquipmentType } from '@/domain/types';
import { useAddPath } from '@/features/generate/hooks';
import { useEquipment, useProfile } from '@/features/profile/hooks';
import { useRecipe, useSetRecipePhoto, useUpdateIngredientName } from '@/features/recipes/hooks';
import { useAddRecipeToList } from '@/features/shopping/hooks';
import { useSpeechOutput } from '@/hooks/useSpeechOutput';
import { cn } from '@/lib/cn';
import { formatDuration, formatGrams, formatKcal } from '@/lib/format';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/pt';

type Tab = 'steps' | 'ingredients' | 'info';

const TAB_LABEL_KEY: Record<Tab, TranslationKey> = {
  steps: 'recipe.tabSteps',
  ingredients: 'recipe.tabIngredients',
  info: 'recipe.tabInfo',
};
const TABS: Tab[] = ['steps', 'ingredients', 'info'];

/**
 * The recipe sheet.
 *
 * Its spine is the promise the product makes: this recipe has been rewritten
 * for *your* chef, and here are the routes *your* kitchen can actually run. The
 * "Adaptada ao seu perfil" panel and the path list are therefore the two blocks
 * that must never be cut for space.
 */
export default function RecipeScreen() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: ownedEquipment } = useEquipment();
  const { language, t } = useLanguage();
  const speechOutput = useSpeechOutput();
  const addPath = useAddPath();

  const [mode, setMode] = useState<ChefMode | null>(null);
  const activeMode = mode ?? profile?.chef_mode ?? 'normal';

  const [servings, setServings] = useState<number | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('steps');
  const [showModes, setShowModes] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [ingredientDraft, setIngredientDraft] = useState('');

  const recipe = useRecipe(slug, activeMode);
  const setPhoto = useSetRecipePhoto();
  const updateIngredient = useUpdateIngredientName();
  const addToList = useAddRecipeToList();

  if (recipe.isPending) return <Spinner label={t('recipe.loading')} />;
  if (recipe.isError) {
    return <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />;
  }
  if (!recipe.data) {
    return (
      <EmptyState
        title={t('recipe.notFoundTitle')}
        description={t('recipe.notFoundDescription')}
      />
    );
  }

  const data = recipe.data;
  const activeServings = servings ?? data.defaultServings;
  const factor = servingFactor(activeServings, data.defaultServings);
  // Paths arrive sorted by how well they fit the user's kitchen.
  const activePath = data.paths.find((path) => path.id === pathId) ?? data.paths[0];
  const nutrition = data.variants[activeMode];
  const availableModes = CHEF_MODES.filter((chef) => data.variants[chef.id]);

  // Two routes through the same appliances are not a choice — they are a
  // generator slip. Compare the kit each needs, not the count.
  const distinctKits = new Set(
    data.paths.map((path) => [...visibleEquipment(path.requiredEquipment)].sort().join('+')),
  );
  const hasPathChoice = distinctKits.size > 1;

  // Appliances the user owns that no route uses yet — "trocar de air fryer
  // para forno" without leaving the recipe sheet. Only offered on a draft
  // this account authored: migration 12's policies refuse the write
  // otherwise, and a button that always fails is worse than no button.
  const usedByAnyPath = new Set(data.paths.flatMap((path) => path.requiredEquipment));
  const swappableEquipment: EquipmentType[] =
    data.status === 'draft'
      ? (ownedEquipment ?? [])
          .map((row) => row.equipment)
          .filter((item) => item !== 'none' && !usedByAnyPath.has(item))
      : [];

  const stats = [
    { label: t('recipe.statTime'), value: formatDuration(data.totalMinutes) },
    { label: t('recipe.statActive'), value: formatDuration(data.activeMinutes) },
    { label: t('recipe.statServings'), value: String(activeServings) },
    {
      label: t('recipe.statLevel'),
      value:
        data.difficulty === 'facil'
          ? t('home.difficultyEasy')
          : data.difficulty === 'medio'
            ? t('home.difficultyMedium')
            : t('home.difficultyHard'),
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="animate-in flex-1">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="relative h-[230px]">
          {/* A linked photo can rot — that is the trade migration 16 makes.
              When it does, RecipeImage falls back to the empty frame rather
              than to the browser's broken-image glyph, which looks like our
              bug. */}
          <RecipeImage src={data.heroImageUrl} className="absolute inset-0" fallback={null} />

          {/* Your own draft, so your own photo. Offered here rather than in a
              settings screen because this is where you notice it is missing.
              The picture is linked, never uploaded — see migration 16. */}
          {data.status === 'draft' ? (
            <button
              type="button"
              onClick={() => setEditingPhoto((open) => !open)}
              className="absolute right-4 bottom-3 flex h-9 items-center gap-2 rounded-pill border border-hairline bg-raised/90 px-3 text-small font-semibold text-ink backdrop-blur"
            >
              <ImagePlus aria-hidden className="size-4" />
              {data.heroImageUrl ? t('recipe.changePhoto') : t('recipe.addPhoto')}
            </button>
          ) : null}

          <div className="absolute inset-x-4 top-3 flex justify-between">
            <button
              type="button"
              aria-label={t('recipe.back')}
              onClick={() => void navigate(-1)}
              className="flex size-10 items-center justify-center rounded-pill border border-hairline bg-raised/90 text-ink backdrop-blur"
            >
              ←
            </button>
            <div className="flex gap-2">
              {speechOutput.isSupported && activePath ? (
                <button
                  type="button"
                  aria-label={speechOutput.isSpeaking ? t('recipe.stopReading') : t('recipe.listenToRecipe')}
                  onClick={() =>
                    speechOutput.isSpeaking
                      ? speechOutput.stop()
                      : speechOutput.speak(
                          [
                            data.title,
                            ...activePath.steps.map(
                              (step, position) =>
                                `${position + 1}. ${step.verb ? `${step.verb}. ` : ''}${step.instruction}`,
                            ),
                          ].join('. '),
                          language,
                        )
                  }
                  className="flex size-10 items-center justify-center rounded-pill border border-hairline bg-raised/90 text-ink backdrop-blur"
                >
                  {speechOutput.isSpeaking ? (
                    <VolumeX aria-hidden className="size-[18px]" />
                  ) : (
                    <Volume2 aria-hidden className="size-[18px]" />
                  )}
                </button>
              ) : null}
              <FavoriteButton recipe={data} />
            </div>
          </div>
        </div>

        {editingPhoto ? (
          <div className="border-b border-hairline bg-raised px-5 py-4">
            <label className="block text-small text-ink-muted" htmlFor="photo-url">
              {t('recipe.photoLink')}
            </label>
            <input
              id="photo-url"
              type="url"
              inputMode="url"
              value={photoUrl}
              onChange={(event) => setPhotoUrl(event.target.value)}
              placeholder={t('recipe.photoUrlPlaceholder')}
              className="mt-1 h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
            />
            <p className="mt-2 text-small text-ink-muted">{t('recipe.photoLinkHint')}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={setPhoto.isPending}
                onClick={() =>
                  setPhoto.mutate(
                    { recipeId: data.id, photoUrl },
                    { onSuccess: () => setEditingPhoto(false) },
                  )
                }
                className="h-[42px] rounded-lg bg-graphite-900 px-4 text-[14px] font-semibold text-porcelain-100 disabled:opacity-45"
              >
                {setPhoto.isPending ? t('recipe.saving') : t('recipe.save')}
              </button>
              <button
                type="button"
                onClick={() => setEditingPhoto(false)}
                className="h-[42px] rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink"
              >
                {t('recipe.cancel')}
              </button>
            </div>
            {setPhoto.isError ? (
              <p className="mt-2 text-small text-rouge">{setPhoto.error.message}</p>
            ) : null}
          </div>
        ) : null}

        <div className="px-5 pb-6">
          <DataLabel tone="signal" className="mt-5">
            {data.authorName}
          </DataLabel>
          <h1 className="mt-2.5 font-display text-[32px] leading-[1.04] font-bold tracking-[-0.03em] text-wrap-pretty text-ink">
            {data.title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <DataLabel>{stat.label}</DataLabel>
                <span className="font-mono text-[13px] text-ink">{stat.value}</span>
              </div>
            ))}
          </div>

          {/* ── Adapted to you ───────────────────────────────────────── */}
          {nutrition ? (
            <div className="mt-6 rounded-lg border border-hairline border-l-2 border-l-rouge bg-raised p-4">
              <DataLabel tone="signal">{t('recipe.adaptedToYou')}</DataLabel>
              {nutrition.changes.length > 0 ? (
                <ul className="mt-3.5 flex flex-col gap-2">
                  {nutrition.changes.map((change) => (
                    <li key={change} className="flex items-start gap-2.5">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ok" />
                      <span className="text-small leading-[1.5] text-ink-secondary">{change}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3.5 text-small leading-[1.5] text-ink-secondary">
                  {t('recipe.thisIsVersion', {
                    mode: CHEF_MODES.find((c) => c.id === activeMode)?.label ?? '',
                  })}
                </p>
              )}

              {availableModes.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowModes((open) => !open)}
                    aria-expanded={showModes}
                    className="mt-3.5 text-[13px] font-semibold text-rouge"
                  >
                    {showModes ? t('recipe.close') : t('recipe.changeChef')}
                  </button>
                  {showModes ? (
                    <div className="animate-fade mt-3.5 flex gap-2" role="radiogroup">
                      {availableModes.map((chef) => {
                        const active = activeMode === chef.id;
                        return (
                          <button
                            key={chef.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setMode(chef.id)}
                            className={cn(
                              'flex-1 rounded-lg border px-3 py-2.5 text-[13px] font-semibold',
                              active
                                ? 'border-transparent bg-graphite-900 text-porcelain-100'
                                : 'border-hairline text-ink-muted',
                            )}
                          >
                            {chef.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {/* ── Paths ──────────────────────────────────────────────────
              Only shown when there is a real choice. A recipe with one route —
              or several that need the same appliances — turns this block into
              a question with one answer, which reads as noise. */}
          {hasPathChoice ? (
            <>
              <h2 className="mt-6.5 mb-1 font-display text-[21px] font-bold tracking-[-0.02em] text-ink">
                {t('recipe.howToPrepare')}
              </h2>
              <p className="mb-3 text-small text-ink-muted">{t('recipe.onlyPossiblePaths')}</p>
              <div className="flex flex-col gap-2">
                {data.paths.map((path) => {
                  const isActive = path.id === activePath?.id;
                  return (
                    <button
                      key={path.id}
                      type="button"
                      onClick={() => setPathId(path.id)}
                      aria-pressed={isActive}
                      className={cn(
                        'rounded-lg border p-4 text-left transition-colors duration-[140ms] ease-signal',
                        isActive ? 'border-rouge bg-card' : 'border-hairline',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex flex-none items-center gap-1.5">
                            {visibleEquipment(path.requiredEquipment).map((item) => (
                              <span
                                key={item}
                                aria-hidden
                                className="size-2.5 rounded-xs"
                                style={{ background: EQUIPMENT_THEME[item].colorVar }}
                              />
                            ))}
                          </span>
                          <span className="text-body font-medium text-ink">{path.name}</span>
                        </span>
                        <span className="flex-none font-mono text-[13px] text-ink-muted">
                          {formatDuration(path.totalMinutes)}
                        </span>
                      </span>

                      {path.isRecommended && path.reason ? (
                        <span className="mt-2 block">
                          <DataLabel tone="signal">{t('recipe.recommended')}</DataLabel>
                          <span className="mt-1.5 block text-small leading-[1.45] text-ink-secondary">
                            {path.reason}
                          </span>
                        </span>
                      ) : null}

                      {path.missingEquipment.length > 0 ? (
                        <span className="mt-2 block text-small text-rouge">
                          {t('recipe.missing')}:{' '}
                          {visibleEquipment(path.missingEquipment).map(equipmentLabel).join(', ')}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* ── Change appliance ─────────────────────────────────────────
              The chef writes a new path for it, without touching the ones
              that already exist — same mechanism as PrepScreen's "Tenho
              outro aparelho", surfaced here so it doesn't take a detour
              through the pre-flight screen to reach. */}
          {swappableEquipment.length > 0 ? (
            <section className="mt-6.5">
              <DataLabel>{t('recipe.changeAppliance')}</DataLabel>
              <p className="mt-2 text-small leading-[1.5] text-ink-muted">
                {t('recipe.changeApplianceHint')}
              </p>
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {swappableEquipment.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={addPath.isPending}
                    onClick={() =>
                      addPath.mutate({
                        recipeId: data.id,
                        title: data.title,
                        ingredients: data.groups.flatMap((group) =>
                          group.items.map((line) => line.displayName),
                        ),
                        equipment: item,
                        equipmentLabel: EQUIPMENT_THEME[item].label,
                        mode: activeMode,
                        servings: activeServings,
                        existingPaths: data.paths.length,
                      })
                    }
                    className="sn-tag shrink-0 cursor-pointer disabled:opacity-45"
                  >
                    {addPath.isPending && addPath.variables?.equipment === item
                      ? t('recipe.writing')
                      : EQUIPMENT_THEME[item].short}
                  </button>
                ))}
              </div>
              {addPath.isError ? (
                <p className="mt-2 text-small text-rouge">
                  {addPath.error instanceof Error
                    ? addPath.error.message
                    : t('recipe.couldNotWritePath')}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <div className="mt-6.5 flex gap-1.5 border-b border-hairline">
            {TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setTab(entry)}
                aria-selected={tab === entry}
                role="tab"
                className={cn(
                  '-mb-px border-b-2 px-3 py-2.5 text-small font-semibold',
                  tab === entry ? 'border-rouge text-ink' : 'border-transparent text-ink-muted',
                )}
              >
                {t(TAB_LABEL_KEY[entry])}
              </button>
            ))}
          </div>

          {tab === 'steps' && activePath ? (
            <div className="flex flex-col">
              {activePath.steps.map((step, position) => (
                <div key={step.id} className="flex gap-3.5 border-b border-hairline py-4">
                  <DataLabel className="flex-none pt-0.75">
                    {String(position + 1).padStart(2, '0')}
                  </DataLabel>
                  <div className="min-w-0 flex-1">
                    {/* The verb lives in its own column because cook mode shows
                        it big above the sentence. Dropped here, the sentence
                        reads as a fragment — "as batatas em fatias bem finas" —
                        since the instruction deliberately does not repeat it. */}
                    {step.verb ? (
                      <p className="font-mono text-[11px] tracking-[0.14em] text-rouge uppercase">
                        {step.verb}
                      </p>
                    ) : null}
                    <p className="mt-1 text-body leading-[1.5] text-ink">{step.instruction}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="sn-badge">{EQUIPMENT_THEME[step.equipment].short}</span>
                      {step.dials.map((dial) => (
                        <span key={dial.kind} className="sn-badge">
                          {dial.valueText ?? dial.valueNum}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'ingredients' ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 border-b border-hairline pb-4">
                <DataLabel>{t('recipe.statServings')}</DataLabel>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="sn-iconbtn"
                    data-variant="outline"
                    aria-label={t('recipe.fewerServings')}
                    onClick={() => setServings(Math.max(1, activeServings - 1))}
                  >
                    −
                  </button>
                  {/* `<output>` rather than a span: it is a live region by
                      default, so the new count is announced instead of silently
                      redrawn. Without it the only feedback for a screen reader
                      was the ingredient amounts changing further down. */}
                  <output
                    aria-label={`${activeServings} ${activeServings === 1 ? t('recipe.servingSingular') : t('recipe.servingPlural')}`}
                    className="min-w-4 text-center font-mono text-heading text-ink"
                  >
                    {activeServings}
                  </output>
                  <button
                    type="button"
                    className="sn-iconbtn"
                    data-variant="outline"
                    aria-label={t('recipe.moreServings')}
                    onClick={() => setServings(Math.min(20, activeServings + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              {data.groups.map((group) => (
                <div key={group.id ?? group.name} className="mt-5.5">
                  <DataLabel tone="primary">{group.name}</DataLabel>
                  <div className="mt-2.5">
                    {group.items.map((item) => {
                      const scaled = scaleLine(item, factor);
                      const isChecked = checked.includes(item.id);

                      if (editingIngredientId === item.id) {
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 border-b border-hairline py-3"
                          >
                            <input
                              type="text"
                              value={ingredientDraft}
                              onChange={(event) => setIngredientDraft(event.target.value)}
                              autoFocus
                              className="h-10 min-w-0 flex-1 rounded-lg border border-hairline bg-transparent px-2.5 text-body text-ink outline-none"
                            />
                            <button
                              type="button"
                              disabled={updateIngredient.isPending}
                              onClick={() =>
                                updateIngredient.mutate(
                                  { ingredientId: item.id, displayName: ingredientDraft },
                                  { onSuccess: () => setEditingIngredientId(null) },
                                )
                              }
                              className="h-9 shrink-0 rounded-lg bg-graphite-900 px-3 text-[13px] font-semibold text-porcelain-100 disabled:opacity-45"
                            >
                              {updateIngredient.isPending ? t('recipe.saving') : t('recipe.save')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingIngredientId(null)}
                              className="h-9 shrink-0 rounded-lg border border-strong px-3 text-[13px] font-semibold text-ink"
                            >
                              {t('recipe.cancel')}
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          className="flex w-full items-start gap-1 border-b border-hairline py-3"
                        >
                          <button
                            type="button"
                            aria-pressed={isChecked}
                            onClick={() =>
                              setChecked((current) =>
                                current.includes(item.id)
                                  ? current.filter((id) => id !== item.id)
                                  : [...current, item.id],
                              )
                            }
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-xs border text-[11px]',
                                isChecked
                                  ? 'border-transparent bg-graphite-900 text-porcelain-100'
                                  : 'border-strong text-transparent',
                              )}
                            >
                              ✓
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  'block text-body text-ink',
                                  isChecked && 'text-ink-muted line-through',
                                )}
                              >
                                {scaled.displayName}
                              </span>
                              {scaled.note ? (
                                <span className="mt-1 block text-small text-ink-muted">
                                  {scaled.note}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-mono text-[13px] text-ink-secondary">
                              {formatAmount(scaled.quantity, scaled.unit)}
                            </span>
                          </button>
                          {data.status === 'draft' ? (
                            <button
                              type="button"
                              aria-label={t('recipe.changeIngredient')}
                              onClick={() => {
                                setIngredientDraft(item.displayName);
                                setEditingIngredientId(item.id);
                              }}
                              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-muted"
                            >
                              <Pencil aria-hidden className="size-[15px]" strokeWidth={1.75} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                type="button"
                disabled={addToList.isPending || addToList.isSuccess}
                onClick={() =>
                  addToList.mutate({
                    recipeId: data.id,
                    servings: activeServings,
                    mode: activeMode,
                  })
                }
                className="mt-5 h-[46px] w-full rounded-lg border border-strong text-[14px] font-semibold text-ink disabled:opacity-45"
              >
                {addToList.isSuccess
                  ? t('recipe.addedToList')
                  : addToList.isPending
                    ? t('recipe.adding')
                    : t('recipe.addToShoppingList')}
              </button>
              {addToList.isError ? (
                <p className="mt-2 text-small text-rouge">
                  {addToList.error instanceof Error
                    ? addToList.error.message
                    : t('recipe.couldNotAdd')}
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === 'info' ? (
            <div className="mt-4">
              <DataLabel>{t('recipe.perServing')}</DataLabel>
              <div className="mt-2.5 flex flex-col">
                {[
                  { label: t('recipe.calories'), value: formatKcal(nutrition?.kcal ?? null) },
                  { label: t('recipe.protein'), value: formatGrams(nutrition?.protein_g ?? null) },
                  { label: t('recipe.carbs'), value: formatGrams(nutrition?.carbs_g ?? null) },
                  { label: t('recipe.fat'), value: formatGrams(nutrition?.fat_g ?? null) },
                  { label: t('recipe.fiber'), value: formatGrams(nutrition?.fiber_g ?? null) },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-3 border-b border-hairline py-3.5"
                  >
                    <span className="text-body text-ink-secondary">{row.label}</span>
                    <span className="font-mono text-[13px] text-ink">{row.value}</span>
                  </div>
                ))}
              </div>
              {/* Ces valeurs sont *par portion* : elles ne bougent pas quand on
                  change le nombre de portions, et le texte disait le contraire.
                  Une phrase qui promet une réaction qui n'aura pas lieu fait
                  passer un comportement correct pour une panne. */}
              <p className="mt-4.5 text-small leading-[1.6] text-ink-muted">
                {t('recipe.perServingHint')}
              </p>

              {data.notes.length > 0 ? (
                <div className="mt-6 flex flex-col gap-3">
                  {data.notes.map((note) => (
                    <div key={note.id} className="rounded-lg border border-hairline bg-raised p-4">
                      {note.title ? (
                        <p className="text-small font-semibold text-ink">{note.title}</p>
                      ) : null}
                      <p className="mt-1 text-small leading-[1.5] text-ink-muted">{note.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Start ──────────────────────────────────────────────────────
          Sticky above the tab bar rather than `fixed`: as a fixed bar it
          overlapped the last 31px of the sheet, measured. */}
      <div className="sticky bottom-[var(--tabbar-height)] z-10 flex-none border-t border-hairline bg-base px-5 pt-3 pb-5">
        <div className="flex items-center gap-2">
          {/* The book page, next to the cook button rather than buried in a
              tab: it is the other way of reading this recipe, and the one you
              want when the phone is going on the counter. */}
          <Link
            to={routes.recipeSpread(data.slug)}
            aria-label={t('recipe.openSheet')}
            className="flex size-[50px] flex-none items-center justify-center rounded-lg border border-strong text-ink no-underline"
          >
            <BookOpen aria-hidden className="size-5" />
          </Link>
          <Link
            to={
              activePath
                ? `${routes.prep(data.slug)}?path=${encodeURIComponent(activePath.slug)}`
                : routes.prep(data.slug)
            }
            className="flex h-[50px] flex-1 items-center justify-center rounded-lg bg-graphite-900 text-body font-semibold text-porcelain-100 no-underline"
          >
            {t('recipe.letsCook')}
          </Link>
        </div>
        {activePath ? (
          <DataLabel className="mt-2.5 flex w-full justify-center">{activePath.name}</DataLabel>
        ) : null}
      </div>
    </div>
  );
}
