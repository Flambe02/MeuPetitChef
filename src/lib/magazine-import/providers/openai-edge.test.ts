import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataError } from '@/lib/supabase/errors';

import { InvalidVisionResponseError, openaiEdgeProvider } from './openai-edge';

const invoke = vi.fn<(...args: unknown[]) => Promise<{ data: unknown; error: unknown }>>();

vi.mock('@/lib/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const PAGE = {
  index: 61,
  folio: 61,
  imageDataUrl: 'data:image/jpeg;base64,aGk=',
  text: 'Gaspacho',
};

const VALID_VERDICT = {
  data: {
    kind: 'recipe',
    confidence: 0.9,
    reasons: ['Traz ingredientes e modo de preparo.'],
    recipeTitles: ['Gaspacho'],
  },
  usage: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    operation: 'classify_page',
    inputTokens: 100,
    outputTokens: 20,
    estimatedCostUsd: 0.0001,
  },
};

describe('openaiEdgeProvider.analyzePage', () => {
  beforeEach(() => invoke.mockReset());

  it('validates the response and stamps `by: vision`, the one field the model never sends', async () => {
    invoke.mockResolvedValueOnce({ data: VALID_VERDICT, error: null });

    const result = await openaiEdgeProvider.analyzePage(PAGE);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('magazine-vision', {
      body: { operation: 'classify_page', pages: [PAGE] },
    });
    expect(result.data.kind).toBe('recipe');
    expect(result.data.by).toBe('vision');
    expect(result.usage.estimatedCostUsd).toBe(0.0001);
  });

  it('retries once when the shape fails validation, and succeeds on the second try', async () => {
    invoke
      .mockResolvedValueOnce({
        data: { data: { kind: 'not-a-real-kind' }, usage: VALID_VERDICT.usage },
        error: null,
      })
      .mockResolvedValueOnce({ data: VALID_VERDICT, error: null });

    const result = await openaiEdgeProvider.analyzePage(PAGE);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.data.kind).toBe('recipe');
  });

  it('gives up after two invalid shapes, as a typed error the pipeline can act on', async () => {
    invoke.mockResolvedValue({
      data: { data: { kind: 'not-a-real-kind' }, usage: VALID_VERDICT.usage },
      error: null,
    });

    await expect(openaiEdgeProvider.analyzePage(PAGE)).rejects.toBeInstanceOf(
      InvalidVisionResponseError,
    );
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('does not retry an explicit error from the function — only a shape failure', async () => {
    invoke.mockResolvedValue({
      data: { error: 'Só administradores podem importar magazines.' },
      error: null,
    });

    await expect(openaiEdgeProvider.analyzePage(PAGE)).rejects.toThrow(DataError);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('openaiEdgeProvider.readIndex / extractRecipes', () => {
  beforeEach(() => invoke.mockReset());

  it('unwraps the entries array from read_index', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        data: { entries: [{ title: 'Gaspacho', folio: 53 }] },
        usage: { ...VALID_VERDICT.usage, operation: 'read_index' },
      },
      error: null,
    });

    const result = await openaiEdgeProvider.readIndex([PAGE]);

    expect(result.data).toEqual([{ title: 'Gaspacho', folio: 53 }]);
  });

  it('unwraps the recipes array from extract_recipe', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        data: {
          recipes: [
            {
              title: 'Gaspacho',
              description: null,
              servings: 4,
              prepMinutes: 20,
              cookMinutes: null,
              restMinutes: 120,
              ingredients: [],
              steps: [],
              tips: [],
              notes: [],
              language: 'fr',
              continuationBefore: false,
              continuationAfter: false,
              confidence: { overall: 0.9, title: 0.9, ingredients: 0.9, steps: 0.9 },
            },
          ],
        },
        usage: { ...VALID_VERDICT.usage, operation: 'extract_recipe' },
      },
      error: null,
    });

    const result = await openaiEdgeProvider.extractRecipes([PAGE]);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.title).toBe('Gaspacho');
  });
});
