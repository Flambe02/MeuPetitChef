import { AlertTriangle, ChevronRight, ImageOff, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import {
  useDeleteMagazineImport,
  useMagazineImport,
  useMagazineImportCost,
  useMagazineImportItems,
  useMagazineImportLogs,
  useMagazineImportPages,
  useRunMagazineImport,
  useSignedImage,
} from '@/features/magazine-import/hooks';
import { readItemConfidence } from '@/lib/magazine-import/item-confidence';
import { IMPORT_STATUS_LABEL, VERDICT_LABEL } from '@/lib/magazine-import/labels';
import type { RecipeVerdict } from '@/lib/magazine-import/types';
import { formatDuration } from '@/lib/recipe-import/duration';
import type { CanonicalRecipe } from '@/lib/recipe-import/types';
import { cn } from '@/lib/cn';

const RUNNABLE_STATUSES = new Set(['uploaded', 'processing', 'extracting']);

const STAGE_LABEL: Record<string, string> = {
  reading_pages: 'Lendo as páginas',
  classifying: 'Classificando páginas',
  extracting: 'Extraindo receitas',
};

type Tab = 'all' | RecipeVerdict | 'imported' | 'ignored';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'ready', label: 'Prontas' },
  { id: 'review', label: 'A verificar' },
  { id: 'problem', label: 'Erros' },
  { id: 'imported', label: 'Importadas' },
  { id: 'ignored', label: 'Ignoradas' },
];

/**
 * The combined progress-and-review screen — §45's mockup and §22's list are
 * the same screen at two moments of one import, not two screens: a
 * `review_required` import that lost its progress bar the instant it finished
 * would leave the admin nowhere to watch the *next* one from.
 */
export default function MagazineImportScreen() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const magazineImport = useMagazineImport(id);
  const pages = useMagazineImportPages(id);
  const items = useMagazineImportItems(id);
  const logs = useMagazineImportLogs(id);
  const cost = useMagazineImportCost(id);
  const run = useRunMagazineImport();
  const deleteImport = useDeleteMagazineImport();

  const [tab, setTab] = useState<Tab>('all');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The File from "Novo import" only exists for the very first render after
  // that navigation — a reload loses it, which is exactly when the run needs
  // to fall back to downloading the PDF back out of storage instead.
  const initialFile = (location.state as { file?: File } | null)?.file;

  const startedRef = useRef(false);
  useEffect(() => {
    if (!id || !magazineImport.data) return;
    if (startedRef.current || run.isPending) return;
    if (!RUNNABLE_STATUSES.has(magazineImport.data.status)) return;
    startedRef.current = true;
    run.mutate({ importId: id, file: initialFile });
    // Only re-arms if the import identity itself changes; `run` and
    // `initialFile` are stable enough across the retries this effect cares
    // about, and including them would re-trigger it on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, magazineImport.data?.status]);

  const cover = useSignedImage(magazineImport.data?.cover_image_path);

  const grouped = useMemo(() => {
    const counts: Record<Tab, number> = {
      all: 0,
      ready: 0,
      review: 0,
      problem: 0,
      imported: 0,
      ignored: 0,
    };
    for (const item of items.data ?? []) {
      counts.all += 1;
      if (item.status === 'imported') counts.imported += 1;
      else if (item.status === 'ignored') counts.ignored += 1;
      else if (item.status === 'failed') counts.problem += 1;
      else counts[readItemConfidence(item.confidence).verdict] += 1;
    }
    return counts;
  }, [items.data]);

  const filtered = useMemo(() => {
    const rows = items.data ?? [];
    if (tab === 'all') return rows;
    return rows.filter((item) => {
      if (tab === 'imported') return item.status === 'imported';
      if (tab === 'ignored') return item.status === 'ignored';
      if (item.status === 'imported' || item.status === 'ignored') return false;
      if (item.status === 'failed') return tab === 'problem';
      return readItemConfidence(item.confidence).verdict === tab;
    });
  }, [items.data, tab]);

  if (magazineImport.isPending) return <Spinner label="Carregando o import…" />;
  if (magazineImport.isError) {
    return (
      <ErrorState error={magazineImport.error} onRetry={() => void magazineImport.refetch()} />
    );
  }
  if (!magazineImport.data) {
    return <EmptyState title="Import não encontrado" description="Ele pode ter sido excluído." />;
  }

  const data = magazineImport.data;
  const pageCount = data.page_count ?? pages.data?.length ?? 0;
  const analyzed = pages.data?.filter((page) => page.status !== 'pending').length ?? 0;
  const progressPct = pageCount > 0 ? Math.round((analyzed / pageCount) * 100) : 0;
  const isRunning = RUNNABLE_STATUSES.has(data.status);

  return (
    <>
      <ScreenHeader
        title={data.publication ?? data.file_name ?? 'Magazine'}
        subtitle={[data.issue, data.publication_date].filter(Boolean).join(' · ') || undefined}
        showBack
        action={
          <Badge tone={data.status === 'completed' ? undefined : 'signal'}>
            {IMPORT_STATUS_LABEL[data.status]}
          </Badge>
        }
      />

      <div className="flex flex-col gap-4 px-5 pb-10">
        {cover.data ? (
          <img
            src={cover.data}
            alt=""
            className="h-32 w-full rounded-lg border border-hairline object-cover object-top"
          />
        ) : null}

        {isRunning || run.isPending ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>
                {data.stage
                  ? (STAGE_LABEL[data.stage] ?? 'Analisando o magazine')
                  : 'Analisando o magazine'}
              </CardTitle>
              <span className="font-mono text-[13px] text-ink-muted">{progressPct}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-pill bg-inset">
              <div
                className="h-full rounded-pill bg-rouge transition-[width] duration-300"
                style={{ width: `${String(progressPct)}%` }}
              />
            </div>
            <p className="mt-2 text-small text-ink-muted">
              {analyzed} / {pageCount || '—'} páginas analisadas · {data.recipe_count} receita
              {data.recipe_count === 1 ? '' : 's'} detectada{data.recipe_count === 1 ? '' : 's'}
            </p>

            {!run.isPending ? (
              <Button
                className="mt-3"
                variant="ghost"
                onClick={() => {
                  startedRef.current = true;
                  run.mutate({ importId: data.id, file: initialFile });
                }}
              >
                Continuar análise
              </Button>
            ) : null}

            {run.isError ? (
              <p className="mt-2 text-small text-rouge">
                {run.error instanceof Error ? run.error.message : 'A análise parou.'}
              </p>
            ) : null}
          </Card>
        ) : null}

        {data.status === 'failed' ? (
          <Card pillar="finance">
            <div className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-rouge" />
              <p className="text-body text-ink">{data.error_message ?? 'A importação falhou.'}</p>
            </div>
            <Button
              className="mt-3"
              variant="ghost"
              onClick={() => {
                startedRef.current = true;
                run.mutate({ importId: data.id, file: initialFile });
              }}
            >
              Tentar de novo
            </Button>
          </Card>
        ) : null}

        {(items.data?.length ?? 0) > 0 ? (
          <>
            <div className="flex flex-wrap gap-2 overflow-x-auto">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="sn-tag"
                  data-active={tab === entry.id || undefined}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label} · {grouped[entry.id]}
                </button>
              ))}
            </div>

            <ul className="flex flex-col gap-2">
              {filtered.map((item) => {
                const confidence = readItemConfidence(item.confidence);
                const transformed = item.transformed_data as unknown as CanonicalRecipe | null;
                const path = transformed?.paths[0];
                return (
                  <li key={item.id}>
                    <Link
                      to={routes.adminMagazineItem(data.id, item.id)}
                      className="flex items-center gap-3 rounded-lg border border-hairline bg-raised px-4 py-3.5 no-underline"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-sm border border-hairline bg-inset text-ink-muted">
                        <ImageOff aria-hidden className="size-5" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-semibold text-ink">
                          {item.title ?? transformed?.title ?? 'Receita sem título'}
                        </p>
                        <p className="mt-0.5 truncate text-small text-ink-muted">
                          Página {item.source_pages.join('–')}
                          {transformed
                            ? ` · ${String(transformed.servings)} porções · ${formatDuration(transformed.totalTimeSeconds) ?? '—'}`
                            : ''}
                          {path?.requiredEquipment[0]
                            ? ` · ${EQUIPMENT_THEME[path.requiredEquipment[0]]?.short ?? path.requiredEquipment[0]}`
                            : ''}
                        </p>
                        <p className="mt-1 text-small text-ink-muted">
                          Extração {Math.round(confidence.score.overall * 100)}%
                          {item.status !== 'extracted'
                            ? ` · ${item.status === 'imported' ? 'Importada' : item.status === 'ignored' ? 'Ignorada' : VERDICT_LABEL[confidence.verdict]}`
                            : ` · ${VERDICT_LABEL[confidence.verdict]}`}
                        </p>
                      </div>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : !isRunning && data.status !== 'failed' ? (
          <EmptyState
            title="Nenhuma receita encontrada"
            description="Esse magazine pode não ter páginas de receita reconhecíveis."
          />
        ) : null}

        <details className="sn-card [&>summary]:list-none">
          <summary className="cursor-pointer text-small text-ink-muted">
            Logs ({logs.data?.length ?? 0})
          </summary>
          <ul className="mt-3 flex flex-col gap-1.5">
            {(logs.data ?? []).map((log) => (
              <li key={log.id} className="font-mono text-[11px] text-ink-muted">
                <span
                  className={cn(
                    log.level === 'error' && 'text-rouge',
                    log.level === 'warn' && 'text-ink-secondary',
                  )}
                >
                  [{log.level}]
                </span>{' '}
                {log.message}
              </li>
            ))}
          </ul>
        </details>

        {cost.data !== undefined && cost.data > 0 ? (
          <p className="text-center text-small text-ink-muted">
            Custo estimado desta importação: ${cost.data.toFixed(2)}
          </p>
        ) : null}

        <div className="mt-2 border-t border-hairline pt-4">
          {!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex items-center gap-2 text-small font-semibold text-rouge"
            >
              <Trash2 aria-hidden className="size-4" />
              Excluir import
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-raised p-4">
              <p className="text-small text-ink">O que você quer excluir?</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteImport.isPending}
                onClick={() =>
                  deleteImport.mutate(
                    { importId: data.id, alsoDeleteUnpublishedRecipes: false },
                    { onSuccess: () => void navigate(routes.adminImports) },
                  )
                }
              >
                Só o import
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteImport.isPending}
                onClick={() =>
                  deleteImport.mutate(
                    { importId: data.id, alsoDeleteUnpublishedRecipes: true },
                    { onSuccess: () => void navigate(routes.adminImports) },
                  )
                }
              >
                O import e as receitas ainda não publicadas
              </Button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="text-small text-ink-muted"
              >
                Cancelar
              </button>
              {deleteImport.isError ? (
                <p className="text-small text-rouge">Não foi possível excluir.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
