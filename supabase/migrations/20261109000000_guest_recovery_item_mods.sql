-- Guest Recovery: item modifications and the fault check (ARCHITECTURE.md
-- "Guest Recovery").
--
-- Many guests order sandwiches, wraps and salads with changes (no pickles, no
-- tomato, grilled nuggets on a Cobb). Until now a recovery item was a menu pick
-- and a quantity, so a missed change could not be logged or counted. This adds:
--   * on the menu: whether an item can take changes, the ingredients a guest can
--     take off, and a short list of things a guest can add or swap;
--   * on a logged item: what was removed, what was added, a short note, and the
--     two fault-check answers with the source worked out from them.
--
-- Deploy order: safe before the code. Every new column is nullable or has a
-- default, and log_guest_recovery keeps its argument list; it only reads extra
-- keys from each p_items element, so the old code (which sends none) still works.
-- Old recoveries keep empty mods and a null source.

alter table public.recovery_menu_items
  add column modifiable boolean not null default false,
  -- What a guest can ask to leave off ("Pickles", "Tomato").
  add column ingredients text[] not null default '{}',
  -- What a guest can ask to add or swap ("Extra sauce", "Grilled nuggets").
  add column addons text[] not null default '{}',
  add constraint recovery_menu_items_ingredients_size check (cardinality(ingredients) <= 12),
  add constraint recovery_menu_items_addons_size check (cardinality(addons) <= 12);

alter table public.guest_recovery_items
  add column removed text[] not null default '{}',
  add column added text[] not null default '{}',
  add column mod_note text,
  -- Did the receipt or sticker show what the guest ordered, mods included?
  add column receipt_ok boolean,
  -- Did the item in the box match that receipt or sticker?
  add column item_ok boolean,
  -- Worked out from the two answers by the app (lib/guest-recovery/mods.ts).
  add column fault_source text,
  add constraint guest_recovery_items_removed_size check (cardinality(removed) <= 12),
  add constraint guest_recovery_items_added_size check (cardinality(added) <= 12),
  add constraint guest_recovery_items_mod_note_len check (mod_note is null or char_length(mod_note) <= 120),
  add constraint guest_recovery_items_fault_source_valid
    check (fault_source is null or fault_source in ('made_wrong', 'order_entry', 'bagging', 'not_sure'));

-- Seed defaults. SEED-DEFAULT: ingredient and add-on lists are a starting point
-- from the standard builds; leaders correct them on the recovery menu screen.
-- Guarded so a second run never overwrites a list a leader already edited.
-- Nuggets, strips, sides, drinks and desserts stay unmodifiable.
update public.recovery_menu_items m
set modifiable = true, ingredients = v.ingredients, addons = v.addons
from (
  values
    ('Chick-fil-A Chicken Sandwich', array['Pickles', 'Butter'], array['Extra pickles', 'Extra sauce', 'Cheese']),
    ('Spicy Chicken Sandwich', array['Pickles', 'Butter'], array['Extra pickles', 'Extra sauce', 'Cheese']),
    ('Chick-fil-A Deluxe Sandwich', array['Pickles', 'Lettuce', 'Tomato', 'Cheese', 'Butter'], array['Extra pickles', 'Extra sauce', 'Extra tomato']),
    ('Spicy Deluxe Sandwich', array['Pickles', 'Lettuce', 'Tomato', 'Cheese', 'Butter'], array['Extra pickles', 'Extra sauce', 'Extra tomato']),
    ('Grilled Chicken Sandwich', array['Lettuce', 'Tomato', 'Butter'], array['Extra sauce', 'Cheese']),
    ('Grilled Chicken Club Sandwich', array['Bacon', 'Cheese', 'Lettuce', 'Tomato', 'Sauce'], array['Extra sauce']),
    ('Cool Wrap', array['Cheese', 'Lettuce', 'Red cabbage', 'Carrots', 'Dressing'], array['Extra dressing', 'Dressing on the side']),
    ('Spicy Cool Wrap', array['Cheese', 'Lettuce', 'Red cabbage', 'Carrots', 'Dressing'], array['Extra dressing', 'Dressing on the side']),
    ('Southwest Veggie Wrap', array['Cheese', 'Lettuce', 'Black beans', 'Corn', 'Dressing'], array['Extra dressing', 'Dressing on the side']),
    ('Cobb Salad', array['Bacon', 'Egg', 'Cheese', 'Corn', 'Tomato', 'Crispy peppers'], array['Grilled nuggets instead of crispy', 'Crispy nuggets instead of grilled', 'Dressing on the side']),
    ('Spicy Southwest Salad', array['Cheese', 'Corn', 'Black beans', 'Tomato', 'Peppers', 'Tortilla strips'], array['Grilled nuggets instead of crispy', 'Crispy nuggets instead of grilled', 'Dressing on the side']),
    ('Market Salad', array['Apples', 'Strawberries', 'Blueberries', 'Blue cheese', 'Nut blend'], array['Grilled nuggets instead of crispy', 'Crispy nuggets instead of grilled', 'Dressing on the side']),
    ('Side Salad', array['Cheese', 'Tomato'], array['Dressing on the side'])
) as v(name, ingredients, addons)
where m.name = v.name
  and not m.modifiable
  and m.ingredients = '{}';

-- The log function: same arguments, plus changes and the fault check on each
-- item. Idempotent exactly as before: a repeat of the same submission id
-- returns the recovery it already made, before any item is written, so a retry
-- cannot duplicate an item or its changes. Everything about a menu item's
-- changes is checked against that item's own lists here, not trusted from the
-- client.
create or replace function public.log_guest_recovery(
  p_submission_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_order_number text,
  p_note text,
  p_sms_consent boolean,
  p_items jsonb,
  p_reason text,
  p_path text
)
returns table (out_id uuid, out_created boolean, out_assigned_to uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_assigned uuid;
  v_item jsonb;
  v_menu public.recovery_menu_items;
  v_qty int;
  v_name text;
  v_settings public.guest_recovery_settings;
  v_removed text[];
  v_added text[];
  v_note text;
  v_receipt boolean;
  v_item_ok boolean;
  v_fault text;
begin
  if auth.uid() is null or not public.has_permission('guest_recovery.log') then
    raise exception 'You do not have permission to log a guest recovery' using errcode = '42501';
  end if;

  select r.id, r.assigned_to into v_id, v_assigned
  from public.guest_recoveries r
  where r.submission_id = p_submission_id and r.logged_by = auth.uid();
  if v_id is not null then
    return query select v_id, false, v_assigned;
    return;
  end if;

  if nullif(btrim(p_guest_email), '') is null then
    raise exception 'Enter the guest''s email' using errcode = '22023';
  end if;
  if nullif(btrim(p_guest_phone), '') is null then
    raise exception 'Enter the guest''s phone number' using errcode = '22023';
  end if;
  if nullif(btrim(p_order_number), '') is null then
    raise exception 'Enter the order number' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('missing_item', 'wrong_item', 'quality', 'too_slow', 'other') then
    raise exception 'Pick a reason' using errcode = '22023';
  end if;
  if p_path is null or p_path not in ('standard', 'spotlight') then
    raise exception 'Pick whether the guest has the Chick-fil-A app' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'Pick at least one missing item (up to 20)' using errcode = '22023';
  end if;

  select * into v_settings from public.guest_recovery_settings where id;

  -- A Spotlight recovery goes to the overseer, or the backup while the overseer
  -- is off. Someone who has left or lost access is skipped, so a reward is never
  -- assigned to a person who cannot send it.
  v_assigned := null;
  if p_path = 'spotlight' then
    if not v_settings.overseer_off
       and v_settings.overseer_id is not null
       and public.guest_recovery_can_work(v_settings.overseer_id) then
      v_assigned := v_settings.overseer_id;
    elsif v_settings.backup_id is not null
       and public.guest_recovery_can_work(v_settings.backup_id) then
      v_assigned := v_settings.backup_id;
    end if;
  end if;

  begin
    insert into public.guest_recoveries (
      submission_id, guest_name, guest_email, guest_phone, order_number, note, sms_consent,
      logged_by, reason, path, expires_at, assigned_to
    ) values (
      p_submission_id,
      btrim(p_guest_name),
      nullif(lower(btrim(p_guest_email)), ''),
      nullif(btrim(p_guest_phone), ''),
      nullif(btrim(p_order_number), ''),
      nullif(btrim(p_note), ''),
      coalesce(p_sms_consent, false),
      auth.uid(),
      p_reason,
      p_path,
      public.guest_recovery_expiry(now(), coalesce(v_settings.expiry_days, 90)),
      v_assigned
    ) returning id into v_id;
  exception when unique_violation then
    select r.id, r.assigned_to into v_id, v_assigned
    from public.guest_recoveries r
    where r.submission_id = p_submission_id and r.logged_by = auth.uid();
    if v_id is null then
      raise exception 'That recovery id is already in use' using errcode = '23505';
    end if;
    return query select v_id, false, v_assigned;
    return;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item ->> 'qty', '1') !~ '^[0-9]{1,2}$' then
      raise exception 'Each quantity must be a whole number from 1 to 20' using errcode = '22023';
    end if;
    v_qty := coalesce(v_item ->> 'qty', '1')::int;
    if v_qty not between 1 and 20 then
      raise exception 'Each quantity must be a whole number from 1 to 20' using errcode = '22023';
    end if;

    -- Changes and the fault check. A missing key means none, so an older caller
    -- that sends only menu_item_id, name and qty still works.
    v_removed := case when jsonb_typeof(v_item -> 'removed') = 'array'
      then array(select btrim(x) from jsonb_array_elements_text(v_item -> 'removed') as x) else '{}'::text[] end;
    v_added := case when jsonb_typeof(v_item -> 'added') = 'array'
      then array(select btrim(x) from jsonb_array_elements_text(v_item -> 'added') as x) else '{}'::text[] end;
    v_note := nullif(btrim(coalesce(v_item ->> 'mod_note', '')), '');
    if cardinality(v_removed) > 12 or cardinality(v_added) > 12 then
      raise exception 'Up to 12 changes per item' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_removed || v_added) as c where char_length(c) not between 1 and 40) then
      raise exception 'Each change must be 1 to 40 characters' using errcode = '22023';
    end if;
    if v_note is not null and char_length(v_note) > 120 then
      raise exception 'That note is too long (up to 120 characters)' using errcode = '22023';
    end if;

    v_receipt := case when jsonb_typeof(v_item -> 'receipt_ok') = 'boolean' then (v_item ->> 'receipt_ok')::boolean else null end;
    v_item_ok := case when jsonb_typeof(v_item -> 'item_ok') = 'boolean' then (v_item ->> 'item_ok')::boolean else null end;
    v_fault := nullif(v_item ->> 'fault_source', '');
    if v_fault is not null and v_fault not in ('made_wrong', 'order_entry', 'bagging', 'not_sure') then
      raise exception 'That fault source is not valid' using errcode = '22023';
    end if;

    if nullif(v_item ->> 'menu_item_id', '') is not null then
      if v_item ->> 'menu_item_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'That menu item is not available' using errcode = '22023';
      end if;
      select * into v_menu
      from public.recovery_menu_items m
      where m.id = (v_item ->> 'menu_item_id')::uuid and m.active;
      if not found then
        raise exception 'That menu item is not available' using errcode = '22023';
      end if;

      -- Removals must be on this item's ingredient list and additions on its
      -- add-on list (either capitalization), and only an item that takes changes.
      if cardinality(v_removed) > 0 or cardinality(v_added) > 0 then
        if not v_menu.modifiable then
          raise exception '% does not take changes', v_menu.name using errcode = '22023';
        end if;
        if exists (
          select 1 from unnest(v_removed) as r
          where lower(r) not in (select lower(i) from unnest(v_menu.ingredients) as i)
        ) then
          raise exception 'One of the removals is not an ingredient of %', v_menu.name using errcode = '22023';
        end if;
        if exists (
          select 1 from unnest(v_added) as a
          where lower(a) not in (select lower(i) from unnest(v_menu.addons) as i)
        ) then
          raise exception 'One of the additions is not offered for %', v_menu.name using errcode = '22023';
        end if;
      end if;

      insert into public.guest_recovery_items (
        recovery_id, menu_item_id, name, family, qty,
        removed, added, mod_note, receipt_ok, item_ok, fault_source
      ) values (
        v_id, v_menu.id, v_menu.name, v_menu.family, v_qty,
        v_removed, v_added, v_note, v_receipt, v_item_ok, v_fault
      );
    else
      v_name := btrim(coalesce(v_item ->> 'name', ''));
      if char_length(v_name) not between 1 and 80 then
        raise exception 'Name each "other" item (up to 80 characters)' using errcode = '22023';
      end if;
      -- A free-text item has no lists to check against, so it takes a note only.
      if cardinality(v_removed) > 0 or cardinality(v_added) > 0 then
        raise exception 'Changes only work on items from the menu' using errcode = '22023';
      end if;
      insert into public.guest_recovery_items (
        recovery_id, menu_item_id, name, family, qty,
        mod_note, receipt_ok, item_ok, fault_source
      ) values (
        v_id, null, v_name, 'Other', v_qty,
        v_note, v_receipt, v_item_ok, v_fault
      );
    end if;
  end loop;

  return query select v_id, true, v_assigned;
end;
$$;

revoke all on function public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.log_guest_recovery(uuid, text, text, text, text, text, boolean, jsonb, text, text)
  to authenticated;
