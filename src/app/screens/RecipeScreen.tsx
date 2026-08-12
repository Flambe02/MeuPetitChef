import { BookOpen, Check, ImagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { routes } from '@/app/routes';
import { FavoriteButton } from '@/components/FavoriteButton';
import { DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { CHEF_MODES } from '@/domain/chef-modes';
import { EQUIPMENT_THEME, equipmentLabel, visibleEquipment } from '@/domain/equipment';
import { formatAmount, scaleLine, servingFactor } from '@/domain/scaling';
import type { ChefMode } from '@/domain/types';
import { useProfile } from '@/features/profile/hooks';
import { useRecipe, useSetRecipePhoto } from '@/features/recipes/hooks';
import { useAddRecipeToList } from '@/features/shopping/hooks';
import { cn } from '@/lib/cn';
import { formatDuration, formatGrams, formatKcal } from '@/lib/format';

type Tab = 'steps' | 'ingredients' | 'info';

const TABS: { id: Tab; label: string }[] = [
  { id: 'steps', label: 'Etapas' },
  { id: 'ingredients', label: 'Ingredientes' },
  { id: 'info', label: 'Informações' },
];

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

  const [mode, setMode] = useState<ChefMode | null>(null);
  const activeMode = mode ?? profile?.chef_mode ?? 'normal';

  const [servings, setServings] = useState<number | null>(null);
  const [pathId, setPathId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('steps');
  const [showModes, setShowModes] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');

  const recipe = useRecipe(slug, activeMode);
  const setPhoto = useSetRecipePhoto();
  const addToList = useAddRecipeToList();

  if (recipe.isPending) return <Spinner label="Carregando a receita…" />;
  if (recipe.isError) {
    return <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />;
  }
  if (!recipe.data) {
    return (
      <EmptyState title="Receita não encontrada" description="Ela pode ter sido despublicada." />
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

  const stats = [
    { label: 'Tempo', value: formatDuration(data.totalMinutes) },
    { label: 'Ativo', value: formatDuration(data.activeMinutes) },
    { label: 'Porções', value: String(activeServings) },
    {
      label: 'Nível',
      value:
        data.difficulty === 'facil' ? 'Fácil' : data.difficulty === 'medio' ? 'Médio' : 'Difícil',
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="animate-in flex-1">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="relative h-[230px] bg-inset">
          {data.heroImageUrl ? (
            <img src={data.heroImageUrl} alt="" className="size-full object-cover" />
          ) : null}

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
              {data.heroImageUrl ? 'Trocar a foto' : 'Adicionar foto'}
            </button>
          ) : null}

          <div className="absolute inset-x-4 top-3 flex justify-between">
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => void navigate(-1)}
              className="flex size-10 items-center justify-center rounded-pill border border-hairline bg-raised/90 text-ink backdrop-blur"
            >
              ←
            </button>
            <FavoriteButton recipe={data} />
          </div>
        </div>

        {editingPhoto ? (
          <div className="border-b border-hairline bg-raised px-5 py-4">
            <label className="block text-small text-ink-muted" htmlFor="photo-url">
              Link da foto
            </label>
            <input
              id="photo-url"
              type="url"
              inputMode="url"
              value={photoUrl}
              onChange={(event) => setPhotoUrl(event.target.value)}
              placeholder="https://…/foto.jpg"
              className="mt-1 h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
            />
            <p className="mt-2 text-small text-ink-muted">
              A foto continua onde está — guardamos só o endereço. Deixe em branco para remover.
            </p>
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
                {setPhoto.isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setEditingPhoto(false)}
                className="h-[42px] rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink"
              >
                Cancelar
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
              <DataLabel tone="signal">Adaptada ao seu perfil</DataLabel>
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
                  Esta é a versão {CHEF_MODES.find((c) => c.id === activeMode)?.label} da receita.
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
                    {showModes ? 'Fechar' : 'Alterar o chef'}
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
                Como você quer preparar esta receita?
              </h2>
              <p className="mb-3 text-small text-ink-muted">
                Só os caminhos possíveis com os seus equipamentos.
              </p>
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
                          <DataLabel tone="signal">Recomendado</DataLabel>
                          <span className="mt-1.5 block text-small leading-[1.45] text-ink-secondary">
                            {path.reason}
                          </span>
                        </span>
                      ) : null}

                      {path.missingEquipment.length > 0 ? (
                        <span className="mt-2 block text-small text-rouge">
                          Falta:{' '}
                          {visibleEquipment(path.missingEquipment).map(equipmentLabel).join(', ')}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* ── Tabs ─────────────────────────────────────────────────── */}
          <div className="mt-6.5 flex gap-1.5 border-b border-hairline">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-selected={tab === entry.id}
                role="tab"
                className={cn(
                  '-mb-px border-b-2 px-3 py-2.5 text-small font-semibold',
                  tab === entry.id ? 'border-rouge text-ink' : 'border-transparent text-ink-muted',
                )}
              >
                {entry.label}
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
                <DataLabel>Porções</DataLabel>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="sn-iconbtn"
                    data-variant="outline"
                    aria-label="Menos porções"
                    onClick={() => setServings(Math.max(1, activeServings - 1))}
                  >
                    −
                  </button>
                  <span className="min-w-4 text-center font-mono text-heading text-ink">
                    {activeServings}
                  </span>
                  <button
                    type="button"
                    className="sn-iconbtn"
                    data-variant="outline"
                    aria-label="Mais porções"
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
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={isChecked}
                          onClick={() =>
                            setChecked((current) =>
                              current.includes(item.id)
                                ? current.filter((id) => id !== item.id)
                                : [...current, item.id],
                            )
                          }
                          className="flex w-full items-start gap-3 border-b border-hairline py-3 text-left"
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
                  ? 'Adicionado à lista ✓'
                  : addToList.isPending
                    ? 'Adicionando…'
                    : 'Adicionar à lista de compras'}
              </button>
              {addToList.isError ? (
                <p className="mt-2 text-small text-rouge">
                  {addToList.error instanceof Error
                    ? addToList.error.message
                    : 'Não foi possível adicionar.'}
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === 'info' ? (
            <div className="mt-4">
              <DataLabel>Por porção</DataLabel>
              <div className="mt-2.5 flex flex-col">
                {[
                  { label: 'Calorias', value: formatKcal(nutrition?.kcal ?? null) },
                  { label: 'Proteínas', value: formatGrams(nutrition?.protein_g ?? null) },
                  { label: 'Carboidratos', value: formatGrams(nutrition?.carbs_g ?? null) },
                  { label: 'Gorduras', value: formatGrams(nutrition?.fat_g ?? null) },
                  { label: 'Fibras', value: formatGrams(nutrition?.fiber_g ?? null) },
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
              <p className="mt-4.5 text-small leading-[1.6] text-ink-muted">
                Valores estimados para o chef selecionado e o número de porções escolhido.
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
            aria-label="Abrir a ficha"
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
            Vamos cozinhar
          </Link>
        </div>
        {activePath ? (
          <DataLabel className="mt-2.5 flex w-full justify-center">{activePath.name}</DataLabel>
        ) : null}
      </div>
    </div>
  );
}
