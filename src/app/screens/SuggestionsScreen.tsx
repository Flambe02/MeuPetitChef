import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function SuggestionsScreen() {
  return (
    <PlaceholderScreen
      title="Sugestões de hoje"
      subtitle="O que cozinhar agora, com o que você tem"
      planned={[
        'Cartões de sugestão com os motivos (perfil, equipamento, kcal a menos)',
        'Recusar e pedir outra',
        'Atalho direto para o modo cozinha',
      ]}
      backing={[
        'recipe_cards (view)',
        'search_recipes(...)',
        'score_cooking_path(...)',
        'profile_equipment',
      ]}
    />
  );
}
