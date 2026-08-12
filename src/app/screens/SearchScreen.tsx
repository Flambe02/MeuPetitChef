import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router';

import { RecipeTile } from '@/components/RecipeRow';
import { DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME, ONBOARDING_EQUIPMENT } from '@/domain/equipment';
import type { EquipmentType } from '@/domain/types';
import { useProfile } from '@/features/profile/hooks';
import { useRecipeSearch } from '@/features/recipes/hooks';
import { cn } from '@/lib/cn';

export default function SearchScreen() {
  const [params] = useSearchParams();
  const { data: profile } = useProfile();

  // The home screen sends people here: its chat bar as `?q=`, its "Tenho 15
  // minutos" shortcut as `?max=`. Read once as the starting point; the fields
  // govern from then on.
  const [term, setTerm] = useState(() => params.get('q') ?? '');
  const [equipment, setEquipment] = useState<EquipmentType[]>([]);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(() => {
    const raw = Number(params.get('max'));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });

  // Keeps typing responsive: the input updates instantly, the query lags a frame.
  const deferredTerm = useDeferredValue(term);
  const mode = profile?.chef_mode ?? 'normal';

  const search = useRecipeSearch({
    query: deferredTerm.trim() || undefined,
    equipment: equipment.length > 0 ? equipment : undefined,
    maxTotalMinutes: maxMinutes ?? undefined,
    mode,
  });

  const toggle = (item: EquipmentType) =>
    setEquipment((current) =>
      current.includes(item) ? current.filter((e) => e !== item) : [...current, item],
    );

  const count = search.data?.length ?? 0;

  return (
    <div className="animate-in px-5 pt-1 pb-7">
      <h1 className="mb-4 font-display text-[30px] font-bold tracking-[-0.03em] text-ink">
        Buscar
      </h1>

      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Receita, ingrediente, equipamento"
        aria-label="Buscar receitas"
        className="h-12 w-full rounded-lg border border-hairline bg-raised px-4 text-body text-ink outline-none"
      />

      <div className="no-scrollbar mt-3.5 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setMaxMinutes((current) => (current === 30 ? null : 30))}
          aria-pressed={maxMinutes === 30}
          className="sn-tag shrink-0 cursor-pointer"
          data-active={maxMinutes === 30 ? '' : undefined}
        >
          Até 30 min
        </button>
        {ONBOARDING_EQUIPMENT.slice(0, 6).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => toggle(item)}
            aria-pressed={equipment.includes(item)}
            className="sn-tag shrink-0 cursor-pointer"
            data-active={equipment.includes(item) ? '' : undefined}
          >
            {EQUIPMENT_THEME[item].short}
          </button>
        ))}
      </div>

      <DataLabel className={cn('mt-5.5 mb-3 block')}>
        {search.isPending ? 'Buscando…' : `${count} ${count === 1 ? 'receita' : 'receitas'}`}
      </DataLabel>

      {search.isPending ? <Spinner /> : null}
      {search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : null}

      {!search.isPending && !search.isError && count === 0 ? (
        <EmptyState title="Nada encontrado" description="Tente outro termo ou remova um filtro." />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {search.data?.map((recipe) => (
          <RecipeTile key={recipe.id} recipe={recipe} mode={mode} />
        ))}
      </div>
    </div>
  );
}
