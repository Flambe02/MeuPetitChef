import type { ChefMode, EquipmentType } from '@/domain/types';

export interface RecipeSearchParams {
  query?: string;
  equipment?: EquipmentType[];
  maxTotalMinutes?: number;
  maxKcal?: number;
  minProteinG?: number;
  mode?: ChefMode;
}

/**
 * Every query key in the app, in one place. Hierarchical on purpose:
 * `queryClient.invalidateQueries({ queryKey: keys.recipes.all })` nukes every
 * recipe query without any of them having to know about each other.
 *
 * Every key holding rows that belong to *one* user takes that user's id. The
 * cache is persisted to IndexedDB and survives a sign-out, so an unscoped
 * `['profile','current']` would serve account A's profile to account B on the
 * same phone. Recipe keys stay unscoped on purpose: recipe content is public.
 */
export const keys = {
  session: ['session'] as const,

  profile: {
    all: ['profile'] as const,
    current: (userId: string) => [...keys.profile.all, 'current', userId] as const,
    equipment: (userId: string) => [...keys.profile.all, 'equipment', userId] as const,
    preferences: (userId: string) => [...keys.profile.all, 'preferences', userId] as const,
  },

  recipes: {
    all: ['recipes'] as const,
    list: (params: RecipeSearchParams) => [...keys.recipes.all, 'list', params] as const,
    detail: (slug: string, mode: ChefMode) => [...keys.recipes.all, 'detail', slug, mode] as const,
    paths: (recipeId: string) => [...keys.recipes.all, 'paths', recipeId] as const,
    suggestions: (mode: ChefMode, limit: number) =>
      [...keys.recipes.all, 'suggestions', mode, limit] as const,
  },

  favorites: {
    all: ['favorites'] as const,
    list: (userId: string) => [...keys.favorites.all, 'list', userId] as const,
  },

  collections: {
    all: ['collections'] as const,
    list: (userId: string) => [...keys.collections.all, 'list', userId] as const,
    detail: (id: string) => [...keys.collections.all, 'detail', id] as const,
  },

  pantry: {
    all: ['pantry'] as const,
    list: (userId: string) => [...keys.pantry.all, 'list', userId] as const,
  },

  plan: {
    all: ['plan'] as const,
    week: (userId: string, weekStart: string) =>
      [...keys.plan.all, 'week', userId, weekStart] as const,
    meta: (userId: string, weekStart: string) =>
      [...keys.plan.all, 'meta', userId, weekStart] as const,
  },

  shopping: {
    all: ['shopping'] as const,
    open: (userId: string) => [...keys.shopping.all, 'open', userId] as const,
  },

  diary: {
    all: ['diary'] as const,
    day: (userId: string, date: string) => [...keys.diary.all, 'day', userId, date] as const,
  },

  cook: {
    all: ['cook'] as const,
    session: (userId: string, recipeId: string) =>
      [...keys.cook.all, 'session', userId, recipeId] as const,
    history: (userId: string) => [...keys.cook.all, 'history', userId] as const,
  },

  imports: {
    all: ['imports'] as const,
    list: (userId: string) => [...keys.imports.all, 'list', userId] as const,
    detail: (id: string) => [...keys.imports.all, 'detail', id] as const,
  },

  /**
   * The magazine importer's back-office. Unscoped by user on purpose — RLS
   * (migration 17) is `is_admin()`, not `created_by = auth.uid()`, because a
   * second admin has to be able to pick up someone else's review.
   */
  magazineImports: {
    all: ['magazineImports'] as const,
    list: () => [...keys.magazineImports.all, 'list'] as const,
    detail: (id: string) => [...keys.magazineImports.all, 'detail', id] as const,
    pages: (id: string) => [...keys.magazineImports.all, 'pages', id] as const,
    items: (id: string) => [...keys.magazineImports.all, 'items', id] as const,
    logs: (id: string) => [...keys.magazineImports.all, 'logs', id] as const,
    cost: (id: string) => [...keys.magazineImports.all, 'cost', id] as const,
  },
} as const;
