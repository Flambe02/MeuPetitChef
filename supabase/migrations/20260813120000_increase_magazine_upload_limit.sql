-- ============================================================================
-- Meu Petit Chef — Raise the `imports` bucket's file size ceiling
-- ============================================================================
--
-- 20MB (migration 10) was sized for a single recipe capture — a photo, a
-- screenshot, a short PDF. The magazine importer (migration 16) shares the
-- same bucket, and a scanned print magazine routinely runs well past that:
-- 80-100MB is ordinary for a glossy issue at print resolution.

update storage.buckets
set file_size_limit = 157286400 -- 150 MiB
where id = 'imports';
