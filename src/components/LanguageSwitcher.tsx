import { Languages } from 'lucide-react';

import { cn } from '@/lib/cn';
import { currentLanguage, LANGUAGES, setLanguage } from '@/lib/translate';

/**
 * Interface language, via Google Translate.
 *
 * The app is written in pt-BR; this translates the rendered page on demand.
 * It is a pragmatic stand-in for real internationalisation, and it behaves
 * like one: the translation is machine-made, it covers recipe content as well
 * as the interface, and switching reloads the page.
 *
 * `notranslate` on the control itself keeps the language names readable —
 * without it, "Português" would be translated into the language you are
 * leaving, which is exactly the wrong way round.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const active = currentLanguage();

  return (
    <div className={cn('notranslate', className)} translate="no">
      <div className="flex items-center gap-2">
        <Languages aria-hidden className="size-4 text-ink-muted" />
        <span className="sn-datalabel">Idioma</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Idioma da interface">
        {LANGUAGES.map((entry) => (
          <button
            key={entry.code}
            type="button"
            className="sn-tag"
            data-active={entry.code === active || undefined}
            aria-pressed={entry.code === active}
            onClick={() => {
              if (entry.code !== active) setLanguage(entry.code);
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-small text-ink-muted">
        Tradução automática do Google. As receitas também são traduzidas.
      </p>
    </div>
  );
}
