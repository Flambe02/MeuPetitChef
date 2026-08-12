import { Check, Star } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ErrorState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME, ONBOARDING_EQUIPMENT } from '@/domain/equipment';
import type { EquipmentType } from '@/domain/types';
import { useEquipment, useSetEquipment } from '@/features/profile/hooks';
import { cn } from '@/lib/cn';

interface Draft {
  spec: string | null;
  isPreferred: boolean;
}

/**
 * "Meus equipamentos" — what the user actually has in their kitchen.
 *
 * This is the single most consequential screen in the settings: every path fit
 * score, every "Falta: Forno" warning and the whole home-screen ranking are
 * computed from these rows. Saving therefore invalidates the recipe namespace.
 *
 * The spec ("6 litros", "TM6") is free-form in the database but offered as the
 * chips the design lists, because an air fryer's capacity changes the timings a
 * recipe should give.
 */
export default function EquipmentScreen() {
  const owned = useEquipment();
  const save = useSetEquipment();

  const [draft, setDraft] = useState<Partial<Record<EquipmentType, Draft>> | null>(null);

  // Server rows are the starting point; the draft takes over on first edit.
  const current = useMemo<Partial<Record<EquipmentType, Draft>>>(() => {
    if (draft) return draft;
    const out: Partial<Record<EquipmentType, Draft>> = {};
    for (const row of owned.data ?? []) {
      out[row.equipment] = { spec: row.spec, isPreferred: row.is_preferred };
    }
    return out;
  }, [draft, owned.data]);

  const edit = (next: Partial<Record<EquipmentType, Draft>>) => setDraft(next);

  const toggle = (equipment: EquipmentType) => {
    const next = { ...current };
    if (next[equipment]) delete next[equipment];
    else next[equipment] = { spec: null, isPreferred: false };
    edit(next);
  };

  const setSpec = (equipment: EquipmentType, spec: string) => {
    const entry = current[equipment];
    if (!entry) return;
    edit({ ...current, [equipment]: { ...entry, spec: entry.spec === spec ? null : spec } });
  };

  const togglePreferred = (equipment: EquipmentType) => {
    const entry = current[equipment];
    if (!entry) return;
    edit({ ...current, [equipment]: { ...entry, isPreferred: !entry.isPreferred } });
  };

  const isDirty = draft !== null;
  const count = Object.keys(current).length;

  if (owned.isPending) return <Spinner />;
  if (owned.isError) {
    return <ErrorState error={owned.error} onRetry={() => void owned.refetch()} />;
  }

  return (
    <>
      <ScreenHeader
        title="Meus equipamentos"
        subtitle="O que você tem em casa"
        showBack
        action={<span className="font-mono text-[13px] text-ink-muted">{count}</span>}
      />

      <div className="flex flex-col gap-2 px-5 pb-32">
        {ONBOARDING_EQUIPMENT.map((equipment) => {
          const theme = EQUIPMENT_THEME[equipment];
          const entry = current[equipment];
          const isOwned = Boolean(entry);

          return (
            <div
              key={equipment}
              className={cn(
                'rounded-lg border p-4 transition-colors duration-[140ms] ease-signal',
                isOwned ? 'bg-raised' : 'border-hairline',
              )}
              style={isOwned ? { borderColor: theme.colorVar } : undefined}
            >
              <button
                type="button"
                onClick={() => toggle(equipment)}
                aria-pressed={isOwned}
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-xs border',
                    isOwned ? 'border-transparent' : 'border-strong',
                  )}
                  style={isOwned ? { background: theme.colorVar } : undefined}
                >
                  {isOwned ? <Check className="size-4 text-porcelain-100" /> : null}
                </span>
                <span className="min-w-0 flex-1 text-body font-semibold text-ink">
                  {theme.label}
                </span>
              </button>

              {isOwned && theme.specs.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 pl-9">
                  {theme.specs.map((spec) => (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => setSpec(equipment, spec)}
                      className="sn-tag cursor-pointer"
                      data-active={entry?.spec === spec ? '' : undefined}
                      aria-pressed={entry?.spec === spec}
                    >
                      {spec}
                    </button>
                  ))}
                </div>
              ) : null}

              {isOwned ? (
                <button
                  type="button"
                  onClick={() => togglePreferred(equipment)}
                  aria-pressed={entry?.isPreferred ?? false}
                  className={cn(
                    'mt-3 ml-9 inline-flex items-center gap-2 text-small font-semibold',
                    entry?.isPreferred ? 'text-rouge' : 'text-ink-muted',
                  )}
                >
                  <Star
                    aria-hidden
                    className="size-4"
                    fill={entry?.isPreferred ? 'currentColor' : 'none'}
                  />
                  Preferido
                </button>
              ) : null}
            </div>
          );
        })}

        <p className="mt-2 text-small leading-[1.5] text-ink-muted">
          Marcar «&nbsp;Preferido&nbsp;» coloca esse aparelho na frente quando uma receita tem
          vários caminhos possíveis.
        </p>
      </div>

      {isDirty ? (
        <div className="safe-bottom fixed inset-x-0 bottom-[var(--tabbar-height)] z-10 mx-auto w-full max-w-app border-t border-hairline bg-raised/95 px-5 py-3 backdrop-blur">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                Object.entries(current).map(([equipment, value]) => ({
                  equipment: equipment as EquipmentType,
                  spec: value.spec,
                  isPreferred: value.isPreferred,
                })),
                { onSuccess: () => setDraft(null) },
              )
            }
            className="h-[50px] w-full rounded-lg bg-graphite-900 text-body font-semibold text-porcelain-100 disabled:opacity-45"
          >
            {save.isPending ? 'Salvando…' : 'Salvar a cozinha'}
          </button>
          {save.isError ? (
            <p className="mt-2 text-center text-small text-rouge">
              {save.error instanceof Error ? save.error.message : 'Não foi possível salvar.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
