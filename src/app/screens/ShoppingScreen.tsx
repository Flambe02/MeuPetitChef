import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function ShoppingScreen() {
  return (
    <PlaceholderScreen
      title="Compras"
      subtitle="Organizada por setor do mercado"
      planned={[
        'Seções por corredor, na ordem em que se anda no mercado',
        'Riscar item com um toque',
        'Arquivar a lista concluída',
      ]}
      backing={[
        'shopping_lists',
        'shopping_items',
        'AISLE_ORDER',
        'add_recipe_to_shopping_list(...)',
      ]}
    />
  );
}
