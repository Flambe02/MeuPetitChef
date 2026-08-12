/**
 * Google Translate, made survivable in a React app.
 *
 * The app is written in Brazilian Portuguese. This adds an on-demand
 * translation of the whole page, so a French speaker can read it without the
 * eighteen screens being extracted into locale files.
 *
 * ── The problem this file exists for ─────────────────────────────────────────
 *
 * Google Translate does not translate a page: it rewrites it. Every text node
 * is replaced by a `<font>` wrapper holding the translation. React knows
 * nothing about those nodes, so the next time it removes an element it looks
 * for a child that Google has since moved, and the reconciler throws:
 *
 *     Failed to execute 'removeChild' on 'Node': The node to be removed
 *     is not a child of this node.
 *
 * The app dies on the spot — usually on the first navigation after switching
 * language. This is a long-standing, well-documented incompatibility, not
 * something specific to this codebase.
 *
 * `guardDomAgainstTranslation` makes the two operations React uses tolerant of
 * a node that has already been moved out from under it. It is a workaround and
 * reads like one; the alternative is real i18n, which is the right fix when
 * the interface stops moving.
 */

const COOKIE = 'googtrans';

export type UiLanguage = 'pt' | 'fr' | 'en';

export const LANGUAGES: { code: UiLanguage; label: string }[] = [
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];

/** The page's own language — the one Google translates *from*. */
const SOURCE: UiLanguage = 'pt';

/* ---------------------------------------------------------------------------
 * The guard
 * ------------------------------------------------------------------------- */

let guarded = false;

/**
 * Stops a translated page from taking React down with it.
 *
 * Only the two methods React's reconciler calls are wrapped, and only the
 * "wrong parent" case is swallowed — a genuine bug still throws as before.
 */
export function guardDomAgainstTranslation(): void {
  if (guarded || typeof Node === 'undefined') return;
  guarded = true;

  // Bound at capture rather than kept as loose prototype references: an
  // unbound method called later with the wrong `this` is precisely what the
  // lint rule is warning about, and here `this` is the node being patched.
  const nativeRemoveChild = <T extends Node>(parent: Node, child: T): T =>
    Node.prototype.removeChild.call(parent, child) as T;
  const nativeInsertBefore = <T extends Node>(parent: Node, node: T, reference: Node | null): T =>
    Node.prototype.insertBefore.call(parent, node, reference) as T;

  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // Google already moved it. React's intent — "this node should be gone" —
      // is satisfied either way, so report success rather than crash the app.
      return child;
    }
    return nativeRemoveChild(this, child);
  };

  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this) {
      // The anchor moved; appending keeps the order Google is about to redo.
      return appendChildSafely(this, node);
    }
    return nativeInsertBefore(this, node, reference);
  };
}

function appendChildSafely<T extends Node>(parent: Node, node: T): T {
  return parent.appendChild(node);
}

/* ---------------------------------------------------------------------------
 * The widget
 * ------------------------------------------------------------------------- */

interface TranslateWindow extends Window {
  google?: { translate?: { TranslateElement?: new (options: object, id: string) => void } };
  googleTranslateElementInit?: () => void;
}

/** Google reads its target language from this cookie, on every load. */
function writeCookie(language: UiLanguage): void {
  const value = language === SOURCE ? '' : `/${SOURCE}/${language}`;
  const expiry = language === SOURCE ? 'Thu, 01 Jan 1970 00:00:00 GMT' : '';
  const suffix = expiry ? `; expires=${expiry}` : '';

  // Written for the bare host as well as the dotted one: Google's own widget
  // sets both, and a stale copy on either wins over the new value.
  for (const domain of [
    '',
    `; domain=${window.location.hostname}`,
    `; domain=.${window.location.hostname}`,
  ]) {
    document.cookie = `${COOKIE}=${value}; path=/${domain}${suffix}`;
  }
}

export function currentLanguage(): UiLanguage {
  const match = /(?:^|;\s*)googtrans=\/[a-z]{2}\/([a-z]{2})/.exec(document.cookie);
  const found = match?.[1];
  return LANGUAGES.some((entry) => entry.code === found) ? (found as UiLanguage) : SOURCE;
}

/**
 * Switches the interface language.
 *
 * Reloads rather than driving the widget in place: Google's element only reads
 * the cookie at startup, and asking it to re-translate a page it has already
 * rewritten is exactly the situation the guard above exists to survive. A
 * reload is one second and leaves the DOM clean.
 */
export function setLanguage(language: UiLanguage): void {
  writeCookie(language);
  window.location.reload();
}

/**
 * Loads Google's script, once, and only when a translation is actually wanted.
 *
 * A Portuguese reader — which is most of them — never pays for it.
 */
export function mountTranslateWidget(): void {
  const scope = window as TranslateWindow;
  if (currentLanguage() === SOURCE) return;
  if (document.getElementById('google-translate-script')) return;

  guardDomAgainstTranslation();

  let host = document.getElementById('google_translate_element');
  if (!host) {
    host = document.createElement('div');
    host.id = 'google_translate_element';
    // The widget's own dropdown is not used; ours drives the cookie instead.
    host.style.display = 'none';
    document.body.appendChild(host);
  }

  scope.googleTranslateElementInit = () => {
    const Element = scope.google?.translate?.TranslateElement;
    if (!Element) return;
    new Element({ pageLanguage: SOURCE, autoDisplay: false }, 'google_translate_element');
  };

  const script = document.createElement('script');
  script.id = 'google-translate-script';
  script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  document.body.appendChild(script);
}
