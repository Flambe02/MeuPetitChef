import type { Enums, Tables, Views } from '@/lib/supabase/database.types';

/* ── Enum aliases ─────────────────────────────────────────────────────────── */
export type EquipmentType = Enums<'equipment_type'>;
export type ChefMode = Enums<'chef_mode'>;
export type Difficulty = Enums<'difficulty'>;
export type SkillLevel = Enums<'skill_level'>;
export type MealSlot = Enums<'meal_slot'>;
export type UnitKind = Enums<'unit_kind'>;
export type DialKind = Enums<'dial_kind'>;
export type ShoppingAisle = Enums<'shopping_aisle'>;
export type RecipeStatus = Enums<'recipe_status'>;
export type PreferenceKind = Enums<'preference_kind'>;
export type ImportSource = Enums<'import_source'>;
export type ImportStatus = Enums<'import_status'>;

/* ── Row aliases ──────────────────────────────────────────────────────────── */
export type Profile = Tables<'profiles'>;
export type ProfileEquipment = Tables<'profile_equipment'>;
export type Recipe = Tables<'recipes'>;
export type RecipeVariantRow = Tables<'recipe_variants'>;
export type RecipeIngredientRow = Tables<'recipe_ingredients'>;
export type CookingPathRow = Tables<'cooking_paths'>;
export type CookingStepRow = Tables<'cooking_steps'>;
export type CookingStepDial = Tables<'cooking_step_dials'>;
export type PantryItem = Tables<'pantry_items'>;
export type MealPlanEntry = Tables<'meal_plan_entries'>;
export type ShoppingItem = Tables<'shopping_items'>;
export type DiaryEntry = Tables<'diary_entries'>;
export type CookSession = Tables<'cook_sessions'>;
export type Collection = Tables<'collections'>;
export type RecipeImport = Tables<'recipe_imports'>;

/**
 * The recipe_cards view is nullable on every column (Postgres cannot prove
 * NOT NULL through a view). This is the non-null shape the UI actually gets,
 * narrowed once at the repository boundary rather than at every call site.
 */
export type RecipeCardRow = Views<'recipe_cards'>;

export interface VariantNutrition {
  id: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  summary: string | null;
  changes: string[];
}

export interface RecipeCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  heroImagePath: string | null;
  heroImageUrl: string | null;
  authorName: string;
  cuisine: string | null;
  category: string | null;
  difficulty: Difficulty;
  totalMinutes: number;
  activeMinutes: number | null;
  defaultServings: number;
  ratingAvg: number;
  ratingCount: number;
  equipment: EquipmentType[];
  tags: string[];
  variants: Partial<Record<ChefMode, VariantNutrition>>;
}

/* ── Composed recipe detail ───────────────────────────────────────────────── */

export interface IngredientLine {
  id: string;
  groupId: string | null;
  groupName: string | null;
  ingredientId: string | null;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  unitKind: UnitKind;
  note: string | null;
  isOptional: boolean;
  isScalable: boolean;
  /** Set when the active chef mode rewrites or drops this line. */
  variantChange: 'replaced' | 'removed' | 'added' | null;
}

export interface IngredientGroup {
  id: string | null;
  name: string;
  items: IngredientLine[];
}

export interface StepDial {
  kind: DialKind;
  valueNum: number | null;
  valueText: string | null;
  subLabel: string | null;
}

export interface CookingStep {
  id: string;
  position: number;
  verb: string | null;
  instruction: string;
  equipment: EquipmentType;
  durationSeconds: number | null;
  timerEnabled: boolean;
  alertText: string | null;
  canRunParallel: boolean;
  dependsOnStepId: string | null;
  dials: StepDial[];
}

export interface CookingPath {
  id: string;
  slug: string;
  name: string;
  requiredEquipment: EquipmentType[];
  totalMinutes: number | null;
  activeMinutes: number | null;
  isRecommended: boolean;
  reason: string | null;
  vesselCount: number | null;
  /** From `score_cooking_path`: how well this route fits the user's kitchen. */
  fitScore: number;
  missingEquipment: EquipmentType[];
  /** The readable recipe steps. */
  steps: CookingStep[];
  /** One-action-per-screen steps for guided cook mode; falls back to `steps`. */
  microSteps: CookingStep[];
}

export interface RecipeNote {
  id: string;
  kind: string;
  title: string | null;
  body: string;
}

export interface RecipeDetail extends RecipeCard {
  description: string | null;
  status: RecipeStatus;
  groups: IngredientGroup[];
  paths: CookingPath[];
  notes: RecipeNote[];
}
