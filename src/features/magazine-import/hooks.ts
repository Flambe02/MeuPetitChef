/**
 * TanStack Query wiring for the magazine importer.
 *
 * The heavy dependencies — `pdfjs-dist` and the OpenAI-backed provider — are
 * loaded with a dynamic `import()` inside the mutations that need them, never
 * at the top of this file. Every other tab pays for this module the moment
 * React Query mounts its provider tree; it must not also pay for pdf.js.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth/session-context';
import { keys } from '@/lib/query/keys';
import { supabase } from '@/lib/supabase/client';
import type { MagazineIdentity } from '@/lib/magazine-import/types';

import {
  approveItem,
  deleteImport,
  getImport,
  identityPatch,
  ignoreItem,
  importItem,
  listImports,
  listItems,
  listLogs,
  listPages,
  saveCoverThumbnail,
  signedUrl,
  syncImportStatus,
  totalCost,
  updateImport,
  uploadMagazine,
} from './api';

const REFRESH_WHILE_RUNNING = 4000;
const RUNNING_STATUSES = new Set(['processing', 'extracting']);

export function useMagazineImports() {
  return useQuery({ queryKey: keys.magazineImports.list(), queryFn: () => listImports(supabase) });
}

export function useMagazineImport(importId: string | undefined) {
  return useQuery({
    queryKey: keys.magazineImports.detail(importId ?? ''),
    queryFn: () => getImport(supabase, importId!),
    enabled: Boolean(importId),
    // Auto-refreshes while a run is in flight, so the progress bar moves
    // without the admin having to reload — and stops once there is nothing
    // left running, so an idle screen does not poll forever.
    refetchInterval: (query) =>
      query.state.data && RUNNING_STATUSES.has(query.state.data.status) ? REFRESH_WHILE_RUNNING : false,
  });
}

/**
 * No polling interval of its own: `useRunMagazineImport`'s `onProgress`
 * invalidates this query directly as the run advances, which is a tighter
 * signal than a timer — a page can go from `pending` to `classified` well
 * inside a 4-second window, and a fixed interval would just show it late.
 */
export function useMagazineImportPages(importId: string | undefined) {
  return useQuery({
    queryKey: keys.magazineImports.pages(importId ?? ''),
    queryFn: () => listPages(supabase, importId!),
    enabled: Boolean(importId),
  });
}

export function useMagazineImportItems(importId: string | undefined) {
  return useQuery({
    queryKey: keys.magazineImports.items(importId ?? ''),
    queryFn: () => listItems(supabase, importId!),
    enabled: Boolean(importId),
  });
}

export function useMagazineImportLogs(importId: string | undefined) {
  return useQuery({
    queryKey: keys.magazineImports.logs(importId ?? ''),
    queryFn: () => listLogs(supabase, importId!),
    enabled: Boolean(importId),
  });
}

export function useMagazineImportCost(importId: string | undefined) {
  return useQuery({
    queryKey: keys.magazineImports.cost(importId ?? ''),
    queryFn: () => totalCost(supabase, importId!),
    enabled: Boolean(importId),
  });
}

/** A signed URL for a private object in the `imports` bucket, or null while unresolved. */
export function useSignedImage(path: string | null | undefined) {
  return useQuery({
    queryKey: ['magazine-signed-url', path],
    queryFn: () => signedUrl(supabase, path!),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Upload + probe, in one action: the PDF lands in storage, its page count and
 * cover thumbnail are read, and the cover's text is read for a first guess at
 * publication / issue / date / language (§5) — all before the pipeline proper
 * ever runs, so the admin sees *something* the instant the file is dropped.
 */
export function useUploadMagazine() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const userId = user!.id;
      const record = await uploadMagazine(supabase, userId, file);

      const pdf = await import('@/lib/pdf/document');
      const { readIdentityFromCover } = await import('@/lib/magazine-import/identity');

      const buffer = await file.arrayBuffer();
      const doc = await pdf.loadPdfDocument(buffer);
      try {
        const pageCount = pdf.getPageCount(doc);
        const { text: coverText } = await pdf.readPageText(doc, 1);
        const identity: MagazineIdentity = readIdentityFromCover(
          { index: 1, folio: null, text: coverText, hasLargeImage: false },
          pageCount,
        );

        const coverDataUrl = await pdf.renderCoverThumbnail(doc);
        const coverPath = await saveCoverThumbnail(supabase, userId, record.id, coverDataUrl);

        const updated = await updateImport(supabase, record.id, {
          ...identityPatch(identity),
          cover_image_path: coverPath,
        });
        return { magazineImport: updated, coverDataUrl };
      } finally {
        await pdf.unloadPdfDocument(doc);
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.magazineImports.list() });
    },
  });
}

export function useUpdateMagazineIdentity(importId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (identity: MagazineIdentity) => updateImport(supabase, importId, identityPatch(identity)),
    onSuccess: (updated) => {
      client.setQueryData(keys.magazineImports.detail(importId), updated);
    },
  });
}

/**
 * Runs (or resumes) the pipeline.
 *
 * A `File` is passed only right after upload, while the browser still holds
 * the bytes in memory — every other call downloads the PDF back out of the
 * private bucket, which is what makes "close the tab, come back tomorrow"
 * work: nothing about resuming depends on the same browser session.
 */
export function useRunMagazineImport() {
  const { user } = useSession();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (input: { importId: string; file?: File; signal?: AbortSignal }) => {
      const userId = user!.id;
      const pdf = await import('@/lib/pdf/document');
      const { openaiEdgeProvider } = await import('@/lib/magazine-import/providers/openai-edge');
      const { runMagazineImport } = await import('./runner');

      let buffer: ArrayBuffer;
      if (input.file) {
        buffer = await input.file.arrayBuffer();
      } else {
        const record = await getImport(supabase, input.importId);
        if (!record) throw new Error('Import não encontrado.');
        const { data, error } = await supabase.storage.from('imports').download(record.file_path);
        if (error) throw error;
        buffer = await data.arrayBuffer();
      }

      const doc = await pdf.loadPdfDocument(buffer);
      try {
        await runMagazineImport(supabase, doc, openaiEdgeProvider, input.importId, userId, {
          signal: input.signal,
          onProgress: () => {
            void client.invalidateQueries({ queryKey: keys.magazineImports.detail(input.importId) });
            void client.invalidateQueries({ queryKey: keys.magazineImports.pages(input.importId) });
          },
        });
      } finally {
        await pdf.unloadPdfDocument(doc);
      }
    },
    onSettled: (_data, _error, variables) => {
      void client.invalidateQueries({ queryKey: keys.magazineImports.detail(variables.importId) });
      void client.invalidateQueries({ queryKey: keys.magazineImports.pages(variables.importId) });
      void client.invalidateQueries({ queryKey: keys.magazineImports.items(variables.importId) });
      void client.invalidateQueries({ queryKey: keys.magazineImports.logs(variables.importId) });
      void client.invalidateQueries({ queryKey: keys.magazineImports.cost(variables.importId) });
      void client.invalidateQueries({ queryKey: keys.magazineImports.list() });
    },
  });
}

export function useDeleteMagazineImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { importId: string; alsoDeleteUnpublishedRecipes: boolean }) =>
      deleteImport(supabase, input.importId, {
        alsoDeleteUnpublishedRecipes: input.alsoDeleteUnpublishedRecipes,
      }),
    onSuccess: (_void, variables) => {
      void client.invalidateQueries({ queryKey: keys.magazineImports.list() });
      client.removeQueries({ queryKey: keys.magazineImports.detail(variables.importId) });
    },
  });
}

function invalidateAfterItemAction(client: ReturnType<typeof useQueryClient>, importId: string) {
  void client.invalidateQueries({ queryKey: keys.magazineImports.items(importId) });
  void client.invalidateQueries({ queryKey: keys.magazineImports.detail(importId) });
  void client.invalidateQueries({ queryKey: keys.magazineImports.list() });
  // The recipe now exists (or the import's item count effectively changed),
  // and every recipe list the admin can see may now include it.
  void client.invalidateQueries({ queryKey: keys.recipes.all });
}

export function useApproveItem(importId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => approveItem(supabase, itemId, user!.id),
    onSuccess: () => invalidateAfterItemAction(client, importId),
  });
}

export function useIgnoreItem(importId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      await ignoreItem(supabase, itemId, user!.id);
      await syncImportStatus(supabase, importId);
    },
    onSuccess: () => invalidateAfterItemAction(client, importId),
  });
}

export function useImportMagazineItem(importId: string) {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (item: Parameters<typeof importItem>[1]) => {
      const saved = await importItem(supabase, item, user!.id);
      await syncImportStatus(supabase, importId);
      return saved;
    },
    onSuccess: () => invalidateAfterItemAction(client, importId),
  });
}
