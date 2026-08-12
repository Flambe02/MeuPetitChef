import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function PlanScreen() {
  return (
    <PlaceholderScreen
      title="Semana"
      subtitle="Almoços e jantares dos próximos 7 dias"
      planned={[
        'Grade dia × refeição com arrastar e soltar',
        'Preenchimento automático a partir do perfil',
        'Enviar a semana para a lista de compras',
      ]}
      backing={[
        'meal_plan_entries',
        'startOfWeek() / weekDates()',
        'add_recipe_to_shopping_list(...)',
      ]}
    />
  );
}
