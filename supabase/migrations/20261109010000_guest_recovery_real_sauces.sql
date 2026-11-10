-- Guest Recovery: use the real Chick-fil-A sauce and dressing names in the
-- add-on lists, and the real cheese choices.
--
-- The first seed (20261109000000) used generic words like "Extra sauce" and
-- "Dressing on the side". The corporate menu page names 8 dipping sauces and 7
-- salad dressings, and the customization guide names three cheeses and the
-- Filet swap on salads. A leader can now log exactly which sauce a guest asked
-- for. Source: chick-fil-a.com dipping sauces and dressings page, checked
-- 2026-11-09. SEED-DEFAULT: leaders correct these on the recovery menu screen
-- if the register screens say otherwise.
--
-- Add-on lists are capped at 12 by a table check, so the sandwiches use all 12
-- (4 extras plus the 8 sauces). This only touches the 13 items seeded by the
-- previous migration, and it ran the same day, before any leader edited a list.
-- The Club's ingredient list swaps "Sauce" for "Mayo": the official guide says
-- the Club is a Deluxe-style build with bacon and mayo.

update public.recovery_menu_items m
set addons = v.addons,
    ingredients = coalesce(v.ingredients, m.ingredients)
from (
  values
    ('Chick-fil-A Chicken Sandwich', null::text[],
      array['Extra pickles', 'American cheese', 'Colby Jack cheese', 'Pepper Jack cheese', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Garden Herb Ranch Sauce', 'Honey Mustard Sauce', 'Polynesian Sauce', 'Sweet & Spicy Sriracha Sauce', 'Zesty Buffalo Sauce', 'Honey Roasted BBQ Sauce']),
    ('Spicy Chicken Sandwich', null::text[],
      array['Extra pickles', 'American cheese', 'Colby Jack cheese', 'Pepper Jack cheese', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Garden Herb Ranch Sauce', 'Honey Mustard Sauce', 'Polynesian Sauce', 'Sweet & Spicy Sriracha Sauce', 'Zesty Buffalo Sauce', 'Honey Roasted BBQ Sauce']),
    ('Chick-fil-A Deluxe Sandwich', null::text[],
      array['Extra pickles', 'American cheese', 'Colby Jack cheese', 'Pepper Jack cheese', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Garden Herb Ranch Sauce', 'Honey Mustard Sauce', 'Polynesian Sauce', 'Sweet & Spicy Sriracha Sauce', 'Zesty Buffalo Sauce', 'Honey Roasted BBQ Sauce']),
    ('Spicy Deluxe Sandwich', null::text[],
      array['Extra pickles', 'American cheese', 'Colby Jack cheese', 'Pepper Jack cheese', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Garden Herb Ranch Sauce', 'Honey Mustard Sauce', 'Polynesian Sauce', 'Sweet & Spicy Sriracha Sauce', 'Zesty Buffalo Sauce', 'Honey Roasted BBQ Sauce']),
    ('Grilled Chicken Sandwich', null::text[],
      array['Extra pickles', 'American cheese', 'Colby Jack cheese', 'Pepper Jack cheese', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Garden Herb Ranch Sauce', 'Honey Mustard Sauce', 'Polynesian Sauce', 'Sweet & Spicy Sriracha Sauce', 'Zesty Buffalo Sauce', 'Honey Roasted BBQ Sauce']),
    ('Grilled Chicken Club Sandwich', array['Bacon', 'Cheese', 'Lettuce', 'Tomato', 'Mayo'],
      array['Extra pickles', 'American cheese', 'Colby Jack cheese', 'Pepper Jack cheese', 'Chick-fil-A Sauce', 'Barbeque Sauce', 'Garden Herb Ranch Sauce', 'Honey Mustard Sauce', 'Polynesian Sauce', 'Sweet & Spicy Sriracha Sauce', 'Zesty Buffalo Sauce', 'Honey Roasted BBQ Sauce']),
    ('Cool Wrap', null::text[],
      array['Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side']),
    ('Spicy Cool Wrap', null::text[],
      array['Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side']),
    ('Southwest Veggie Wrap', null::text[],
      array['Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side']),
    ('Cobb Salad', null::text[],
      array['Grilled nuggets instead of crispy', 'Crispy nuggets instead of grilled', 'Filet instead of nuggets', 'Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side']),
    ('Spicy Southwest Salad', null::text[],
      array['Grilled nuggets instead of crispy', 'Crispy nuggets instead of grilled', 'Filet instead of nuggets', 'Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side']),
    ('Market Salad', null::text[],
      array['Grilled nuggets instead of crispy', 'Crispy nuggets instead of grilled', 'Filet instead of nuggets', 'Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side']),
    ('Side Salad', null::text[],
      array['Avocado Lime Ranch Dressing', 'Creamy Salsa Dressing', 'Fat-Free Honey Mustard Dressing', 'Garden Herb Ranch Dressing', 'Light Balsamic Vinaigrette Dressing', 'Light Italian Dressing', 'Zesty Apple Cider Vinaigrette Dressing', 'Dressing on the side'])
) as v(name, ingredients, addons)
where m.name = v.name
  and m.modifiable;
