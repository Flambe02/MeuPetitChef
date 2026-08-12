import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { DataLabel } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/states';
import { CHEF_MODES } from '@/domain/chef-modes';
import { equipmentLabel } from '@/domain/equipment';
import type { PreferenceKind } from '@/domain/types';
import { signOut } from '@/features/auth/api';
import { useSession } from '@/features/auth/session-context';
import {
  useEquipment,
  usePreferences,
  useProfile,
  useUpdateProfile,
} from '@/features/profile/hooks';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/lib/format';

const SKILL_LABEL: Record<string, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

const PREFERENCE_LABEL: Record<PreferenceKind, string> = {
  cuisine: 'Cozinhas preferidas',
  style: 'Estilo de cozinhar',
  time: 'Tempo disponível',
  restriction: 'Restrições',
};

/**
 * "Meu perfil" — everything the onboarding asked, in one place, editable.
 *
 * The chef selector lives here rather than being read-only as the prototype
 * draws it: it is the single answer that rewrites every recipe on every screen,
 * and burying it behind "Refazer o onboarding" would make the app's central
 * promise a seven-question detour.
 */
export default function ProfileScreen() {
  const { user } = useSession();
  const profile = useProfile();
  const equipment = useEquipment();
  const preferences = usePreferences();
  const updateProfile = useUpdateProfile();
  const install = useInstallPrompt();

  if (profile.isPending) return <Spinner />;

  const data = profile.data;
  const byKind = (kind: PreferenceKind) =>
    (preferences.data ?? []).filter((row) => row.kind === kind).map((row) => row.value);

  return (
    <>
      <ScreenHeader title="Meu perfil" subtitle={user?.email ?? undefined} />

      <div className="flex flex-col gap-6 px-5 pb-8">
        {/* ── Chef ───────────────────────────────────────────────────── */}
        <section>
          <DataLabel>Seu chef</DataLabel>
          <div className="mt-3 flex flex-col gap-2">
            {CHEF_MODES.map((chef) => {
              const active = data?.chef_mode === chef.id;
              return (
                <button
                  key={chef.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={updateProfile.isPending}
                  onClick={() => updateProfile.mutate({ chef_mode: chef.id })}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors duration-[140ms] ease-signal',
                    active ? 'border-rouge bg-card' : 'border-hairline',
                  )}
                >
                  <p className="text-body font-semibold text-ink">{chef.label}</p>
                  <p className="mt-1 text-small text-ink-muted">{chef.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Servings ───────────────────────────────────────────────── */}
        <section className="flex items-center justify-between rounded-lg border border-hairline px-4 py-3">
          <DataLabel>Porções habituais</DataLabel>
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Menos porções"
              disabled={updateProfile.isPending}
              onClick={() =>
                updateProfile.mutate({
                  default_servings: Math.max(1, (data?.default_servings ?? 2) - 1),
                })
              }
              className="size-8 rounded-lg border border-hairline text-ink"
            >
              −
            </button>
            <span className="w-6 text-center text-body font-semibold text-ink">
              {data?.default_servings ?? 2}
            </span>
            <button
              type="button"
              aria-label="Mais porções"
              disabled={updateProfile.isPending}
              onClick={() =>
                updateProfile.mutate({
                  default_servings: Math.min(20, (data?.default_servings ?? 2) + 1),
                })
              }
              className="size-8 rounded-lg border border-hairline text-ink"
            >
              +
            </button>
          </div>
        </section>

        {/* ── Kitchen ────────────────────────────────────────────────── */}
        <section>
          <DataLabel>Sua cozinha</DataLabel>
          <Link
            to={routes.equipment}
            className="mt-3 flex items-center gap-3 rounded-lg border border-hairline bg-raised p-4 no-underline"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-body text-ink">
                {equipment.data && equipment.data.length > 0
                  ? equipment.data.map((item) => equipmentLabel(item.equipment)).join(' · ')
                  : 'Nenhum equipamento configurado ainda.'}
              </span>
              <span className="mt-1 block font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase">
                {equipment.data?.length ?? 0} aparelhos
              </span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
          </Link>
        </section>

        {/* ── Onboarding answers ─────────────────────────────────────── */}
        <section>
          <DataLabel>Suas respostas</DataLabel>
          <dl className="mt-3 flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
            <Row
              label="Nível na cozinha"
              value={(data?.skill_level ? SKILL_LABEL[data.skill_level] : null) ?? null}
            />
            {(Object.keys(PREFERENCE_LABEL) as PreferenceKind[]).map((kind) => (
              <Row key={kind} label={PREFERENCE_LABEL[kind]} value={byKind(kind).join(' · ')} />
            ))}
            <Row
              label="Onboarding"
              value={
                data?.onboarding_completed_at
                  ? `Concluído em ${formatShortDate(data.onboarding_completed_at)}`
                  : null
              }
            />
          </dl>
          <Link
            to={routes.onboarding}
            className="mt-3 inline-block text-small font-semibold text-rouge no-underline"
          >
            Refazer o onboarding
          </Link>
        </section>

        {/* ── Cook-mode settings ─────────────────────────────────────── */}
        <section>
          <DataLabel>No modo cozinha</DataLabel>
          <div className="mt-3 flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
            <Toggle
              label="Manter a tela acesa"
              hint="Nada de desbloquear o telefone com as mãos sujas."
              checked={data?.keep_screen_awake ?? true}
              onChange={(next) => updateProfile.mutate({ keep_screen_awake: next })}
            />
            <Toggle
              label="Som do timer"
              hint="Um toque quando o tempo acaba."
              checked={data?.timer_sound ?? true}
              onChange={(next) => updateProfile.mutate({ timer_sound: next })}
            />
          </div>
        </section>

        {install.canInstall ? (
          <Button variant="ghost" block onClick={() => void install.promptInstall()}>
            Instalar na tela de início
          </Button>
        ) : null}
        {install.isIOS && !install.isInstalled ? (
          <p className="text-small text-ink-muted">
            No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”.
          </p>
        ) : null}

        <Button variant="quiet" block onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3.5">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="text-right text-small font-medium text-ink">
        {value && value.length > 0 ? value : <span className="text-ink-muted">—</span>}
      </dd>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-4 px-4 py-3.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body text-ink">{label}</span>
        <span className="mt-0.5 block text-small text-ink-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-10 shrink-0 items-center rounded-pill p-0.5 transition-colors duration-[140ms]',
          checked ? 'bg-rouge' : 'bg-inset',
        )}
      >
        <span
          className={cn(
            'size-5 rounded-pill bg-porcelain-50 transition-transform duration-[140ms] ease-signal',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  );
}
