import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from './LanguageProvider';
import { useLanguage } from './language-context';

const mutateMock = vi.fn();
let sessionUser: { id: string } | null = null;
let profileData: { locale: string } | undefined = undefined;

vi.mock('@/features/auth/session-context', () => ({
  useSession: () => ({ session: null, user: sessionUser, isLoading: false }),
}));

vi.mock('@/features/profile/hooks', () => ({
  useProfile: () => ({ data: profileData }),
  useUpdateProfile: () => ({ mutate: mutateMock }),
}));

function Probe() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div>
      <span data-testid="greeting">{t('home.greeting')}</span>
      <button type="button" onClick={() => setLanguage(language === 'fr' ? 'pt' : 'fr')}>
        toggle
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mutateMock.mockClear();
    sessionUser = null;
    profileData = undefined;
  });

  it('defaults to pt-BR', () => {
    renderProbe();
    expect(screen.getByTestId('greeting')).toHaveTextContent('Olá, o que vamos cozinhar hoje?');
  });

  it('switches instantly — a state update, not a reload', () => {
    renderProbe();
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('greeting')).toHaveTextContent(
      'Salut, qu’est-ce qu’on va cuisiner aujourd’hui ?',
    );
  });

  it('persists the choice to localStorage', () => {
    renderProbe();
    fireEvent.click(screen.getByText('toggle'));
    expect(window.localStorage.getItem('mpc.language')).toBe('fr');
  });

  it('writes the choice onto the profile when signed in', () => {
    sessionUser = { id: 'user-1' };
    renderProbe();
    fireEvent.click(screen.getByText('toggle'));
    expect(mutateMock).toHaveBeenCalledWith({ locale: 'fr-FR' });
  });

  it('never touches the profile when signed out', () => {
    renderProbe();
    fireEvent.click(screen.getByText('toggle'));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('adopts the profile locale once, when this device has no local choice yet', () => {
    sessionUser = { id: 'user-1' };
    profileData = { locale: 'fr-FR' };
    renderProbe();
    expect(screen.getByTestId('greeting')).toHaveTextContent('Salut');
  });

  it('never overrides an existing local choice with the profile locale', () => {
    window.localStorage.setItem('mpc.language', 'pt');
    sessionUser = { id: 'user-1' };
    profileData = { locale: 'fr-FR' };
    renderProbe();
    expect(screen.getByTestId('greeting')).toHaveTextContent('Olá');
  });
});
