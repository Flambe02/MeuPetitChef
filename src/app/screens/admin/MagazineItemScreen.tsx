import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import { EmptyState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import {
  useApproveItem,
  useIgnoreItem,
  useImportMagazineItem,
  useMagazineImportItem,
  useUpdateMagazineItem,
} from '@/features/magazine-import/hooks';
import { readItemConfidence } from '@/lib/magazine-import/item-confidence';
import { VERDICT_LABEL } from '@/lib/magazine-import/labels';
import type { MagazineRecipe } from '@/lib/magazine-import/types';
import { formatDuration } from '@/lib/recipe-import/duration';
import { findDuplicate } from '@/lib/recipe-import/persist';
import type {
  CanonicalIngredient,
  CanonicalRecipe,
  CanonicalStep,
} from '@/lib/recipe-import/types';
import { validateRecipe } from '@/lib/recipe-import/validate';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/cn';

type Pane = 'source' | 'app';

/**
 * "Review recette" — §23-25. Source on one side, always as read only: it is
 * provenance, not a draft. The Cookimix version is what an admin can actually
 * fix, because `to-canonical.ts` reads the page mechanically and a magazine's
 * print quality is not always kind to it.
 *
 * Thermomix/Air Fryer adaptation, nutrition, tags and translation are §17-20
 * — real, planned, and visibly not here yet: a disabled "Em breve" affordance
 * is honest about that; a button that looks live and does nothing is not.
 */
export default function MagazineItemScreen() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const navigate = useNavigate();

  const item = useMagazineImportItem(id, itemId);
  const approve = useApproveItem(id ?? '');
  const ignore = useIgnoreItem(id ?? '');
  const doImport = useImportMagazineItem(id ?? '');
  const save = useUpdateMagazineItem(id ?? '');

  const [pane, setPane] = useState<Pane>('app');
  const [draft, setDraft] = useState<CanonicalRecipe | null>(null);
  // Which item's data `draft` was last seeded from. Compared against
  // `item.data?.id` during render — the pattern React's own docs recommend
  // for "reset local state when a prop changes" — rather than in a
  // `useEffect`, which would set state one render late and trigger an
  // avoidable extra pass.
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  if (item.data && item.data.id !== seededFrom) {
    setSeededFrom(item.data.id);
    setDraft(
      item.data.transformed_data
        ? (item.data.transformed_data as unknown as CanonicalRecipe)
        : null,
    );
  }

  const duplicate = useQuery({
    queryKey: ['magazine-item-duplicate', draft?.fingerprint],
    queryFn: () => findDuplicate(supabase, draft!),
    enabled: Boolean(draft),
    staleTime: 5 * 60 * 1000,
  });

  if (item.isPending) return <Spinner label="Carregando a receita…" />;
  if (!item.data) {
    return <EmptyState title="Receita não encontrada" description="Ela pode ter sido removida." />;
  }
  if (!draft) {
    return (
      <EmptyState
        title="Ainda não adaptada"
        description="Esta receita não tem uma versão Cookimix — algo deu errado na extração."
      />
    );
  }

  const source = item.data.source_data as unknown as MagazineRecipe | null;
  const confidence = readItemConfidence(item.data.confidence);
  const validation = validateRecipe(draft);
  const isTerminal = item.data.status === 'imported' || item.data.status === 'ignored';

  const setDraftField = <K extends keyof CanonicalRecipe>(key: K, value: CanonicalRecipe[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const setIngredient = (index: number, patch: Partial<CanonicalIngredient>) => {
    setDraft((current) => {
      if (!current) return current;
      const ingredients = current.ingredients.map((line, position) =>
        position === index ? { ...line, ...patch } : line,
      );
      return { ...current, ingredients };
    });
  };

  const removeIngredient = (index: number) => {
    setDraft((current) =>
      current
        ? { ...current, ingredients: current.ingredients.filter((_, i) => i !== index) }
        : current,
    );
  };

  const addIngredient = () => {
    setDraft((current) => {
      if (!current) return current;
      const line: CanonicalIngredient = {
        position: current.ingredients.length,
        groupName: null,
        sourceName: '',
        sourceQuantity: null,
        sourceUnit: null,
        normalizedName: null,
        quantity: null,
        unit: null,
        unitKind: 'count',
        note: null,
        isOptional: false,
        isScalable: true,
      };
      return { ...current, ingredients: [...current.ingredients, line] };
    });
  };

  const setStep = (index: number, patch: Partial<CanonicalStep>) => {
    setDraft((current) => {
      if (!current) return current;
      const path = current.paths[0];
      if (!path) return current;
      const steps = path.steps.map((step, position) =>
        position === index ? { ...step, ...patch } : step,
      );
      return { ...current, paths: [{ ...path, steps }, ...current.paths.slice(1)] };
    });
  };

  const removeStep = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const path = current.paths[0];
      if (!path) return current;
      const steps = path.steps
        .filter((_, i) => i !== index)
        .map((step, position) => ({ ...step, position }));
      return { ...current, paths: [{ ...path, steps }, ...current.paths.slice(1)] };
    });
  };

  const addStep = () => {
    setDraft((current) => {
      if (!current) return current;
      const path = current.paths[0];
      if (!path) return current;
      const step: CanonicalStep = {
        position: path.steps.length,
        verb: null,
        instruction: '',
        equipment: 'none',
        durationSeconds: null,
        temperatureC: null,
        thermomix: null,
        sourceText: '',
        sourceLabel: null,
      };
      return {
        ...current,
        paths: [{ ...path, steps: [...path.steps, step] }, ...current.paths.slice(1)],
      };
    });
  };

  const path = draft.paths[0];

  return (
    <>
      <ScreenHeader
        title={draft.title || 'Receita sem título'}
        subtitle={`Página ${item.data.source_pages.join('–')}`}
        showBack
        action={
          <Badge tone={confidence.verdict === 'ready' ? undefined : 'signal'}>
            {VERDICT_LABEL[confidence.verdict]}
          </Badge>
        }
      />

      <div className="flex flex-col gap-4 px-5 pb-32">
        {confidence.findings.length > 0 ? (
          <Card>
            <div className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-secondary" />
              <div className="min-w-0">
                <CardTitle>O que verificar</CardTitle>
                <ul className="mt-1 flex flex-col gap-1">
                  {confidence.findings.map((finding, index) => (
                    <li key={index} className="text-small text-ink-muted">
                      · {finding}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ) : null}

        {duplicate.data ? (
          <Card pillar="finance">
            <CardTitle>Receita parecida já existe</CardTitle>
            <p className="mt-1 text-small text-ink-muted">
              {duplicate.data.title ??
                'Uma receita com o mesmo título ou ingredientes já foi importada.'}
            </p>
          </Card>
        ) : null}

        <div className="flex gap-2 md:hidden">
          <button
            type="button"
            className="sn-tag flex-1"
            data-active={pane === 'source' || undefined}
            onClick={() => setPane('source')}
          >
            Fonte
          </button>
          <button
            type="button"
            className="sn-tag flex-1"
            data-active={pane === 'app' || undefined}
            onClick={() => setPane('app')}
          >
            Cookimix
          </button>
        </div>

        <div className="flex flex-col gap-4 md:grid md:grid-cols-2">
          {/* ── Source, read-only ─────────────────────────────────────────── */}
          <div className={cn(pane === 'source' ? 'block' : 'hidden', 'md:block')}>
            <Card>
              <DataLabel tone="primary">Fonte da revista</DataLabel>
              {source ? (
                <>
                  <h3 className="mt-2 font-display text-heading text-ink">{source.title}</h3>
                  {source.description ? (
                    <p className="mt-2 text-small text-ink-muted">{source.description}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-muted">
                    {source.servings !== null ? <span>{source.servings} porções</span> : null}
                    {source.prepMinutes !== null ? (
                      <span>Preparo {source.prepMinutes} min</span>
                    ) : null}
                    {source.cookMinutes !== null ? (
                      <span>Cozimento {source.cookMinutes} min</span>
                    ) : null}
                    {source.restMinutes !== null ? (
                      <span>Repouso {source.restMinutes} min</span>
                    ) : null}
                  </div>
                  {source.continuationBefore ? (
                    <p className="mt-2 text-small text-ink-muted">↑ Continua da página anterior</p>
                  ) : null}

                  <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
                    Ingredientes
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {source.ingredients.map((line, index) => (
                      <li key={index} className="text-small text-ink">
                        {[line.quantity, line.unit, line.ingredient].filter(Boolean).join(' ')}
                        {line.preparation ? ` (${line.preparation})` : ''}
                        {line.optional ? ' — opcional' : ''}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
                    Modo de preparo
                  </p>
                  <ol className="mt-2 flex flex-col gap-2">
                    {source.steps.map((step) => (
                      <li key={step.order} className="text-small text-ink">
                        {step.order}. {step.instruction}
                      </li>
                    ))}
                  </ol>
                  {source.continuationAfter ? (
                    <p className="mt-2 text-small text-ink-muted">↓ Continua na próxima página</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-small text-ink-muted">Sem dados de origem.</p>
              )}
            </Card>
          </div>

          {/* ── Cookimix, editable ────────────────────────────────────────── */}
          <div className={cn(pane === 'app' ? 'block' : 'hidden', 'md:block')}>
            <Card>
              <DataLabel tone="primary">Versão Cookimix</DataLabel>

              <label className="mt-3 block">
                <DataLabel>Título</DataLabel>
                <input
                  value={draft.title}
                  onChange={(event) => setDraftField('title', event.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none"
                />
              </label>

              <label className="mt-3 block">
                <DataLabel>Descrição</DataLabel>
                <textarea
                  value={draft.description ?? ''}
                  onChange={(event) => setDraftField('description', event.target.value || null)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-hairline bg-transparent p-3 text-body text-ink outline-none"
                />
              </label>

              <div className="mt-3 flex gap-3">
                <label className="flex-1">
                  <DataLabel>Porções</DataLabel>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={draft.servings}
                    onChange={(event) =>
                      setDraftField('servings', Math.max(1, Number(event.target.value) || 1))
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none"
                  />
                </label>
                <label className="flex-1">
                  <DataLabel>Tempo total (min)</DataLabel>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(draft.totalTimeSeconds / 60)}
                    onChange={(event) =>
                      setDraftField(
                        'totalTimeSeconds',
                        Math.max(60, (Number(event.target.value) || 1) * 60),
                      )
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none"
                  />
                </label>
              </div>

              {path?.requiredEquipment.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {path.requiredEquipment.map((equipment) => (
                    <span key={equipment} className="sn-tag">
                      {EQUIPMENT_THEME[equipment]?.short ?? equipment}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-between">
                <p className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
                  Ingredientes
                </p>
                <button
                  type="button"
                  onClick={addIngredient}
                  className="text-small font-semibold text-ink"
                >
                  <Plus aria-hidden className="inline size-3.5" /> Adicionar
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {draft.ingredients.map((line, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={line.quantity ?? ''}
                      onChange={(event) =>
                        setIngredient(index, {
                          quantity: event.target.value ? Number(event.target.value) : null,
                        })
                      }
                      placeholder="qtd"
                      className="h-9 w-14 shrink-0 rounded-lg border border-hairline bg-transparent px-2 text-small text-ink outline-none"
                    />
                    <input
                      value={line.unit ?? ''}
                      onChange={(event) =>
                        setIngredient(index, { unit: event.target.value || null })
                      }
                      placeholder="un."
                      className="h-9 w-16 shrink-0 rounded-lg border border-hairline bg-transparent px-2 text-small text-ink outline-none"
                    />
                    <input
                      value={line.sourceName}
                      onChange={(event) => setIngredient(index, { sourceName: event.target.value })}
                      placeholder="ingrediente"
                      className="h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-transparent px-2 text-small text-ink outline-none"
                    />
                    <button
                      type="button"
                      aria-label="Remover ingrediente"
                      onClick={() => removeIngredient(index)}
                      className="flex size-9 shrink-0 items-center justify-center text-ink-muted"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
                  Modo de preparo
                </p>
                <button
                  type="button"
                  onClick={addStep}
                  className="text-small font-semibold text-ink"
                >
                  <Plus aria-hidden className="inline size-3.5" /> Adicionar
                </button>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {(path?.steps ?? []).map((step, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="mt-2.5 font-mono text-[12px] text-ink-muted">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <input
                        value={step.verb ?? ''}
                        onChange={(event) => setStep(index, { verb: event.target.value || null })}
                        placeholder="Verbo (Cortar, Assar…)"
                        className="h-9 w-full rounded-lg border border-hairline bg-transparent px-2 text-small font-semibold text-ink outline-none"
                      />
                      <textarea
                        value={step.instruction}
                        onChange={(event) => setStep(index, { instruction: event.target.value })}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-hairline bg-transparent p-2 text-small text-ink outline-none"
                      />
                      {step.durationSeconds || step.temperatureC ? (
                        <p className="mt-1 font-mono text-[11px] text-ink-muted uppercase">
                          {step.durationSeconds ? formatDuration(step.durationSeconds) : ''}
                          {step.temperatureC ? ` · ${step.temperatureC} °C` : ''}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label="Remover passo"
                      onClick={() => removeStep(index)}
                      className="mt-1 flex size-9 shrink-0 items-center justify-center text-ink-muted"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="sn-tag opacity-50">Adaptar ao Brasil — em breve</span>
                <span className="sn-tag opacity-50">Traduzir PT-BR — em breve</span>
                <span className="sn-tag opacity-50">Adaptar Thermomix — em breve</span>
                <span className="sn-tag opacity-50">Adaptar Air Fryer — em breve</span>
                <span className="sn-tag opacity-50">Calcular nutrição — em breve</span>
              </div>

              {!validation.ok ? (
                <div className="mt-4 flex flex-col gap-1">
                  {validation.errors.map((issue, index) => (
                    <p key={index} className="text-small text-rouge">
                      · {issue.message}
                    </p>
                  ))}
                </div>
              ) : null}

              <Button
                className="mt-4"
                variant="ghost"
                block
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    itemId: item.data!.id,
                    patch: { transformed_data: draft as unknown as never },
                  })
                }
              >
                {save.isPending ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </Card>
          </div>
        </div>
      </div>

      {!isTerminal ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-app gap-2 border-t border-hairline bg-raised/95 px-5 py-3 backdrop-blur">
          <Button
            variant="ghost"
            disabled={ignore.isPending}
            onClick={() => ignore.mutate(item.data!.id)}
          >
            Ignorar
          </Button>
          <Button
            variant="ghost"
            disabled={approve.isPending || item.data.status === 'approved'}
            onClick={() => approve.mutate(item.data!.id)}
          >
            {item.data.status === 'approved' ? <Check aria-hidden className="size-4" /> : null}
            Aprovar
          </Button>
          <Button
            block
            disabled={doImport.isPending || !validation.ok}
            onClick={() =>
              doImport.mutate(item.data!, {
                onSuccess: (saved) => void navigate(routes.recipe(saved.slug)),
              })
            }
          >
            {doImport.isPending ? 'Importando…' : 'Importar para o Cookimix'}
          </Button>
        </div>
      ) : (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-app border-t border-hairline bg-raised/95 px-5 py-3 text-center backdrop-blur">
          <p className="text-small text-ink-muted">
            {item.data.status === 'imported' ? 'Já importada.' : 'Ignorada.'}
          </p>
        </div>
      )}
    </>
  );
}
