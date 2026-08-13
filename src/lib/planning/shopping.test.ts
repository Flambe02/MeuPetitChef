import { describe, expect, it } from 'vitest';

import { buildMealPlanEntry } from './test-helpers';
import { recipeEntriesForShoppingList } from './shopping';

describe('recipeEntriesForShoppingList', () => {
  it('keeps recipe entries with a recipe attached', () => {
    const entries = [buildMealPlanEntry({ id: 'a', entry_type: 'recipe', recipe_id: 'r1' })];
    expect(recipeEntriesForShoppingList(entries)).toEqual(entries);
  });

  it('drops a recipe entry with no recipe_id (a custom-title-only entry)', () => {
    const entries = [buildMealPlanEntry({ id: 'a', entry_type: 'recipe', recipe_id: null, custom_title: 'Sobra da vó' })];
    expect(recipeEntriesForShoppingList(entries)).toEqual([]);
  });

  it('ignores leftovers — their ingredients were already bought for the original meal', () => {
    const entries = [
      buildMealPlanEntry({ id: 'a', entry_type: 'recipe', recipe_id: 'r1' }),
      buildMealPlanEntry({ id: 'b', entry_type: 'leftover', recipe_id: 'r1', parent_entry_id: 'a' }),
    ];
    expect(recipeEntriesForShoppingList(entries).map((e) => e.id)).toEqual(['a']);
  });

  it('ignores eating_out and skipped', () => {
    const entries = [
      buildMealPlanEntry({ id: 'a', entry_type: 'eating_out', recipe_id: null }),
      buildMealPlanEntry({ id: 'b', entry_type: 'skipped', recipe_id: null }),
    ];
    expect(recipeEntriesForShoppingList(entries)).toEqual([]);
  });
});
