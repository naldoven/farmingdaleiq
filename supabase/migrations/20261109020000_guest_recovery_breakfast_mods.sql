-- Guest Recovery: turn on changes for the breakfast sandwiches, burritos, bowls
-- and the chicken and waffles sandwiches.
--
-- Same idea as 20261109000000: a guest can ask to leave something off or add or
-- swap something, so a leader can log it and the fault check applies. Left off
-- on purpose because they come as is: plain biscuit, English muffin, hash
-- browns, yeast rolls, waffles, a la carte eggs, and Chick-n-Minis.
--
-- SEED-DEFAULT: ingredient lists are a starting point from the standard builds,
-- not checked against the store's register. Leaders correct them on the recovery
-- menu screen. Guarded so a list a leader already edited is never overwritten.

-- Chicken, spicy chicken and grilled chicken biscuits. The add-ons are the same
-- eleven choices for every breakfast sandwich below.
update public.recovery_menu_items m
set modifiable = true, ingredients = array['Butter'], addons = array['American cheese', 'Pepper Jack cheese', 'Bacon', 'Sausage', 'Egg', 'Honey packet', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Honey Roasted BBQ Sauce', 'Zesty Buffalo Sauce', 'Sweet & Spicy Sriracha Sauce']
where m.name in ('Chicken Biscuit', 'Spicy Chicken Biscuit', 'Grilled Chicken Biscuit')
  and not m.modifiable and m.ingredients = '{}';

-- Egg and cheese biscuits, English muffin sandwiches and the Egg White Grill.
update public.recovery_menu_items m
set modifiable = true, addons = array['American cheese', 'Pepper Jack cheese', 'Bacon', 'Sausage', 'Egg', 'Honey packet', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Honey Roasted BBQ Sauce', 'Zesty Buffalo Sauce', 'Sweet & Spicy Sriracha Sauce'],
    ingredients = case
      when m.name in ('Egg Biscuit') then array['Egg', 'Butter']
      when m.name in ('Sausage Biscuit') then array['Sausage', 'Butter']
      when m.name in ('Bacon Biscuit') then array['Bacon', 'Butter']
      when m.name in ('Chicken, Egg & Cheese Biscuit', 'Spicy Chicken, Egg & Cheese Biscuit') then array['Egg', 'Cheese', 'Butter']
      when m.name in ('Sausage, Egg & Cheese Biscuit', 'Sausage, Egg & Cheese Muffin') then array['Sausage', 'Egg', 'Cheese', 'Butter']
      when m.name in ('Bacon, Egg & Cheese Biscuit', 'Bacon, Egg & Cheese Muffin') then array['Bacon', 'Egg', 'Cheese', 'Butter']
      when m.name in ('Chicken, Egg & Cheese Muffin', 'Spicy Chicken, Egg & Cheese Muffin') then array['Egg', 'Cheese', 'Butter']
      else array['Egg white', 'Cheese', 'Butter']
    end
where m.name in (
  'Egg Biscuit', 'Sausage Biscuit', 'Bacon Biscuit',
  'Chicken, Egg & Cheese Biscuit', 'Spicy Chicken, Egg & Cheese Biscuit',
  'Sausage, Egg & Cheese Biscuit', 'Bacon, Egg & Cheese Biscuit',
  'Sausage, Egg & Cheese Muffin', 'Bacon, Egg & Cheese Muffin',
  'Chicken, Egg & Cheese Muffin', 'Spicy Chicken, Egg & Cheese Muffin',
  'Egg White Grill', 'Egg White Grill Muffin'
)
  and not m.modifiable and m.ingredients = '{}';

-- Burritos and bowls.
update public.recovery_menu_items m
set modifiable = true,
    ingredients = case when m.family = 'Breakfast Burrito'
      then array['Egg', 'Cheese', 'Hash browns', 'Peppers and onions']
      else array['Egg', 'Cheese', 'Hash browns'] end,
    addons = array['American cheese', 'Pepper Jack cheese', 'Bacon', 'Sausage', 'Honey packet',
                   'Chick-fil-A Sauce', 'Garden Herb Ranch Sauce', 'Zesty Buffalo Sauce',
                   'Sweet & Spicy Sriracha Sauce']
where m.family in ('Breakfast Burrito', 'Breakfast Bowl')
  and not m.modifiable and m.ingredients = '{}';

-- Chicken and waffles sandwiches, breakfast and lunch.
update public.recovery_menu_items m
set modifiable = true,
    ingredients = array['Butter', 'Syrup'],
    addons = array['Waffle syrup', 'Honey packet', 'American cheese', 'Bacon']
where m.family in ('Chicken & Waffles Breakfast', 'Chicken & Waffles Sandwich')
  and not m.modifiable and m.ingredients = '{}';
