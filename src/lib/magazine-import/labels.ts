/**
 * pt-BR labels for the magazine importer's back-office screens.
 *
 * Kept in one file because three screens show the same statuses, and a wording
 * change ("Em revisão" → "Revisão pendente") should not require finding every
 * place that spelled it out inline.
 */
import type { MagazineImportStatus, MagazineItemStatus } from '@/domain/types';
import type { RecipeVerdict } from './types.ts';

export const IMPORT_STATUS_LABEL: Record<MagazineImportStatus, string> = {
  uploaded: 'Enviado',
  processing: 'Analisando',
  extracting: 'Extraindo receitas',
  review_required: 'Em revisão',
  ready: 'Pronto',
  completed: 'Concluído',
  failed: 'Falhou',
};

export const ITEM_STATUS_LABEL: Record<MagazineItemStatus, string> = {
  detected: 'Detectada',
  extracted: 'Extraída',
  review: 'Em revisão',
  approved: 'Aprovada',
  imported: 'Importada',
  ignored: 'Ignorada',
  failed: 'Falhou',
};

export const VERDICT_LABEL: Record<RecipeVerdict, string> = {
  ready: 'Pronta',
  review: 'A verificar',
  problem: 'Problema',
};
