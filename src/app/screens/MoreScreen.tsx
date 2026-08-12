import {
  Activity,
  CircleUserRound,
  CookingPot,
  Heart,
  Link2,
  ShieldCheck,
  ShoppingBasket,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router';

import { routes } from '@/app/routes';
import { DataLabel } from '@/components/ui/Card';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useIsAdmin } from '@/features/admin/hooks';
import { useEquipment } from '@/features/profile/hooks';
import { useFavorites } from '@/features/favorites/hooks';

interface Entry {
  label: string;
  desc: string;
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

  const groups: { name: string; items: Entry[] }[] = [
    {
      name: 'Cozinha',
      items: [
        {
          label: 'Lista de compras',
          desc: 'Do que falta para a sua semana',
          icon: ShoppingBasket,
          to: routes.shopping,
        },
        {
          label: 'Favoritos',
          desc: 'Receitas que você guardou',
          icon: Heart,
          to: routes.favorites,
          hint: favorites.data ? String(favorites.data.length) : undefined,
        },
        {
          label: 'Importar receita',
          desc: 'Link, foto, captura ou PDF',
          icon: Link2,
          to: routes.import,
        },
      ],
    },
    {
      name: 'Acompanhamento',
      items: [
        {
          label: 'Registrar calorias',
          desc: 'Diário do dia, sem obrigação',
          icon: Activity,
          to: routes.diary,
        },
        {
          label: 'Meu perfil',
          desc: 'Chef, restrições e porções',
          icon: CircleUserRound,
          to: routes.profile,
        },
        {
          label: 'Meus equipamentos',
          desc: 'O que você tem em casa',
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
            name: 'Administração',
            items: [
              {
                label: 'Importações',
                desc: 'Trazer receitas de outras fontes para o catálogo',
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
      <h1 className="mb-5 font-display text-[30px] font-bold tracking-[-0.03em] text-ink">Mais</h1>

      {groups.map((group) => (
        <section key={group.name} className="mb-6">
          <DataLabel tone="primary">{group.name}</DataLabel>
          <div className="mt-3 flex flex-col gap-2">
            {group.items.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex items-center gap-3.5 rounded-lg border border-hairline bg-raised px-4 py-3.75 no-underline"
              >
                <item.icon aria-hidden className="size-5 shrink-0 text-ink-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-small text-ink-muted">{item.desc}</span>
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
        <LanguageSwitcher />
      </section>
    </div>
  );
}
