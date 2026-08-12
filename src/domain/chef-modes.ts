import type { ChefMode } from './types';

/**
 * The three chefs are the product's nutrition axis. The user picks a chef, not
 * a diet — the concept document is explicit that the intelligence stays
 * invisible and the vocabulary stays warm.
 */
export interface ChefModeMeta {
  id: ChefMode;
  label: string;
  description: string;
  /** Path under /assets in the design project; mirrored into /public/chefs. */
  illustration: string;
}

export const CHEF_MODES: readonly ChefModeMeta[] = [
  {
    id: 'normal',
    label: 'Normal',
    description: 'Equilibrado, profissional e sempre preparado. Seu chef do dia a dia.',
    illustration: '/chefs/chef-normal.png',
  },
  {
    id: 'gourmand',
    label: 'Gourmand',
    description: 'Apaixonado por sabores e boas experiências. Generoso e acolhedor.',
    illustration: '/chefs/chef-gourmand.png',
  },
  {
    id: 'fit',
    label: 'Fit',
    description: 'Leve, ativo e disciplinado. Equilíbrio entre saúde, prazer e performance.',
    illustration: '/chefs/chef-fit.png',
  },
] as const;

export const DEFAULT_CHEF_MODE: ChefMode = 'normal';

export function chefMode(id: ChefMode): ChefModeMeta {
  return CHEF_MODES.find((mode) => mode.id === id) ?? CHEF_MODES[0]!;
}
