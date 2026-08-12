import { PlaceholderScreen } from '@/components/PlaceholderScreen';

export default function DiaryScreen() {
  return (
    <PlaceholderScreen
      title="Diário"
      subtitle="O que você comeu hoje"
      planned={[
        'Anel de meta calórica e proteica',
        'Registro por refeição',
        'Histórico dos últimos dias',
      ]}
      backing={['diary_entries', 'profiles.daily_kcal_goal', 'profiles.daily_protein_goal_g']}
    />
  );
}
