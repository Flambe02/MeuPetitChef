import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as profileApi from '@/features/profile/api';
import { LanguageProvider } from '@/lib/i18n/LanguageProvider';

import OnboardingScreen from './OnboardingScreen';

vi.mock('@/features/profile/api', () => ({
  getProfile: vi.fn(() => Promise.resolve(null)),
  getEquipment: vi.fn(() => Promise.resolve([])),
  getPreferences: vi.fn(() => Promise.resolve([])),
  updateProfile: vi.fn(() => Promise.resolve({ id: 'user-1' })),
  setEquipment: vi.fn(() => Promise.resolve()),
  completeOnboarding: vi.fn(() =>
    Promise.resolve({ id: 'user-1', onboarding_completed_at: '2026-08-11T10:00:00Z' }),
  ),
}));

vi.mock('@/features/auth/session-context', () => ({
  useSession: () => ({ session: null, user: { id: 'user-1' }, isLoading: false }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LanguageProvider>{children}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The guard sends every new account here and only lets it out once
   * `onboarding_completed_at` is set. If this screen ever loses its way to
   * `completeOnboarding`, every new sign-up is locked out of the whole app.
   */
  it('takes a new account all the way to a completed onboarding', async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen />, { wrapper });

    await user.click(screen.getByRole('radio', { name: /Gourmand/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    await user.click(screen.getByRole('button', { name: 'Air Fryer' }));
    await user.click(screen.getByRole('button', { name: 'Começar a cozinhar' }));

    await waitFor(() => {
      expect(profileApi.completeOnboarding).toHaveBeenCalledWith('user-1');
    });

    expect(profileApi.updateProfile).toHaveBeenCalledWith('user-1', { chef_mode: 'gourmand' });
    expect(profileApi.setEquipment).toHaveBeenCalledWith('user-1', [{ equipment: 'air_fryer' }]);
  });

  /** Stamping the profile before the kitchen is saved would let the user out
   *  with an empty kitchen if the equipment write failed. */
  it('saves the kitchen before stamping the profile as onboarded', async () => {
    const user = userEvent.setup();
    render(<OnboardingScreen />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Começar a cozinhar' }));

    await waitFor(() => {
      expect(profileApi.completeOnboarding).toHaveBeenCalled();
    });

    const setEquipmentOrder = vi.mocked(profileApi.setEquipment).mock.invocationCallOrder[0]!;
    const completeOrder = vi.mocked(profileApi.completeOnboarding).mock.invocationCallOrder[0]!;
    expect(setEquipmentOrder).toBeLessThan(completeOrder);
  });

  it('surfaces a failed save instead of stranding the user on a dead button', async () => {
    vi.mocked(profileApi.updateProfile).mockRejectedValueOnce(new Error('Sem conexão.'));

    const user = userEvent.setup();
    render(<OnboardingScreen />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Começar a cozinhar' }));

    expect(await screen.findByText('Sem conexão.')).toBeInTheDocument();
    expect(profileApi.completeOnboarding).not.toHaveBeenCalled();
  });
});
