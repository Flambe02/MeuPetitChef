import {
  AirVent,
  Bell,
  Calendar,
  Camera,
  Check,
  Clock,
  CookingPot,
  Fan,
  Flame,
  Leaf,
  Link2,
  Mic,
  Microwave,
  Refrigerator,
  Soup,
  Thermometer,
  User,
  Utensils,
  Zap,
} from 'lucide-react';
import { useMemo, useState, type ComponentType, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { IconButton } from '@/components/ui/IconButton';
import { DataLabel } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { CHEF_MODES } from '@/domain/chef-modes';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import type { EquipmentType } from '@/domain/types';
import { useRecipeChat } from '@/features/generate/hooks';
import { mealSlotLabel, suggestionReasons } from '@/features/recipes/suggestion';
import { useEquipment, useProfile, useUpdateProfile } from '@/features/profile/hooks';
import { useSuggestions } from '@/features/recipes/hooks';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { cn } from '@/lib/cn';
import { formatTimer } from '@/lib/format';

const REASON_ICON = { leaf: Leaf, fan: Fan, zap: Zap, clock: Clock } as const;

/** Lucide glyph per appliance, matching the `icon` name in EQUIPMENT_THEME. */
const EQUIPMENT_ICON: Record<
  EquipmentType,
  ComponentType<{ className?: string; strokeWidth?: number }>
> = {
  air_fryer: Fan,
  oven: Microwave,
  stovetop: Flame,
  thermomix: CookingPot,
  microwave: AirVent,
  blender: CookingPot,
  pressure_cooker: Soup,
  electric_cooker: Soup,
  barbecue: Flame,
  sous_vide: Thermometer,
  other: Utensils,
  none: Utensils,
};

const ATALHOS = [
  { label: 'Com o que tenho', icon: Refrigerator, to: routes.pantry },
  { label: 'Tenho 15 minutos', icon: Clock, to: `${routes.search}?max=30` },
  { label: 'Importar receita', icon: Link2, to: routes.import },
  { label: 'Preparar para depois', icon: Calendar, to: routes.plan },
] as const;

/**
 * Home — the assistant, not a catalogue.
 *
 * The prototype leads with a single reasoned suggestion and a way to say what
 * you have, rather than a feed of cards.
 *
 *   • text     — asks the chef for a recipe through the `generate-recipe` Edge
 *                Function, constrained to the appliances ticked below the
 *                field. Accepting writes a private draft, which is what makes
 *                it cookable in the landscape screens.
 *   • "Falar"  — browser SpeechRecognition, hidden entirely where unsupported.
 *   • "Foto"   — routes to the import screen, which owns `recipe_imports`.
 *                It does *not* claim to read a fridge photo; nothing here does.
 */
export default function HomeScreen() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: equipment } = useEquipment();
  const updateProfile = useUpdateProfile();

  const [phrase, setPhrase] = useState('');
  const [offset, setOffset] = useState(0);

  const speech = useSpeechInput(setPhrase);
  const slot = useMemo(() => mealSlotLabel(), []);

  const mode = profile?.chef_mode ?? 'normal';
  const suggestions = useSuggestions(mode, 8);
  const owned = useMemo(() => equipment?.map((item) => item.equipment) ?? [], [equipment]);
  const chat = useRecipeChat();

  const list = suggestions.data ?? [];
  const suggestion = list.length > 0 ? list[offset % list.length]! : null;
  const reasons = suggestion ? suggestionReasons(suggestion, mode, owned) : [];

  // Which appliances this request may use. Seeded from the kitchen on file, so
  // the common case is one tap on the send button.
  const [picked, setPicked] = useState<EquipmentType[] | null>(null);
  const chosen = picked ?? owned;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = phrase.trim();
    if (!query || chat.ask.isPending) return;
    chat.ask.mutate({
      prompt: query,
      equipment: chosen,
      mode,
      servings: profile?.default_servings ?? 2,
    });
  };

  const chefLine = chat.ask.isPending
    ? 'Deixa comigo. Estou montando uma receita com o que você tem…'
    : chat.ask.isError
      ? chat.ask.error instanceof Error
        ? chat.ask.error.message
        : 'Não consegui responder agora.'
      : chat.recipe
        ? 'Que tal esta? Se quiser, peça um ajuste — mais rápido, sem lactose, outro corte.'
        : 'Me diga o que você tem, o que deseja cozinhar ou envie uma receita. Estou aqui para ajudar.';

  return (
    <div className="animate-in">
      {/* Header — the one graphite band on an otherwise porcelain screen. */}
      <header className="safe-top relative overflow-hidden bg-graphite-900 px-5 pt-1.5 pb-[30px] text-porcelain-100">
        <div className="flex items-start justify-between gap-3">
          {/* Badge + stacked lockup. The wordmark is set, not drawn — the brand
              guideline is explicit that the identity is the name, tight. */}
          <div className="flex items-center gap-3">
            {/* The chef *is* the control: tapping the character cycles Normal →
                Gourmand → Fit, and the illustration changes with it. It rewrites
                every recipe on every screen, so it earns the most tappable spot
                on the app. */}
            <button
              type="button"
              onClick={() => {
                const order = CHEF_MODES.map((chef) => chef.id);
                const next = order[(order.indexOf(mode) + 1) % order.length]!;
                updateProfile.mutate({ chef_mode: next });
              }}
              disabled={updateProfile.isPending}
              aria-label={`Chef ${CHEF_MODES.find((c) => c.id === mode)?.label ?? ''} — tocar para trocar`}
              className="size-14 shrink-0 overflow-hidden rounded-pill bg-graphite-700"
            >
              {/* `object-top`: the illustration is a full-body character, so
                  anchoring it anywhere else crops to the chef's feet. */}
              <img
                src={`/chefs/chef-${mode}.png`}
                alt=""
                className="size-full scale-[1.7] object-contain object-top"
              />
            </button>
            <span className="leading-none">
              <span className="block font-mono text-[9px] tracking-[0.3em] text-porcelain-100 uppercase">
                Meu
              </span>
              <span className="mt-1.5 block font-display text-[30px] leading-[0.84] font-bold tracking-[-0.045em] uppercase">
                Petit
                <br />
                Chef
                <span
                  aria-hidden
                  className="ml-0.5 inline-block size-2.5 rounded-pill bg-rouge align-baseline"
                />
              </span>
            </span>
          </div>

          <div className="flex flex-col items-end gap-2.5">
            <div className="flex gap-1">
              <IconButton aria-label="Notificações" className="size-[38px] text-porcelain-100">
                <Bell aria-hidden className="size-[22px]" strokeWidth={1.75} />
              </IconButton>
              <IconButton
                aria-label="Perfil"
                onClick={() => void navigate(routes.profile)}
                className="size-[38px] text-porcelain-100"
              >
                <User aria-hidden className="size-[22px]" strokeWidth={1.75} />
              </IconButton>
            </div>
            <span className="font-mono text-[10px] tracking-[0.16em] text-steel-400 uppercase">
              {slot}
            </span>
          </div>
        </div>

        <div className="mt-[26px]">
          <h1 className="max-w-[13ch] font-display text-[31px] leading-[1.06] font-bold tracking-[-0.03em] text-wrap-pretty">
            Olá, o que vamos cozinhar hoje?
          </h1>
          <div aria-hidden className="mt-[18px] h-0.5 w-11 bg-rouge" />
        </div>
      </header>

      {/* What the chef just said. */}
      <div className="px-5 pt-5">
        <p className="rounded-xl border border-hairline bg-raised p-4 text-body leading-[1.5] text-ink">
          {chefLine}
        </p>
      </div>

      {/* Say what you have. */}
      <div className="px-5 pt-3.5">
        <form
          onSubmit={submit}
          className="flex items-center gap-1.5 rounded-xl border border-hairline bg-raised py-1.5 pr-1.5 pl-3.5"
        >
          <input
            type="text"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder="Diga o que você tem ou quer cozinhar…"
            aria-label="O que você tem ou quer cozinhar"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none"
          />
          <IconButton
            aria-label="Foto"
            onClick={() => void navigate(routes.import)}
            className="size-10 rounded-pill text-ink"
          >
            <Camera aria-hidden className="size-[22px]" strokeWidth={1.75} />
          </IconButton>
          {speech.isSupported ? (
            <IconButton
              aria-label={speech.isRecording ? 'Parar de gravar' : 'Falar'}
              onClick={() => (speech.isRecording ? speech.stop() : speech.start())}
              className="size-10 rounded-pill text-rouge"
            >
              <Mic aria-hidden className="size-[22px]" strokeWidth={1.75} />
            </IconButton>
          ) : null}
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!phrase.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-rouge text-[18px] text-porcelain-100 disabled:opacity-45"
          >
            <span aria-hidden>→</span>
          </button>
        </form>

        {speech.isRecording ? (
          <div
            role="status"
            className="animate-fade mt-2.5 flex items-center gap-3 rounded-xl border border-rouge bg-raised px-3.5 py-3"
          >
            <span aria-hidden className="size-2 shrink-0 rounded-pill bg-rouge" />
            <span className="font-mono text-[13px] text-ink">
              {formatTimer(Math.floor(speech.elapsedMs / 1000))}
            </span>
            <span className="flex-1 text-small text-ink-muted">Ouvindo…</span>
            <button
              type="button"
              onClick={() => speech.stop()}
              className="h-[46px] rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink"
            >
              Parar
            </button>
          </div>
        ) : null}

        {/* Which appliances this request may use. Pre-ticked from the kitchen
            on file, so the common case is a single tap on send. */}
        {owned.length > 0 ? (
          <div className="mt-3.5">
            <p className="text-small text-ink-muted">
              Com quais aparelhos? <span className="text-ink-muted">Pode marcar vários.</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {owned.map((item) => {
                const active = chosen.includes(item);
                const theme = EQUIPMENT_THEME[item];
                const Icon = EQUIPMENT_ICON[item];
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setPicked(active ? chosen.filter((e) => e !== item) : [...chosen, item])
                    }
                    aria-pressed={active}
                    aria-label={theme.label}
                    title={theme.label}
                    className={cn(
                      'relative flex size-14 shrink-0 items-center justify-center rounded-xl border',
                      'transition-colors duration-[140ms] ease-signal',
                      active
                        ? 'border-transparent text-porcelain-100'
                        : 'border-hairline text-ink-muted',
                    )}
                    style={active ? { background: theme.colorVar } : undefined}
                  >
                    <Icon aria-hidden className="size-6" strokeWidth={1.75} />
                    {/* A tick as well as the fill: the accent colour is already
                        doing identity duty, and colour alone is not a state. */}
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-pill bg-graphite-900"
                      >
                        <Check className="size-3 text-porcelain-100" strokeWidth={3} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* What the chef came back with. */}
        {chat.recipe ? (
          <div className="animate-in mt-3 rounded-xl border border-hairline border-l-2 border-l-rouge bg-raised p-4">
            <h2 className="font-display text-[19px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
              {chat.recipe.title}
            </h2>
            <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
              {chat.recipe.total_minutes} min · {chat.recipe.servings} porções ·{' '}
              {chat.recipe.ingredients.length} ingredientes · {chat.recipe.paths.length}{' '}
              {chat.recipe.paths.length === 1 ? 'caminho' : 'caminhos'}
            </p>
            <p className="mt-2.5 text-small leading-[1.5] text-ink-secondary">
              {chat.recipe.description}
            </p>

            <div className="mt-3.5 flex gap-2">
              <button
                type="button"
                disabled={chat.accept.isPending}
                onClick={() =>
                  chat.accept.mutate(
                    { mode, equipment: chosen, servings: profile?.default_servings ?? 2 },
                    {
                      onSuccess: (draft) => {
                        chat.reset();
                        setPhrase('');
                        void navigate(routes.recipe(draft.slug));
                      },
                    },
                  )
                }
                className="h-[42px] flex-1 rounded-lg bg-graphite-900 text-[14px] font-semibold text-porcelain-100 disabled:opacity-45"
              >
                {chat.accept.isPending ? 'Salvando…' : 'Ver a receita'}
              </button>
              <button
                type="button"
                onClick={() => setPhrase('')}
                className="h-[42px] flex-1 rounded-lg border border-strong text-[14px] font-semibold text-ink"
              >
                Ajustar
              </button>
            </div>
            {chat.accept.isError ? (
              <p className="mt-2 text-small text-rouge">
                {chat.accept.error instanceof Error
                  ? chat.accept.error.message
                  : 'Não foi possível salvar.'}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex justify-center">
          <Link
            to={routes.import}
            className="inline-flex h-[38px] items-center gap-2 rounded-pill border border-hairline bg-raised px-4 text-small text-ink-muted no-underline"
          >
            Ou tire uma foto da geladeira
          </Link>
        </div>
      </div>

      {/* Shortcuts sit above the divider on purpose: they are other ways of
       *asking*, so they belong with the chat, not with the chef's own pick. */}
      <section className="px-5 pt-6">
        <DataLabel>Atalhos</DataLabel>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {ATALHOS.map((atalho) => (
            <Link
              key={atalho.label}
              to={atalho.to}
              className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised p-3.5 text-left no-underline"
            >
              <atalho.icon aria-hidden className="size-[18px] shrink-0 text-rouge" />
              <span className="text-[13.5px] leading-[1.25] font-semibold text-ink">
                {atalho.label}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Or let the chef decide. */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <DataLabel>Ou deixe comigo</DataLabel>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </div>

      <section className="px-5 pt-4">
        {suggestions.isPending ? <Spinner /> : null}
        {suggestions.isError ? (
          <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
        ) : null}

        {!suggestions.isPending && !suggestions.isError && !suggestion ? (
          <EmptyState
            title="Nenhuma receita ainda"
            description="Publique receitas no back-office ou rode o seed do Supabase para começar."
          />
        ) : null}

        {suggestion ? (
          <div className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-raised p-3.5 shadow-card">
            <div className="flex gap-3.5">
              <div className="relative min-h-[150px] w-[124px] shrink-0 overflow-hidden rounded-lg bg-inset">
                {suggestion.heroImageUrl ? (
                  <img
                    src={suggestion.heroImageUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
                <span className="pointer-events-none absolute top-2 left-2 rounded-xs bg-graphite-900 px-2 py-[5px] font-mono text-[9px] tracking-[0.14em] text-porcelain-100 uppercase">
                  Sugestão de hoje
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[19px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
                  {suggestion.title}
                </h2>
                <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
                  {suggestion.totalMinutes} min · {suggestion.defaultServings} porções ·{' '}
                  {suggestion.difficulty === 'facil'
                    ? 'Fácil'
                    : suggestion.difficulty === 'medio'
                      ? 'Médio'
                      : 'Difícil'}
                </p>

                {reasons.length > 0 ? (
                  <ul className="mt-3.5 flex flex-col gap-[9px]">
                    {reasons.map((reason) => {
                      const Icon = REASON_ICON[reason.icon];
                      return (
                        <li key={reason.text} className="flex items-center gap-[9px]">
                          <Icon
                            aria-hidden
                            className="size-4 shrink-0 text-ink-secondary"
                            strokeWidth={1.75}
                          />
                          <span className="text-[12.5px] leading-[1.35] text-ink-secondary">
                            {reason.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                to={routes.recipe(suggestion.slug)}
                className="flex h-[42px] flex-1 items-center justify-center rounded-lg bg-graphite-900 text-[14px] font-semibold whitespace-nowrap text-porcelain-100 no-underline"
              >
                Ver a receita
              </Link>
              <button
                type="button"
                onClick={() => setOffset((current) => current + 1)}
                disabled={list.length < 2}
                className="h-[42px] flex-1 rounded-lg border border-strong text-[14px] font-semibold whitespace-nowrap text-ink disabled:opacity-45"
              >
                Outra ideia
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
