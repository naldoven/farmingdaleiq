-- Guest Recovery menu: bring the picker in line with what the Farmingdale POS
-- sells (checked against photos of the register screens on 2026-11-02).
--
-- The first seed was 68 items and thin on breakfast. This adds the missing
-- breakfast items (biscuits, muffins, burritos, bowls, chicken and waffles,
-- yeast rolls), the lunch chicken and waffles sandwiches, two more wraps, the other nugget and strip counts, soups,
-- parfaits, filets and other sides, more drinks, floats and frosted sodas, and
-- a few add-ons. Options such as cheese choice, bun type or no hash brown are
-- left out on purpose: they change an item, they are not items.
--
-- Leaders can still hide any of these in Menu & settings, and add more.

-- The picker lists categories in the order of their lowest sort number, and
-- items by sort. Multiplying the old numbers by 100 leaves room to slot new
-- items between old ones. The guard keeps a second run from multiplying again.
update public.recovery_menu_items set sort = sort * 100 where sort < 1000;

-- The POS calls these "4 count" and "Chicken Soup". Same rows, clearer names.
update public.recovery_menu_items
set name = '4-count Chick-n-Minis'
where name = 'Chick-n-Minis';

update public.recovery_menu_items
set name = 'Cup of Chicken Soup', family = 'Chicken Soup'
where name = 'Chicken Noodle Soup';

insert into public.recovery_menu_items (name, family, category, sort)
values
  -- Whole order
  ('Family Meal', 'Family Meal', 'Whole order', 250),

  -- Sandwiches and wraps
  ('Chicken & Waffles Sandwich', 'Chicken & Waffles Sandwich', 'Sandwiches', 1320),
  ('Spicy Chicken & Waffles Sandwich', 'Chicken & Waffles Sandwich', 'Sandwiches', 1330),
  ('Grilled Chicken & Waffles Sandwich', 'Chicken & Waffles Sandwich', 'Sandwiches', 1340),
  ('Spicy Cool Wrap', 'Cool Wrap', 'Sandwiches', 1610),
  ('Southwest Veggie Wrap', 'Southwest Veggie Wrap', 'Sandwiches', 1620),

  -- Nuggets and strips
  ('1-count Chick-fil-A Nuggets', 'Nuggets', 'Nuggets and Strips', 1990),
  ('5-count Chick-fil-A Nuggets', 'Nuggets', 'Nuggets and Strips', 1995),
  ('1-count Grilled Nuggets', 'Grilled Nuggets', 'Nuggets and Strips', 2290),
  ('5-count Grilled Nuggets', 'Grilled Nuggets', 'Nuggets and Strips', 2295),
  ('30-count Grilled Nuggets', 'Grilled Nuggets', 'Nuggets and Strips', 2450),
  ('1-count Chick-n-Strips', 'Chick-n-Strips', 'Nuggets and Strips', 2490),
  ('10-count Chick-n-Strips', 'Chick-n-Strips', 'Nuggets and Strips', 2750),

  -- Kids
  ('Kid''s Meal (Mac & Cheese)', 'Kid''s Meal', 'Kids', 8300),

  -- Sides
  ('Bowl of Chicken Soup', 'Chicken Soup', 'Sides', 5010),
  ('Cup of Tortilla Soup', 'Tortilla Soup', 'Sides', 5020),
  ('Bowl of Tortilla Soup', 'Tortilla Soup', 'Sides', 5030),
  ('Cookie Parfait', 'Parfait', 'Sides', 5040),
  ('Granola Parfait', 'Parfait', 'Sides', 5050),
  ('Apple Sauce', 'Apple Sauce', 'Sides', 5060),
  ('Potato Chips', 'Chips', 'Sides', 5070),
  ('Chick-fil-A Sauce Chips', 'Chips', 'Sides', 5080),
  ('Chick-fil-A Filet', 'Filet', 'Sides', 5090),
  ('Spicy Filet', 'Filet', 'Sides', 5100),
  ('Grilled Filet', 'Filet', 'Sides', 5110),
  ('Lunch Waffle', 'Waffle', 'Sides', 5120),

  -- Drinks
  ('Small Diet Lemonade', 'Diet Lemonade', 'Drinks', 6210),
  ('Medium Diet Lemonade', 'Diet Lemonade', 'Drinks', 6220),
  ('Large Diet Lemonade', 'Diet Lemonade', 'Drinks', 6230),
  ('Hot Coffee', 'Hot Coffee', 'Drinks', 7350),
  ('Water', 'Water', 'Drinks', 7410),
  ('Chocolate Milk', 'Milk', 'Drinks', 7510),
  ('Apple Juice', 'Apple Juice', 'Drinks', 7610),
  ('Cup of Ice', 'Cup of Ice', 'Drinks', 7620),

  -- Desserts
  ('6-count Chocolate Chunk Cookies', 'Cookie', 'Desserts', 9210),
  ('Float', 'Float', 'Desserts', 9610),
  ('Frosted Soda', 'Frosted Soda', 'Desserts', 9620),

  -- Breakfast: biscuits
  ('Chicken, Egg & Cheese Biscuit', 'Chicken, Egg & Cheese Biscuit', 'Breakfast', 10010),
  ('Spicy Chicken, Egg & Cheese Biscuit', 'Chicken, Egg & Cheese Biscuit', 'Breakfast', 10110),
  ('Grilled Chicken Biscuit', 'Grilled Chicken Biscuit', 'Breakfast', 10150),
  ('Egg Biscuit', 'Egg Biscuit', 'Breakfast', 10310),
  ('Sausage Biscuit', 'Sausage Biscuit', 'Breakfast', 10320),
  ('Sausage, Egg & Cheese Biscuit', 'Sausage, Egg & Cheese Biscuit', 'Breakfast', 10330),
  ('Bacon Biscuit', 'Bacon Biscuit', 'Breakfast', 10340),
  ('Butter Biscuit', 'Butter Biscuit', 'Breakfast', 10350),

  -- Breakfast: English muffins
  ('English Muffin', 'English Muffin', 'Breakfast', 10360),
  ('Sausage, Egg & Cheese Muffin', 'English Muffin Sandwich', 'Breakfast', 10370),
  ('Bacon, Egg & Cheese Muffin', 'English Muffin Sandwich', 'Breakfast', 10380),
  ('Chicken, Egg & Cheese Muffin', 'English Muffin Sandwich', 'Breakfast', 10390),
  ('Spicy Chicken, Egg & Cheese Muffin', 'English Muffin Sandwich', 'Breakfast', 10391),
  ('Egg White Grill Muffin', 'English Muffin Sandwich', 'Breakfast', 10392),

  -- Breakfast: Chick-n-Minis, burritos
  ('10-count Chick-n-Minis', 'Chick-n-Minis', 'Breakfast', 10410),
  ('Chicken Breakfast Burrito', 'Breakfast Burrito', 'Breakfast', 10420),
  ('Sausage Breakfast Burrito', 'Breakfast Burrito', 'Breakfast', 10430),
  ('Bacon Breakfast Burrito', 'Breakfast Burrito', 'Breakfast', 10440),
  ('Spicy Chicken Breakfast Burrito', 'Breakfast Burrito', 'Breakfast', 10450),
  ('Grilled Chicken Breakfast Burrito', 'Breakfast Burrito', 'Breakfast', 10460),
  ('No Meat Breakfast Burrito', 'Breakfast Burrito', 'Breakfast', 10470),

  -- Breakfast: sides and chicken and waffles
  ('Large Hash Browns', 'Hash Browns', 'Breakfast', 10510),
  ('Mini Yeast Rolls', 'Mini Yeast Rolls', 'Breakfast', 10520),
  ('Breakfast Waffle', 'Breakfast Waffle', 'Breakfast', 10530),
  ('A La Carte Eggs', 'A La Carte Eggs', 'Breakfast', 10540),
  ('Chicken & Waffles Breakfast Sandwich', 'Chicken & Waffles Breakfast', 'Breakfast', 10550),
  ('Spicy Chicken & Waffles Breakfast Sandwich', 'Chicken & Waffles Breakfast', 'Breakfast', 10560),
  ('Grilled Chicken & Waffles Breakfast Sandwich', 'Chicken & Waffles Breakfast', 'Breakfast', 10570),

  -- Breakfast: bowls
  ('Chicken Breakfast Bowl', 'Breakfast Bowl', 'Breakfast', 10610),
  ('Sausage Breakfast Bowl', 'Breakfast Bowl', 'Breakfast', 10620),
  ('Bacon Breakfast Bowl', 'Breakfast Bowl', 'Breakfast', 10630),
  ('Spicy Chicken Breakfast Bowl', 'Breakfast Bowl', 'Breakfast', 10640),
  ('Grilled Chicken Breakfast Bowl', 'Breakfast Bowl', 'Breakfast', 10650),
  ('No Meat Breakfast Bowl', 'Breakfast Bowl', 'Breakfast', 10660),

  -- Extras
  ('Salad dressing', 'Salad dressing', 'Extras', 11300),
  ('Honey packet', 'Honey packet', 'Extras', 11310),
  ('Waffle syrup', 'Waffle syrup', 'Extras', 11320),
  ('Gluten-free bun', 'Gluten-free bun', 'Extras', 11330)
on conflict (name) do nothing;
