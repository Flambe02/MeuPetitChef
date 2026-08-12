# Meu Petit Chef — notes pour Claude Code

PWA de recettes adaptables (React + Vite + TypeScript + Tailwind v4 + Supabase).
Interface en **portugais brésilien**. Documentation et commentaires en français
ou en anglais, jamais mélangés dans un même fichier.

## Commandes

```bash
npm run verify      # schéma + typecheck + lint + tests + build. À lancer avant de conclure.
npm run db:verify   # rejoue les migrations dans un Postgres WASM et assère le schéma
npm run db:types    # régénère database.types.ts — OBLIGATOIRE après chaque migration
npm run dev
```

Docker n'est pas installé : `supabase start` et `supabase gen types` ne
fonctionnent pas. Utiliser `db:verify` et `db:types` (PGlite) à la place.

## Règles

- **Après toute migration** : `npm run db:types` puis `npm run db:verify`. Les
  deux, dans cet ordre. Le code compile contre le fichier généré.
- **Ne jamais éditer** `src/lib/supabase/database.types.ts` à la main.
- **Toute nouvelle table** doit avoir `enable row level security` et au moins
  une policy dans la migration RLS. `db:verify` échoue sinon.
- **Toute réponse Supabase** passe par `unwrap()` / `unwrapMaybe()` de
  `src/lib/supabase/errors.ts`. Jamais de `if (error)` en ligne.
- **Aucune couleur en dur.** Utiliser les utilitaires Tailwind adossés aux
  tokens (`bg-card`, `text-ink-muted`, `border-hairline`…). La palette vit dans
  `src/styles/tokens/`, copiée du design system Signal Noir.
- **Textes visibles en pt-BR.** Les identifiants, noms de fichiers et
  commentaires restent en anglais ; les chemins de route sont en portugais.
- Un domaine = un dossier dans `src/features/` avec `api.ts` (repository) et
  `hooks.ts` (TanStack Query). Les écrans n'appellent jamais `supabase`
  directement.
- Les clés de requête viennent de `src/lib/query/keys.ts`, jamais de tableaux
  littéraux inline.

## Implémenter un écran du design

Les 11 écrans encore en gabarit rendent `<PlaceholderScreen>`. Pour en
implémenter un :

1. Ouvrir le prototype Claude Design _Cookimix Brasil prototype cliquable_,
   fichier `Meu Petit Chef.dc.html` (projet `2414bb4c-0880-44e2-b993-55eb31697846`).
2. Remplacer le contenu de `src/app/screens/<Nom>Screen.tsx`.
3. Réutiliser le repository listé dans le champ `backing` du gabarit — il est
   déjà écrit.
4. Ne pas ajouter de route : elles existent toutes dans `src/app/routes.ts`.

## Pièges connus

- `exactOptionalPropertyTypes` est **désactivé** volontairement (incompatible
  avec les types d'options de supabase-js). Ne pas le réactiver.
- Le minuteur de cuisine stocke un instant d'échéance absolu, pas un compteur.
  Ne pas le « simplifier » en `setInterval` décrémental : il perdrait du temps
  quand l'app passe en arrière-plan.
- Le mode cuisine est routé hors de `<AppShell>` — c'est intentionnel.
- Le dossier est synchronisé par OneDrive. Ne pas s'étonner d'I/O lentes sur
  `node_modules`.
