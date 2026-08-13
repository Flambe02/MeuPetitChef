import {
  Activity,
  CircleUserRound,
  CookingPot,
  Heart,
  Languages,
  Link2,
  ShieldCheck,
  ShoppingBasket,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { DataLabel } from '@/components/ui/Card';
import { useIsAdmin } from '@/features/admin/hooks';
import { useEquipment } from '@/features/profile/hooks';
import { useFavorites } from '@/features/favorites/hooks';
import { useLanguage, type UiLanguage } from '@/lib/i18n/language-context';
import type { TranslationKey } from '@/lib/i18n/pt';

interface Entry {
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  to: string;
  /** Rendered only when there is a real number to show. */
  hint?: string;
}

/**
 * "Mais" — the fifth tab, and the way into everything the four others do not
 * carry.
 *
 * Counts are shown only where they can be read without side effects. The
 * shopping list and the diary are deliberately bare: `getOpenList` *creates* a
 * list when none exists, and rendering a menu must never write to the database
 * just to decorate a row with a number.
 */
export default function MoreScreen() {
  const favorites = useFavorites();
  const equipment = useEquipment();
  const isAdmin = useIsAdmin();
  const { language, setLanguage, t } = useLanguage();

  const groups: { nameKey: TranslationKey; items: Entry[] }[] = [
    {
      nameKey: 'more.kitchen',
      items: [
        {
          labelKey: 'more.shoppingList',
          descKey: 'more.shoppingListDesc',
          icon: ShoppingBasket,
          to: routes.shopping,
        },
        {
          labelKey: 'more.favorites',
          descKey: 'more.favoritesDesc',
          icon: Heart,
          to: routes.favorites,
          hint: favorites.data ? String(favorites.data.length) : undefined,
        },
        {
          labelKey: 'more.importRecipe',
          descKey: 'more.importRecipeDesc',
          icon: Link2,
          to: routes.import,
        },
      ],
    },
    {
      nameKey: 'more.tracking',
      items: [
        {
          labelKey: 'more.logCalories',
          descKey: 'more.logCaloriesDesc',
          icon: Activity,
          to: routes.diary,
        },
        {
          labelKey: 'more.myProfile',
          descKey: 'more.myProfileDesc',
          icon: CircleUserRound,
          to: routes.profile,
        },
        {
          labelKey: 'more.myEquipment',
          descKey: 'more.myEquipmentDesc',
          icon: CookingPot,
          to: routes.equipment,
          hint: equipment.data ? String(equipment.data.length) : undefined,
        },
      ],
    },
    // Only ever rendered for an admin, and even then only decoration: the
    // real gate is RequireAdmin on the route and is_admin() everywhere behind
    // it, not this conditional.
    ...(isAdmin
      ? [
          {
            nameKey: 'more.admin' as const,
            items: [
              {
                labelKey: 'more.imports' as const,
                descKey: 'more.importsDesc' as const,
                icon: ShieldCheck,
                to: routes.adminImports,
              },
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="animate-in px-5 pt-1 pb-7">
      <h1 className="mb-5 font-display text-[30px] font-bold tracking-[-0.03em] text-ink">
        {t('more.title')}
      </h1>

      {groups.map((group) => (
        <section key={group.nameKey} className="mb-6">
          <DataLabel tone="primary">{t(group.nameKey)}</DataLabel>
          <div className="mt-3 flex flex-col gap-2">
            {group.items.map((item) => (
              <Link
                key={item.labelKey}
                to={item.to}
                className="flex items-center gap-3.5 rounded-lg border border-hairline bg-raised px-4 py-3.75 no-underline"
              >
                <item.icon aria-hidden className="size-5 shrink-0 text-ink-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-ink">{t(item.labelKey)}</span>
                  <span className="mt-0.5 block text-small text-ink-muted">{t(item.descKey)}</span>
                </span>
                {item.hint ? (
                  <span className="shrink-0 font-mono text-[13px] text-ink-muted">{item.hint}</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="mb-6 rounded-lg border border-hairline bg-raised px-4 py-3.75">
        <div className="flex items-center gap-2">
          <Languages aria-hidden className="size-4 text-ink-muted" />
          <span className="sn-datalabel">{t('more.language')}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('more.language')}>
          {(['pt', 'fr'] satisfies UiLanguage[]).map((code) => (
            <button
              key={code}
              type="button"
              className="sn-tag"
              data-active={code === language || undefined}
              aria-pressed={code === language}
              onClick={() => {
                if (code !== language) setLanguage(code);
              }}
            >
              {code === 'pt' ? 'Português' : 'Français'}
            </button>
          ))}
        </div>

        <p className="mt-2 text-small text-ink-muted">{t('more.languageDesc')}</p>
      </section>
    </div>
  );
}
