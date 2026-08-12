import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { routes } from '@/app/routes';
import { LandscapeScreen } from '@/components/LandscapeScreen';
import { Dial } from '@/components/cook/Dial';
import { StepProgress } from '@/components/cook/StepProgress';
import { Vessel } from '@/components/cook/Vessel';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { EQUIPMENT_THEME } from '@/domain/equipment';
import { playTimerChime, primeAudio } from '@/features/cook/chime';
import { useCookSession } from '@/features/cook/hooks';
import { useIsFavorite, useToggleFavorite } from '@/features/favorites/hooks';
import { useTimerStore } from '@/features/cook/timer-store';
import { useProfile } from '@/features/profile/hooks';
import { useRecipe } from '@/features/recipes/hooks';
import { useWakeLock } from '@/hooks/useWakeLock';
import { cn } from '@/lib/cn';
import { formatTimer } from '@/lib/format';
import { asset } from '@/lib/asset';

/**
 * Guided cook mode — landscape, one action per screen, screen kept awake.
 *
 * Landscape is not a preference: the prototype gates its own frame on
 * `screen !== "cook" && screen !== "spread"`, and every dial, the appliance
 * outline and the step track are laid out across the width. Rendered in the
 * 440px portrait column the rest of the app uses, the timer falls below the
 * fold — which is the one thing that must never happen to someone standing at a
 * hob with wet hands.
 *
 * The cooking path arrives as `?path=`. Without it the screen would silently
 * cook `paths[0]`, i.e. not the route the user just picked on the recipe sheet.
 */
export default function CookScreen() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const { data: profile } = useProfile();
  const recipe = useRecipe(slug, profile?.chef_mode ?? 'normal');

  /** Null until the cook moves; before that the stored step governs. */
  const [movedTo, setMovedTo] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [isDone, setIsDone] = useState(false);

  // Declared with the other hooks: the screen returns early while the recipe
  // loads, and a hook after a return is a hook that sometimes does not run.
  const saveToBook = useToggleFavorite();
  const isInBook = useIsFavorite(recipe.data?.id);

  const timer = useTimerStore();
  useWakeLock(profile?.keep_screen_awake ?? true);

  const wantsSound = soundOn && profile?.timer_sound !== false;

  // One interval for the whole screen; the clock itself lives in the store.
  useEffect(() => {
    if (!timer.isRunning) return;
    const id = window.setInterval(() => {
      if (useTimerStore.getState().remaining() <= 0) {
        useTimerStore.getState().markFired();
        if (wantsSound) playTimerChime();
        navigator.vibrate?.([200, 100, 200]);
      }
      forceTick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [timer.isRunning, wantsSound]);

  // Leaving cook mode must not leave a timer ticking with no UI attached to it.
  useEffect(() => () => useTimerStore.getState().reset(), []);

  const cook = useCookSession({
    recipeId: recipe.data?.id,
    pathId: null,
    mode: profile?.chef_mode ?? 'normal',
    servings: recipe.data?.defaultServings ?? 2,
  });

  /**
   * Derived rather than synchronised: the session row arrives asynchronously,
   * and copying it into state through an effect would let a late response yank
   * the cook backwards from a step they had already advanced to. Until they
   * move, the stored step *is* the step.
   */
  const index = movedTo ?? cook.resumeAt;

  const path = useMemo(() => {
    const paths = recipe.data?.paths ?? [];
    const wanted = params.get('path');
    return paths.find((entry) => entry.id === wanted || entry.slug === wanted) ?? paths[0];
  }, [recipe.data, params]);

  const steps = path?.microSteps ?? [];
  const step = steps[Math.min(index, Math.max(0, steps.length - 1))];

  if (recipe.isPending) return <Spinner label="Preparando o modo cozinha…" />;
  if (recipe.isError) {
    return <ErrorState error={recipe.error} onRetry={() => void recipe.refetch()} />;
  }
  if (!recipe.data || !step) {
    return (
      <EmptyState
        title="Sem etapas para guiar"
        description="Esta receita ainda não tem um percurso de preparo publicado."
      />
    );
  }

  const data = recipe.data;
  const recipeRoute = routes.recipe(data.slug);
  const theme = EQUIPMENT_THEME[step.equipment];
  const isLast = index >= steps.length - 1;
  const hasTimer = step.timerEnabled && step.durationSeconds !== null;
  const isThisStepsTimer = timer.stepId === step.id;

  const goTo = (next: number) => {
    useTimerStore.getState().reset();
    const clamped = Math.max(0, Math.min(steps.length - 1, next));
    setMovedTo(clamped);
    // Persisted per step, not per tick: a handful of writes for a whole recipe.
    cook.saveStep(clamped);
  };

  const advance = () => {
    if (isLast) {
      useTimerStore.getState().reset();
      cook.finish();
      setIsDone(true);
      return;
    }
    goTo(index + 1);
  };

  return (
    <LandscapeScreen>
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex flex-none items-center gap-3.5 border-b border-hairline py-3.5 pr-5 pl-5">
        <img src={asset('brand/badge.png')} alt="" className="size-10 flex-none rounded-pill" />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="truncate font-display text-[19px] font-bold tracking-[-0.025em]">
            {data.title}
          </span>
          <span
            className="flex-none rounded-xs border px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase"
            style={{ color: theme.colorVar, borderColor: theme.colorVar }}
          >
            {theme.short}
          </span>
        </div>

        <span className="mr-1.5 flex-none font-mono text-[13px] tracking-[0.14em] text-ink-muted">
          {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </span>

        <div className="flex flex-none items-center gap-2">
          <CookButton label="Etapa anterior" onClick={() => goTo(index - 1)} disabled={index === 0}>
            <ChevronLeft aria-hidden className="size-[18px]" />
          </CookButton>
          <CookButton label="Próxima etapa" onClick={() => goTo(index + 1)} disabled={isLast}>
            <ChevronRight aria-hidden className="size-[18px]" />
          </CookButton>

          {hasTimer ? (
            <CookButton
              label={timer.isRunning ? 'Pausar' : 'Iniciar'}
              onClick={() => {
                primeAudio();
                if (isThisStepsTimer && timer.isRunning) timer.pause();
                else if (isThisStepsTimer && timer.pausedRemaining !== null) timer.resume();
                else timer.start(step.id, step.durationSeconds!);
              }}
            >
              {timer.isRunning ? (
                <Pause aria-hidden className="size-[18px]" />
              ) : (
                <Play aria-hidden className="size-[18px]" />
              )}
            </CookButton>
          ) : null}

          <CookButton
            label={wantsSound ? 'Desligar o som' : 'Ligar o som'}
            onClick={() => setSoundOn((on) => !on)}
          >
            {wantsSound ? (
              <Volume2 aria-hidden className="size-[18px]" />
            ) : (
              <VolumeX aria-hidden className="size-[18px]" />
            )}
          </CookButton>

          <CookButton
            label="Sair"
            onClick={() => void navigate(recipeRoute)}
            className="border-rouge text-rouge"
          >
            <X aria-hidden className="size-[18px]" />
          </CookButton>
        </div>
      </header>

      {/* ── The step ─────────────────────────────────────────────────── */}
      {/* `items-center` used to sit on this row, which centred the step column
          and then clipped it at BOTH ends as soon as it outgrew the viewport —
          a phone in landscape leaves about 320px here, and a three-line
          instruction plus a dial needs more. The column is now its own scroll
          container: `min-h-full justify-center` keeps a short step centred, and
          a long one scrolls instead of losing its first line. */}
      <main className="flex min-h-0 flex-1 gap-6 overflow-hidden px-10">
        <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex min-h-full flex-col justify-center py-4">
            {step.verb ? (
              <p className="font-mono text-[13px] tracking-[0.2em] text-rouge uppercase">
                {step.verb}
              </p>
            ) : null}

            {/* Scales with viewport height rather than sitting at a fixed 38px:
              the screen must never clip an instruction someone is following. */}
            <p
              className="mt-3 font-display leading-[1.08] font-bold tracking-[-0.03em] text-ink"
              style={{ fontSize: 'clamp(22px, 6.4vh, 38px)' }}
            >
              {step.instruction}
            </p>

            {step.dials.length > 0 || hasTimer ? (
              <div className="mt-6 flex items-start gap-[18px]">
                {hasTimer ? (
                  <Dial
                    kind="tempo"
                    value={formatTimer(
                      isThisStepsTimer ? timer.remaining() : step.durationSeconds!,
                    )}
                    sub="min · seg"
                    shape={theme.shape}
                    accent={theme.colorVar}
                  />
                ) : null}
                {step.dials
                  .filter((dial) => dial.kind !== 'tempo' || !hasTimer)
                  .map((dial) => (
                    <Dial
                      key={dial.kind}
                      kind={dial.kind}
                      value={dial.valueText ?? String(dial.valueNum ?? '—')}
                      sub={dial.subLabel}
                      shape={theme.shape}
                      accent={theme.colorVar}
                    />
                  ))}
              </div>
            ) : null}

            {step.alertText ? (
              <p className="mt-5 max-w-[52ch] text-small text-ink-muted">{step.alertText}</p>
            ) : null}
          </div>
        </div>

        {/* The appliance outline gives way before the instruction does: it is
            an orientation cue, and a narrow landscape phone needs the width
            for the words. Hidden entirely below 700px, where 300px of it would
            take nearly half the screen. */}
        <div className="hidden w-[clamp(180px,26vw,300px)] flex-none items-center justify-center text-ink/15 min-[700px]:flex">
          <Vessel kind={theme.vessel} className="size-full max-h-70 max-w-70" />
        </div>
      </main>

      {/* ── Track + advance ──────────────────────────────────────────── */}
      <footer className="flex flex-none items-center gap-[22px] border-t border-hairline px-5 pt-3.5 pb-4.5">
        <StepProgress steps={steps} current={index} onSelect={goTo} />
        <button
          type="button"
          onClick={advance}
          className="h-[46px] flex-none rounded-lg bg-graphite-900 px-6 text-[14px] font-semibold text-porcelain-100"
        >
          {isLast ? 'Concluir' : 'Avançar'}
        </button>
      </footer>

      {/* ── Bom apetite ──────────────────────────────────────────────── */}
      {isDone ? (
        <div className="animate-fade absolute inset-0 flex items-center justify-center bg-base/85 backdrop-blur-[14px]">
          <div className="flex max-w-[460px] items-center gap-5 rounded-xl border border-hairline bg-raised px-7 py-6.5">
            <img src={asset('brand/badge.png')} alt="" className="size-20 flex-none rounded-pill" />
            <div>
              <span className="sn-datalabel" data-tone="signal">
                Concluído
              </span>
              <p className="mt-3 font-display text-[28px] leading-[1.1] font-bold tracking-[-0.03em] text-ink">
                Bom apetite.
              </p>
              <p className="mt-2.5 mb-4.5 text-small leading-[1.6] text-ink-muted">
                {path?.name} · {steps.length} etapas
                {data.variants[profile?.chef_mode ?? 'normal']?.kcal
                  ? ` · ${Math.round(data.variants[profile?.chef_mode ?? 'normal']!.kcal!)} kcal por porção`
                  : ''}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void navigate(recipeRoute, { replace: true })}
                  className="h-[42px] rounded-lg bg-graphite-900 px-[18px] text-[14px] font-semibold text-porcelain-100"
                >
                  Voltar à receita
                </button>
                {/* This used to only navigate. A button that says "Salvar" and
                    writes nothing is worse than no button: the cook believes
                    the recipe is in their book and finds it empty later. */}
                <button
                  type="button"
                  disabled={saveToBook.isPending}
                  onClick={() => {
                    if (!isInBook) saveToBook.mutate({ recipe: data, next: true });
                    void navigate(routes.book);
                  }}
                  className="h-[42px] rounded-lg border border-strong px-4 text-[14px] font-semibold text-ink disabled:opacity-45"
                >
                  {isInBook ? 'Ver no livro' : 'Salvar no livro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </LandscapeScreen>
  );
}

/** The square outline controls in the top bar. */
function CookButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg border border-hairline text-ink',
        'transition-colors duration-[140ms] ease-signal disabled:opacity-35',
        className,
      )}
    >
      {children}
    </button>
  );
}
