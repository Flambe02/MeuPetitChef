import type { EquipmentType } from './types';

/**
 * Appliance identity. Kept in one table because cook mode themes an entire
 * screen from it: the shape behind the step number, the accent colour, the
 * verb on the primary button.
 *
 * Colours and shapes come from the Signal Noir prototype; the icon names are
 * lucide identifiers.
 */
export interface EquipmentTheme {
  label: string;
  /** Short label for chips and dense lists. */
  short: string;
  icon: string;
  /** CSS custom property holding this appliance's accent colour. */
  colorVar: string;
  shape: 'circle' | 'triangle' | 'square' | 'octagon' | 'diamond';
  /** Imperative used on the cook-mode primary action. */
  cta: string;
  /** Which appliance outline cook mode draws beside the step. */
  vessel: VesselKind;
  /** Whether the onboarding asks the user to pick a model/capacity. */
  specs: readonly string[];
}

/** The five outlines cook mode can draw. Several appliances share one. */
export type VesselKind = 'bowl' | 'air-fryer' | 'oven' | 'stovetop' | 'none';

export const EQUIPMENT_THEME: Record<EquipmentType, EquipmentTheme> = {
  air_fryer: {
    label: 'Air Fryer',
    short: 'Air Fryer',
    icon: 'fan',
    colorVar: 'var(--color-eq-air-fryer)',
    shape: 'triangle',
    cta: 'Iniciar',
    vessel: 'air-fryer',
    specs: ['4 litros', '6 litros', '8 litros', 'Outro'],
  },
  oven: {
    label: 'Forno',
    short: 'Forno',
    icon: 'microwave',
    colorVar: 'var(--color-eq-oven)',
    shape: 'square',
    cta: 'Assar',
    vessel: 'oven',
    specs: ['Elétrico', 'A gás', 'Embutido'],
  },
  stovetop: {
    label: 'Fogão / Cooktop',
    short: 'Fogão',
    icon: 'flame',
    colorVar: 'var(--color-eq-stovetop)',
    shape: 'octagon',
    cta: 'Cozinhar',
    vessel: 'stovetop',
    specs: ['A gás', 'Indução', 'Elétrico'],
  },
  thermomix: {
    label: 'Thermomix / Robô de cozinha',
    short: 'Thermomix',
    icon: 'cooking-pot',
    colorVar: 'var(--color-eq-thermomix)',
    shape: 'circle',
    cta: 'Iniciar',
    vessel: 'bowl',
    specs: ['TM5', 'TM6', 'TM7', 'Similar'],
  },
  microwave: {
    label: 'Micro-ondas',
    short: 'Micro-ondas',
    icon: 'air-vent',
    colorVar: 'var(--color-eq-microwave)',
    shape: 'diamond',
    cta: 'Aquecer',
    vessel: 'oven',
    specs: ['20 L', '30 L', 'Outro'],
  },
  blender: {
    label: 'Liquidificador',
    short: 'Liquidificador',
    icon: 'cooking-pot',
    colorVar: 'var(--color-eq-none)',
    shape: 'circle',
    cta: 'Bater',
    vessel: 'bowl',
    specs: [],
  },
  pressure_cooker: {
    label: 'Panela de pressão',
    short: 'Pressão',
    icon: 'soup',
    colorVar: 'var(--color-eq-stovetop)',
    shape: 'octagon',
    cta: 'Cozinhar',
    vessel: 'stovetop',
    specs: ['Comum', 'Elétrica'],
  },
  electric_cooker: {
    label: 'Panela elétrica',
    short: 'Panela elétrica',
    icon: 'soup',
    colorVar: 'var(--color-eq-stovetop)',
    shape: 'octagon',
    cta: 'Cozinhar',
    vessel: 'stovetop',
    specs: [],
  },
  barbecue: {
    label: 'Churrasqueira',
    short: 'Churrasco',
    icon: 'flame',
    colorVar: 'var(--color-eq-air-fryer)',
    shape: 'triangle',
    cta: 'Grelhar',
    vessel: 'stovetop',
    specs: ['Carvão', 'A gás', 'Elétrica'],
  },
  sous_vide: {
    label: 'Sous-vide',
    short: 'Sous-vide',
    icon: 'thermometer',
    colorVar: 'var(--color-eq-microwave)',
    shape: 'diamond',
    cta: 'Cozinhar',
    vessel: 'stovetop',
    specs: [],
  },
  other: {
    label: 'Outro equipamento',
    short: 'Outro',
    icon: 'utensils',
    colorVar: 'var(--color-eq-none)',
    shape: 'square',
    cta: 'Avançar',
    vessel: 'none',
    specs: [],
  },
  none: {
    label: 'Bancada',
    short: 'Bancada',
    icon: 'utensils',
    colorVar: 'var(--color-eq-none)',
    shape: 'square',
    cta: 'Avançar',
    vessel: 'none',
    specs: [],
  },
};

/** The appliances offered during onboarding, in the order the prototype uses. */
export const ONBOARDING_EQUIPMENT: EquipmentType[] = [
  'air_fryer',
  'oven',
  'stovetop',
  'thermomix',
  'microwave',
  'blender',
  'pressure_cooker',
  'electric_cooker',
  'barbecue',
  'sous_vide',
  'other',
];

/** `none` is a step type, not an appliance — never show it as a requirement. */
export function visibleEquipment(list: readonly EquipmentType[]): EquipmentType[] {
  return list.filter((item) => item !== 'none');
}

export function equipmentLabel(equipment: EquipmentType): string {
  return EQUIPMENT_THEME[equipment].short;
}
