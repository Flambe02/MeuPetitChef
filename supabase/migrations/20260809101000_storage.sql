-- ============================================================================
-- Meu Petit Chef — 10. Storage buckets and their policies
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('recipe-images', 'recipe-images', true, 8388608,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  -- Import sources are user documents: private, owner-scoped.
  ('imports', 'imports', false, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- recipe-images — public read, editor write.
-- ----------------------------------------------------------------------------
create policy "recipe images: public read"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

create policy "recipe images: editors write"
  on storage.objects for insert
  with check (bucket_id = 'recipe-images' and public.is_editor());

create policy "recipe images: editors update"
  on storage.objects for update
  using (bucket_id = 'recipe-images' and public.is_editor())
  with check (bucket_id = 'recipe-images' and public.is_editor());

create policy "recipe images: editors delete"
  on storage.objects for delete
  using (bucket_id = 'recipe-images' and public.is_editor());

-- ----------------------------------------------------------------------------
-- avatars — public read, owner writes inside their own `{uid}/` prefix.
-- ----------------------------------------------------------------------------
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- imports — fully private, owner-only, same `{uid}/` convention.
-- ----------------------------------------------------------------------------
create policy "imports: owner read"
  on storage.objects for select
  using (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "imports: owner write"
  on storage.objects for insert
  with check (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "imports: owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'imports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
