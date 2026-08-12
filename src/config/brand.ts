/**
 * Every user-visible name of the product lives here. The working title is still
 * open (Meu Petit Chef / Cookimix Brasil / …), so renaming must stay a one-file
 * change — never a find-and-replace across screens.
 */
export const brand = {
  name: 'Meu Petit Chef',
  shortName: 'Petit Chef',
  tagline: 'Qualquer receita. Do seu jeito. Com os aparelhos que você tem.',
  locale: 'pt-BR',
  authorFallback: 'Petit Chef',
} as const;
