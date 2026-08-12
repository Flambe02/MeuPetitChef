/**
 * Every route in the app, named once.
 *
 * Paths are in Portuguese because they are user-visible and shareable; the
 * identifiers stay in English so the code reads consistently. The prototype's
 * 18 screens map onto these one-to-one.
 */
export const routes = {
  // Shell tabs
  home: '/',
  search: '/buscar',
  favorites: '/favoritos',
  book: '/livro',
  profile: '/perfil',

  // Discovery
  suggestions: '/sugestoes',
  pantry: '/despensa',

  // Recipe
  recipe: (slug = ':slug') => `/receita/${slug}`,
  recipeSpread: (slug = ':slug') => `/receita/${slug}/ficha`,
  cook: (slug = ':slug') => `/receita/${slug}/cozinhar`,
  /**
   * "Antes de começar" — the pre-flight for one recipe, not a weekly meal-prep
   * screen. It hangs off the recipe because that is what the prototype's
   * `← Receita` back link and its per-path equipment list require.
   */
  prep: (slug = ':slug') => `/receita/${slug}/preparo`,

  // Planning
  plan: '/planejamento',
  shopping: '/compras',
  diary: '/diario',

  // Settings & tooling
  equipment: '/equipamentos',
  more: '/mais',
  import: '/importar',

  // Administration — admin-only, gated by RequireAdmin in the router and by
  // is_admin() in every table and Edge Function these screens touch.
  adminImports: '/administracao/importacoes',
  adminNewMagazineImport: '/administracao/importacoes/nova',
  adminMagazineImport: (id = ':id') => `/administracao/importacoes/${id}`,
  adminMagazineItem: (id = ':id', itemId = ':itemId') =>
    `/administracao/importacoes/${id}/receitas/${itemId}`,

  // Auth & onboarding
  onboarding: '/boas-vindas',
  signIn: '/entrar',
} as const;

/**
 * The five tabs, as the design draws them. Favourites and profile are *not*
 * here: the prototype reaches favourites through "Meu livro" and the profile
 * through the avatar in the home header, which is why the fifth tab is "Mais".
 */
export const TAB_ROUTES = [
  { path: routes.home, label: 'Início', icon: 'house' },
  { path: routes.search, label: 'Buscar', icon: 'search' },
  { path: routes.plan, label: 'Semana', icon: 'calendar' },
  { path: routes.book, label: 'Meu livro', icon: 'book' },
  { path: routes.more, label: 'Mais', icon: 'more' },
] as const;
