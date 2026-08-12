import '@/styles/index.css';
import { mountTranslateWidget } from '@/lib/translate';

const container = document.getElementById('root');
if (!container) throw new Error('#root não encontrado no index.html');

/**
 * Paints a boot failure the user can actually read.
 *
 * Built with DOM calls rather than React: the whole point is that this runs
 * when the app could not be constructed in the first place. Text goes in via
 * `textContent`, never `innerHTML` — the message can carry an exception string.
 */
function renderBootFailure(target: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText = [
    'max-width:44ch',
    'margin:0 auto',
    'padding:2rem 1.5rem',
    'font-family:system-ui,sans-serif',
    'color:var(--text-primary,#0B0D10)',
  ].join(';');

  const title = document.createElement('h1');
  title.textContent = 'O aplicativo não conseguiu iniciar';
  title.style.cssText = 'font-size:1.375rem;margin:0 0 0.75rem';

  const detail = document.createElement('pre');
  detail.textContent = message;
  detail.style.cssText = [
    'white-space:pre-wrap',
    'font-size:0.8125rem',
    'line-height:1.5',
    'margin:0',
    'padding:1rem',
    'border-radius:0.5rem',
    'background:var(--surface-inset,#EDEAE3)',
    'color:var(--text-secondary,#3A3F45)',
  ].join(';');

  panel.append(title, detail);
  target.replaceChildren(panel);
}

// Google Translate rewrites the DOM; the guard inside must be installed
// before React mounts, and the script itself only loads when a language
// other than Portuguese was chosen.
mountTranslateWidget();

void import('@/app/bootstrap')
  .then(({ mount }) => {
    mount(container);
  })
  .catch((error: unknown) => {
    console.error('Boot failed', error);
    renderBootFailure(container, error);
  });
