/**
 * Pure helpers `document.ts` needs, kept apart from it on purpose.
 *
 * `document.ts` imports `pdfjs-dist`, and that import alone throws in any
 * environment without a real `DOMMatrix` — which is to say, in Vitest's jsdom.
 * A helper here that needs no pdf.js object stays testable only by living
 * somewhere that never pulls the package in.
 */

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
}

/**
 * pdf.js returns text as a flat stream of positioned fragments, not lines. The
 * only line-break signal it gives is `hasEOL` — true on the fragment that ends
 * a visual line — so that is what turns the stream back into the paragraphs
 * the classifier's regexes and `readFolio` expect to see.
 */
export function joinTextItems(items: TextItemLike[]): string {
  let text = '';
  for (const item of items) {
    text += item.str;
    text += item.hasEOL ? '\n' : ' ';
  }
  return text;
}

/** A `data:image/jpeg;base64,…` URL → a `Blob`, for a Storage upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:([^;]+);base64/.exec(header ?? '')?.[1] ?? 'image/jpeg';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
