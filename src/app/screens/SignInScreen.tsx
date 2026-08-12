import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';

import { routes } from '@/app/routes';
import { Button } from '@/components/ui/Button';
import { DataLabel } from '@/components/ui/Card';
import { brand } from '@/config/brand';
import { signInWithOtp, signInWithPassword, signUpWithPassword } from '@/features/auth/api';
import { useSession } from '@/features/auth/session-context';

type Mode = 'signin' | 'signup' | 'magic';

export default function SignInScreen() {
  const { session, isLoading } = useSession();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ kind: 'error' | 'ok'; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (!isLoading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? routes.home;
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    try {
      if (mode === 'magic') {
        await signInWithOtp(email);
        setStatus({ kind: 'ok', message: 'Enviamos um link de acesso para o seu e-mail.' });
      } else if (mode === 'signup') {
        await signUpWithPassword(email, password);
        setStatus({ kind: 'ok', message: 'Conta criada. Confirme o e-mail para entrar.' });
      } else {
        await signInWithPassword(email, password);
      }
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível entrar.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="font-display text-display-m text-ink">{brand.name}</h1>
        <p className="mt-2 text-small text-ink-muted">{brand.tagline}</p>
      </div>

      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <DataLabel>E-mail</DataLabel>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="h-12 rounded-lg border border-hairline bg-raised px-4 text-body text-ink outline-none"
          />
        </label>

        {mode !== 'magic' ? (
          <label className="flex flex-col gap-2">
            <DataLabel>Senha</DataLabel>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="h-12 rounded-lg border border-hairline bg-raised px-4 text-body text-ink outline-none"
            />
          </label>
        ) : null}

        {status ? (
          <p className={status.kind === 'error' ? 'text-small text-rouge' : 'text-small text-ink'}>
            {status.message}
          </p>
        ) : null}

        <Button type="submit" block disabled={pending}>
          {mode === 'signup' ? 'Criar conta' : mode === 'magic' ? 'Enviar link' : 'Entrar'}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-center">
        <button
          type="button"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          className="text-small text-ink-muted"
        >
          {mode === 'signup' ? 'Já tenho conta' : 'Criar uma conta'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'magic' ? 'signin' : 'magic')}
          className="text-small text-ink-muted"
        >
          {mode === 'magic' ? 'Entrar com senha' : 'Entrar por link no e-mail'}
        </button>
      </div>
    </div>
  );
}
