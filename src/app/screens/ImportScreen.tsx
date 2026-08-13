import { AlertTriangle, Check, Copy, FileJson, Link2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import { EmptyState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import type { EquipmentType } from '@/domain/types';
import { useVersionFromImport } from '@/features/reference/hooks';
import { useEquipment } from '@/features/profile/hooks';
import type { ImportOutcome } from '@/features/import/api';
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
 * Handed to an outside model (ChatGPT, Claude, Gemini) so the person can turn
 * a magazine scan, a photo or a pasted article into a file this screen can
 * read directly — `schema.org/Recipe` JSON, the exact shape `jsonld.ts`
 * already parses for Cookomix and Cookidoo. Written in French because the
 * source material is: an import keeps the recipe's own language until the
 * explicit pt-BR adaptation pass, same as every other provider.
 */
const AI_PROMPT = `Tu es un assistant qui extrait une recette de cuisine à partir d'un texte ou d'une photo, et qui produit UNIQUEMENT du JSON valide au format schema.org/Recipe.

Règles strictes :
- N'extrais QUE le contenu de LA recette (titre, ingrédients, étapes, temps, portions, nutrition si présente). Ignore tout le reste du document : publicités, édito, sommaire, autres articles, autres recettes.
- Si le document contient plusieurs recettes, choisis-en une seule et laisse les autres de côté — importe-les une par une, à la suite.
- N'invente RIEN. Si une information est absente, mets le champ à null ou omets-le. Ne devine jamais une quantité, un temps de cuisson ou un nombre de portions.
- Garde la langue d'origine de la recette (ne traduis pas).
- N'invente jamais d'URL d'image. Si tu n'as pas d'URL réelle et publique pour une photo, omets le champ "image".
- Réponds UNIQUEMENT avec le JSON — aucun texte avant ou après, aucune balise markdown \`\`\`.

Format attendu :
{
  "@type": "Recipe",
  "name": "",
  "description": "",
  "recipeYield": "",
  "prepTime": "PT..M",
  "cookTime": "PT..M",
  "totalTime": "PT..M",
  "recipeCategory": "",
  "recipeCuisine": "",
  "keywords": "",
  "recipeIngredient": [""],
  "recipeInstructions": [""],
  "nutrition": {
    "calories": "",
    "proteinContent": "",
    "carbohydrateContent": "",
    "fatContent": "",
    "fiberContent": ""
  },
  "inLanguage": "fr"
}

Voici le texte ou la photo de la recette à traiter :
[COLE ICI LE TEXTE, OU DÉCRIS/JOINS LA PHOTO]`;

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
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const analyze = useAnalyzeImport();
  const save = useSaveImport();
  const equipment = useEquipment();
  const imports = useImports();

  // Shown, not chosen: the address says which site it is, and the only thing a
  // manual override ever did was let someone pick the wrong parser.
  const detected = url.trim() ? (detectProvider(url.trim())?.id ?? null) : null;

  // The appliances the cook actually owns drive the rewrite.
  const myEquipment: EquipmentType[] = (equipment.data ?? []).map((row) => row.equipment);

  const analyzed = analyze.data ?? null;
  const outcome = analyzed?.outcome ?? null;

  const reset = () => {
    analyze.reset();
    save.reset();
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

  /**
   * A `.json`/`.md` file the person generated with an outside model, read
   * straight into the same textarea a pasted caption or JSON uses — the file
   * itself never leaves the browser, and everything downstream (JSON →
   * `fileImporter`, Markdown/prose → the reading pass) is exactly the
   * existing pipeline.
   */
  const loadFile = async (file: File | null) => {
    if (!file) return;
    reset();
    setFileError(null);
    try {
      const text = await file.text();
      if (!text.trim()) {
        setFileError('Esse arquivo está vazio.');
        return;
      }
      setSource(text);
    } catch {
      setFileError('Não consegui ler esse arquivo.');
    }
  };

  const copyPrompt = () => {
    void navigator.clipboard.writeText(AI_PROMPT).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    });
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

          {detected ? (
            <p className="mt-2 text-small text-ink-muted">
              {PROVIDERS.find((entry) => entry.id === detected)?.label} — reconhecido pelo endereço.
            </p>
          ) : null}

          {/* Everything below is the fallback, and folded away by default. The
              screen has one job — take a link — and showing three ways to do it
              at once made the one that works look like an option among others.
              The provider chips went with it: the address already says which
              site it is, and forcing the wrong one only ever broke an import. */}
          <details className="mt-4 [&>summary]:list-none">
            <summary className="cursor-pointer text-small font-semibold text-ink underline underline-offset-4">
              O link não abriu?
            </summary>

            <p className="mt-3 text-small text-ink-muted">
              Posts privados e páginas que pedem login não abrem sozinhos. Mande capturas de tela do
              post, cole o texto da receita, ou envie um arquivo.
            </p>

            {/* ── Generate the file with an outside AI ──────────────────
                For a magazine page or a printed recipe with no link at all —
                a PDF too heavy for the magazine importer's own upload limit
                is exactly this case. The model does the reading; this screen
                still validates the result like any other import, nothing is
                trusted blind. */}
            <details className="mt-4 rounded-lg border border-hairline p-3 [&>summary]:list-none">
              <summary className="cursor-pointer text-small font-semibold text-ink underline underline-offset-4">
                Não tem link nem consegue enviar o PDF? Gere o arquivo com IA
              </summary>
              <p className="mt-2 text-small text-ink-muted">
                Copie o texto abaixo, cole numa conversa com o ChatGPT, o Claude ou o Gemini junto
                com a foto ou o texto da receita, e envie aqui o JSON que ele responder — como
                texto colado ou como arquivo.
              </p>
              <div className="relative mt-3">
                <textarea
                  readOnly
                  rows={6}
                  value={AI_PROMPT}
                  className="w-full rounded-lg border border-hairline bg-inset p-3 font-mono text-[11px] text-ink-muted outline-none"
                />
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={copyPrompt}>
                {promptCopied ? (
                  <>
                    <Check aria-hidden className="size-4" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy aria-hidden className="size-4" />
                    Copiar prompt
                  </>
                )}
              </Button>
            </details>

            <label className="mt-4 block text-small text-ink-muted" htmlFor="import-source">
              Texto da receita
            </label>
            <textarea
              id="import-source"
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                reset();
              }}
              rows={4}
              placeholder="A legenda do post, o conteúdo da página (Ctrl+U), ou o JSON gerado por uma IA."
              className="mt-1 w-full rounded-lg border border-hairline bg-transparent p-3 font-mono text-[12px] text-ink outline-none placeholder:text-ink-muted"
            />

            {/* ── Or a file, straight from disk ─────────────────────────
                JSON parses directly and reliably (`fileImporter`, no model
                call needed on our side); Markdown or plain text goes through
                the same reading pass a pasted caption already does. */}
            <label className="mt-4 block text-small text-ink-muted" htmlFor="import-file">
              Ou envie um arquivo (.json ou .md)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <Upload aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <input
                id="import-file"
                type="file"
                accept=".json,.md,application/json,text/markdown,text/plain"
                onChange={(event) => {
                  void loadFile(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
                className="block w-full text-small text-ink-muted file:mr-3 file:rounded-lg file:border file:border-hairline file:bg-transparent file:px-3 file:py-2 file:text-small file:font-semibold file:text-ink"
              />
            </div>
            {fileError ? <p className="mt-2 text-small text-rouge">{fileError}</p> : null}

            {/* ── Screenshots ────────────────────────────────────────── */}
            {/* The way in that always works. A private post has no link worth
                pasting and no caption to copy, but it is right there on screen
                — so print it, one screen per print, and send the lot. */}
            <label className="mt-4 block text-small text-ink-muted" htmlFor="import-images">
              Capturas de tela do post
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
          </details>

          <Button
            className="mt-4"
            size="lg"
            block
            disabled={analyze.isPending || (!source.trim() && !url.trim() && images.length === 0)}
            onClick={() =>
              analyze.mutate({
                url: url.trim(),
                source,
                images: images.map((image) => image.dataUrl),
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

            {/* ── The one action ───────────────────────────────────────── */}
            {/* What someone wants after reading "Bolo de fubá, 6 ingredientes"
                is to cook it, not to file it. The chef writes the version for
                the appliances they own — which is also what fills in whatever
                the post left out — and the reference stays behind as a note of
                where it came from. */}
            <CookNow
              outcome={outcome}
              equipment={myEquipment}
              disabled={analyze.isPending}
              onSaveReference={() => save.mutate(outcome)}
              saving={save.isPending}
              saved={Boolean(save.data)}
            />

            {outcome.validation.errors.length > 0 ? (
              <IssueList
                title={`Erros (${outcome.validation.errors.length})`}
                tone="error"
                issues={outcome.validation.errors}
              />
            ) : null}

            {/* Folded, and small. The warnings are honest bookkeeping — "the
                caption gave no quantities" — but they are not what the person
                came for, and five of them stacked full-size read as a failure. */}
            {outcome.validation.warnings.length > 0 ? (
              <details className="sn-card [&>summary]:list-none">
                <summary className="cursor-pointer text-small text-ink-muted">
                  Avisos ({outcome.validation.warnings.length}) — o que a fonte não trouxe
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {outcome.validation.warnings.map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className="text-small text-ink-muted">
                      · {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <details className="sn-card [&>summary]:list-none">
              <summary className="cursor-pointer text-small text-ink-muted">
                Passos lidos ({outcome.summary.steps})
              </summary>
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
            </details>

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

            {save.isError ? (
              <p className="text-small text-rouge">
                {save.error instanceof Error ? save.error.message : 'Não deu certo.'}
              </p>
            ) : null}
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

/**
 * The end of the import, and the only decision worth putting in front of
 * someone: cook it now, or keep it for later.
 *
 * "Cozinhar agora" is not a shortcut past the review — it is the step that
 * turns a reference into something cookable. The chef rewrites the recipe for
 * the appliances this cook owns, in pt-BR, and fills in what the source left
 * out: a caption with no serving count and no total time comes back with both,
 * plus the dials the cook screen needs. It is also the only output that may be
 * published, which is why the reference beside it stays private.
 */
function CookNow({
  outcome,
  equipment,
  disabled,
  onSaveReference,
  saving,
  saved,
}: {
  outcome: ImportOutcome;
  equipment: EquipmentType[];
  disabled: boolean;
  onSaveReference: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const navigate = useNavigate();
  const version = useVersionFromImport();

  const cook = () => {
    version.mutate(
      { outcome, equipment, mode: 'normal' },
      {
        onSuccess: (result) => {
          // The reference is filed on the way out rather than first: it is
          // bookkeeping, and it must never stand between the cook and the pan.
          onSaveReference();
          void navigate(routes.recipe(result.recipe.slug));
        },
      },
    );
  };

  return (
    <Card>
      <Button block size="lg" disabled={disabled || version.isPending} onClick={cook}>
        {version.isPending ? 'O chef está escrevendo…' : 'Cozinhar agora'}
      </Button>

      <p className="mt-2 text-center text-small text-ink-muted">
        {equipment.length > 0
          ? `O chef escreve o preparo para: ${equipment
              .map((item) => EQUIPMENT_THEME[item]?.short ?? item)
              .join(', ')}.`
          : 'Cadastre seus aparelhos em Equipamentos para um preparo sob medida.'}
      </p>

      {version.isError ? (
        <p className="mt-2 text-small text-rouge">{version.error.message}</p>
      ) : null}

      <Button
        className="mt-3"
        variant="ghost"
        block
        size="md"
        disabled={saving || saved || !outcome.validation.ok}
        onClick={onSaveReference}
      >
        {saved ? 'Guardada como referência' : saving ? 'Guardando…' : 'Só guardar como referência'}
      </Button>
    </Card>
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
