import { describe, expect, it } from 'vitest';

import { readFixture } from '@/test/fixtures';

import { recordImport, saveImportedRecipe, type ImportSupabaseClient } from './persist';
import { runImport } from './registry';

/* ---------------------------------------------------------------------------
 * A Supabase client that records instead of writing.
 *
 * The point is not to re-test PostgREST: it is to prove that the rows this
 * layer builds satisfy the constraints the migrations declare — `total_minutes
 * > 0`, `active_minutes <= total_minutes`, `not timer_enabled or
 * duration_seconds is not null`, one dial per (step, kind), and the RLS shape
 * `created_by = auth.uid() and status = 'draft'`. Those are exactly the rules a
 * real insert would fail on, at the point where the failure is unhelpful.
 * ------------------------------------------------------------------------- */

interface Recorded {
  table: string;
  rows: Record<string, unknown>[];
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private singleMode = false;

  constructor(
    private readonly client: FakeClient,
    private readonly table: string,
    private readonly operation: 'select' | 'insert' | 'update',
    private readonly rows: Record<string, unknown>[] = [],
  ) {}

  select(): this {
    return this;
  }
  eq(): this {
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  single(): this {
    this.singleMode = true;
    return this;
  }

  private result(): { data: unknown; error: null } {
    if (this.operation === 'select') return { data: [], error: null };
    if (this.operation === 'update') return { data: null, error: null };

    const data = this.rows.map((row, index) => ({
      id: `${this.table}-${index}`,
      name: row.name,
      position: row.position,
      slug: row.slug,
    }));
    return { data: this.singleMode ? data[0] : data, error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.operation === 'insert')
      this.client.recorded.push({ table: this.table, rows: this.rows });
    if (this.operation === 'update') {
      this.client.updates.push({ table: this.table, rows: this.rows });
    }
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly recorded: Recorded[] = [];
  readonly updates: Recorded[] = [];

  from(table: string) {
    return {
      select: () => new FakeQuery(this, table, 'select'),
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) =>
        new FakeQuery(this, table, 'insert', Array.isArray(rows) ? rows : [rows]),
      update: (row: Record<string, unknown>) => new FakeQuery(this, table, 'update', [row]),
    };
  }

  rowsFor(table: string): Record<string, unknown>[] {
    return this.recorded.filter((entry) => entry.table === table).flatMap((entry) => entry.rows);
  }
}

const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

async function importedGratin() {
  return runImport({
    url: 'https://www.cookomix.com/recettes/gratin-dauphinois-thermomix/',
    html: readFixture('cookomix', 'gratin-dauphinois.html'),
    parseHtml,
    importedAt: '2026-08-11T00:00:00.000Z',
  });
}

describe('saveImportedRecipe', () => {
  it('writes a private draft owned by the caller', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    const [row] = client.rowsFor('recipes');
    // The RLS policy from migration 12 accepts nothing else.
    expect(row).toMatchObject({ status: 'draft', created_by: 'user-1' });
    expect(row).toMatchObject({
      source_provider: 'cookomix',
      source_url: 'https://www.cookomix.com/recettes/gratin-dauphinois-thermomix/',
      imported_at: '2026-08-11T00:00:00.000Z',
    });
    // Photos are referenced, never downloaded.
    expect(row?.source_image_url).toMatch(/^https:\/\//);
  });

  it('respects the time constraints the recipes table declares', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    const [row] = client.rowsFor('recipes');
    expect(row?.total_minutes).toBe(55);
    expect(row?.active_minutes).toBe(10);
    expect(Number(row?.total_minutes)).toBeGreaterThan(0);
    expect(Number(row?.active_minutes)).toBeLessThanOrEqual(Number(row?.total_minutes));
  });

  it('never claims a total time of zero, even for a recipe that declares none', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe: { ...recipe, totalTimeSeconds: 0, prepTimeSeconds: null },
      userId: 'user-1',
    });

    // `total_minutes > 0` is a check constraint; a timeless import must still save.
    expect(client.rowsFor('recipes')[0]?.total_minutes).toBe(1);
    expect(client.rowsFor('recipes')[0]?.active_minutes).toBeNull();
  });

  it('writes the nutrition onto a variant, which is what the sheet reads', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    expect(client.rowsFor('recipe_variants')[0]).toMatchObject({
      mode: 'normal',
      kcal: 431,
      protein_g: 5.9,
    });
  });

  it('keeps the source ingredient names, untranslated', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    const names = client.rowsFor('recipe_ingredients').map((row) => row.display_name);
    expect(names).toContain('Crème fraîche épaisse');
  });

  it('only enables a timer when there is a duration to count', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    for (const step of client.rowsFor('cooking_steps')) {
      if (step.timer_enabled) expect(step.duration_seconds).not.toBeNull();
    }
    expect(client.rowsFor('cooking_steps').some((step) => step.timer_enabled)).toBe(true);
  });

  it('writes at most one dial of each kind per step', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    const seen = new Set<string>();
    for (const dial of client.rowsFor('cooking_step_dials')) {
      const key = `${String(dial.step_id)}:${String(dial.kind)}`;
      // `unique (step_id, kind)` — a second dial of a kind would be a 23505.
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('records the attribution note', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
    });

    const notes = client.rowsFor('recipe_notes');
    expect(notes.some((note) => String(note.body).includes('Importado de cookomix'))).toBe(true);
    // `recipe_notes.kind` is a checked list.
    for (const note of notes) {
      expect(['tip', 'storage', 'allergen', 'substitution', 'nutrition', 'warning']).toContain(
        note.kind,
      );
    }
  });

  it('closes the import row when one was given', async () => {
    const { recipe } = await importedGratin();
    const client = new FakeClient();

    await saveImportedRecipe(client as unknown as ImportSupabaseClient, {
      recipe,
      userId: 'user-1',
      importId: 'import-1',
    });

    // `accepted_import_has_recipe` requires the recipe id to travel with it.
    const update = client.updates.find((entry) => entry.table === 'recipe_imports');
    expect(update?.rows[0]).toMatchObject({ status: 'accepted', recipe_id: 'recipes-0' });
  });
});

describe('recordImport', () => {
  it('stores the raw payload beside the normalized recipe', async () => {
    const { recipe, raw, validation } = await importedGratin();
    const client = new FakeClient();

    await recordImport(client as unknown as ImportSupabaseClient, {
      userId: null,
      recipe,
      rawPayload: raw.payload,
      validation,
    });

    const [row] = client.rowsFor('recipe_imports');
    expect(row).toMatchObject({
      user_id: null,
      provider: 'cookomix',
      external_id: '205',
      fingerprint: recipe.fingerprint,
      status: 'needs_review',
    });
    // Both halves are kept, so a parser fix can be replayed without re-fetching.
    expect(row?.raw_data).not.toBeNull();
    expect(row?.extracted).not.toBeNull();
  });

  it('marks a failed validation and says why', async () => {
    const outcome = await runImport({
      url: 'https://cookidoo.fr/recipes/recipe/fr-FR/r59322',
      html: readFixture('cookidoo', 'public-recipe.html'),
      parseHtml,
      importedAt: '2026-08-11T00:00:00.000Z',
    });
    const client = new FakeClient();

    await recordImport(client as unknown as ImportSupabaseClient, {
      userId: null,
      recipe: outcome.recipe,
      rawPayload: outcome.raw.payload,
      validation: outcome.validation,
    });

    const [row] = client.rowsFor('recipe_imports');
    expect(row?.status).toBe('failed');
    expect(String(row?.error_message)).toContain('passo');
    expect(row?.warnings).toBeInstanceOf(Array);
  });
});
