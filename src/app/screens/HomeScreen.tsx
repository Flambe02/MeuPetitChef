import {
  AirVent,
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
import { RecipeImage } from '@/components/ui/RecipeImage';
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
import { asset } from '@/lib/asset';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/pt';

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

/**
 * Two, not four. "Tenho 15 minutos" and "Preparar para depois" were removed on
 * use: both are reachable from the tab bar and from the chat bar, and four
 * tiles under a "Atalhos" label read as a menu rather than as a shortcut.
 * `?max=` still works on the search screen — nothing was deleted behind them.
 */
const ATALHOS = [
  { labelKey: 'home.shortcutPantry', icon: Refrigerator, to: routes.pantry },
  { labelKey: 'home.shortcutImport', icon: Link2, to: routes.import },
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
  const { language, setLanguage, t } = useLanguage();

  const [phrase, setPhrase] = useState('');
  const [offset, setOffset] = useState(0);

  const speech = useSpeechInput(setPhrase, language);
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
      language,
    });
  };

  const chefLine = chat.ask.isPending
    ? t('home.chefLineThinking')
    : chat.ask.isError
      ? chat.ask.error instanceof Error
        ? chat.ask.error.message
        : t('home.chefLineErrorGeneric')
      : chat.recipe
        ? t('home.chefLineGotRecipe')
        : t('home.chefLineDefault');

  return (
    <div className="animate-in">
      {/* Header — the one graphite band on an otherwise porcelain screen. */}
      {/* `safe-top` sets padding-top outright, so it silently ate the `pt-1.5`
          that used to sit next to it: on any screen without a notch the inset
          is 0px, and the wordmark ended up flush against the top edge. Same
          folding as OnboardingScreen — inset *plus* the spacing, one
          declaration. */}
      <header className="relative overflow-hidden bg-graphite-900 px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[30px] text-porcelain-100">
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
              className="relative size-14 shrink-0 overflow-hidden rounded-pill bg-graphite-700"
            >
              {/* The illustrations are full-body characters (≈180×360) and the
                  button is a 56px circle, so the artwork has to be framed, not
                  fitted. Sizing by height alone — 250% of the circle, centred
                  horizontally — crops to the head and chef's whites and takes
                  the three modes' differing widths in its stride.

                  The 8% offset is the whole point: anchored flush to the top,
                  the toque touches the edge exactly where the round mask has
                  already started cutting inwards, and the hat loses its
                  corners. Four pixels of headroom put it back. */}
              <img
                src={asset(`chefs/chef-${mode}.png`)}
                alt=""
                className="absolute top-[7%] left-1/2 h-[210%] max-w-none -translate-x-1/2"
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
              {/* A discreet stand-in for the "Notificações" bell — this app has
                  no notification feature, and the header's other slot is
                  where a language toggle earns its keep: it's the one control
                  every non-Portuguese reader needs before anything else on
                  the screen. The app's own translations, not Google's — no
                  reload, no widget, no banner to fight. */}
              <IconButton
                aria-label={t('home.switchLanguage')}
                title="PT / FR"
                onClick={() => setLanguage(language === 'fr' ? 'pt' : 'fr')}
                className="size-[38px] text-porcelain-100"
              >
                <span aria-hidden className="font-mono text-[11px] font-semibold tracking-[0.02em]">
                  {language === 'fr' ? 'FR' : 'PT'}
                </span>
              </IconButton>
              <IconButton
                aria-label={t('home.profile')}
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
            {t('home.greeting')}
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
            placeholder={t('home.searchPlaceholder')}
            aria-label={t('home.searchAriaLabel')}
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none"
          />
          <IconButton
            aria-label={t('home.photo')}
            onClick={() => void navigate(routes.import)}
            className="size-10 rounded-pill text-ink"
          >
            <Camera aria-hidden className="size-[22px]" strokeWidth={1.75} />
          </IconButton>
          {speech.isSupported ? (
            <IconButton
              aria-label={speech.isRecording ? t('home.stopRecording') : t('home.speak')}
              onClick={() => (speech.isRecording ? speech.stop() : speech.start())}
              className="size-10 rounded-pill text-rouge"
            >
              <Mic aria-hidden className="size-[22px]" strokeWidth={1.75} />
            </IconButton>
          ) : null}
          <button
            type="submit"
            aria-label={t('home.send')}
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
            <span className="flex-1 text-small text-ink-muted">{t('home.listening')}</span>
            <button
              type="button"
              onClick={() => speech.stop()}
              className="h-[46px] rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink"
            >
              {t('home.stop')}
            </button>
          </div>
        ) : null}

        {speech.errorKey ? (
          <p role="alert" className="mt-2.5 text-small text-rouge">
            {t(speech.errorKey as TranslationKey)}
          </p>
        ) : null}

        {/* Which appliances this request may use. Pre-ticked from the kitchen
            on file, so the common case is a single tap on send. */}
        {owned.length > 0 ? (
          <div className="mt-3.5">
            <p className="text-small text-ink-muted">
              {t('home.whichAppliances')} <span className="text-ink-muted">{t('home.canPickSeveral')}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2.5">
              {owned.map((item) => {
                const active = chosen.includes(item);
                const theme = EQUIPMENT_THEME[item];
                const Icon = EQUIPMENT_ICON[item];
                const label = t(`equipment.${item}` as TranslationKey);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setPicked(active ? chosen.filter((e) => e !== item) : [...chosen, item])
                    }
                    aria-pressed={active}
                    aria-label={label}
                    title={label}
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
              {chat.recipe.total_minutes} min · {chat.recipe.servings} {t('home.servingsSuffix')} ·{' '}
              {chat.recipe.ingredients.length} {t('home.ingredientsSuffix')} · {chat.recipe.paths.length}{' '}
              {t(chat.recipe.paths.length === 1 ? 'home.pathSingular' : 'home.pathPlural')}
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
                {chat.accept.isPending ? t('home.savingRecipe') : t('home.viewRecipe')}
              </button>
              <button
                type="button"
                onClick={() => setPhrase('')}
                className="h-[42px] flex-1 rounded-lg border border-strong text-[14px] font-semibold text-ink"
              >
                {t('home.adjust')}
              </button>
            </div>
            {chat.accept.isError ? (
              <p className="mt-2 text-small text-rouge">
                {chat.accept.error instanceof Error
                  ? chat.accept.error.message
                  : t('home.couldNotSave')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex justify-center">
          <Link
            to={routes.import}
            className="inline-flex h-[38px] items-center gap-2 rounded-pill border border-hairline bg-raised px-4 text-small text-ink-muted no-underline"
          >
            {t('home.orTakePhoto')}
          </Link>
        </div>
      </div>

      {/* Shortcuts sit above the divider on purpose: they are other ways of
       *asking*, so they belong with the chat, not with the chef's own pick. */}
      <section className="px-5 pt-6">
        <DataLabel>{t('home.shortcuts')}</DataLabel>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {ATALHOS.map((atalho) => (
            <Link
              key={atalho.labelKey}
              to={atalho.to}
              className="flex items-center gap-2.5 rounded-lg border border-hairline bg-raised p-3.5 text-left no-underline"
            >
              <atalho.icon aria-hidden className="size-[18px] shrink-0 text-rouge" />
              <span className="text-[13.5px] leading-[1.25] font-semibold text-ink">
                {t(atalho.labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Or let the chef decide. */}
      <div className="flex items-center gap-3 px-5 pt-6">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <DataLabel>{t('home.orLetMeDecide')}</DataLabel>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </div>

      <section className="px-5 pt-4">
        {suggestions.isPending ? <Spinner /> : null}
        {suggestions.isError ? (
          <ErrorState error={suggestions.error} onRetry={() => void suggestions.refetch()} />
        ) : null}

        {!suggestions.isPending && !suggestions.isError && !suggestion ? (
          <EmptyState title={t('home.emptyTitle')} description={t('home.emptyDescription')} />
        ) : null}

        {suggestion ? (
          <div className="flex flex-col gap-3.5 rounded-xl border border-hairline bg-raised p-3.5 shadow-card">
            <div className="flex gap-3.5">
              <div className="relative min-h-[150px] w-[124px] shrink-0 overflow-hidden rounded-lg">
                <RecipeImage src={suggestion.heroImageUrl} className="absolute inset-0" fallback={null} />
                <span className="pointer-events-none absolute top-2 left-2 rounded-xs bg-graphite-900 px-2 py-[5px] font-mono text-[9px] tracking-[0.14em] text-porcelain-100 uppercase">
                  {t('home.todaysSuggestion')}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[19px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
                  {suggestion.title}
                </h2>
                <p className="mt-2 font-mono text-[10px] tracking-[0.1em] text-ink-muted uppercase">
                  {suggestion.totalMinutes} min · {suggestion.defaultServings} {t('home.servingsSuffix')} ·{' '}
                  {suggestion.difficulty === 'facil'
                    ? t('home.difficultyEasy')
                    : suggestion.difficulty === 'medio'
                      ? t('home.difficultyMedium')
                      : t('home.difficultyHard')}
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
                {t('home.viewRecipe')}
              </Link>
              <button
                type="button"
                onClick={() => setOffset((current) => current + 1)}
                disabled={list.length < 2}
                className="h-[42px] flex-1 rounded-lg border border-strong text-[14px] font-semibold whitespace-nowrap text-ink disabled:opacity-45"
              >
                {t('home.anotherIdea')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
