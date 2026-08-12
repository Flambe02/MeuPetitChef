import { BookOpen, ChefHat, FileText } from 'lucide-react';
import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useMagazineImports } from '@/features/magazine-import/hooks';
import { IMPORT_STATUS_LABEL } from '@/lib/magazine-import/labels';
import { formatShortDate } from '@/lib/format';

/**
 * "Importações" — §44 of the brief, and the front door to every non-user
 * source of recipes. Magazine PDF is the only one wired up today; Cookomix and
 * Cookidoo already have working importers (`src/lib/recipe-import/providers/`)
 * reachable from `/importar`, but neither is a back-office batch flow yet —
 * "Em breve" here is honest, not a placeholder for something unbuilt.
 */
export default function ImportacoesScreen() {
  const imports = useMagazineImports();

  return (
    <>
      <ScreenHeader
        title="Importações"
        subtitle="Trazer receitas de outras fontes para o catálogo"
        showBack
      />

      <div className="flex flex-col gap-4 px-5 pb-10">
        <Card>
          <div className="flex items-start gap-3">
            <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-secondary" />
            <div className="min-w-0 flex-1">
              <CardTitle>Magazine PDF</CardTitle>
              <p className="mt-1 text-small text-ink-muted">
                Envie um PDF de revista de culinária e transforme suas receitas em receitas
                Cookimix, prontas para revisar e publicar.
              </p>
            </div>
          </div>
          <Link to={routes.adminNewMagazineImport} className="mt-4 block">
            <Button block>Novo import</Button>
          </Link>
        </Card>

        <Card className="opacity-70">
          <div className="flex items-start gap-3">
            <ChefHat aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-secondary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Cookomix</CardTitle>
                <Badge tone="signal">Em breve</Badge>
              </div>
              <p className="mt-1 text-small text-ink-muted">
                Importação em lote direto do catálogo do Cookomix.
              </p>
            </div>
          </div>
        </Card>

        <Card className="opacity-70">
          <div className="flex items-start gap-3">
            <BookOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-secondary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Cookidoo</CardTitle>
                <Badge tone="signal">Em breve</Badge>
              </div>
              <p className="mt-1 text-small text-ink-muted">
                Importação em lote a partir de receitas exportadas do Cookidoo.
              </p>
            </div>
          </div>
        </Card>

        <section className="mt-2">
          <DataLabel tone="primary">Imports recentes</DataLabel>

          {imports.isPending ? (
            <Spinner />
          ) : imports.isError ? (
            <ErrorState error={imports.error} onRetry={() => void imports.refetch()} />
          ) : imports.data.length === 0 ? (
            <EmptyState
              title="Nenhum import ainda"
              description="Os magazines que você enviar aparecem aqui, com o progresso da análise."
            />
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {imports.data.map((row) => (
                <li key={row.id}>
                  <Link
                    to={routes.adminMagazineImport(row.id)}
                    className="flex items-center gap-3 rounded-lg border border-hairline bg-raised px-4 py-3.5 no-underline"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-semibold text-ink">
                        {row.publication ?? row.file_name ?? 'Magazine sem nome'}
                        {row.issue ? ` · ${row.issue}` : ''}
                      </p>
                      <p className="mt-0.5 text-small text-ink-muted">
                        {row.recipe_count > 0
                          ? `${String(row.recipe_count)} receita${row.recipe_count === 1 ? '' : 's'}`
                          : 'Sem receitas ainda'}{' '}
                        · {formatShortDate(row.created_at)}
                      </p>
                    </div>
                    <Badge tone={row.status === 'completed' ? undefined : 'signal'}>
                      {IMPORT_STATUS_LABEL[row.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
