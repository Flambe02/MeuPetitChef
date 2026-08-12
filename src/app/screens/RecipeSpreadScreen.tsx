import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function RecipeSpreadScreen() {
  return (
    <PlaceholderScreen
      title="Ficha da receita"
      subtitle="Ingredientes e etapas em página dupla"
      showBack
      planned={[
        'Layout de página dupla para leitura na bancada',
        'Escala de porções ao vivo',
        'Marcação de ingredientes já separados',
      ]}
      backing={[
        'recipe_ingredients',
        'recipe_variant_ingredients',
        'cooking_steps',
        'scaleQuantity()',
      ]}
    />
  );
}
