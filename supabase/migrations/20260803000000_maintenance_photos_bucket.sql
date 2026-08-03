-- Maintenance photo uploads: storage bucket + object policies.
--
-- The maintenance module previously accepted photo *links* (photo_urls /
-- photo_url / invoice_url are plain text columns) because the app had no
-- file-upload flow. Photos are now uploaded directly from the browser
-- client (components/maintenance/photo-upload.tsx) into this bucket and the
-- resulting public URLs are stored in those same text columns, so no table
-- schema change is needed and legacy pasted-link rows keep working.
--
-- The bucket is PUBLIC for reads: stored values stay plain URLs that render
-- in <img>/<a> exactly like the pasted links they replace, with no signing
-- step to expire or break. Object paths carry a client-generated UUID so
-- URLs are unguessable, and the content (kitchen equipment photos, invoice
-- shots) is not privacy-sensitive — the same judgment as
-- maintenance_requests' select-authenticated policy in
-- 20260707012000_vendors_maintenance_rls.sql.
--
-- Writes stay locked down: only signed-in holders of maintenance.request
-- (the base key every seeded role holds) can upload; there are no update or
-- delete policies, so objects are immutable and undeletable through the
-- client API (storage.objects is default-deny under RLS); and the bucket
-- enforces a 10 MB, image-only limit server-side, mirrored client-side in
-- photo-upload.tsx.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'maintenance-photos',
  'maintenance-photos',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy maintenance_photos_insert_requester on storage.objects
  for insert
  with check (
    bucket_id = 'maintenance-photos'
    and public.has_permission('maintenance.request')
  );
