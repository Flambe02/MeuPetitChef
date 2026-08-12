import { AlertTriangle, Check, FileJson, Link2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import { EmptyState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import { useCreateOwnVersion } from '@/features/reference/hooks';
import { useEquipment } from '@/features/profile/hooks';
import { useAnalyzeImport, useImports, useSaveImport } from '@/features/import/hooks';
import {
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
  prepareImage,
  type PreparedImage,
} from '@/features/import/images';
import { formatDuration } from '@/lib/recipe-import/duration';
import { detectProvider } from '@/lib/recipe-import/registry';
import type { ProviderId } from '@/lib/recipe-import/types';
import { cn } from '@/lib/cn';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'cookomix', label: 'Cookomix' },
  { id: 'cookidoo', label: 'Cookidoo' },
  { id: 'social', label: 'Instagram / Facebook' },
];

/**
 * "Importar receita" — bring in a recipe you found, as a private reference.
 *
 * The framing is deliberate. An imported recipe is somebody else's writing: it
 * lands in your own collection as a *reference*, and migration 14 stops it
 * being published at all. The step that produces something publishable is
 * "Criar minha versão", which takes only the facts — the dish, the
 * ingredients, the timings — and has the chef write an original recipe for the
 * appliances you actually own. Converting a Thermomix recipe to an air fryer
 * is not a translation: the procedure genuinely changes.
 *
 * It runs the same parser as the CLI, and now it fetches too: the browser still
 * cannot reach cookomix.com or instagram.com itself — no CORS headers, the
 * request is refused before it leaves the tab — so the `import-recipe` Edge
 * Function does it server-side. A URL on its own is therefore enough.
 *
 * The paste box stays, demoted to what it always really was: the way in when
 * fetching cannot work. A Cookidoo page only its subscriber can open, an
 * Instagram post behind a login wall — copy what you can see, paste it here.
 * Prose goes through the same reading pass a fetched caption does.
 */
export default function ImportScreen() {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('');
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  const analyze = useAnalyzeImport();
  const save = useSaveImport();
  const own = useCreateOwnVersion();
  const equipment = useEquipment();
  const imports = useImports();

  const detected = url.trim() ? (detectProvider(url.trim())?.id ?? null) : null;
  const activeProvider = provider ?? detected;

  // The appliances the cook actually owns drive the rewrite.
  const myEquipment = (equipment.data ?? []).map((row) => row.equipment);

  const analyzed = analyze.data ?? null;
  const outcome = analyzed?.outcome ?? null;

  const reset = () => {
    analyze.reset();
    save.reset();
    own.reset();
  };

  /**
   * Captures are added to what is already there, not swapped for it: a caption
   * spread over three screens is three trips to the picker on most phones, and
   * replacing the selection each time would make that impossible.
   */
  const addImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    reset();
    setImageError(null);

    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setImageError(`No máximo ${MAX_IMAGES} capturas.`);
      return;
    }

    try {
      const prepared = await Promise.all([...files].slice(0, room).map(prepareImage));
      const next = [...images, ...prepared];
      if (next.reduce((sum, image) => sum + image.bytes, 0) > MAX_TOTAL_BYTES) {
        setImageError('As capturas somam peso demais. Tente com menos imagens.');
        return;
      }
      setImages(next);
    } catch {
      setImageError('Não consegui ler uma dessas imagens.');
    }
  };

  return (
    <>
      <ScreenHeader
        title="Importar receita"
        subtitle="Guarde uma receita que você encontrou, como referência"
        showBack
      />

      <div className="flex flex-col gap-4 px-5 pb-24">
        {/* ── The form ─────────────────────────────────────────────────── */}
        <Card>
          <CardTitle>Fonte</CardTitle>

          <label className="mt-3 block text-small text-ink-muted" htmlFor="import-url">
            Endereço da receita
          </label>
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-hairline px-3">
            <Link2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
            <input
              id="import-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                reset();
              }}
              placeholder="Cole o link — Cookomix, Cookidoo, Instagram ou Facebook"
              className="h-11 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-muted"
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {PROVIDERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setProvider(provider === entry.id ? null : entry.id);
                  reset();
                }}
                aria-pressed={activeProvider === entry.id}
                className={cn('sn-tag')}
                data-active={activeProvider === entry.id || undefined}
              >
                {entry.label}
              </button>
            ))}
            {detected ? (
              <span className="text-small text-ink-muted">detectado pelo endereço</span>
            ) : null}
          </div>

          <label className="mt-4 block text-small text-ink-muted" htmlFor="import-source">
            Ou cole o texto da receita <span className="text-ink-muted">(opcional)</span>
          </label>
          <textarea
            id="import-source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              reset();
            }}
            rows={4}
            placeholder="A legenda do post, ou o conteúdo da página (Ctrl+U). Use quando o link não abrir sozinho."
            className="mt-1 w-full rounded-lg border border-hairline bg-transparent p-3 font-mono text-[12px] text-ink outline-none placeholder:text-ink-muted"
          />

          {/* ── Screenshots ──────────────────────────────────────────── */}
          {/* The way in that always works. A private post has no link worth
              pasting and no caption to copy, but it is right there on screen —
              so print it, one screen per print, and send the lot. */}
          <label className="mt-4 block text-small text-ink-muted" htmlFor="import-images">
            Ou envie capturas de tela do post
          </label>
          <input
            id="import-images"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              void addImages(event.target.files);
              // Cleared so picking the same file twice still fires a change.
              event.target.value = '';
            }}
            className="mt-1 block w-full text-small text-ink-muted file:mr-3 file:rounded-lg file:border file:border-hairline file:bg-transparent file:px-3 file:py-2 file:text-small file:font-semibold file:text-ink"
          />

          {images.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {images.map((image, index) => (
                <li key={`${image.name}-${index}`} className="relative">
                  <img
                    src={image.dataUrl}
                    alt=""
                    className="size-20 rounded-lg border border-hairline object-cover"
                  />
                  <span className="absolute top-1 left-1 rounded-xs bg-graphite-900/80 px-1 font-mono text-[10px] text-porcelain-100">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover a captura ${index + 1}`}
                    onClick={() => {
                      setImages(images.filter((_, position) => position !== index));
                      reset();
                    }}
                    className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-pill border border-hairline bg-raised text-ink"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {imageError ? <p className="mt-2 text-small text-rouge">{imageError}</p> : null}

          <p className="mt-2 text-small text-ink-muted">
            {images.length > 0
              ? 'Vamos ler as capturas na ordem em que aparecem — uma legenda cortada em várias telas vira uma receita só.'
              : source.trim()
                ? 'Vamos ler o texto colado — o endereço serve só para registrar a origem.'
                : 'Buscamos a página para você. Posts privados ou páginas que pedem login não abrem: nesses casos, mande capturas ou cole o texto.'}
          </p>

          <Button
            className="mt-4"
            block
            disabled={analyze.isPending || (!source.trim() && !url.trim() && images.length === 0)}
            onClick={() =>
              analyze.mutate({
                url: url.trim(),
                source,
                images: images.map((image) => image.dataUrl),
                ...(activeProvider ? { provider: activeProvider } : {}),
              })
            }
          >
            {analyze.isPending ? 'Lendo…' : 'Buscar receita'}
          </Button>

          {analyze.isError ? (
            <p className="mt-3 text-small text-rouge">
              {analyze.error instanceof Error ? analyze.error.message : 'Não deu certo.'}
            </p>
          ) : null}
        </Card>

        {analyze.isPending ? <Spinner label="Lendo a receita…" /> : null}

        {/* ── The preview ──────────────────────────────────────────────── */}
        {outcome ? (
          <>
            <Card pillar={outcome.validation.ok ? undefined : 'finance'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DataLabel>{outcome.provider}</DataLabel>
                  <h2 className="mt-1 font-display text-display-s text-ink">
                    {outcome.recipe.title || 'Sem título'}
                  </h2>
                </div>
                <Badge tone={outcome.validation.ok ? undefined : 'signal'} dot>
                  {outcome.validation.ok ? 'Pronta para revisão' : 'Precisa de atenção'}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                <DataLabel value={String(outcome.recipe.servings)}>Porções</DataLabel>
                <DataLabel value={formatDuration(outcome.recipe.totalTimeSeconds) ?? '—'}>
                  Tempo
                </DataLabel>
                <DataLabel value={outcome.recipe.difficulty}>Dificuldade</DataLabel>
              </div>

              <ul className="mt-4 flex flex-col gap-1 text-body text-ink">
                <Line ok={outcome.summary.ingredients > 0}>
                  {outcome.summary.ingredients} ingredientes
                </Line>
                <Line ok={outcome.summary.steps > 0}>{outcome.summary.steps} passos</Line>
                {outcome.summary.programSteps > 0 ? (
                  <Line ok={outcome.summary.stepsWithParameters >= outcome.summary.programSteps}>
                    Parâmetros Thermomix: {outcome.summary.stepsWithParameters}/
                    {outcome.summary.programSteps} passos programados
                  </Line>
                ) : null}
                <Line ok={outcome.recipe.nutrition.kcal !== null}>
                  {outcome.recipe.nutrition.kcal !== null
                    ? `${outcome.recipe.nutrition.kcal} kcal por porção`
                    : 'Sem informação nutricional'}
                </Line>
              </ul>

              {outcome.summary.equipment.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {outcome.summary.equipment.map((equipment) => (
                    <span key={equipment} className="sn-tag">
                      {EQUIPMENT_THEME[equipment]?.short ?? equipment}
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>

            {outcome.validation.errors.length > 0 ? (
              <IssueList
                title={`Erros (${outcome.validation.errors.length})`}
                tone="error"
                issues={outcome.validation.errors}
              />
            ) : null}
            {outcome.validation.warnings.length > 0 ? (
              <IssueList
                title={`Avisos (${outcome.validation.warnings.length})`}
                tone="warning"
                issues={outcome.validation.warnings}
              />
            ) : null}

            <Card>
              <CardTitle>Passos lidos</CardTitle>
              <ol className="mt-3 flex flex-col gap-3">
                {outcome.recipe.paths[0]?.steps.map((step) => (
                  <li key={step.position} className="flex gap-3">
                    <span className="mt-[2px] font-mono text-[12px] text-ink-muted">
                      {String(step.position + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-body text-ink">{step.instruction}</p>
                      <p className="mt-1 font-mono text-[11px] tracking-[0.08em] text-ink-muted uppercase">
                        {EQUIPMENT_THEME[step.equipment]?.short ?? step.equipment}
                        {step.thermomix?.durationSeconds
                          ? ` · ${formatDuration(step.thermomix.durationSeconds)}`
                          : step.durationSeconds
                            ? ` · ${formatDuration(step.durationSeconds)}`
                            : ''}
                        {step.thermomix?.temperatureC
                          ? ` · ${
                              step.thermomix.temperatureC === 'varoma'
                                ? 'Varoma'
                                : `${step.thermomix.temperatureC} °C`
                            }`
                          : step.temperatureC
                            ? ` · ${step.temperatureC} °C`
                            : ''}
                        {step.thermomix?.speed !== null && step.thermomix?.speed !== undefined
                          ? ` · vel. ${String(step.thermomix.speed)}`
                          : ''}
                        {step.thermomix?.reverse ? ' · inverso' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            {analyzed?.duplicate ? (
              <Card pillar="finance">
                <CardTitle>Essa receita já foi importada</CardTitle>
                <p className="mt-2 text-body text-ink-muted">
                  {analyzed.duplicate.reason === 'external_id'
                    ? 'Já existe um import com o mesmo identificador na fonte.'
                    : analyzed.duplicate.reason === 'source_url'
                      ? 'Já existe uma receita com esse endereço de origem.'
                      : 'Já existe um import com os mesmos ingredientes e título.'}
                </p>
              </Card>
            ) : null}

            {/* ── The decision ────────────────────────────────────────── */}
            {save.data ? (
              <Card>
                <CardTitle>Referência salva</CardTitle>
                <p className="mt-2 text-body text-ink-muted">
                  Ela fica na sua coleção, só sua. Uma receita importada de outro site é uma
                  referência — serve para consultar, não para publicar.
                </p>

                {/* The step that makes it yours: not a translation of someone
                    else's text, but a recipe written for the appliances you own. */}
                {own.isSuccess ? (
                  <>
                    <p className="mt-3 text-body text-ink">
                      Sua versão está pronta: <strong>{own.data.recipe.slug}</strong>
                    </p>
                    {own.data.originality.warnings.map((warning, index) => (
                      <p key={index} className="mt-1 text-small text-ink-muted">
                        {warning.message}
                      </p>
                    ))}
                    <Link
                      to={routes.recipe(own.data.recipe.slug)}
                      className="mt-2 inline-block text-body font-semibold text-rouge underline underline-offset-4"
                    >
                      Abrir a minha versão
                    </Link>
                  </>
                ) : (
                  <>
                    <Button
                      className="mt-3"
                      block
                      disabled={own.isPending}
                      onClick={() =>
                        own.mutate({
                          referenceId: save.data!.id,
                          equipment: myEquipment,
                          mode: 'normal',
                        })
                      }
                    >
                      {own.isPending ? 'Escrevendo…' : 'Criar minha versão'}
                    </Button>
                    <p className="mt-2 text-small text-ink-muted">
                      {myEquipment.length > 0
                        ? `Escrita do zero para: ${myEquipment
                            .map((item) => EQUIPMENT_THEME[item]?.short ?? item)
                            .join(', ')}.`
                        : 'Cadastre seus aparelhos em Equipamentos para um preparo sob medida.'}
                    </p>
                  </>
                )}
                {own.isError ? (
                  <p className="mt-2 text-small text-rouge">{own.error.message}</p>
                ) : null}

                <Link
                  to={routes.recipe(save.data.slug)}
                  className="mt-3 block text-small text-ink-muted underline underline-offset-4"
                >
                  Ver a referência
                </Link>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  block
                  disabled={save.isPending || !outcome.validation.ok}
                  onClick={() => save.mutate(outcome)}
                >
                  {save.isPending ? 'Salvando…' : 'Importar receita'}
                </Button>
                {!outcome.validation.ok ? (
                  <p className="text-center text-small text-ink-muted">
                    Corrija os erros na fonte antes de importar.
                  </p>
                ) : null}
                {save.isError ? (
                  <p className="text-small text-rouge">
                    {save.error instanceof Error ? save.error.message : 'Não deu certo.'}
                  </p>
                ) : null}
              </div>
            )}
          </>
        ) : null}

        {/* ── The queue ────────────────────────────────────────────────── */}
        <Card>
          <CardTitle>Imports recentes</CardTitle>
          {imports.isPending ? (
            <Spinner />
          ) : (imports.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nada por aqui ainda"
              description="Os imports que você fizer aparecem nesta lista."
            />
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {imports.data?.map((row) => (
                <li key={row.id} className="flex items-start gap-3">
                  {row.source_url ? (
                    <Link2 aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
                  ) : (
                    <FileJson aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-ink">
                      {row.provider ?? 'manual'}
                      {row.external_id ? ` · ${row.external_id}` : ''}
                    </p>
                    <p className="truncate text-small text-ink-muted">
                      {row.source_url ?? row.error_message ?? '—'}
                    </p>
                  </div>
                  <Badge tone={row.status === 'accepted' ? undefined : 'signal'}>
                    {row.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Line({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check aria-hidden className="size-4 shrink-0 text-ink-muted" />
      ) : (
        <X aria-hidden className="size-4 shrink-0 text-rouge" />
      )}
      <span>{children}</span>
    </li>
  );
}

function IssueList({
  title,
  tone,
  issues,
}: {
  title: string;
  tone: 'error' | 'warning';
  issues: { code: string; message: string }[];
}) {
  return (
    <Card pillar={tone === 'error' ? 'finance' : undefined}>
      <CardTitle>{title}</CardTitle>
      <ul className="mt-3 flex flex-col gap-2">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className="flex items-start gap-2">
            <AlertTriangle
              aria-hidden
              className={cn(
                'mt-[3px] size-4 shrink-0',
                tone === 'error' ? 'text-rouge' : 'text-ink-muted',
              )}
            />
            <span className="text-body text-ink-muted">{issue.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
