import { FileUp, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/states';
import { useUpdateMagazineIdentity, useUploadMagazine } from '@/features/magazine-import/hooks';
import type { MagazineIdentity } from '@/lib/magazine-import/types';
import { cn } from '@/lib/cn';

const MAX_BYTES = 20 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Importar um magazine" — §4 of the brief.
 *
 * One screen, two moments. Before upload: a drop zone and nothing else — the
 * design brief is explicit that the MVP is PDF-only, and offering JPG/PNG/EPUB
 * controls that do nothing would be worse than not showing them. After upload:
 * whatever the cover gave up (§5), editable, because a wrong guess here costs
 * one correction and a wrong guess baked silently into every recipe's
 * provenance costs much more.
 */
export default function NewMagazineImportScreen() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<MagazineIdentity | null>(null);

  const upload = useUploadMagazine();
  const updateIdentity = useUpdateMagazineIdentity(upload.data?.magazineImport.id ?? '');

  const pickFile = (candidate: File | null) => {
    if (!candidate) return;
    setFileError(null);
    if (candidate.type !== 'application/pdf' && !candidate.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Envie um arquivo PDF.');
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setFileError(`O arquivo passa de ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setFile(candidate);
    upload.mutate(candidate, {
      onSuccess: (result) => {
        setIdentity({
          publication: result.magazineImport.publication,
          issue: result.magazineImport.issue,
          publicationDate: result.magazineImport.publication_date,
          language: result.magazineImport.language,
          country: result.magazineImport.country,
          pageCount: result.magazineImport.page_count,
        });
      },
    });
  };

  const clear = () => {
    setFile(null);
    setIdentity(null);
    upload.reset();
  };

  const start = async () => {
    const importId = upload.data?.magazineImport.id;
    if (!importId || !identity) return;
    await updateIdentity.mutateAsync(identity);
    // The File is handed along in router state so the pipeline can start
    // immediately from the bytes already in memory — resuming later downloads
    // the PDF back out of storage instead, see useRunMagazineImport.
    void navigate(routes.adminMagazineImport(importId), { state: { file } });
  };

  return (
    <>
      <ScreenHeader title="Importar um magazine" subtitle="Escolha um PDF para começar" showBack />

      <div className="flex flex-col gap-4 px-5 pb-10">
        {!upload.data ? (
          <Card>
            <label
              className={cn(
                'flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center',
                dragActive ? 'border-rouge bg-inset' : 'border-hairline',
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                pickFile(event.dataTransfer.files[0] ?? null);
              }}
            >
              <Upload aria-hidden className="size-8 text-ink-muted" strokeWidth={1.5} />
              <span className="text-body font-semibold text-ink">Solte seu magazine PDF aqui</span>
              <span className="text-small text-ink-muted">ou</span>
              <span className="sn-btn" data-variant="ghost" data-size="sm">
                Escolher um arquivo
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => {
                  pickFile(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </label>

            {fileError ? <p className="mt-3 text-small text-rouge">{fileError}</p> : null}
          </Card>
        ) : null}

        {file && upload.isPending ? (
          <Card>
            <div className="flex items-center gap-3">
              <FileUp aria-hidden className="size-5 shrink-0 text-ink-secondary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{file.name}</p>
                <p className="text-small text-ink-muted">{formatBytes(file.size)}</p>
              </div>
            </div>
            <div className="mt-4">
              <Spinner label="Enviando e lendo a capa…" />
            </div>
          </Card>
        ) : null}

        {upload.isError ? (
          <Card pillar="finance">
            <p className="text-body text-rouge">
              {upload.error instanceof Error
                ? upload.error.message
                : 'Não foi possível enviar o arquivo.'}
            </p>
            <Button className="mt-3" variant="ghost" onClick={clear}>
              Tentar de novo
            </Button>
          </Card>
        ) : null}

        {upload.data && identity ? (
          <>
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={upload.data.coverDataUrl}
                    alt=""
                    className="h-20 w-14 shrink-0 rounded-sm border border-hairline object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-ink">{file?.name}</p>
                    <p className="text-small text-ink-muted">
                      {identity.pageCount ? `${String(identity.pageCount)} páginas` : '—'}
                      {file ? ` · ${formatBytes(file.size)}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remover arquivo"
                  onClick={clear}
                  className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-hairline text-ink-muted"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>
            </Card>

            <Card>
              <CardTitle>Sobre esta edição</CardTitle>
              <p className="mt-1 text-small text-ink-muted">
                Lido automaticamente da capa — confira antes de continuar.
              </p>

              <div className="mt-4 flex flex-col gap-3">
                <Field label="Nome do magazine">
                  <input
                    value={identity.publication ?? ''}
                    onChange={(event) =>
                      setIdentity({ ...identity, publication: event.target.value || null })
                    }
                    placeholder="Régal, Cuisine Actuelle…"
                    className="h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
                  />
                </Field>

                <Field label="Número / edição">
                  <input
                    value={identity.issue ?? ''}
                    onChange={(event) =>
                      setIdentity({ ...identity, issue: event.target.value || null })
                    }
                    placeholder="Hors-Série N31"
                    className="h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
                  />
                </Field>

                <div className="flex gap-3">
                  <Field label="Data (AAAA-MM)" className="flex-1">
                    <input
                      value={identity.publicationDate ?? ''}
                      onChange={(event) =>
                        setIdentity({ ...identity, publicationDate: event.target.value || null })
                      }
                      placeholder="2026-06"
                      className="h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
                    />
                  </Field>

                  <Field label="Idioma" className="flex-1">
                    <input
                      value={identity.language}
                      onChange={(event) =>
                        setIdentity({ ...identity, language: event.target.value })
                      }
                      placeholder="fr"
                      className="h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
                    />
                  </Field>

                  <Field label="País" className="flex-1">
                    <input
                      value={identity.country ?? ''}
                      onChange={(event) =>
                        setIdentity({ ...identity, country: event.target.value || null })
                      }
                      placeholder="FR"
                      className="h-11 w-full rounded-lg border border-hairline bg-transparent px-3 text-body text-ink outline-none placeholder:text-ink-muted"
                    />
                  </Field>
                </div>
              </div>
            </Card>

            <Button size="lg" disabled={updateIdentity.isPending} onClick={() => void start()}>
              {updateIdentity.isPending ? 'Preparando…' : 'Iniciar análise'}
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('block', className)}>
      <DataLabel>{label}</DataLabel>
      <div className="mt-1">{children}</div>
    </label>
  );
}
