import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';

import { routes } from '@/app/routes';
import { RequireAuth, RequireOnboarding } from '@/app/guards';
import { AppShell } from '@/components/AppShell';
import { RouteErrorBoundary } from '@/components/ErrorBoundary';
import { Spinner } from '@/components/ui/states';

/** Every screen is code-split: the cook screen must not be in the home bundle. */
const load = (factory: () => Promise<{ default: ComponentType }>) => {
  const Screen = lazy(factory);
  return (
    <Suspense fallback={<Spinner />}>
      <Screen />
    </Suspense>
  );
};

const shellChildren: RouteObject[] = [
  { index: true, element: load(() => import('@/app/screens/HomeScreen')) },
  { path: routes.search, element: load(() => import('@/app/screens/SearchScreen')) },
  { path: routes.favorites, element: load(() => import('@/app/screens/FavoritesScreen')) },
  { path: routes.book, element: load(() => import('@/app/screens/BookScreen')) },
  { path: routes.profile, element: load(() => import('@/app/screens/ProfileScreen')) },

  { path: routes.suggestions, element: load(() => import('@/app/screens/SuggestionsScreen')) },
  { path: routes.pantry, element: load(() => import('@/app/screens/PantryScreen')) },

  { path: routes.recipe(), element: load(() => import('@/app/screens/RecipeScreen')) },

  { path: routes.plan, element: load(() => import('@/app/screens/PlanScreen')) },
  { path: routes.shopping, element: load(() => import('@/app/screens/ShoppingScreen')) },
  { path: routes.diary, element: load(() => import('@/app/screens/DiaryScreen')) },

  { path: routes.equipment, element: load(() => import('@/app/screens/EquipmentScreen')) },
  { path: routes.more, element: load(() => import('@/app/screens/MoreScreen')) },
  { path: routes.import, element: load(() => import('@/app/screens/ImportScreen')) },
];

export const router = createBrowserRouter(
  [
    {
      errorElement: <RouteErrorBoundary />,
      children: [
        // Public
        { path: routes.signIn, element: load(() => import('@/app/screens/SignInScreen')) },

        // Authenticated
        {
          element: <RequireAuth />,
          children: [
            // Onboarding sits inside auth but outside the onboarding guard,
            // otherwise it would redirect to itself forever.
            {
              path: routes.onboarding,
              element: load(() => import('@/app/screens/OnboardingScreen')),
            },

            {
              element: <RequireOnboarding />,
              children: [
                // Cook mode and its pre-flight own the full screen — no shell, no
                // tab bar. Both end in a pinned primary action that a tab bar
                // would sit on top of, and neither is a place to wander off from.
                { path: routes.cook(), element: load(() => import('@/app/screens/CookScreen')) },
                { path: routes.prep(), element: load(() => import('@/app/screens/PrepScreen')) },
                // The ficha joins them: it is the book page, full bleed, with
                // its own "Fechar o livro" — a tab bar would sit on top of the
                // pinned actions and offer a second way out of a screen that
                // already has one.
                {
                  path: routes.recipeSpread(),
                  element: load(() => import('@/app/screens/RecipeSpreadScreen')),
                },
                { element: <AppShell />, children: shellChildren },
              ],
            },
          ],
        },

        { path: '*', element: load(() => import('@/app/screens/NotFoundScreen')) },
      ],
    },
  ],
  {
    /**
     * Where the app lives on its host.
     *
     * `/` everywhere except GitHub Pages, which serves a project site from
     * `/<repo>/`. Vite fills `BASE_URL` from its own `base`, so this follows
     * the build automatically — without it, every route would be matched
     * against `/MeuPetitChef/receita/…` and nothing would ever hit.
     */
    basename: import.meta.env.BASE_URL,
  },
);
