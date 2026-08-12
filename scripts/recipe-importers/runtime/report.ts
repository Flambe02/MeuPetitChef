/**
 * The human-facing half of the CLI output.
 *
 * `log.ts` prints the machine-readable stage lines; this prints the summary a
 * person reads before deciding whether to keep the import.
 */
import type { ImportOutcome } from '../../../src/lib/recipe-import/registry.ts';
import { formatDuration } from '../../../src/lib/recipe-import/duration.ts';
import { FAIL, OK, WARN } from './log.ts';

export type ImportState = 'READY FOR REVIEW' | 'NEEDS ATTENTION' | 'SAVED' | 'DUPLICATE';

export function printReport(outcome: ImportOutcome, state: ImportState): void {
  const { recipe, summary, validation } = outcome;

  console.log('');
  console.log(`${OK} Provider detected: ${outcome.provider}`);
  console.log(`${OK} Recipe detected`);
  console.log(`${summary.ingredients > 0 ? OK : FAIL} ${summary.ingredients} ingredients`);
  console.log(`${summary.steps > 0 ? OK : FAIL} ${summary.steps} steps`);

  if (summary.programSteps > 0) {
    const complete = summary.stepsWithParameters >= summary.programSteps;
    console.log(
      `${complete ? OK : WARN} Thermomix parameters detected: ` +
        `${summary.stepsWithParameters}/${summary.programSteps} steps`,
    );
  } else if (summary.thermomixSteps > 0) {
    console.log(`${OK} ${summary.thermomixSteps} Thermomix steps (no programmed step)`);
  }
  if (summary.equipment.length > 0) {
    console.log(`${OK} Equipment: ${summary.equipment.join(', ')}`);
  }
  console.log(`${OK} Recipe normalized`);

  if (validation.warnings.length > 0) {
    console.log('');
    console.log(`Warnings (${validation.warnings.length}):`);
    for (const warning of validation.warnings) {
      console.log(`  ${WARN} ${warning.message}`);
    }
  }
  if (validation.errors.length > 0) {
    console.log('');
    console.log(`Errors (${validation.errors.length}):`);
    for (const error of validation.errors) {
      console.log(`  ${FAIL} ${error.message}`);
    }
  }

  console.log('');
  console.log('Recipe:');
  console.log(`  ${recipe.title}`);
  console.log(
    `  ${recipe.servings} porções · ${formatDuration(recipe.totalTimeSeconds) ?? 'tempo desconhecido'} · ${recipe.difficulty}`,
  );
  console.log(`  slug: ${recipe.slug}`);
  console.log(`  fingerprint: ${recipe.fingerprint.slice(0, 16)}…`);

  console.log('');
  console.log('Status:');
  console.log(`  ${state}`);
  console.log('');
}

/** One line per URL, for the batch runner. */
export function batchLine(
  index: number,
  total: number,
  url: string,
  state: string,
  detail?: string,
): string {
  const position = `${String(index + 1).padStart(String(total).length, ' ')}/${total}`;
  return `${position} ${state.padEnd(16)} ${url}${detail ? ` — ${detail}` : ''}`;
}
