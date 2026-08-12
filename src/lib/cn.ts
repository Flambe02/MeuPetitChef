import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The design system's own font sizes, declared to tailwind-merge.
 *
 * Without this list, `cn('text-porcelain-100', 'text-body')` returns just
 * `text-body` — and the button loses its text colour. tailwind-merge only
 * treats `text-*` as a size when it recognises the value (`text-sm`,
 * `text-2xl`, `text-[13px]`); everything else it files as a colour, so
 * `text-body` and `text-porcelain-100` land in the same group and the last one
 * wins. That is exactly what happened to every primary button in the app: black
 * text on a graphite background, invisible, because `<Button>` composes its
 * colour and its size through `cn`.
 *
 * Keep in step with the `--text-*` tokens in `src/styles/index.css`.
 */
const FONT_SIZES = [
  'display-m',
  'display-s',
  'title',
  'heading',
  'body',
  'body-l',
  'small',
  'label',
] as const;

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
});

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
