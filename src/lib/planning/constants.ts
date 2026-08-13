import type { MealPlanGenerationMode } from '@/domain/types';

/** The four intentions "Montar minha semana" offers — one selected at a time. */
export const GENERATION_MODES: { id: MealPlanGenerationMode; label: string; description: string }[] = [
  { id: 'equilibrada', label: 'Equilibrada', description: 'Variedade + nutrição + simplicidade' },
  { id: 'pratica', label: 'Prática', description: 'Receitas rápidas + sobras' },
  { id: 'economica', label: 'Econômica', description: 'Reaproveitar ingredientes, comprar menos' },
  { id: 'fit', label: 'Fit', description: 'Otimizar calorias + proteínas' },
];

/**
 * The priority chips in the generation sheet. Their ids double as the keys
 * `engine.ts`'s `PRIORITY_NUDGES` reads — change one, change the other.
 */
export const GENERATION_PRIORITIES: { id: string; label: string; defaultChecked: boolean }[] = [
  { id: 'variar', label: 'Variar bastante', defaultChecked: true },
  { id: 'rapido', label: 'Cozinhar rápido', defaultChecked: true },
  { id: 'ingredientes', label: 'Usar ingredientes em comum', defaultChecked: true },
  { id: 'economizar', label: 'Economizar', defaultChecked: false },
  { id: 'brasileiras', label: 'Mais receitas brasileiras', defaultChecked: false },
];
