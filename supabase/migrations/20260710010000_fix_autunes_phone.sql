-- Autunes Repair: real phone from Naldo 2026-07-10. The KitchenIQ screenshot
-- showed "(191) 740-2803" (191 is not a valid US area code) and the original
-- vendor seed carried it with a FLAG note. The seed file is also corrected in
-- place for fresh databases; this update fixes any database that already ran
-- the original seed. No-op if the row is absent or already corrected.

update public.vendors
set phone = '(917) 402-8032',
    notes = 'Bun Toaster & Egg Station'
where lower(name) = 'autunes repair'
  and phone = '(191) 740-2803';
