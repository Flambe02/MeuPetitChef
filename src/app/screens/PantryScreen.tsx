import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function PantryScreen() {
  return (
    <PlaceholderScreen
      title="Despensa"
      subtitle="O que você tem em casa agora"
      planned={[
        'Chips de ingredientes com adicionar/remover',
        'Sugestões filtradas pela despensa',
        'Aviso de validade próxima',
      ]}
      backing={['pantry_items', 'ingredients', 'add_recipe_to_shopping_list(skip_pantry)']}
    />
  );
}
