-- Guest Recovery menu: take "Entire order" and "Entire meal" out of the picker.
--
-- They were added as a shortcut for "the whole order was wrong", but nothing kept
-- a leader from picking one next to the real items, which would send the guest two
-- overlapping rewards. Spotlight also has no "entire order" reward to send. The
-- real items are what the reward and the Stats screen (what goes missing) need,
-- and the reason and order number already say what happened.
--
-- Hidden, not deleted: old recoveries may point at them, and a manager can show
-- them again in Menu & settings. Family Meal is a real product, so it stays, under
-- a category that does not say "whole order".

update public.recovery_menu_items
set active = false
where name in ('Entire order', 'Entire meal');

update public.recovery_menu_items
set category = 'Meals'
where name = 'Family Meal';
