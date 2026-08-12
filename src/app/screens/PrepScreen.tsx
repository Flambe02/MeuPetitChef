import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { routes } from '@/app/routes';
import { DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME, visibleEquipment } from '@/domain/equipment';
import { formatAmount, scaleLine, servingFactor } from '@/domain/scaling';
import type { EquipmentType } from '@/domain/types';
import { useAddPath } from '@/features/generate/hooks';
import { useEquipment, useProfile } from '@/features/profile/hooks';
import { useRecipe } from '@/features/recipes/hooks';
import { cn } from '@/lib/cn';
import { formatDuration, formatKcal } from '@/lib/format';
import { asset } from '@/lib/asset';

/**
 * "Antes de começar" — the pre-flight before guided cooking.
 *
 * Its job is to stop someone starting an eighteen-step recipe and discovering at
 * step twelve that they needed an appliance they do not have. Removing one here
 * re-picks the best route that does not need it, rather than leaving the cook
 * stranded mid-recipe.
 */
export default function PrepScreen() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: profile } = useProfile();

  const mode = profile?.chef_mode ?? 'normal';
  const recipe = useRecipe(slug, mode);
  const equipment = useEquipment();
  const addPath = useAddPath();

  const [removed, setRemoved] = useState<EquipmentType[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [servings, setServings] = useState<number | null>(null);

  // Memoised: `?? []` would hand `path` a fresh array on every render and
  // defeat the memo below.
  const paths = useMemo(() => recipe.data?.paths ?? [], [recipe.data]);

  /** Best route that needs none of the appliances the cook just removed. */
  const path = useMemo(() => {
    const wanted = params.get('path');
    const preferred = paths.find((p) => p.id === wanted || p.slug === wanted) ?? paths[0];
    if (removed.length === 0) return preferred;
    const runnable = paths.find(
      (p) => !visibleEquipment(p.requiredEquipment).some((e) => removed.includes(e)),
    );
    return runnable ?? preferred;
  }, [paths, params, removed]);

  if (recipe.isPending) return <Spinner label="Carregando…" />;
  if (recipe.isError) {
    return <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />;
  }
  if (!recipe.data || !path) {
    return (
      <EmptyState
        title="Sem percurso de preparo"
        description="Esta receita ainda não tem um caminho publicado."
      />
    );
  }

  const data = recipe.data;
  const activeServings = servings ?? data.defaultServings;
  const factor = servingFactor(activeServings, data.defaultServings);
  const nutrition = data.variants[mode];
  const guidedSteps = path.microSteps.length;

  // Did removing something actually move us to a different route? Saying "I
  // switched paths" when there was only ever one is a lie the cook can see.
  const switched = path.id !== (paths.find((p) => p.slug === params.get('path')) ?? paths[0])?.id;

  // Appliances the user owns that no route uses yet. Only offered on a draft
  // they authored — migration 12's policies would refuse the write otherwise,
  // and a button that always fails is worse than no button.
  const isOwnDraft = data.status === 'draft';
  const usedByAnyPath = new Set(paths.flatMap((p) => p.requiredEquipment));
  const canAddPath = isOwnDraft
    ? (equipment.data ?? [])
        .map((row) => row.equipment)
        .filter((item) => item !== 'none' && !usedByAnyPath.has(item))
    : [];

  const stepsUsing = (equipment: EquipmentType) =>
    path.microSteps.filter((step) => step.equipment === equipment).length;

  // Every appliance the recipe mentions, not just this route's — the design
  // lists the unused ones greyed out so the choice of route is legible. What
  // this route actually uses comes first, busiest appliance at the top.
  const allEquipment = visibleEquipment([
    ...new Set(paths.flatMap((p) => p.requiredEquipment)),
  ]).sort((a, b) => stepsUsing(b) - stepsUsing(a));

  const toggleRemoved = (equipment: EquipmentType) =>
    setRemoved((current) =>
      current.includes(equipment)
        ? current.filter((e) => e !== equipment)
        : [...current, equipment],
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="animate-in flex-1 px-5 pt-1 pb-6">
        <Link
          to={routes.recipe(data.slug)}
          className="sn-btn inline-flex pl-0 no-underline"
          data-variant="quiet"
        >
          ← Receita
        </Link>

        <h1 className="mt-2.5 mb-1.5 font-display text-[28px] leading-[1.06] font-bold tracking-[-0.03em] text-ink">
          Antes de começar
        </h1>
        <p className="mb-5.5 text-small leading-[1.5] text-ink-muted">
          {path.name} · {formatDuration(path.totalMinutes ?? data.totalMinutes)}
        </p>

        {/* ── Equipment ────────────────────────────────────────────── */}
        <DataLabel>Equipamentos necessários</DataLabel>
        <div className="mt-3 flex flex-col gap-2">
          {allEquipment.map((equipment) => {
            const theme = EQUIPMENT_THEME[equipment];
            const count = stepsUsing(equipment);
            const isUsed = count > 0;
            const isRemoved = removed.includes(equipment);
            return (
              <div
                key={equipment}
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3.5',
                  isUsed && !isRemoved ? 'bg-raised' : 'border-hairline opacity-55',
                )}
                style={
                  isUsed && !isRemoved ? { borderColor: theme.colorVar, borderWidth: 1 } : undefined
                }
              >
                <span
                  aria-hidden
                  className="size-5 shrink-0 rounded-xs"
                  style={{ background: isUsed && !isRemoved ? theme.colorVar : 'var(--steel-400)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-ink">{theme.label}</span>
                  <span className="mt-1 block font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                    {isRemoved
                      ? 'Removido'
                      : isUsed
                        ? `${count} ${count === 1 ? 'etapa' : 'etapas'}`
                        : 'Não usado neste caminho'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => toggleRemoved(equipment)}
                  className="h-[38px] shrink-0 rounded-lg border border-hairline px-4 text-small font-semibold text-ink"
                >
                  {isRemoved ? 'Devolver' : 'Remover'}
                </button>
              </div>
            );
          })}
        </div>

        {removed.length > 0 ? (
          <div className="mt-3.5 flex items-start gap-3">
            <img src={asset('brand/badge.png')} alt="" className="size-10 shrink-0 rounded-pill" />
            <p className="flex-1 rounded-lg border border-hairline border-l-2 border-l-rouge bg-raised px-4 py-3 text-small leading-[1.5] text-ink-secondary">
              {switched
                ? `Troquei o caminho para « ${path.name} », que não precisa do que você tirou.`
                : 'Esse é o único caminho publicado desta receita. Posso escrever outro com um aparelho que você tenha — é só escolher abaixo.'}
            </p>
          </div>
        ) : null}

        {/* ── Add an appliance ─────────────────────────────────────── */}
        {canAddPath.length > 0 ? (
          <section className="mt-5.5">
            <DataLabel>Tenho outro aparelho</DataLabel>
            <p className="mt-2 text-small leading-[1.5] text-ink-muted">
              O chef escreve um novo caminho para ele, sem tocar no que já existe.
            </p>
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {canAddPath.map((item) => (
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
                      mode,
                      servings: activeServings,
                      existingPaths: paths.length,
                    })
                  }
                  className="sn-tag shrink-0 cursor-pointer disabled:opacity-45"
                >
                  {addPath.isPending && addPath.variables?.equipment === item
                    ? 'Escrevendo…'
                    : EQUIPMENT_THEME[item].short}
                </button>
              ))}
            </div>
            {addPath.isError ? (
              <p className="mt-2 text-small text-rouge">
                {addPath.error instanceof Error
                  ? addPath.error.message
                  : 'Não consegui montar esse caminho.'}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* ── Ingredients ──────────────────────────────────────────── */}
        <div className="mt-7 flex items-baseline justify-between gap-3">
          <DataLabel>Ingredientes</DataLabel>
          <div className="flex items-center gap-3 font-mono text-[11px] text-ink-muted">
            <button
              type="button"
              aria-label="Menos porções"
              onClick={() => setServings(Math.max(1, activeServings - 1))}
              className="text-ink"
            >
              −
            </button>
            {activeServings} porções
            <button
              type="button"
              aria-label="Mais porções"
              onClick={() => setServings(Math.min(20, activeServings + 1))}
              className="text-ink"
            >
              +
            </button>
          </div>
        </div>

        {nutrition ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-hairline bg-raised px-4 py-3.5">
            <Macro label="Por porção" value={formatKcal(nutrition.kcal)} />
            <Macro
              label="Proteínas"
              value={nutrition.protein_g === null ? '—' : `${Math.round(nutrition.protein_g)} g`}
            />
            <Macro
              label="Total"
              value={
                nutrition.kcal === null
                  ? '—'
                  : `${Math.round(nutrition.kcal * activeServings)} kcal`
              }
            />
          </div>
        ) : null}

        {data.groups.map((group) => (
          <div key={group.id ?? group.name} className="mt-5">
            <DataLabel tone="primary">{group.name}</DataLabel>
            <div className="mt-2">
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
                    className="flex w-full items-start gap-3 border-b border-hairline py-2.75 text-left"
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
                        <span className="mt-0.75 block text-small text-ink-muted">
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
      </div>

      {/* ── Start ──────────────────────────────────────────────────── */}
      {/* `safe-bottom` sets padding-bottom outright, so the spacing folds into
          the same declaration rather than fighting it with `pb-5`. */}
      <div className="sticky bottom-0 flex-none border-t border-hairline bg-base px-5 pt-3.5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <button
          type="button"
          onClick={() =>
            void navigate(`${routes.cook(data.slug)}?path=${encodeURIComponent(path.slug)}`)
          }
          className="h-[50px] w-full rounded-lg bg-graphite-900 text-body font-semibold text-porcelain-100"
        >
          Começar
        </button>
        <p className="mt-2.5 text-center font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
          {guidedSteps} etapas guiadas
        </p>
      </div>
    </div>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.25">
      <DataLabel>{label}</DataLabel>
      <span className="font-mono text-[15px] text-ink">{value}</span>
    </div>
  );
}
