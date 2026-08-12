/**
 * Turning page-shaped extractions into recipe-shaped ones.
 *
 * Two facts about magazines make this its own step (§10 and §11 of the brief):
 *
 *   * a page often holds **more than one** recipe — "Brochettes de crevettes"
 *     and "Crevettes à la bisque" sharing a spread is a normal layout, not an
 *     edge case;
 *   * a recipe often spans **more than one** page — it starts on 58 and finishes
 *     on 59, sometimes with the title reprinted, sometimes not.
 *
 * So the unit the model returns (one page, N blocks) is not the unit the app
 * stores (one recipe, N pages). This file converts between them, and it does it
 * with evidence rather than optimism: two halves are joined when the model said
 * one continues and the other resumes, on *adjacent* pages — or when the title
 * is literally reprinted. A guess would silently weld two different dishes into
 * one recipe, which is worse than leaving both halves to be reviewed.
 */
import { fold, squish } from '@/lib/recipe-import/text';

import { scoreRecipe } from './confidence.ts';
import { findIndexEntry } from './index-reader.ts';
import type {
  AssembledRecipe,
  ConfidenceThresholds,
  MagazineRecipe,
  RecipeIndexEntry,
} from './types.ts';

/** What one page's extraction produced. */
export interface PageExtraction {
  /** File position, not folio. */
  pageIndex: number;
  recipes: MagazineRecipe[];
}

interface Group {
  recipe: MagazineRecipe;
  pages: number[];
  blockIndex: number;
}

export interface AssembleOptions {
  index?: RecipeIndexEntry[];
  thresholds?: ConfidenceThresholds;
}

export function assembleRecipes(
  extractions: PageExtraction[],
  options: AssembleOptions = {},
): AssembledRecipe[] {
  const ordered = [...extractions].sort((a, b) => a.pageIndex - b.pageIndex);
  const groups: Group[] = [];

  for (const extraction of ordered) {
    extraction.recipes.forEach((recipe, blockIndex) => {
      const open = findOpenGroup(groups, extraction.pageIndex, recipe);
      if (open) {
        mergeInto(open, recipe, extraction.pageIndex);
        return;
      }
      groups.push({ recipe: { ...recipe }, pages: [extraction.pageIndex], blockIndex });
    });
  }

  const index = options.index ?? [];

  return groups.map((group) => {
    const recipe = renumberSteps(group.recipe);
    const entry = findIndexEntry(recipe.title, index);
    const scored = scoreRecipe(recipe, {
      ...(options.thresholds ? { thresholds: options.thresholds } : {}),
      danglingContinuation: recipe.continuationAfter,
      indexed: entry !== null,
    });

    return {
      recipe,
      pages: [...group.pages],
      blockIndex: group.blockIndex,
      confidence: scored.confidence,
      verdict: scored.verdict,
      findings: scored.findings,
      indexedTitle: entry?.title ?? null,
    };
  });
}

/**
 * The group this block continues, if any.
 *
 * Only the most recent group on the *previous* page is eligible. A recipe that
 * jumps from page 58 to page 74 ("suite p. 74") is not handled here and is
 * deliberately left as two items to review: the pages are not adjacent, the
 * pointer text is not read, and welding them on a title match alone would join
 * the wrong pair the first time a magazine ran two variations of one dish.
 */
function findOpenGroup(groups: Group[], pageIndex: number, incoming: MagazineRecipe): Group | null {
  for (let position = groups.length - 1; position >= 0; position -= 1) {
    const group = groups[position];
    if (!group) continue;
    const lastPage = group.pages[group.pages.length - 1];
    if (lastPage === undefined) continue;
    if (lastPage === pageIndex) continue; // same page: a second recipe, not a tail
    if (lastPage !== pageIndex - 1) break; // groups are ordered; older ones are further away

    const bothFlagged = group.recipe.continuationAfter && incoming.continuationBefore;
    const sameTitle = titlesMatch(group.recipe.title, incoming.title);

    // The title alone is enough only when the *first* half also said it carried
    // on: a magazine that reprints "Gaspacho" as a photo caption on the next
    // page would otherwise absorb that page into the recipe.
    if (bothFlagged || (sameTitle && group.recipe.continuationAfter)) return group;
  }
  return null;
}

function titlesMatch(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  return a.length >= 4 && a === b;
}

function normalizeTitle(title: string): string {
  return fold(squish(title))
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Folds the tail into the head.
 *
 * The head wins on identity (title, description, servings, timings) because
 * that is where a magazine prints them; the tail contributes what it has that
 * the head lacks. Ingredients and steps are appended, not merged by similarity:
 * a recipe that genuinely uses butter twice must keep both lines.
 */
function mergeInto(group: Group, tail: MagazineRecipe, pageIndex: number): void {
  const head = group.recipe;

  group.recipe = {
    ...head,
    title: head.title.trim().length >= tail.title.trim().length ? head.title : tail.title,
    description: head.description ?? tail.description,
    servings: head.servings ?? tail.servings,
    prepMinutes: head.prepMinutes ?? tail.prepMinutes,
    cookMinutes: head.cookMinutes ?? tail.cookMinutes,
    restMinutes: head.restMinutes ?? tail.restMinutes,
    ingredients: [...head.ingredients, ...dropRepeatedIngredients(head, tail)],
    steps: [...head.steps, ...tail.steps],
    tips: [...new Set([...head.tips, ...tail.tips])],
    notes: [...new Set([...head.notes, ...tail.notes])],
    language: head.language ?? tail.language,
    continuationBefore: head.continuationBefore,
    // The tail decides whether the recipe is still open.
    continuationAfter: tail.continuationAfter,
    reportedConfidence: {
      overall: Math.min(head.reportedConfidence.overall, tail.reportedConfidence.overall),
      title: Math.min(head.reportedConfidence.title, tail.reportedConfidence.title),
      ingredients: Math.min(
        head.reportedConfidence.ingredients,
        tail.reportedConfidence.ingredients,
      ),
      steps: Math.min(head.reportedConfidence.steps, tail.reportedConfidence.steps),
    },
  };
  group.pages.push(pageIndex);
}

/**
 * A jump page very often reprints the ingredient list beside the continuation.
 * Appending it would double every quantity, so an incoming line identical to one
 * already held is dropped — identical meaning same folded name *and* same
 * quantity, which leaves a genuine second use of butter alone.
 */
function dropRepeatedIngredients(
  head: MagazineRecipe,
  tail: MagazineRecipe,
): MagazineRecipe['ingredients'] {
  const seen = new Set(
    head.ingredients.map(
      (line) => `${fold(line.ingredient)}|${String(line.quantity)}|${line.unit ?? ''}`,
    ),
  );
  return tail.ingredients.filter(
    (line) => !seen.has(`${fold(line.ingredient)}|${String(line.quantity)}|${line.unit ?? ''}`),
  );
}

/** After a merge the two halves both start at 1. The reader needs one sequence. */
function renumberSteps(recipe: MagazineRecipe): MagazineRecipe {
  return {
    ...recipe,
    steps: recipe.steps.map((step, position) => ({ ...step, order: position + 1 })),
  };
}
