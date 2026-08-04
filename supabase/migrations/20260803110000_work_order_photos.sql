-- Work orders get their own photo_urls, same shape as
-- maintenance_requests.photo_urls: a leader creating a work order directly
-- (no triage request) attaches photos from the direct-upload flow
-- (components/maintenance/photo-upload.tsx -> the maintenance-photos
-- bucket). The detail page merges these with the originating request's
-- photos, so both paths show photos in one place.

alter table public.work_orders add column if not exists photo_urls text[];
