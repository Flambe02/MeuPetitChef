import { useState } from 'react';
import { useNavigate } from 'react-router';

import { routes } from '@/app/routes';
import { Button } from '@/components/ui/Button';
import { DataLabel } from '@/components/ui/Card';
import { CHEF_MODES } from '@/domain/chef-modes';
import { ONBOARDING_EQUIPMENT } from '@/domain/equipment';
import type { ChefMode, EquipmentType } from '@/domain/types';
import { useCompleteOnboarding } from '@/features/profile/hooks';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/pt';

/**
 * Onboarding — the two answers the rest of the app cannot run without.
 *
 * The prototype specifies seven questions; the five others (level, cuisines,
 * time, style, restrictions) only refine ranking, while *chef* and *equipment*
 * decide what every recipe screen renders. They are asked here so the guard in
 * `RequireOnboarding` always has a way out — an onboarding with no exit locks
 * every new account out of the app entirely.
 *
 * The remaining five questions slot in as extra steps against
 * `profile_preferences`, which is already written and typed.
 */
export default function OnboardingScreen() {
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();
  const { t } = useLanguage();

  const [step, setStep] = useState<0 | 1>(0);
  const [chefMode, setChefMode] = useState<ChefMode>('normal');
  const [equipment, setEquipment] = useState<EquipmentType[]>([]);

  const toggle = (item: EquipmentType) =>
    setEquipment((current) =>
      current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item],
    );

  const finish = () => {
    complete.mutate(
      { chefMode, equipment },
      { onSuccess: () => void navigate(routes.home, { replace: true }) },
    );
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-base">
      {/* `safe-top` sets padding-top outright, so the visual spacing has to be
          folded into the same declaration rather than added with `pt-6`. */}
      <header className="px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
        <DataLabel>{t('onboarding.step', { step: step + 1 })}</DataLabel>
        <div aria-hidden className="mt-3 flex gap-1">
          <span className="h-0.5 flex-1 rounded-pill bg-rouge" />
          <span className={cn('h-0.5 flex-1 rounded-pill', step === 1 ? 'bg-rouge' : 'bg-inset')} />
        </div>
      </header>

      {step === 0 ? (
        <main className="flex flex-1 flex-col gap-6 px-6 pb-6">
          <div>
            <h1 className="font-display text-display-s text-ink">{t('onboarding.chefQuestion')}</h1>
            <p className="mt-2 text-small text-ink-muted">{t('onboarding.chefQuestionDesc')}</p>
          </div>

          <div
            role="radiogroup"
            aria-label={t('onboarding.chefRadioGroupLabel')}
            className="flex flex-col gap-3 pb-4"
          >
            {CHEF_MODES.map((chef) => {
              const active = chefMode === chef.id;
              return (
                <button
                  key={chef.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setChefMode(chef.id)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors duration-[140ms] ease-signal',
                    active ? 'border-rouge bg-card' : 'border-hairline',
                  )}
                >
                  <p className="text-body font-semibold text-ink">{chef.label}</p>
                  <p className="mt-1 text-small text-ink-muted">
                    {t(`chefMode.${chef.id}.description` as TranslationKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col gap-6 px-6 pb-6">
          <div>
            <h1 className="font-display text-display-s text-ink">{t('onboarding.equipmentQuestion')}</h1>
            <p className="mt-2 text-small text-ink-muted">{t('onboarding.equipmentQuestionDesc')}</p>
          </div>

          <div
            role="group"
            aria-label={t('onboarding.equipmentGroupLabel')}
            className="grid grid-cols-2 gap-2 pb-4"
          >
            {ONBOARDING_EQUIPMENT.map((item) => {
              const active = equipment.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(item)}
                  className={cn(
                    'rounded-lg border px-4 py-4 text-left text-small font-semibold transition-colors duration-[140ms] ease-signal',
                    active
                      ? 'border-transparent bg-graphite-900 text-porcelain-100'
                      : 'border-hairline text-ink-muted',
                  )}
                >
                  {t(`equipment.${item}` as TranslationKey)}
                </button>
              );
            })}
          </div>
        </main>
      )}

      {complete.isError ? (
        <p className="px-6 pb-3 text-small text-rouge">
          {complete.error instanceof Error ? complete.error.message : t('onboarding.saveError')}
        </p>
      ) : null}

      <footer className="flex gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {step === 1 ? (
          <Button variant="ghost" onClick={() => setStep(0)} disabled={complete.isPending}>
            {t('onboarding.back')}
          </Button>
        ) : null}

        {step === 0 ? (
          <Button block onClick={() => setStep(1)}>
            {t('onboarding.continueButton')}
          </Button>
        ) : (
          <Button block onClick={finish} disabled={complete.isPending}>
            {complete.isPending ? t('onboarding.finishing') : t('onboarding.startCooking')}
          </Button>
        )}
      </footer>
    </div>
  );
}
