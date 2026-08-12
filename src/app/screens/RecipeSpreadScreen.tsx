import { ChefHat, ImageOff, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';

import { routes } from '@/app/routes';
import { FullScreen } from '@/components/FullScreen';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import { formatAmount, scaleLine, servingFactor } from '@/domain/scaling';
import { useProfile } from '@/features/profile/hooks';
import { useRecipe } from '@/features/recipes/hooks';
import { useCookOrientation } from '@/hooks/useCookOrientation';
import { formatDuration } from '@/lib/format';

/**
 * "Ficha" — the recipe as a page of a book, for reading on the counter.
 *
 * Not another recipe screen. The sheet at `/receita/:slug` is a *chooser*: chef
 * modes, serving scaling, three tabs, a path picker. This is what you open once
 * those decisions are made and your hands are about to be full — everything at
 * once, nothing to tap: ingredients on one side, method on the other, in the
 * order you will need them.
 *
 * Both orientations are drawn, as in cook mode. Held sideways it is a spread,
 * two pages side by side with the fold between them; upright it is one column,
 * ingredients then method, because a phone in portrait has no room for two
 * pages and pretending otherwise gives two unreadable ones.
 */
export default function RecipeSpreadScreen() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const orientation = useCookOrientation();

  const mode = profile?.chef_mode ?? 'normal';
  const recipe = useRecipe(slug, mode);

  if (recipe.isPending) return <Spinner label="Abrindo a ficha…" />;
  if (recipe.isError) {
    return <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />;
  }
  if (!recipe.data) {
    return <EmptyState title="Receita não encontrada" description="Ela pode ter sido removida." />;
  }

  const data = recipe.data;
  const path = data.paths.find((entry) => entry.isRecommended) ?? data.paths[0];
  const factor = servingFactor(data.defaultServings, data.defaultServings);

  const close = () => void navigate(routes.recipe(data.slug));
  const cook = () =>
    void navigate(
      path ? `${routes.cook(data.slug)}?path=${encodeURIComponent(path.slug)}` : routes.cook(data.slug),
    );

  /* ── The left page: what this is ──────────────────────────────────────── */
  {
    /* `min-h-0` only sideways. As a portrait flex child it let this block
       shrink below its own content, which then painted straight over the
       ingredients underneath. */
  }
  const cover = (
    <div className="flex flex-col landscape:min-h-0">
      <p className="font-mono text-[11px] tracking-[0.18em] text-rouge uppercase">
        {data.category ? `Coleção · ${data.category}` : 'Ficha'}
      </p>

      <h1 className="mt-3 font-display text-[clamp(26px,4.2vh,40px)] leading-[1.05] font-bold tracking-[-0.03em] text-ink">
        {data.title}
      </h1>
      <span aria-hidden className="mt-4 block h-[3px] w-14 rounded-pill bg-rouge" />

      {/* The photo is linked, never stored — so it is also the one thing here
          that can fail at read time. A frame that says so beats a broken icon.
          Upright it takes a fixed slice of the page; sideways it takes what the
          page has left, which is what makes it look like a plate on a page. */}
      <div className="mt-6 flex h-44 min-h-0 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-inset landscape:h-auto landscape:flex-1">
        {data.heroImageUrl ? (
          <img
            src={data.heroImageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="flex flex-col items-center gap-2 p-6 text-center text-ink-muted">
            <ImageOff aria-hidden className="size-6" strokeWidth={1.5} />
            <span className="text-small">Sem foto</span>
          </span>
        )}
      </div>

      <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-ink-muted uppercase">
        {path?.name ?? 'Preparo'} · {formatDuration(data.totalMinutes)} · {data.defaultServings}{' '}
        {data.defaultServings === 1 ? 'porção' : 'porções'}
      </p>
    </div>
  );

  /* ── The right page: what to do ───────────────────────────────────────── */
  {
    /* No scroll container of its own: upright the whole page scrolls, and a
       nested one here overlapped the cover above it. The landscape branch wraps
       this in the scroller it needs. */
  }
  const contents = (
    // Two columns only when the right-hand page is genuinely wide enough. On a
    // landscape phone it is about 440px, and splitting that gave two columns
    // where "Azeite de oliva" wrapped over three lines.
    <div className="flex flex-col gap-6 min-[1000px]:flex-row">
      <section className="min-w-0 min-[1000px]:w-[42%] min-[1000px]:flex-none">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">
          Ingredientes
        </p>
        {data.groups.map((group) => (
          <div key={group.id ?? group.name}>
            {/* A group only earns a heading when the recipe actually has more
                than one: "Ingredientes / Ingredientes" is noise. */}
            {data.groups.length > 1 && group.name ? (
              <p className="mt-4 font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                {group.name}
              </p>
            ) : null}
            <ul className="mt-3 flex flex-col">
              {group.items.map((ingredient) => {
                const scaled = scaleLine(ingredient, factor);
                return (
                  <li
                    key={ingredient.id}
                    className="flex items-baseline justify-between gap-3 border-b border-hairline py-2 last:border-b-0"
                  >
                    <span className="min-w-0 text-body text-ink">{ingredient.displayName}</span>
                    <span className="flex-none font-mono text-[12px] text-ink-muted">
                      {formatAmount(scaled.quantity, scaled.unit)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="min-w-0 flex-1">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-muted uppercase">Preparo</p>
        <ol className="mt-3 flex flex-col gap-3">
          {(path?.steps ?? []).map((step, position) => (
            <li key={step.id} className="flex gap-3">
              <span className="flex-none pt-0.5 font-mono text-[12px] text-ink-muted">
                {String(position + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                {step.verb ? (
                  <span className="font-mono text-[10px] tracking-[0.14em] text-rouge uppercase">
                    {step.verb}{' '}
                  </span>
                ) : null}
                <span className="text-body leading-[1.5] text-ink">{step.instruction}</span>
                <span className="ml-2 font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
                  {EQUIPMENT_THEME[step.equipment]?.short ?? step.equipment}
                </span>
              </div>
            </li>
          ))}
        </ol>

        {data.notes.length > 0 ? (
          <div className="mt-6 border-t border-hairline pt-4">
            {data.notes.map((note) => (
              <p key={note.id} className="text-small leading-[1.6] text-ink-muted italic">
                {note.title ? `${note.title}: ` : ''}
                {note.body}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );

  const actions = (
    <div className="flex flex-none items-center gap-3 border-t border-hairline px-5 pt-3 pb-4">
      <button
        type="button"
        onClick={close}
        className="flex h-[46px] flex-none items-center gap-2 rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink"
      >
        <X aria-hidden className="size-4" />
        Fechar o livro
      </button>
      <button
        type="button"
        onClick={cook}
        className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-lg bg-graphite-900 text-[15px] font-semibold text-porcelain-100"
      >
        <ChefHat aria-hidden className="size-[18px]" />
        Cozinhar
      </button>
    </div>
  );

  if (orientation.isPortrait) {
    return (
      <FullScreen>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5">
          {cover}
          {contents}
        </div>
        {actions}
      </FullScreen>
    );
  }

  return (
    <FullScreen>
      <div className="flex min-h-0 flex-1 gap-8 px-8 py-6">
        {/* The fold: one hairline, no shadow. It is a book, not a skeuomorph. */}
        <div className="min-w-0 flex-1 border-r border-hairline pr-8">{cover}</div>
        <div className="min-w-0 flex-[1.25] overflow-y-auto overscroll-contain">{contents}</div>
      </div>
      {actions}
    </FullScreen>
  );
}
