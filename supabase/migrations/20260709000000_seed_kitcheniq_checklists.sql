-- Seed: real Farmingdale checklists imported from the live Ecolab KitchenIQ
-- portal (site 723) on 2026-07-09. 64 active checklists,
-- 1050 questions across 144 sections. The 3 "- Copy"
-- duplicates in KitchenIQ were intentionally excluded.
--
-- KitchenIQ question types are mapped onto FarmingdaleIQ's five types:
--   yesNo/checkbox -> yes_no ; numeric -> number ; text/signature -> text ;
--   picture -> yes_no + photo_required ; multipleChoice -> multi_choice ;
--   foodTemperature -> temperature (holding_mode from KitchenIQ + Cold/Hot Foods).
-- Un-sectioned KitchenIQ questions are grouped under a "General" section.
-- Templates are seeded active = true so the team can use them immediately;
-- deactivate any that shouldn't be live from the app.
--
-- Idempotent: first removes any existing template of the same name that has
-- no runs (this replaces the earlier draft-name placeholders from
-- 20260707070000_seed_checklist_templates.sql and lets the migration re-run).
-- A template that already has runs is left untouched.

delete from public.checklist_templates t
where t.name in (
  'Safe Count',
  'Pickles Check-in - Smart Shop',
  'Pickles',
  'Suggestive Selling and Upselling',
  'Welcoming Enviornemnt Audit - Smart Shop',
  'New Checklist - Draft',
  'Self Assesment',
  'Confirm Check-In - Smart Shop',
  'Coater Check-In - Smart Shop',
  'Name Check-In - Smart Shop',
  'Focus Checklist',
  'FOH Ecosure Audit',
  'FOH Catering (Morning)',
  'FOH Breakfast Checklist',
  'Comprehensive Food Test',
  'Director Walkthrough',
  'BOH Walk-Thru Checklist',
  'R&M Maintenance Walk Through',
  'Temperature Check',
  'Food Safety 5 Audit',
  'BOH Leadership Closing Checklist',
  'FOH - Closing Leader Checklist',
  'FOH - Closing Shift Leader',
  'QIV - Nuggets & Strips',
  'Catering Follow-Up',
  'Night FOH Catering',
  'BOH Dishes Closing Checklist',
  'BOH Dish Put Back Closing Checklist',
  'BOH Boards Closing Checklist',
  'FOH Closing - Ice Dream Machine',
  'FOH Closing - Chutes & Towers',
  'Breakfast Checklist',
  'FOH Closing - Front Counter & Teas',
  'Food Test - Nuggets & Strips',
  'Food Test - Grilled Nugget',
  'QIV - Grilled Nugget',
  'Food Test - Grilled Chicken',
  'QIV - Grilled Chicken',
  'Food Test - Fries',
  'QIV - Fries',
  'Food Test - Filet',
  'QIV - Filet',
  'FOH Closing - Dining Room & Playground',
  'FOH Closing - Lemonades',
  'Morning BOH Catering',
  'Night BOH Catering',
  'BOH Trash/Raw Closing Checklist',
  'BOH Breading Closing Checklist',
  'Brand Ambassador WHED Audit',
  'Brand Ambassador Systems Audit',
  'Brand Ambassador Outlook Audit',
  'Bi-Weekly Clean Prep',
  'Prep Closing Checklist',
  'BOH Machines Closing Checklist',
  'Great Food Audit - Nuggets',
  'BOH Closing Checklist',
  'Great Food Audit - Waffle Potato Fries',
  'Great Food Audit - Grilled Sandwich',
  'Great Food Audit - Chicken Sandwich',
  'Genuine Hospitality Audit',
  'Fast & Accurate Service Audit',
  'Clean & Safe Environment Audit',
  'Prep Food Safety Audit'
)
and not exists (select 1 from public.checklist_runs r where r.template_id = t.id);

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Safe Count', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Front Safe', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'number', 'Pennies', false, null, null, false),
    (sec, 1, 'number', 'Nickles', false, null, null, false),
    (sec, 2, 'number', 'Dimes', false, null, null, false),
    (sec, 3, 'number', 'Quarters', false, null, null, false),
    (sec, 4, 'number', 'Ones', false, null, null, false),
    (sec, 5, 'number', 'Fives', false, null, null, false),
    (sec, 6, 'number', 'Tens', false, null, null, false),
    (sec, 7, 'number', 'Twenties', false, null, null, false),
    (sec, 8, 'number', 'Fifties', false, null, null, false),
    (sec, 9, 'number', 'Hundreds', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Smart Safe', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'number', 'Pennies', false, null, null, false),
    (sec, 1, 'number', 'Nickles', false, null, null, false),
    (sec, 2, 'number', 'Dimes', false, null, null, false),
    (sec, 3, 'number', 'Quarters', false, null, null, false),
    (sec, 4, 'number', 'Ones', false, null, null, false),
    (sec, 5, 'number', 'Fives', false, null, null, false),
    (sec, 6, 'number', 'Tens', false, null, null, false),
    (sec, 7, 'number', 'Twenties', false, null, null, false),
    (sec, 8, 'number', 'Fifties', false, null, null, false),
    (sec, 9, 'number', 'Hundreds', false, null, null, false),
    (sec, 10, 'number', 'Change Fund Received', false, null, null, false),
    (sec, 11, 'number', 'Change Fund Deposited', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Pickles Check-in - Smart Shop', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Check buns, are the pickles overlapping?', false, null, null, false),
    (sec, 1, 'yes_no', 'If there are smaller pickles present, is there three?', false, null, null, false),
    (sec, 2, 'yes_no', 'Check a completed sandwich, are the pickles hanging off the heel of the bun?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Pickles', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Suggestive Selling and Upselling', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Breif', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Did you read the form?', false, null, null, false),
    (sec, 1, 'yes_no', 'Did you complete the quiz?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Welcoming Enviornemnt Audit - Smart Shop', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Did the team member offer a warm welcome to the guest walking in? (FC)', false, null, null, false),
    (sec, 1, 'yes_no', 'Did the team member offer a fond farewell at the end of the order? (FC)', false, null, null, false),
    (sec, 2, 'yes_no', 'Did the team member use the guests name more than once? (FC)', false, null, null, false),
    (sec, 3, 'yes_no', 'Did the team member offer a warm welcome to the guest walking in? (DT)', false, null, null, false),
    (sec, 4, 'yes_no', 'Did the team member offer a fond farewell at the end of the order? (DT)', false, null, null, false),
    (sec, 5, 'yes_no', 'Did the team member use the guests name more than once? (DT)', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('New Checklist - Draft', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Did we do the Zone audit for the day?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Self Assesment', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Did you complete your Self Assesment Audits on OpsHub', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Confirm Check-In - Smart Shop', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Did the Team Member Confirm the Order on IPOS?', false, null, null, false),
    (sec, 1, 'yes_no', 'Did the Team Member Confirm the Order on Register?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Coater Check-In - Smart Shop', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', '#2 Is CFA SANDWICH filet facing smooth side up?', false, null, null, false),
    (sec, 1, 'yes_no', '#1 CFA Filet is entirely covered in coater (free of large lumps, uncooked coater, bare spots)?', false, null, null, false),
    (sec, 2, 'yes_no', '#2 Total area of Bare Spots of CFA Regular Filets is no larger than a quarter (Both SIdes)', false, null, null, false),
    (sec, 3, 'yes_no', '#2 CFA Filet is entirely covered in a generous layer if seasoned coater, free of large lumps & uncooked coater', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Name Check-In - Smart Shop', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Did the Team Member use their name on Register?', false, null, null, false),
    (sec, 1, 'yes_no', 'Did the Team Member use their name on Expo?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Focus Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'How did you grow team members today?', false, null, null, false),
    (sec, 1, 'text', 'How did you grow AHA/Quality today?', false, null, null, false),
    (sec, 2, 'text', 'How did you protect food safety today?', false, null, null, false),
    (sec, 3, 'yes_no', 'How did you perform operational excellence today?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Ecosure Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Ecosure Cleanliness', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is the exterior of the sugar bin clean?', false, null, null, true),
    (sec, 1, 'yes_no', 'Is the sugar bin scoop clean and free of build-up?', false, null, null, false),
    (sec, 2, 'yes_no', 'Are the interiors of ALL fridges clean?', false, null, null, false),
    (sec, 3, 'yes_no', 'Are the gaskets on ALL fridges in good condition (not ripped or broken)?', false, null, null, false),
    (sec, 4, 'yes_no', 'Are the gaskets on ALL fridges clean?', false, null, null, false),
    (sec, 5, 'yes_no', 'Is the FC hand-wash sink free of build-up and residue?', false, null, null, false),
    (sec, 6, 'yes_no', 'Are the spindles on the ice dream machine free of build-up?', false, null, null, false),
    (sec, 7, 'yes_no', 'Is the shake base machine free of build-up and residue?', false, null, null, true),
    (sec, 8, 'yes_no', 'Are the interior of the ice machine wall clean and free of mold?', false, null, null, true),
    (sec, 9, 'yes_no', 'Is the interior dispensers (4) of the ice machine, clean and mold free?', false, null, null, false),
    (sec, 10, 'yes_no', 'Are the vents inside the ice machine free of stains and residue?', false, null, null, false),
    (sec, 11, 'yes_no', 'Is the ice machine slate free of residue and clean?', false, null, null, true),
    (sec, 12, 'yes_no', 'Is the paddle for the ice machine clean and stain free?', false, null, null, false),
    (sec, 13, 'yes_no', 'Are the front panels (behind the lids)of all the soda towers clean?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Are the following items labled & up to date?', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'FC Sweetened Tea', false, null, null, false),
    (sec, 1, 'yes_no', 'FC Unsweetened Tea', false, null, null, false),
    (sec, 2, 'yes_no', 'FC Lemonade Dispensers', false, null, null, false),
    (sec, 3, 'yes_no', 'FC Sunjoy Dispenser', false, null, null, false),
    (sec, 4, 'yes_no', 'FC Strawberry Dispenser', false, null, null, false),
    (sec, 5, 'yes_no', 'DT Sweetened Tea', false, null, null, false),
    (sec, 6, 'yes_no', 'DT Unsweetened Tea', false, null, null, false),
    (sec, 7, 'yes_no', 'DT Lemonade Dispensers', false, null, null, false),
    (sec, 8, 'yes_no', 'DT Sunjoy Dispenser', false, null, null, false),
    (sec, 9, 'yes_no', 'DT Cold Brew Dispenser', false, null, null, false),
    (sec, 10, 'yes_no', 'DT Strawberry Dispenser', false, null, null, false),
    (sec, 11, 'yes_no', 'Milk (in use)', false, null, null, false),
    (sec, 12, 'yes_no', 'Cherries (in use)', false, null, null, false),
    (sec, 13, 'yes_no', 'Cherries Jar (opened)', false, null, null, false),
    (sec, 14, 'yes_no', 'Whipped Cream (in use)', false, null, null, false),
    (sec, 15, 'yes_no', 'Oreo Crumble', false, null, null, false),
    (sec, 16, 'yes_no', 'Chocolate Syrup', false, null, null, false),
    (sec, 17, 'yes_no', 'Cane Syrups', false, null, null, false),
    (sec, 18, 'yes_no', 'SM Fruit', false, null, null, false),
    (sec, 19, 'yes_no', 'MD Fruit', false, null, null, false),
    (sec, 20, 'yes_no', 'LG Fruit', false, null, null, false),
    (sec, 21, 'yes_no', 'Parfaits', false, null, null, false),
    (sec, 22, 'yes_no', 'Side Salads', false, null, null, false),
    (sec, 23, 'yes_no', 'Kale Crunch', false, null, null, false),
    (sec, 24, 'yes_no', 'Southwest Salads', false, null, null, false),
    (sec, 25, 'yes_no', 'Market Salads', false, null, null, false),
    (sec, 26, 'yes_no', 'Grilled Wraps', false, null, null, false),
    (sec, 27, 'yes_no', 'Spicy Grilled Wraps', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'FC Maintenance', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'is the following item stocked up: Paper Towel Dispenser', false, null, null, false),
    (sec, 1, 'yes_no', 'is the following item stocked up: Hand Soap Dispenser', false, null, null, false),
    (sec, 2, 'yes_no', 'is the following item stocked up: Hand Sanitizer Dispenser', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the following item positioned correctly: Sugar Bin Scoop', false, null, null, false),
    (sec, 4, 'yes_no', 'Is the following item positioned correctly: Ice Bin Holder', false, null, null, false),
    (sec, 5, 'yes_no', 'Is the following item positioned correctly: Ice Scoopers (Drink Towers)', false, null, null, false),
    (sec, 6, 'yes_no', 'Is the following item positioned correctly: Cherry Container', false, null, null, false),
    (sec, 7, 'yes_no', 'Is the following item free of cracks and close properly: DT Lemonade Dispenser & Lids', false, null, null, false),
    (sec, 8, 'yes_no', 'Is the following item free of cracks and close properly: FC Lemonade Dispenser & Lids', false, null, null, false),
    (sec, 9, 'yes_no', 'Is the following item free of cracks and close properly: IceDream Machine Lids', false, null, null, false),
    (sec, 10, 'yes_no', 'Is the following item free of cracks and close properly: Cherry Container', false, null, null, false),
    (sec, 11, 'yes_no', 'Is the following item free of cracks and close properly: DT Tea Dispensers', false, null, null, false),
    (sec, 12, 'yes_no', 'Is the following item free of cracks and close properly: FC Tea Dispensers', false, null, null, false),
    (sec, 13, 'yes_no', 'Is the following item free of cracks and close properly: Drink Tower Ice Holder', false, null, null, false),
    (sec, 14, 'yes_no', 'Check both trash bins, are both bins filled less than halfway?', false, null, null, false),
    (sec, 15, 'yes_no', 'Are Team Members cutting boxes on top of the Drive-Thru Counter?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Women''s Bathrooms', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is the Paper Towel Dispenser stocked up?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is the Hand Soap Dispenser stocked up?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the Hand Sanitizer Dispenser stocked up?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the Toilet Paper Dispenser stocked up?', false, null, null, false),
    (sec, 4, 'yes_no', 'Are the trash bins in the restroom less than halfway filled?', false, null, null, false),
    (sec, 5, 'yes_no', 'Is the changing tables in restroom clean and residue-free?', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Men''s Bathroom', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is the Paper Towel Dispenser stocked up?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is the Hand Soap Dispenser stocked up?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the Hand Sanitizer Dispenser stocked up?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the Toilet Paper Dispenser stocked up?', false, null, null, false),
    (sec, 4, 'yes_no', 'Are the trash bins in the restroom less than halfway filled?', false, null, null, false),
    (sec, 5, 'yes_no', 'Is the changing tables in restroom clean and residue-free?', false, null, null, true);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Catering (Morning)', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Print receipts of all catering orders for the business day.', false, null, null, false),
    (sec, 1, 'yes_no', 'Confirm setups are complete for orders', false, null, null, false),
    (sec, 2, 'yes_no', 'Delivery order? Confirm Driver', false, null, null, false),
    (sec, 3, 'yes_no', 'Communicate with BOH Leaders Delivery Departure Time', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Breakfast Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', '6:00AM Coffee Setup', false, null, null, false),
    (sec, 1, 'yes_no', '6:30AM Icedream Setup', false, null, null, false),
    (sec, 2, 'yes_no', '6:45AM Label Lemonades, Teas, & Desserts', false, null, null, false),
    (sec, 3, 'yes_no', '7:00AM Patio Setup', false, null, null, false),
    (sec, 4, 'yes_no', '8:15AM Parking Lot Sweep', false, null, null, false),
    (sec, 5, 'yes_no', '8:30AM Run First Break', false, null, null, false),
    (sec, 6, 'yes_no', '9:00AM iPOS Setup', false, null, null, false),
    (sec, 7, 'yes_no', 'Fill Ice Bins', false, null, null, false),
    (sec, 8, 'yes_no', 'Stock Up Cups & Lids', false, null, null, false),
    (sec, 9, 'yes_no', 'Stock Drinks & Dessert Fridges', false, null, null, false),
    (sec, 10, 'yes_no', 'Stock All 3 Condiment Sections', false, null, null, false),
    (sec, 11, 'yes_no', 'Stock Dressings', false, null, null, false),
    (sec, 12, 'yes_no', 'Stock Bags', false, null, null, false),
    (sec, 13, 'yes_no', 'Trays', false, null, null, false),
    (sec, 14, 'yes_no', 'Kids’ Meals', false, null, null, false),
    (sec, 15, 'yes_no', 'Catering Setups', false, null, null, false),
    (sec, 16, 'yes_no', '8oz Bottles of Sauce', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Comprehensive Food Test', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Participants and pre checklist', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'List participants', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure you have all the items listed below !', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Order Taking', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'multi_choice', 'Select One : Order Route', false, '["Dining in","Drive Thru","Mobile Ordering"]'::jsonb, null, false),
    (sec, 1, 'text', 'Answer based on order route', false, null, null, false),
    (sec, 2, 'yes_no', 'If in Drive Thru - Is the teammeber wearing a reflective vest ?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the teammember wearing a name tag ?', false, null, null, false),
    (sec, 4, 'text', 'Which of the Core 4 were displayed ? Create eye contact / Share a smile / Speak with a friendly tone / Always say my please', false, null, null, false),
    (sec, 5, 'yes_no', 'Was the order confirmed ?', false, null, null, false),
    (sec, 6, 'yes_no', 'Team members offered a warm welcome and a fond fear well ?', false, null, null, false),
    (sec, 7, 'text', 'What was the speed of service ( from start of interaction till order recieved )', false, null, null, false),
    (sec, 8, 'text', 'Comments ?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Bagging / Packaging', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are all items accounted for ?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are proper bagging procedures followed ? ( Amount of sauces / Napkins )', false, null, null, false),
    (sec, 2, 'yes_no', 'Are the outside of boxes / bags stained / torn', false, null, null, false),
    (sec, 3, 'yes_no', 'is the foil bag folded correctly', false, null, null, false),
    (sec, 4, 'yes_no', 'Are sleeves if needed present ?', false, null, null, false),
    (sec, 5, 'yes_no', 'Did you get the correct cutlery / dressing ? ( sides , salads , wraps )', false, null, null, false),
    (sec, 6, 'yes_no', 'Pictures For section', false, null, null, true),
    (sec, 7, 'text', 'Comments ?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Food Quality - Drink', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is there spillage on the lid ?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is the correct dimple punched ?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the beverage correct ?', false, null, null, false),
    (sec, 3, 'yes_no', 'Pictures For section', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Food Quality - Fries', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Temperature ?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are fries correctly salted ?', false, null, null, false),
    (sec, 2, 'yes_no', 'Are fries portioned correctly ?', false, null, null, false),
    (sec, 3, 'yes_no', 'Are fries the appropriate color ?', false, null, null, false),
    (sec, 4, 'yes_no', 'Are small pieces less than 20% of total ?', false, null, null, false),
    (sec, 5, 'text', 'Was the weight of fries in correct range ?', false, null, null, false),
    (sec, 6, 'yes_no', 'Pictures For section', false, null, null, true),
    (sec, 7, 'text', 'Comments ?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Food Quality - Sandwhich / Nuggets / Strips', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Temperature of product:', false, null, null, false),
    (sec, 1, 'yes_no', 'Is the tab punch correctly ?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the count correct ?', false, null, null, false),
    (sec, 3, 'yes_no', 'Are there scraps ?', false, null, null, false),
    (sec, 4, 'yes_no', 'Are there bare spots ?', false, null, null, false),
    (sec, 5, 'yes_no', 'Is there an even amount of small and large nuggets ?', false, null, null, false),
    (sec, 6, 'yes_no', 'Is the bun undamaged ?', false, null, null, false),
    (sec, 7, 'yes_no', 'Is there acceptable bun coverage (3 points) ?', false, null, null, false),
    (sec, 8, 'yes_no', 'Is the filet smooth side up ?', false, null, null, false),
    (sec, 9, 'yes_no', 'Are there 2 pickles, dating not mating ?', false, null, null, false),
    (sec, 10, 'yes_no', 'Is the color appropriate ?', false, null, null, false),
    (sec, 11, 'yes_no', 'Is the coater appropriate ? ( clumpy - thin ( no milk wash / too much milk wash ) / dull ( food left sitting) )', false, null, null, false),
    (sec, 12, 'yes_no', 'If Applicable : Clamshell is securely closed with both locking tabs secured', false, null, null, false),
    (sec, 13, 'yes_no', 'If Applicable : Is there carbon biuld up on grilled product ?', false, null, null, false),
    (sec, 14, 'yes_no', 'If Applicable : Is the lettuce amount appropriate ? ( 2 pieces 4in each)', false, null, null, false),
    (sec, 15, 'yes_no', 'If Applicable : Are there 2 whole slices of tomatoes ?', false, null, null, false),
    (sec, 16, 'yes_no', 'If Applicable: Grilled Fillet is the correct color and best grill marks side up ?', false, null, null, false),
    (sec, 17, 'yes_no', 'If Applicable : Honey Roasted BBQ is served ? ( With Grill )', false, null, null, false),
    (sec, 18, 'yes_no', 'If Applicable : Are the grilled nuggets seperated ?', false, null, null, false),
    (sec, 19, 'yes_no', 'Pictures For section', false, null, null, true),
    (sec, 20, 'text', 'Comments ?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Closing', 6) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'What is your biggest take away / action item ? how will you impact it ?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Director Walkthrough', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Outside', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Dumpster pad', false, null, null, false),
    (sec, 1, 'yes_no', 'Dumpster doors cleanliness', false, null, null, false),
    (sec, 2, 'yes_no', 'Close the dumpster doors if needed', false, null, null, false),
    (sec, 3, 'yes_no', 'Parking Lot cleanliness', false, null, null, false),
    (sec, 4, 'yes_no', 'Patio', false, null, null, false),
    (sec, 5, 'text', 'Any action items needed?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dining Room/ Restrooms/ Playground', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Restrooms are cleaned', false, null, null, false),
    (sec, 1, 'yes_no', 'White walls and baseboards (incuding corner buildup) of bathrooms are cleaned and free of residue', false, null, null, false),
    (sec, 2, 'yes_no', 'Dining room tables and chairs are alligned', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the restroom stocked?', false, null, null, false),
    (sec, 4, 'yes_no', 'Dining room tables and chairs are cleaned and free form debrie', false, null, null, false),
    (sec, 5, 'yes_no', 'Windows/playground glass is clear and free from finger prints and smudges', false, null, null, false),
    (sec, 6, 'yes_no', 'Check if the flowers are looking good in the dining room', false, null, null, false),
    (sec, 7, 'yes_no', 'Playground is clean', false, null, null, false),
    (sec, 8, 'yes_no', 'Kids chairs are cleaned and free from debrie', false, null, null, false),
    (sec, 9, 'yes_no', 'Dining room floor are clean/ no sweep needed', false, null, null, false),
    (sec, 10, 'yes_no', 'Brown walls are clean and free from any residue/dust', false, null, null, false),
    (sec, 11, 'text', 'Any action items needed?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Front Counter', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Register counter is clean, free of puddles of water/stains', false, null, null, false),
    (sec, 1, 'yes_no', 'White walls are clean and free from any residue', false, null, null, false),
    (sec, 2, 'yes_no', 'Floor is clean and clear of any trash/foot marks', false, null, null, false),
    (sec, 3, 'yes_no', 'Baseboards are clean, including any corner buildup', false, null, null, false),
    (sec, 4, 'yes_no', 'Lemonade counter is free of any old drink/food residue', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Drive Thru', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Floor is swept and mopped', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Audits', 4) returning id into sec;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'BOH', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is all catering written down with drop times.', false, null, null, false),
    (sec, 1, 'multi_choice', 'Is the kitchen clean?', false, '["Is the floor clean and lacks debris","Are trash’s changed / cardboard brought back","Break racks brought to the back"]'::jsonb, null, false),
    (sec, 2, 'yes_no', 'Are we stocked up for the current day part?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is rotation / put back completed for the day part?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Catering area', 6) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is the catering area neat and orginized?', false, null, null, false),
    (sec, 1, 'yes_no', 'Do we need a trash run?', false, null, null, false),
    (sec, 2, 'yes_no', 'Are there TMS bags plugged in if needed?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is bread racks organized and use first clips in place?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Walk-Thru Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Back of Building', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure Trash is not overflowing and not a hazard.', false, null, null, false),
    (sec, 1, 'yes_no', 'Bun Roation Clips are set up (1/Green is use first)', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooler', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure Cooldown pans are not stacked & Labled', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure Cooldown Chicken Pans follow cooldown requirements', false, null, null, false),
    (sec, 2, 'yes_no', 'Mac & Cheese Rotation is completed (3 Stacks)', false, null, null, false),
    (sec, 3, 'yes_no', 'Ensure Corn & Bean is rotation is complete', false, null, null, false),
    (sec, 4, 'yes_no', 'Minimum of 3 Pans of Romaine', false, null, null, false),
    (sec, 5, 'yes_no', 'Minimum of 6 Lemonade', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Freezer', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Shared table is Logged and Bins set up with bags', false, null, null, false),
    (sec, 1, 'yes_no', 'There is less than 10 cases of Chicken Rotation to be put back', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Breading', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'The Holding Cabinet meets the minimun', false, null, null, false),
    (sec, 1, 'yes_no', 'Thawing Cabinets have Control Labels & Date Labels', false, null, null, false),
    (sec, 2, 'yes_no', 'Holding Cabinet has Date Labels & Control Labels', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Boards', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Rethermalizer has minimum of 2 Soup & Cheese Sauce', false, null, null, false),
    (sec, 1, 'yes_no', 'Primary & Secondary Fry Fridges are Full', false, null, null, false),
    (sec, 2, 'yes_no', '2 12QT of Cookies & Brownie', false, null, null, false),
    (sec, 3, 'yes_no', '1 Bucket of Gluten-Free Buns', false, null, null, false),
    (sec, 4, 'yes_no', 'Secondary Fry Fridges has Cheese Sauce & Soup', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Prep', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', '1 Bucket of Spicy & Grilled cut chicken', false, null, null, false),
    (sec, 1, 'yes_no', '1 12QT of each Soup Chicken', false, null, null, false),
    (sec, 2, 'yes_no', 'There is less than 5 Trays to make on Prep', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Around the Kitchen', 6) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Paper Towel Dispensers are loaded.', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure Sanitzer is changed & Ready for use in each area', false, null, null, false),
    (sec, 2, 'yes_no', 'Hand Soap is loaded', false, null, null, false),
    (sec, 3, 'yes_no', 'Check A&C Calender to ensure your Daypart task are completed', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Other Tasks', 7) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Check & Plan for Catering Orders', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('R&M Maintenance Walk Through', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Temperature Check', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Nuggets', false, null, null, false),
    (sec, 1, 'yes_no', 'Strips', false, null, null, false),
    (sec, 2, 'yes_no', 'Mac', false, null, null, false),
    (sec, 3, 'yes_no', 'Filet', false, null, null, false),
    (sec, 4, 'yes_no', 'Spicy', false, null, null, false),
    (sec, 5, 'yes_no', 'Grilled nug', false, null, null, false),
    (sec, 6, 'yes_no', 'Grilled filet', false, null, null, false),
    (sec, 7, 'yes_no', 'Fries', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Food Safety 5 Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Time & Temperature', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Bun Rotation Clips in Use?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is breaded cooldown chicken trays in the cooler single stacked?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is grilled cooldown chicken double stacked in the cooler?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is all chicken everything properly labeled in the cooler?', false, null, null, false),
    (sec, 4, 'yes_no', 'Is there at-least 1 bucket of each Corn & Bean Thawed?', false, null, null, true),
    (sec, 5, 'yes_no', 'Is the first Mac & Cheese completely thawed and ready to be used?', false, null, null, false),
    (sec, 6, 'yes_no', 'Are "USE FIRST" clips present and used correctly to identify the longest-held tray for each product in the thaw cabinets?', false, null, null, false),
    (sec, 7, 'yes_no', 'Does all fileted/thawed chicken in the holding cabinet have a date label & control label? (Labeled Example)', false, null, null, false),
    (sec, 8, 'temperature', 'Take the temperature of the Filets in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 9, 'temperature', 'Take the temperature of the Spicy Filets in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 10, 'temperature', 'Take the temperature of the Nuggets in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 11, 'temperature', 'Take the temperature of the Strips in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 12, 'temperature', 'Take the temperature of the Grilled Filets in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 13, 'temperature', 'Take the temperature of the Grilled Nuggets in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 14, 'temperature', 'Take the temperature of the Milkwash in the holding cabinet', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 15, 'yes_no', 'Is the Milk and Egg wash in use at the breading table at the appropriate color?', false, null, null, false),
    (sec, 16, 'temperature', 'Take the temperature of the Filets in the breading table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 17, 'temperature', 'Take the temperature of the Spicy Filets in the breading table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 18, 'temperature', 'Take the temperature of the Nuggets in the breading table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 19, 'temperature', 'Take the temperature of the Strips in the breading table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 20, 'temperature', 'Take the temperature of the Milk and Egg Wash in the breading table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 21, 'temperature', 'Take the temperature of the Spicy Milk and Egg Wash in the breading table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 22, 'yes_no', 'Are grilled timers being maintained?', false, null, null, true),
    (sec, 23, 'yes_no', 'Are all breakfast items properly labeled?', false, null, null, false),
    (sec, 24, 'yes_no', 'Is everything properly labeled on boards!', false, null, null, false),
    (sec, 25, 'temperature', 'Take the temperature of the Filets in the hot holding station', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 26, 'temperature', 'Take the temperature of the Spicy Filets in the hot holding station', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 27, 'temperature', 'Take the temperature of the Nuggets in the hot holding station', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 28, 'temperature', 'Take the temperature of the Strips in the hot holding station', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 29, 'temperature', 'Take the temperature of the Grilled FIlets in the hot holding station', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 30, 'temperature', 'Take the temperature of the Grilled Nuggets in the hot holding station', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 31, 'yes_no', 'Is there a container with a label for all products?', false, null, null, false),
    (sec, 32, 'temperature', 'Take the temperature of the Green Leaf in the coldwell', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 33, 'temperature', 'Take the temperature of the Tomatoes in the coldwell', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 34, 'temperature', 'Take the temperature of the American Cheese in the coldwell', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 35, 'temperature', 'Take the temperature of the Pepper Jack Cheese in the coldwell', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 36, 'temperature', 'Take the temperature of the Colby Jack Cheese in the coldwell', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 37, 'temperature', 'Take the temperature of the Grilled Chicken in the Prep Table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 38, 'temperature', 'Take the temperature of the Spicy Grilled Chicken in the Prep Table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cleaning & Sanitation', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are gaskets on fridges cleaned and well maintained?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are the hot holding shelves cleaned and well maintained?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the Prep Table interior cleaned & maintained?', false, null, null, true),
    (sec, 3, 'yes_no', 'Are Coater Shelving, Upper Shelving, Wires, Walls & Stands clean and well maintained?', false, null, null, true),
    (sec, 4, 'yes_no', 'Are Thawing Cabinet Shelving, Walls & Bottom clean and well maintained?', false, null, null, true),
    (sec, 5, 'yes_no', 'Are base surfaces, walls, interior of doors, and shelving inside of the holding cabinet clean and well maintained', false, null, null, true),
    (sec, 6, 'yes_no', 'Is the shelving above the clean dishes cleaned & maintained?', false, null, null, true),
    (sec, 7, 'yes_no', 'Please Observe 5 Dishes from the Clean Disk Rack and determine if they look clean.', false, null, null, true),
    (sec, 8, 'yes_no', 'Is underneath all the shelving in the cooler cleaned & maintained?', false, null, null, true),
    (sec, 9, 'yes_no', 'Is underneath all the shelving in the freezer cleaned & maintained?', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cross-Contamination', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is Sugar Scoop stored inside the of the Sugar Bin with the handle up & are Bins Labeled? (Both Bins have a "Sugar Label"', false, null, null, false),
    (sec, 1, 'yes_no', 'Using the appropriate test strips (ensure test strips are within expiration date), is produce wash at the proper concentration (0.751.0 oz/gal.)?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the Egg Slicer in it''s own container?', false, null, null, false),
    (sec, 3, 'yes_no', 'Are all fridges equipped with Light Bulbs & Light Shields?', false, null, null, false),
    (sec, 4, 'yes_no', 'Is a yellow apron worn when working with raw chicken at the Breading Table & Rotation Table?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Pests', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Pest Control Devices in BOH currently working?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is there an excessive amount of garbage near the back door area?', false, null, null, true),
    (sec, 2, 'yes_no', 'Are interior & exterior of garbage containers cleaned & maintained?', false, null, null, false),
    (sec, 3, 'yes_no', 'Are Dumpster Doors & Lids closed?', false, null, null, false),
    (sec, 4, 'yes_no', 'Is the Dumpster Pad swept and well maintained?', false, null, null, true),
    (sec, 5, 'yes_no', 'Are Mops and/or Mop Heads hung to dry?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Health & Hygiene', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Hand Sinks working and being not blocked by any objects? (Brooms, Ladders, Buckets, Cardboard', false, null, null, false),
    (sec, 1, 'yes_no', 'Are Kitchen Paper Towel & Soap dispensers stocked, clean and/or in good repair?', false, null, null, false),
    (sec, 2, 'yes_no', 'No Bracelets', false, null, null, false),
    (sec, 3, 'yes_no', 'No Lanyards', false, null, null, false),
    (sec, 4, 'yes_no', 'Nonslip shoes', false, null, null, false),
    (sec, 5, 'yes_no', 'Hairnets', false, null, null, false),
    (sec, 6, 'yes_no', 'Correct Color Aprons & Gloves', false, null, null, false),
    (sec, 7, 'yes_no', 'Nails Are Clean, Trimmed & Have No Polish', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Leadership Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Leaders', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure Corn & Bean is rotation is complete', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure Mac & Cheese rotation is complete', false, null, null, false),
    (sec, 2, 'yes_no', 'Bun & Chicken Count Updated', false, null, null, false),
    (sec, 3, 'yes_no', 'All Team Members completed their checklists', false, null, null, false),
    (sec, 4, 'yes_no', 'Were Counts Posted?', false, null, null, false),
    (sec, 5, 'yes_no', 'Was the iPad Plugged in?', false, null, null, false),
    (sec, 6, 'yes_no', 'Ensure VSBL was completed for BOH', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH - Closing Leader Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'iPads and Card Readers organized/plugged in', false, null, null, false),
    (sec, 1, 'yes_no', 'Catering Warmers are unplugged', false, null, null, false),
    (sec, 2, 'yes_no', 'Ensure VSBL was completed for FOH', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH - Closing Shift Leader', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Complete Time Punch', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure all Team Members Time Punches are correct', false, null, null, false),
    (sec, 2, 'yes_no', 'Signage is off', false, null, null, false),
    (sec, 3, 'yes_no', 'Ensure Infractions were added for lateness/call out', false, null, null, false),
    (sec, 4, 'yes_no', 'Ensure VSBL was completed for FOH', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('QIV - Nuggets & Strips', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Breading Nuggets', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Raw Nuggets & Strips are placed into milk and egg wash in perforated pan/wire basket, separated in the milk wash', false, null, null, false),
    (sec, 1, 'yes_no', 'Seasoned coater pans have 2”-3” of coater at all times', false, null, null, false),
    (sec, 2, 'yes_no', 'Breaded raw Nuggets & Strips are transferred without delay', false, null, null, false),
    (sec, 3, 'yes_no', 'Nuggets & Strips are separated drained and rolled with gentle pressure until all surfaces are generously covered with evenly-distributed coater', false, null, null, false),
    (sec, 4, 'yes_no', 'Nuggets & Strips are transferred in wire basket', false, null, null, false),
    (sec, 5, 'yes_no', 'Nuggets & Strips are transferred in correct transfer pan', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooking Nuggets', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Tiered/half basket is lowered into oil, immediately raised about 4” and then lowered again to prevent chicken from sticking.', false, null, null, false),
    (sec, 1, 'yes_no', 'Nuggets are stirred for 30 seconds', false, null, null, false),
    (sec, 2, 'yes_no', 'lid is closed correctly (with spindle turned clockwise until tight)', false, null, null, false),
    (sec, 3, 'yes_no', 'Product button is pressed immediately after lid is closed to start cooking cycle', false, null, null, false),
    (sec, 4, 'yes_no', 'Nuggets are cooked in a machine set to pressure mode', false, null, null, false),
    (sec, 5, 'yes_no', 'Pressure registers in the green “Operating Zone” during the cooking cycle', false, null, null, false),
    (sec, 6, 'yes_no', 'Pressure is not escaping from the Henny Penny during the cooking cycle', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Nuggets & Strips', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 1, 'yes_no', 'Nugget/Strip box has tab pressed', false, null, null, false),
    (sec, 2, 'yes_no', 'There are no scraps in Nuggets/Strip box', false, null, null, false),
    (sec, 3, 'yes_no', 'The correct amount of Nuggets/Strips are in the box', false, null, null, false),
    (sec, 4, 'yes_no', 'Internal temperature of cooked Nuggets & Strips is 140°F or higher out of hot holding (chutes)', false, null, null, false),
    (sec, 5, 'yes_no', 'Minimum packaged weight is met (Nuggets: 5ct - 2.8 / 8ct - 4.2 / 12ct - 6.2 / 30ct - 17.2', false, null, null, false),
    (sec, 6, 'yes_no', 'Minimum packaged weight is met (Strips: 2ct - 2.8 / 3ct - 4.0 / 4ct - 5.2 / 30ct - 17.2', false, null, null, false),
    (sec, 7, 'yes_no', 'Nuggets/Strips are entirely covered in a generous layer of seasoned coater, free of large lumps or uncooked coater', false, null, null, false),
    (sec, 8, 'yes_no', 'Is the texture of the Strips/Nuggets correct, based on experience?', false, null, null, false),
    (sec, 9, 'yes_no', 'Does the Strips/Nuggets have proper flavor and free of old oil taste, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Catering Follow-Up', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Call each catering order that has gone out throughout the day and ask the following questions', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'How was the overall experience? (Taste, Temperature Team Member courteousness)', false, null, null, false),
    (sec, 1, 'yes_no', 'Was the order accurate and was anything missing?', false, null, null, false),
    (sec, 2, 'yes_no', 'Would you recommend anything to our team?', false, null, null, false),
    (sec, 3, 'yes_no', 'Give a fond farewell, thank the guest for the order, and say that we’d love to serve them again!', false, null, null, false),
    (sec, 4, 'yes_no', 'List of Guests to not follow up with & Instructions on how to find Orders', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Night FOH Catering', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Confirm Orders for Tommorows’s Catering', false, null, null, false),
    (sec, 1, 'yes_no', 'Coomunicate any set up placements or additions items to be prepped in the morning', false, null, null, false),
    (sec, 2, 'yes_no', 'Print next day''s catering orders large setups', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Dishes Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dishes', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Clean compartment sink', false, null, null, false),
    (sec, 1, 'yes_no', 'Clean dirty dish rack', false, null, null, false),
    (sec, 2, 'yes_no', 'Clean inside & outside of dishwasher', false, null, null, false),
    (sec, 3, 'yes_no', 'Clean nearby stainless steel.', false, null, null, false),
    (sec, 4, 'yes_no', 'Ensure all dishes are washed', false, null, null, false),
    (sec, 5, 'yes_no', 'Take 3 Pictrues of DIshes on the Clean Dish Rack', false, null, null, true);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Dish Put Back Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Prep', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'The outside of the prep table is clean (Sides Included)', false, null, null, false),
    (sec, 1, 'yes_no', 'The lower cavity of the prep table is clean', false, null, null, false),
    (sec, 2, 'yes_no', 'The outside of the prep table is clean (Sides Included)', false, null, null, false),
    (sec, 3, 'yes_no', 'All prep items in the lower cavity have a new date label', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dishes', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Put away dishes in correct spot', false, null, null, false),
    (sec, 1, 'yes_no', 'Take 3 Pictrues of DIshes on the Clean Dish Rack', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Boards Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Boards', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Counters/centerline has NO FOOD RESIDUE', false, null, null, false),
    (sec, 1, 'yes_no', 'All cooldown chicken taken into freezer/cooler (Be sure to label)', false, null, null, false),
    (sec, 2, 'yes_no', 'All equipment turned off', false, null, null, false),
    (sec, 3, 'yes_no', 'Pull out toasters and wipe under & Clean Teflon', false, null, null, false),
    (sec, 4, 'yes_no', 'Daily filters complete on fryers', false, null, null, false),
    (sec, 5, 'yes_no', 'Clean/Empty grease traps', false, null, null, false),
    (sec, 6, 'yes_no', 'Wipe down all hand sinks', false, null, null, false),
    (sec, 7, 'yes_no', 'Pull out boxes under dry area and wipe down shelving', false, null, null, false),
    (sec, 8, 'yes_no', 'Stock fry coolers', false, null, null, false),
    (sec, 9, 'yes_no', 'Clean Merco warming station', false, null, null, false),
    (sec, 10, 'yes_no', 'Ensure oil is up to the fill line', false, null, null, false),
    (sec, 11, 'yes_no', 'Pull out fridges and wipe down inside and out', false, null, null, false),
    (sec, 12, 'yes_no', 'Empty and wipe down rethermalizer', false, null, null, false),
    (sec, 13, 'yes_no', 'Cover all cheese, lettuce and tomatoes with food film and label', false, null, null, false),
    (sec, 14, 'yes_no', 'Empty and wipe down soup warmer', false, null, null, false),
    (sec, 15, 'yes_no', 'Lunch Dishes are put back', false, null, null, false),
    (sec, 16, 'yes_no', 'Breakfast Dishes are put back', false, null, null, false),
    (sec, 17, 'yes_no', 'Hasbrown in Secondary Freezer', false, null, null, false),
    (sec, 18, 'yes_no', 'Both Salt Shaker is cleaned', false, null, null, true),
    (sec, 19, 'yes_no', 'Teflon cleaned', false, null, null, true),
    (sec, 20, 'yes_no', 'Yeast Bun pulled out', false, null, null, true);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Closing - Ice Dream Machine', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Disassemble Ice Cream Machine', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Drain mix and put in cooler (with label)', false, null, null, false),
    (sec, 1, 'yes_no', 'Rinse machine', false, null, null, false),
    (sec, 2, 'yes_no', 'Run sanitizer though machine', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Take big parts back to dishes', false, null, null, false),
    (sec, 1, 'yes_no', 'Wash small parts upfront', false, null, null, false),
    (sec, 2, 'yes_no', 'Take off side part and wipe it down', false, null, null, false),
    (sec, 3, 'yes_no', 'Wipe off entire machine', false, null, null, false),
    (sec, 4, 'yes_no', 'Wipe off entire machine', false, null, null, false),
    (sec, 5, 'yes_no', 'Clean counter', false, null, null, false),
    (sec, 6, 'yes_no', 'Iced coffee syrups in fridge', false, null, null, false),
    (sec, 7, 'yes_no', 'Lay Out Parts on Tray to Dry Overnight', false, null, null, true),
    (sec, 8, 'yes_no', 'SATURDAYS ONLY: Take out shakebase, wipe the inside of the machine, leave shake base tray out to dry for the night and turn if off', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Closing - Chutes & Towers', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Chutes', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Turn off chutes', false, null, null, false),
    (sec, 1, 'yes_no', 'Clean chutes and metal inserts thoroughly', false, null, null, false),
    (sec, 2, 'yes_no', 'Make sure bagging area is clean and top of secondary is clean', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Drink Towers', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Soak and clean nozzles and diffusers in sanitizer (3 min)', false, null, null, false),
    (sec, 1, 'yes_no', 'Turn off drink towers', false, null, null, false),
    (sec, 2, 'yes_no', 'Scrub each socket & take a picture of them in a row', false, null, null, true),
    (sec, 3, 'yes_no', 'Pour 2 cups WARM water into drip trays', false, null, null, false),
    (sec, 4, 'yes_no', 'Wipe drip trays with clean towel to remove build-up', false, null, null, false),
    (sec, 5, 'yes_no', 'Clean all 3 Fridge Gaskets', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Coffee', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Turn off Coffee Machine', false, null, null, true),
    (sec, 1, 'yes_no', 'Empty coffee pots', false, null, null, false),
    (sec, 2, 'yes_no', 'Remove and discard filter', false, null, null, false),
    (sec, 3, 'yes_no', 'Place filter and tab inside brewer and press small brew', false, null, null, false),
    (sec, 4, 'yes_no', 'Remove timer insert and place upside down in 12-quart', false, null, null, false),
    (sec, 5, 'yes_no', 'Scrub and empty server at compartment sink', false, null, null, false),
    (sec, 6, 'yes_no', 'Rinse blue brush', false, null, null, false),
    (sec, 7, 'yes_no', 'Place server under brewer, replace timer insert and complete a rinse cycle', false, null, null, false),
    (sec, 8, 'yes_no', 'Remove timer insert and place upside down in 12-quart container', false, null, null, false),
    (sec, 9, 'yes_no', 'Scrub and empty brewer', false, null, null, false),
    (sec, 10, 'yes_no', 'Run water in brewer for final rinse', false, null, null, false),
    (sec, 11, 'yes_no', 'Wipe exterior of coffee pot', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Saturdays Only', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Break the drink towers apart and bring to dishes *after 9 PM*', false, null, null, false),
    (sec, 1, 'yes_no', 'Empty ice bins in front counter and drive thru', false, null, null, false),
    (sec, 2, 'yes_no', 'Carefully clean inside of drink tower', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Breakfast Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Coffee Setup', false, null, null, false),
    (sec, 1, 'yes_no', 'Icedream Setup', false, null, null, false),
    (sec, 2, 'yes_no', 'Label Lemonades, Teas, & Desserts', false, null, null, false),
    (sec, 3, 'yes_no', 'Patio Setup', false, null, null, false),
    (sec, 4, 'yes_no', 'Parking Lot Sweep Assigned', false, null, null, false),
    (sec, 5, 'yes_no', 'Run First Break', false, null, null, false),
    (sec, 6, 'yes_no', 'iPOS Setup', false, null, null, false),
    (sec, 7, 'yes_no', 'Fill Ice Bins', false, null, null, false),
    (sec, 8, 'yes_no', 'Stock Up Cups & Lids', false, null, null, false),
    (sec, 9, 'yes_no', 'Stock Drinks & Dessert Fridges', false, null, null, false),
    (sec, 10, 'yes_no', 'Stock All 3 Condiment Sections', false, null, null, false),
    (sec, 11, 'yes_no', 'Stock Dressings', false, null, null, false),
    (sec, 12, 'yes_no', 'Stock Bags', false, null, null, false),
    (sec, 13, 'yes_no', 'Trays', false, null, null, false),
    (sec, 14, 'yes_no', 'Kids’ Meals', false, null, null, false),
    (sec, 15, 'yes_no', 'Catering Setups', false, null, null, false),
    (sec, 16, 'yes_no', 'Cleaning Task', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Closing - Front Counter & Teas', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', '*Everything must be cleaned by towel and blue spray*', false, null, null, false),
    (sec, 1, 'yes_no', 'Turn off KPS Screens', false, null, null, false),
    (sec, 2, 'yes_no', 'Wipe KPS screens off with clean towel and blue cleaner', false, null, null, false),
    (sec, 3, 'yes_no', 'Turn off Tea Brewer', false, null, null, true),
    (sec, 4, 'yes_no', 'Take tea urn nozzles off and take tea urns back to dishes', false, null, null, false),
    (sec, 5, 'yes_no', 'Take metal teas slates to dish', false, null, null, false),
    (sec, 6, 'yes_no', 'Clear tea containers and metal spoon back to dishes', false, null, null, false),
    (sec, 7, 'yes_no', 'Throw old tea bags away, turn off tea brewer, and clean area', false, null, null, false),
    (sec, 8, 'yes_no', 'Sweep front counter (make sure to sweep behind fridges)', false, null, null, false),
    (sec, 9, 'yes_no', 'Charge all iPads, card readers and anker chargers (cleaned with sanitizer wipe)', false, null, null, false),
    (sec, 10, 'yes_no', 'Wipe off entire front counter including shelf under lemonades and behind last drink tower', false, null, null, false),
    (sec, 11, 'yes_no', 'Organize all reflective vests and put them where they belong', false, null, null, false),
    (sec, 12, 'yes_no', 'Wipe off front of all fridges (front counter and drive thru) (blue cleaner)', false, null, null, false),
    (sec, 13, 'yes_no', 'Empty front counter trash can', false, null, null, false),
    (sec, 14, 'yes_no', 'Wipe off outside of trash can', false, null, null, false),
    (sec, 15, 'yes_no', 'Spray out all trash cans in the drive-thru', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Saturdays Only', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Clean front counters with restroom cleaner (bleach)', false, null, null, false),
    (sec, 1, 'yes_no', 'Clean tea urns and containers thoroughly (Ask Leader)', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'During WInter', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Empty pockets and organize all jackets', false, null, null, false),
    (sec, 1, 'yes_no', 'Remove anything from pockets and put it where they belong', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Weather Pods', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'All weather pods must be left open to dry after use', false, null, null, false),
    (sec, 1, 'yes_no', 'Once it is dry we must sanitize and clean each pod with Tide Spray or with a towel and soapy water', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Food Test - Nuggets & Strips', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Nuggets & Strips', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 1, 'yes_no', 'Nugget/Strip box has tab pressed', false, null, null, false),
    (sec, 2, 'yes_no', 'There are no scraps in Nuggets/Strip box', false, null, null, false),
    (sec, 3, 'yes_no', 'The correct amount of Nuggets/Strips are in the box', false, null, null, false),
    (sec, 4, 'yes_no', 'Internal temperature of cooked Nuggets & Strips is 140°F or higher out of hot holding (chutes)', false, null, null, false),
    (sec, 5, 'yes_no', 'Minimum packaged weight is met (Nuggets: 5ct - 2.8 / 8ct - 4.2 / 12ct - 6.2 / 30ct - 17.2', false, null, null, false),
    (sec, 6, 'yes_no', 'Minimum packaged weight is met (Strips: 2ct - 2.8 / 3ct - 4.0 / 4ct - 5.2 / 30ct - 17.2', false, null, null, false),
    (sec, 7, 'yes_no', 'Nuggets/Strips are entirely covered in a generous layer of seasoned coater, free of large lumps or uncooked coater', false, null, null, false),
    (sec, 8, 'yes_no', 'Is the texture of the Strips/Nuggets correct, based on experience?', false, null, null, false),
    (sec, 9, 'yes_no', 'Does the Strips/Nuggets have proper flavor and free of old oil taste, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Food Test - Grilled Nugget', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Finished Product: Grilled Nugget', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of packaging is free of excessive staining due to product', false, null, null, false),
    (sec, 1, 'yes_no', 'is the count of the Grilled nuggets correct ?', false, null, null, false),
    (sec, 2, 'yes_no', 'Internal temperature of Grilled Nugget is 140°F or higher out of hot holding', false, null, null, false),
    (sec, 3, 'yes_no', 'Grilled Nugget is correct color', false, null, null, false),
    (sec, 4, 'yes_no', 'Grilled Nugget is free of excessive carbon build up', false, null, null, false),
    (sec, 5, 'yes_no', 'is the taste of the Grilled nuggests satisfactory ?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('QIV - Grilled Nugget', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooking Grilled Chicken', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Grill is cleaned before dropping', false, null, null, false),
    (sec, 1, 'yes_no', 'Grilled filets are loaded from left to right', false, null, null, false),
    (sec, 2, 'yes_no', 'Grilled Chicken is loaded from front to back', false, null, null, false),
    (sec, 3, 'yes_no', 'Tips of grilled filets point to outside of grill (not overlapping outer edges of grill grate) so that thickest portion of filet is in center of grill', false, null, null, false),
    (sec, 4, 'yes_no', 'Filets are loaded smooth-side down to create the best grill marks', false, null, null, false),
    (sec, 5, 'yes_no', 'Grilled Nuggets/Filets do not touch, overlap, or hang off grill', false, null, null, false),
    (sec, 6, 'yes_no', 'If less than a full batch (8 filets/40 Grilled Nuggets or less), Chicken is loaded starting from the Partial line', false, null, null, false),
    (sec, 7, 'yes_no', 'Correct product button on grill is pressed', false, null, null, false),
    (sec, 8, 'yes_no', 'Only 1 type of grilled product is cooked in same batch', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Holding: Grilled Sandwich', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Grilled chicken that has exceeded hold time (30 min) is not served', false, null, null, false),
    (sec, 1, 'yes_no', 'Is Timer set?', false, null, null, false),
    (sec, 2, 'yes_no', 'Holding pans/kanbans in holding station are pushed in fully, with no air gaps present', false, null, null, false),
    (sec, 3, 'yes_no', 'Level of juices is below false bottom (not touching chicken), and no water is added to kanban', false, null, null, false),
    (sec, 4, 'yes_no', 'Kanbans (amber holding pans) for Duke holding station and Merco Holding Cabinet each have a low-rise false bottom', false, null, null, false),
    (sec, 5, 'yes_no', 'Kanbans have Merco Timer Clips and are in use?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Finished Product: Grilled Nugget', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of packaging is free of excessive staining due to product', false, null, null, false),
    (sec, 1, 'yes_no', 'is the count of the Grilled nuggets correct ?', false, null, null, false),
    (sec, 2, 'yes_no', 'Internal temperature of Grilled Nugget is 140°F or higher out of hot holding', false, null, null, false),
    (sec, 3, 'yes_no', 'Grilled Nugget is correct color', false, null, null, false),
    (sec, 4, 'yes_no', 'Grilled Nugget is free of excessive carbon build up', false, null, null, false),
    (sec, 5, 'yes_no', 'is the taste of the Grilled nuggests satisfactory ?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Food Test - Grilled Chicken', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Finished Product: Grilled Sandwich', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of clamshell is free of excessive staining due to product', false, null, null, false),
    (sec, 1, 'yes_no', 'Sandwich is served in sandwich sleeve inside clamshell', false, null, null, false),
    (sec, 2, 'yes_no', 'Clamshell should be securely closed with both locking tabs secured, product not protruding from clamshell.', false, null, null, false),
    (sec, 3, 'yes_no', 'Weight of cooked filet is at least 2.7 oz', false, null, null, false),
    (sec, 4, 'yes_no', 'Internal temperature of Grilled Filet is 140°F or higher out of hot holding', false, null, null, false),
    (sec, 5, 'yes_no', 'Grilled filet has acceptable bun coverage', false, null, null, false),
    (sec, 6, 'yes_no', 'Best grill marks of grilled filet are facing up', false, null, null, false),
    (sec, 7, 'yes_no', 'Grilled Chicken is correct color', false, null, null, false),
    (sec, 8, 'yes_no', 'Grilled filet is free of excessive carbon build up', false, null, null, false),
    (sec, 9, 'yes_no', 'There are 2 whole slices of tomato? (3/16" thick)', false, null, null, false),
    (sec, 10, 'yes_no', 'There are 2 pieces Green Leaf lettuce leaves on grilled sandwich?', false, null, null, false),
    (sec, 11, 'yes_no', 'Is a Sleeve present and facing correctly ?', false, null, null, false),
    (sec, 12, 'yes_no', 'Multigrain Brioche bun is not torn or crushed, with no flaking or peeling', false, null, null, false),
    (sec, 13, 'yes_no', 'Multigrain Brioche bun heel & crown is toasted evenly to correct color', false, null, null, false),
    (sec, 14, 'yes_no', 'Multigrain Brioche bun heel & crown is toasted evenly to correct color', false, null, null, false),
    (sec, 15, 'yes_no', 'Tomato slices have no visible core, no hole in center, no end slices', false, null, null, false),
    (sec, 16, 'yes_no', 'Does the bun taste fresh and toasted properly, based on experience?', false, null, null, false),
    (sec, 17, 'yes_no', 'Does the Grilled Chicken Sandwich filet taste properly marinated and free of carbon flavor, based on experience?', false, null, null, false),
    (sec, 18, 'yes_no', 'Is the Grilled Chicken Sandwich balanced by a ripe tomato and fresh lettuce texture, based on experience?', false, null, null, false),
    (sec, 19, 'yes_no', 'Does the Grilled Chicken Sandwich have the proper texture, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('QIV - Grilled Chicken', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooking Grilled Chicken', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Grill is cleaned before dropping', false, null, null, false),
    (sec, 1, 'yes_no', 'Grilled filets are loaded from left to right', false, null, null, false),
    (sec, 2, 'yes_no', 'Grilled Chicken is loaded from front to back', false, null, null, false),
    (sec, 3, 'yes_no', 'Tips of grilled filets point to outside of grill (not overlapping outer edges of grill grate) so that thickest portion of filet is in center of grill', false, null, null, false),
    (sec, 4, 'yes_no', 'Filets are loaded smooth-side down to create the best grill marks', false, null, null, false),
    (sec, 5, 'yes_no', 'Grilled Nuggets/Filets do not touch, overlap, or hang off grill', false, null, null, false),
    (sec, 6, 'yes_no', 'If less than a full batch (8 filets/40 Grilled Nuggets or less), Chicken is loaded starting from the Partial line', false, null, null, false),
    (sec, 7, 'yes_no', 'Correct product button on grill is pressed', false, null, null, false),
    (sec, 8, 'yes_no', 'Only 1 type of grilled product is cooked in same batch', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Holding: Grilled Sandwich', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Grilled chicken that has exceeded hold time (30 min) is not served', false, null, null, false),
    (sec, 1, 'yes_no', 'Is Timer set?', false, null, null, false),
    (sec, 2, 'yes_no', 'Holding pans/kanbans in holding station are pushed in fully, with no air gaps present', false, null, null, false),
    (sec, 3, 'yes_no', 'Level of juices is below false bottom (not touching chicken), and no water is added to kanban', false, null, null, false),
    (sec, 4, 'yes_no', 'Kanbans (amber holding pans) for Duke holding station and Merco Holding Cabinet each have a low-rise false bottom', false, null, null, false),
    (sec, 5, 'yes_no', 'Kanbans have Merco Timer Clips and are in use?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Finished Product: Grilled Sandwich', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of clamshell is free of excessive staining due to product', false, null, null, false),
    (sec, 1, 'yes_no', 'Sandwich is served in sandwich sleeve inside clamshell', false, null, null, false),
    (sec, 2, 'yes_no', 'Clamshell should be securely closed with both locking tabs secured, product not protruding from clamshell.', false, null, null, false),
    (sec, 3, 'yes_no', 'Weight of cooked filet is at least 2.7 oz', false, null, null, false),
    (sec, 4, 'yes_no', 'Internal temperature of Grilled Filet is 140°F or higher out of hot holding', false, null, null, false),
    (sec, 5, 'yes_no', 'Grilled filet has acceptable bun coverage', false, null, null, false),
    (sec, 6, 'yes_no', 'Best grill marks of grilled filet are facing up', false, null, null, false),
    (sec, 7, 'yes_no', 'Grilled Chicken is correct color', false, null, null, false),
    (sec, 8, 'yes_no', 'Grilled filet is free of excessive carbon build up', false, null, null, false),
    (sec, 9, 'yes_no', 'There are 2 whole slices of tomato? (3/16" thick)', false, null, null, false),
    (sec, 10, 'yes_no', 'There are 2 pieces Green Leaf lettuce leaves on grilled sandwich?', false, null, null, false),
    (sec, 11, 'yes_no', 'Is a Sleeve present and facing correctly ?', false, null, null, false),
    (sec, 12, 'yes_no', 'Multigrain Brioche bun is not torn or crushed, with no flaking or peeling', false, null, null, false),
    (sec, 13, 'yes_no', 'Multigrain Brioche bun heel & crown is toasted evenly to correct color', false, null, null, false),
    (sec, 14, 'yes_no', 'Multigrain Brioche bun heel & crown is toasted evenly to correct color', false, null, null, false),
    (sec, 15, 'yes_no', 'Tomato slices have no visible core, no hole in center, no end slices', false, null, null, false),
    (sec, 16, 'yes_no', 'Does the bun taste fresh and toasted properly, based on experience?', false, null, null, false),
    (sec, 17, 'yes_no', 'Does the Grilled Chicken Sandwich filet taste properly marinated and free of carbon flavor, based on experience?', false, null, null, false),
    (sec, 18, 'yes_no', 'Is the Grilled Chicken Sandwich balanced by a ripe tomato and fresh lettuce texture, based on experience?', false, null, null, false),
    (sec, 19, 'yes_no', 'Does the Grilled Chicken Sandwich have the proper texture, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Food Test - Fries', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Finished Product: Waffle Potato Fries', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 1, 'yes_no', 'Does Fries Meet Weight Requirements (SM - 3oz - 4oz / M - 4.2oz - 5.2oz / L - 5.6oz - 6.7oz)', false, null, null, false),
    (sec, 2, 'yes_no', 'Waffle Potato Fry package appears full', false, null, null, false),
    (sec, 3, 'yes_no', 'Fries meet color requirements', false, null, null, false),
    (sec, 4, 'yes_no', 'Internal temperature of fries are 170°F or higher out of hot holding (chutes)', false, null, null, false),
    (sec, 5, 'yes_no', 'Fries are evenly cooked (crisp on outside and soft inside) not scorched, or soggy', false, null, null, false),
    (sec, 6, 'yes_no', 'There is not an excessive number of small pieces', false, null, null, false),
    (sec, 7, 'yes_no', 'Are the Waffle Potato Fries salted correctly, based on experience?', false, null, null, false),
    (sec, 8, 'yes_no', 'Do the Waffle Potato Fries have the correct texture, based on experience?', false, null, null, false),
    (sec, 9, 'yes_no', 'Do the Waffle Potato Fries have the proper taste, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('QIV - Fries', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooking Waffle Potato Fries', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Frozen Waffle Potato Fries are lowered into oil immediately when placed in basket', false, null, null, false),
    (sec, 1, 'yes_no', 'Basket is gently shaken immediately after being lowered into oil to separate product', false, null, null, false),
    (sec, 2, 'yes_no', 'Correct cook button used', false, null, null, false),
    (sec, 3, 'yes_no', 'Basket is gently shaken 3-5 times Throughout cooking process', false, null, null, false),
    (sec, 4, 'yes_no', 'Waffle Fries are salted with approved salt dispenser and appropriate portion (number of clicks) based on batch size (2 Clicks)', false, null, null, false),
    (sec, 5, 'yes_no', 'Basket is drained, but for no more than 5 seconds, over open fryer', false, null, null, false),
    (sec, 6, 'yes_no', 'After draining Waffle Fries are transferred within 5 seconds to warming station', false, null, null, false),
    (sec, 7, 'yes_no', 'Salt is above the minimum fill line in the dispenser', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Holding: Waffle Potato Fries', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Once packaged, Waffle Potato Fries are served no longer than 2 minutes', false, null, null, false),
    (sec, 1, 'yes_no', 'Waffle Potato Fries are not served more than a total of 5 minutes (3 minutes in well)', false, null, null, false),
    (sec, 2, 'yes_no', 'Fries past quality timers are discarded', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Finished Product: Waffle Potato Fries', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 1, 'yes_no', 'Does Fries Meet Weight Requirements (SM - 3oz - 4oz / M - 4.2oz - 5.2oz / L - 5.6oz - 6.7oz)', false, null, null, false),
    (sec, 2, 'yes_no', 'Waffle Potato Fry package appears full', false, null, null, false),
    (sec, 3, 'yes_no', 'Fries meet color requirements', false, null, null, false),
    (sec, 4, 'yes_no', 'Internal temperature of fries are 170°F or higher out of hot holding (chutes)', false, null, null, false),
    (sec, 5, 'yes_no', 'Fries are evenly cooked (crisp on outside and soft inside) not scorched, or soggy', false, null, null, false),
    (sec, 6, 'yes_no', 'There is not an excessive number of small pieces', false, null, null, false),
    (sec, 7, 'yes_no', 'Are the Waffle Potato Fries salted correctly, based on experience?', false, null, null, false),
    (sec, 8, 'yes_no', 'Do the Waffle Potato Fries have the correct texture, based on experience?', false, null, null, false),
    (sec, 9, 'yes_no', 'Do the Waffle Potato Fries have the proper taste, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Food Test - Filet', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Chicken & Spicy Sandwich', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Pickles are not hanging off bun heel', false, null, null, false),
    (sec, 1, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 2, 'yes_no', 'Top of foil bag is pressed in and folded down twice (each fold 1⁄2” in width) to cover and secure opening', false, null, null, false),
    (sec, 3, 'yes_no', 'Internal temperature of cooked chicken is 140°F or higher out of hot holding (chutes)', false, null, null, false),
    (sec, 4, 'yes_no', 'Weight of cooked filet is at least 3.3 oz (Spicy is at least 3.4oz)', false, null, null, false),
    (sec, 5, 'yes_no', 'Filet has acceptable bun coverage', false, null, null, false),
    (sec, 6, 'yes_no', 'Chicken filet is golden brown in appearance', false, null, null, false),
    (sec, 7, 'yes_no', 'Filet is entirely covered in a generous layer of seasoned coater, free of large lumps or uncooked coater', false, null, null, false),
    (sec, 8, 'yes_no', 'Pickles are spread out on center of bun bottom (heel); overlapped by no more than a quarter of pickle area', false, null, null, false),
    (sec, 9, 'yes_no', 'Does the bun have a fresh taste, based on experience?', false, null, null, false),
    (sec, 10, 'yes_no', 'Is the Chicken Sandwich balanced by a vinegar flavor, based on experience?', false, null, null, false),
    (sec, 11, 'yes_no', 'Does butter and toast on bun create proper caramelization, based on experience?', false, null, null, false),
    (sec, 12, 'yes_no', 'Is the texture of the Sandwich filet correct, based on experience?', false, null, null, false),
    (sec, 13, 'yes_no', 'Does the bun have a fresh taste, based on experience?', false, null, null, false),
    (sec, 14, 'yes_no', 'Bun is not torn or crushed, with no flaking or peeling', false, null, null, false),
    (sec, 15, 'yes_no', 'Bun heel & crown is toasted evenly to correct color', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('QIV - Filet', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Fileting Raw Chick-fil-A Chicken', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is the Filet less than 0.65 inch thick to ensure proper cook temp ?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is Filet more than 0.45 inch thick to ensure proper taste experience ?', false, null, null, false),
    (sec, 2, 'yes_no', 'is the Filet Roller being used when fileting chicken ?', false, null, null, false),
    (sec, 3, 'yes_no', 'Are Raw filets free of loose/hanging fat, bone fragments, veins, blood spots and cartilage ?', false, null, null, false),
    (sec, 4, 'yes_no', 'Is Each raw chicken pan is dedicated to one type of raw chicken ?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Breading Raw Filets', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Raw filets are held by tips', false, null, null, false),
    (sec, 1, 'yes_no', '1-2 raw filets dipped into milk and egg wash at a time', false, null, null, false),
    (sec, 2, 'yes_no', 'Raw chicken is fully submerged into milk and egg wash', false, null, null, false),
    (sec, 3, 'yes_no', 'Raw filets are drained using a gentle, shaking motion', false, null, null, false),
    (sec, 4, 'yes_no', 'When breading raw chicken, no more than two filets at a time, were placed in the seasoned coater.', false, null, null, false),
    (sec, 5, 'yes_no', 'Raw chicken is placed smooth side down', false, null, null, false),
    (sec, 6, 'yes_no', 'Raw chicken is firmly pressed down on both sides with full upper body weight', false, null, null, false),
    (sec, 7, 'yes_no', 'Raw chicken is completely and generously covered with evenly-distributed seasoned coater', false, null, null, false),
    (sec, 8, 'yes_no', 'Breaded raw chicken filets are transferred in correct transfer pan without delay', false, null, null, false),
    (sec, 9, 'yes_no', 'Seasoned coater pans have 2”-3” of coater at all times', false, null, null, false),
    (sec, 10, 'yes_no', 'Is seasoned coater being rubbed off gloves into their appropriate pans.', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooking Filets', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Filets are loaded correctly with rough side facing down onto shelves of tiered basket', false, null, null, false),
    (sec, 1, 'yes_no', 'Filets are not overlapping on shelves', false, null, null, false),
    (sec, 2, 'yes_no', 'When loading Filets place on the second to last tier to the second to top tier if loading (1-12) / the second to last tier to top if (13 -18) / All tiers if (19 -24)', false, null, null, false),
    (sec, 3, 'yes_no', 'Tiered/half basket is lowered into oil, immediately raised about 4” and then lowered again to prevent chicken from sticking to shelves', false, null, null, false),
    (sec, 4, 'yes_no', 'Lid is closed correctly (with spindle turned clockwise until tight)', false, null, null, false),
    (sec, 5, 'yes_no', 'Product button is pressed immediately after lid is closed to start cooking cycle', false, null, null, false),
    (sec, 6, 'yes_no', 'CFA filets are cooked in a machine set to pressure mode', false, null, null, false),
    (sec, 7, 'yes_no', 'Pressure registers in the green “Operating Zone” during the cooking cycle', false, null, null, false),
    (sec, 8, 'yes_no', 'Pressure is not escaping from the Henny Penny during the cooking cycle', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Chicken & Spicy Sandwich', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Pickles are not hanging off bun heel', false, null, null, false),
    (sec, 1, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 2, 'yes_no', 'Top of foil bag is pressed in and folded down twice (each fold 1⁄2” in width) to cover and secure opening', false, null, null, false),
    (sec, 3, 'yes_no', 'Internal temperature of cooked chicken is 140°F or higher out of hot holding (chutes)', false, null, null, false),
    (sec, 4, 'yes_no', 'Weight of cooked filet is at least 3.3 oz (Spicy is at least 3.4oz)', false, null, null, false),
    (sec, 5, 'yes_no', 'Filet has acceptable bun coverage', false, null, null, false),
    (sec, 6, 'yes_no', 'Chicken filet is golden brown in appearance', false, null, null, false),
    (sec, 7, 'yes_no', 'Filet is entirely covered in a generous layer of seasoned coater, free of large lumps or uncooked coater', false, null, null, false),
    (sec, 8, 'yes_no', 'Pickles are spread out on center of bun bottom (heel); overlapped by no more than a quarter of pickle area', false, null, null, false),
    (sec, 9, 'yes_no', 'Does the bun have a fresh taste, based on experience?', false, null, null, false),
    (sec, 10, 'yes_no', 'Is the Chicken Sandwich balanced by a vinegar flavor, based on experience?', false, null, null, false),
    (sec, 11, 'yes_no', 'Does butter and toast on bun create proper caramelization, based on experience?', false, null, null, false),
    (sec, 12, 'yes_no', 'Is the texture of the Sandwich filet correct, based on experience?', false, null, null, false),
    (sec, 13, 'yes_no', 'Does the bun have a fresh taste, based on experience?', false, null, null, false),
    (sec, 14, 'yes_no', 'Bun is not torn or crushed, with no flaking or peeling', false, null, null, false),
    (sec, 15, 'yes_no', 'Bun heel & crown is toasted evenly to correct color', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Closing - Dining Room & Playground', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dining Room', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Sweep dining room', false, null, null, false),
    (sec, 1, 'yes_no', 'Wipe off all tables', false, null, null, true),
    (sec, 2, 'yes_no', 'Wipe off booths', false, null, null, true),
    (sec, 3, 'yes_no', 'Wipe off chairs', false, null, null, true),
    (sec, 4, 'yes_no', 'Empty inside trash receptacles', false, null, null, false),
    (sec, 5, 'yes_no', 'Empty both patio trash receptacles', false, null, null, true),
    (sec, 6, 'yes_no', 'Wipe high chairs and replace placemat', false, null, null, false),
    (sec, 7, 'yes_no', 'Sweep Entrance & Rugs', false, null, null, false),
    (sec, 8, 'yes_no', 'Hang Rugs on Rails', false, null, null, false),
    (sec, 9, 'yes_no', 'Wipe doors and windows in vestibule', false, null, null, false),
    (sec, 10, 'yes_no', 'Put blinds up evenly', false, null, null, false),
    (sec, 11, 'yes_no', 'Wipe smudges and hand prints off windows', false, null, null, false),
    (sec, 12, 'yes_no', 'Shades at Level Position to BlackBar', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Playground', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Use Special disinfectant on playground on equipment', false, null, null, false),
    (sec, 1, 'yes_no', 'Clean the inside playground with multi-surface (1) and sanitizer spray (2)', false, null, null, false),
    (sec, 2, 'yes_no', 'Sweep and Vacuum the floor: Vacuum those hard-to-reach places with the shop vac', false, null, null, true),
    (sec, 3, 'yes_no', 'Clean windows and doors with a multi-surface spray', false, null, null, true),
    (sec, 4, 'yes_no', 'Clean and sanitize the toddler area', false, null, null, true),
    (sec, 5, 'yes_no', 'Clean any visible garbage in the cubbies and throughout the playground', false, null, null, true),
    (sec, 6, 'yes_no', 'Ensure the inside of the playground and steps are properly cleaned', false, null, null, true),
    (sec, 7, 'yes_no', 'Clean under the slide', false, null, null, true),
    (sec, 8, 'yes_no', 'Clean scuff marks on the slide with a magic eraser', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Bathroom', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Empty trash', false, null, null, false),
    (sec, 1, 'yes_no', 'Sweep floors', false, null, null, false),
    (sec, 2, 'yes_no', 'Stock TP and Paper Towels', false, null, null, false),
    (sec, 3, 'yes_no', 'Wipe down bottom of doors in both bathrooms and back door entering the kitchen', false, null, null, false),
    (sec, 4, 'yes_no', 'Empty Women''s Room Trash Cans', false, null, null, true);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('FOH Closing - Lemonades', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Turn off Lemonade machine', false, null, null, false),
    (sec, 1, 'yes_no', 'Drain Lemonade & Coffee Base', false, null, null, false),
    (sec, 2, 'yes_no', 'Place leftover lemonade & Coffee Base in cooler (with label)', false, null, null, false),
    (sec, 3, 'yes_no', 'Ensure dishes are taken back', false, null, null, false),
    (sec, 4, 'yes_no', 'Clean Lemonade machine (ensure it is completely clean, no pulp residue)', false, null, null, false),
    (sec, 5, 'yes_no', 'Repeat steps on other lemonade machine', false, null, null, false),
    (sec, 6, 'yes_no', 'Wipe off counter underneath/around machine', false, null, null, false),
    (sec, 7, 'yes_no', 'Wash lemonade parts with soapy water in the prep sink and ensure sink is clean of any residue once it is done being used', false, null, null, false),
    (sec, 8, 'yes_no', 'Bring up Lemonde dishes once cleaned', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Morning BOH Catering', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure TMS bags are plugged in for daily catering', false, null, null, false),
    (sec, 1, 'yes_no', 'Print receipts for all catering orders that business day', false, null, null, false),
    (sec, 2, 'yes_no', 'Confirm Departure times of delivery orders with FOH', false, null, null, false),
    (sec, 3, 'yes_no', 'Bring up Trays for all catering''s for the day', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Night BOH Catering', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure TMS bags are unplugged if day is completed', false, null, null, false),
    (sec, 1, 'yes_no', 'Check next day''s catering orders and prep any cold items, cookies/brownies', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Trash/Raw Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Trash/Raw', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Take out all trash', false, null, null, false),
    (sec, 1, 'yes_no', 'Close Dumpster lids and doors', false, null, null, false),
    (sec, 2, 'yes_no', 'Clean mop sink', false, null, null, false),
    (sec, 3, 'yes_no', 'Clean trash cart', false, null, null, false),
    (sec, 4, 'yes_no', 'Spray all trash cans/dust pans', false, null, null, false),
    (sec, 5, 'yes_no', 'Beverage area clean & cups thrown out', false, null, null, false),
    (sec, 6, 'yes_no', 'Ensure all towels/mop heads are in the dirty towel bin', false, null, null, false),
    (sec, 7, 'yes_no', 'Dumpster Pad is cleaned', false, null, null, true),
    (sec, 8, 'yes_no', 'Ensure all spray bottles are in utility cabinet', false, null, null, false),
    (sec, 9, 'yes_no', 'Catering Warmer Bags are turned off', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Breading Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Breading', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Clean both breading tables', false, null, null, false),
    (sec, 1, 'yes_no', 'Clean rotation table', false, null, null, false),
    (sec, 2, 'yes_no', 'Cleaning Holding Cabinet Door', false, null, null, false),
    (sec, 3, 'yes_no', 'Clean Thawing Cabinet Doors', false, null, null, false),
    (sec, 4, 'yes_no', '4 Milkwash Ready', false, null, null, false),
    (sec, 5, 'yes_no', 'Are "USE FIRST" clips present and used correctly to identify the longest-held tray for each product in the thaw cabinets?', false, null, null, false),
    (sec, 6, 'yes_no', 'Is an accurate date label & control label applied to each row in the thawing cabinets?', false, null, null, false),
    (sec, 7, 'yes_no', 'Does all fileted/thawed chicken in the lower cavity of the breading table have a date label & control label?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Brand Ambassador WHED Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'multi_choice', 'What daypart is it currently?', false, '["Breakfast","Lunch","Afternoon (3-5)","Dinner","Night (8-10)"]'::jsonb, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Genuine Hospitality - Front Counter', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Team Members polo shirts are tucked in and Chick-fil-A belt is worn?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are team members are wearing Chick-fil-A outerwear?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is silver nametag is visible on Team Member''s right chest?', false, null, null, false),
    (sec, 3, 'multi_choice', 'Observe a TM take an order: Did they exhibit the CORE 4?', false, '["Shared a smile","Make eye contact","Speak with a friendly tone","Said my pleasure"]'::jsonb, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Genuine Hospitality- Drive Thru', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Team Members polo shirts are tucked in and Chick-fil-A belt is worn?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are team members are wearing Chick-fil-A outerwear?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is silver nametag is visible on Team Member''s right chest?', false, null, null, false),
    (sec, 3, 'multi_choice', 'Observe a TM: Did they exhibit the CORE 4? Select all that apply', false, '["Shared a smile","Make eye contact","Speak with a friendly tone","Said my pleasure"]'::jsonb, null, false),
    (sec, 4, 'multi_choice', 'What position are they on?', false, '["iPOS","Expo"]'::jsonb, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Fast and Accurate Service', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Observe a TM take an order: What position are they on?', false, null, null, false),
    (sec, 1, 'yes_no', 'Did the Team Member ask the customer for their choice of sauce(s)?', false, null, null, false),
    (sec, 2, 'yes_no', 'Did the team member ask for 1 or 2 sauces?', false, null, null, false),
    (sec, 3, 'yes_no', 'Did the Team Member confirm the order?', false, null, null, false),
    (sec, 4, 'yes_no', 'Was a receipt given to the guest?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Clean and Safe Environment', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Order Takers and EXPO: Is yellow reflective vest being worn?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are indoor trash receptacles not overfull/overflowing?', false, null, null, false),
    (sec, 2, 'yes_no', 'Are outdoor trash receptacles not overfull/overflowing?', false, null, null, false),
    (sec, 3, 'multi_choice', 'In female restrooms:', false, '["Are the trash receptacles overfull/overflowing?","Are the paper towels stocked and dispensing in the restroom?","Is there toilet paper available in the restroom stall?"]'::jsonb, null, false),
    (sec, 4, 'multi_choice', 'In male restrooms:', false, '["Are the trash receptacles overfull/overflowing?","Are the paper towels stocked and dispensing in the restroom?","Is there toilet paper available in the restroom stall?"]'::jsonb, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Brand Ambassador Sign Off', false, null, null, false),
    (sec, 1, 'text', 'Shift Supervisor/Team Lead Sign Off', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Brand Ambassador Systems Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'iPads', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is the iPOS 1 Useable & Rechargeable?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is the iPOS 2 Useable & Rechargeable?', false, null, null, false),
    (sec, 2, 'yes_no', 'Is the iPOS 3 Useable & Rechargeable?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the M$ 4 Useable & Rechargeable?', false, null, null, false),
    (sec, 4, 'yes_no', 'Is the iPad 5 Useable & Rechargeable?', false, null, null, false),
    (sec, 5, 'yes_no', 'Is the Mobile-Thru iPAD Useable & Rechargeable?', false, null, null, false),
    (sec, 6, 'yes_no', 'Is the M$ 6 Useable & Rechargeable?', false, null, null, false),
    (sec, 7, 'yes_no', 'Is the iPOS 7 Useable & Rechargeable?', false, null, null, false),
    (sec, 8, 'yes_no', 'Is the M$ 8 Useable & Rechargeable?', false, null, null, false),
    (sec, 9, 'yes_no', 'Is the BOH Useable & Rechargeable?', false, null, null, false),
    (sec, 10, 'yes_no', 'Is the iPOS 11 Useable & Rechargeable?', false, null, null, false),
    (sec, 11, 'yes_no', 'Is the iPad 12 Useable & Rechargeable?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Portable Chargers', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Please input the amount of USABLE portable chargers.', false, null, null, false),
    (sec, 1, 'text', 'Please input the amount of UNUSABLE portable chargers.', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Card Readers', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Please input the amount of USABLE card readers.', false, null, null, false),
    (sec, 1, 'text', 'Please input the amount of UNUSABLE card readers.', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'iPOS Chargers', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Please input the amount of USABLE cables. Can it charge your phone and an iPad?', false, null, null, false),
    (sec, 1, 'text', 'Please input the amount of UNUSABLE cables', false, null, null, false),
    (sec, 2, 'text', 'Card Reader Chargers (non-iPhone chargers)', false, null, null, false),
    (sec, 3, 'yes_no', 'Are all iPOS iPads in good Condition? (Cracks, Broken Buttons, etc )', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Menus/Sunshades/Vests/Clips', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Menus: Please insert the number of USABLE menus and cheat sheets we have including the ones outside', false, null, null, false),
    (sec, 1, 'text', 'Sunshades/Clips: Please insert the number of USABLE sunshades and clips we have', false, null, null, false),
    (sec, 2, 'text', 'Reflective Vests: Please insert the number of USUABLE Reflective vests', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Confirmation', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'To Confirm there is an equual amount of all equipment needed?', false, null, null, false),
    (sec, 1, 'text', 'Brand Ambassador Sign Off', false, null, null, false),
    (sec, 2, 'text', 'Shift Supervisor/Team Lead Sign Off', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Brand Ambassador Outlook Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'What is the current daypart?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Trainee', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Name of team member', false, null, null, false),
    (sec, 1, 'text', 'Position the team member is working on', false, null, null, false),
    (sec, 2, 'text', 'What did the team member know about the Core-4?', false, null, null, false),
    (sec, 3, 'text', 'How do we ask for sauces?', false, null, null, false),
    (sec, 4, 'text', 'What do you do when a door dasher walks in and is waiting for their order?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Fully trained team member', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Name of team member', false, null, null, false),
    (sec, 1, 'text', 'Position the team member is working on', false, null, null, false),
    (sec, 2, 'text', 'What did the team member know about the Core-4?', false, null, null, false),
    (sec, 3, 'text', 'How do we ask for sauces?', false, null, null, false),
    (sec, 4, 'text', 'What do you do when a door dasher walks in and is waiting for their order?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Brand Ambassador Level (Fully Trained & Fast)', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Name of team member:', false, null, null, false),
    (sec, 1, 'text', 'Position the team member is working on', false, null, null, false),
    (sec, 2, 'text', 'What did the team member know about the Core-4?', false, null, null, false),
    (sec, 3, 'text', 'How do we ask for sauces?', false, null, null, false),
    (sec, 4, 'yes_no', 'What do you do when a door dasher walks in and is waiting for their order?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'OGs (Been here since you can remember)', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Name of team member:', false, null, null, false),
    (sec, 1, 'text', 'Position the team member is working on', false, null, null, false),
    (sec, 2, 'text', 'What did the team member know about the Core-4?', false, null, null, false),
    (sec, 3, 'text', 'How do we ask for sauces?', false, null, null, false),
    (sec, 4, 'text', 'What do you do when a door dasher walks in and is waiting for their order?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Order Taker Observations', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'You must ask the shift supervisor on duty who they would like you to observe for today. Please insert the name of the team member that they choose down below:', false, null, null, false),
    (sec, 1, 'yes_no', 'Greeted the guest with a smile and asked for their name', false, null, null, false),
    (sec, 2, 'yes_no', 'Asked for order destination and inputs information accordingly (ex. dine-in and carry out)', false, null, null, false),
    (sec, 3, 'yes_no', 'Asked clarifying questions and confirming the items that are being rung up', false, null, null, false),
    (sec, 4, 'yes_no', 'Used upgraded language (beverage, guest, serve, etc.)', false, null, null, false),
    (sec, 5, 'yes_no', 'Communicated to guest effectively', false, null, null, false),
    (sec, 6, 'yes_no', 'Displayed the Core 4', false, null, null, false),
    (sec, 7, 'yes_no', 'Repeated the whole order at the end.', false, null, null, false),
    (sec, 8, 'yes_no', 'Was quick but did not seem rushed', false, null, null, false),
    (sec, 9, 'yes_no', 'Do you think the guest would be satisfied with their experience today?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 6) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'text', 'Brand Ambassador Sign Off', false, null, null, false),
    (sec, 1, 'text', 'Shift Supervisor/Team Lead Sign Off', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Bi-Weekly Clean Prep', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Racks above prep table', false, null, null, false),
    (sec, 1, 'yes_no', 'Walls behind lemonade table', false, null, null, false),
    (sec, 2, 'yes_no', 'Prep sinks inside/outside, wall above sink', false, null, null, false),
    (sec, 3, 'yes_no', 'Walls behind prep fridge', false, null, null, false),
    (sec, 4, 'yes_no', 'Deep clean top of prep table', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Prep Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cleaning', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'All dividers are cleaned and located inside the upper cavity', false, null, null, false),
    (sec, 1, 'yes_no', 'The lower & upper cavity of the prep table is clean', false, null, null, false),
    (sec, 2, 'yes_no', 'The outside of the prep table is clean (Sides Included)', false, null, null, false),
    (sec, 3, 'yes_no', 'All handles doors inside/outside on prep tables', false, null, null, false),
    (sec, 4, 'yes_no', 'Mixing table top & bottom', false, null, null, false),
    (sec, 5, 'yes_no', 'Lemonade table top and bottom also faucet', false, null, null, false),
    (sec, 6, 'yes_no', 'Wipe down sugar bin', false, null, null, false),
    (sec, 7, 'yes_no', 'All prep related dishes have been brought back to dishes (Sanitizer Included)', false, null, null, false),
    (sec, 8, 'yes_no', 'All prep items in the lower cavity have a new date label', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Machines Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Machines', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure ALL cords are off the ground.', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure all daily filters are complete on fryers', false, null, null, false),
    (sec, 2, 'yes_no', 'Turn off and final clean inside of fryers', false, null, null, false),
    (sec, 3, 'yes_no', 'Wipe down outside of fryers', false, null, null, false),
    (sec, 4, 'yes_no', 'Ensure fryer handles are in the correct position.', false, null, null, false),
    (sec, 5, 'yes_no', 'Ensure oil is up to the fill line.', false, null, null, false),
    (sec, 6, 'yes_no', 'Turn off and clean grills', false, null, null, false),
    (sec, 7, 'yes_no', 'Empty grease traps inside fryers', false, null, null, false),
    (sec, 8, 'yes_no', 'Clean/Empty grease traps', false, null, null, false),
    (sec, 9, 'yes_no', 'Kanban Queue cleared of food residue', false, null, null, false),
    (sec, 10, 'yes_no', 'Wipe down thawing cabinets', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Great Food Audit - Nuggets', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Chutes following LCD iPad & not overstocked?', false, null, null, false),
    (sec, 1, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, true),
    (sec, 2, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, false),
    (sec, 3, 'temperature', 'Internal temperature of cooked Nuggets & Strips is 140°F', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 4, 'yes_no', 'There are no scraps in Nuggets/Strips box', false, null, null, true),
    (sec, 5, 'yes_no', 'The correct amount of Nuggets/Strips are in the box', false, null, null, false),
    (sec, 6, 'yes_no', 'Nuggets meet color requirements', false, null, null, false),
    (sec, 7, 'yes_no', 'Minimum packaged weight is met (Nuggets: 5ct - 2.8 / 8ct - 4.2 12ct - 6.2 30ct - 17.2', false, null, null, false),
    (sec, 8, 'yes_no', 'Nuggets are entirely covered in a generous layer of seasoned coater, free of large lumps or uncooked coater', false, null, null, false),
    (sec, 9, 'yes_no', 'Is the texture of the Nuggets correct, based on experience?', false, null, null, false),
    (sec, 10, 'yes_no', 'Does the Nuggets have proper flavor and free of old oil taste, based on experience? (Sweet/Salty?)', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('BOH Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Boards', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Counters/centerline has NO FOOD RESIDUE', false, null, null, false),
    (sec, 1, 'yes_no', 'All cooldown chicken taken into freezer/cooler (Be sure to label)', false, null, null, false),
    (sec, 2, 'yes_no', 'All equipment turned off', false, null, null, false),
    (sec, 3, 'yes_no', 'Pull out toasters and wipe under & Clean Teflon', false, null, null, false),
    (sec, 4, 'yes_no', 'Daily filters complete on fryers', false, null, null, false),
    (sec, 5, 'yes_no', 'Clean/Empty grease traps', false, null, null, false),
    (sec, 6, 'yes_no', 'Wipe down all hand sinks', false, null, null, false),
    (sec, 7, 'yes_no', 'Pull out boxes under dry area and wipe down shelving', false, null, null, false),
    (sec, 8, 'yes_no', 'Stock fry coolers', false, null, null, false),
    (sec, 9, 'yes_no', 'Clean Merco warming station', false, null, null, false),
    (sec, 10, 'yes_no', 'Ensure oil is up to the fill line', false, null, null, false),
    (sec, 11, 'yes_no', 'Pull out fridges and wipe down inside and out', false, null, null, false),
    (sec, 12, 'yes_no', 'Empty and wipe down rethermalizer', false, null, null, false),
    (sec, 13, 'yes_no', 'Cover all cheese, lettuce and tomatoes with food film and label', false, null, null, false),
    (sec, 14, 'yes_no', 'Empty and wipe down soup warmer', false, null, null, false),
    (sec, 15, 'yes_no', 'Lunch Dishes are put back', false, null, null, false),
    (sec, 16, 'yes_no', 'Breakfast Dishes are put back', false, null, null, false),
    (sec, 17, 'yes_no', 'Hasbrown in Secondary Freezer', false, null, null, false),
    (sec, 18, 'yes_no', 'Both Salt Shaker is cleaned', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Machines', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure ALL cords are off the ground.', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure all daily filters are complete on fryers', false, null, null, false),
    (sec, 2, 'yes_no', 'Turn off and final clean inside of fryers', false, null, null, false),
    (sec, 3, 'yes_no', 'Wipe down outside of fryers', false, null, null, false),
    (sec, 4, 'yes_no', 'Ensure fryer handles are in the correct position.', false, null, null, false),
    (sec, 5, 'yes_no', 'Ensure oil is up to the fill line.', false, null, null, false),
    (sec, 6, 'yes_no', 'Turn off and clean grills', false, null, null, false),
    (sec, 7, 'yes_no', 'Empty grease traps inside fryers', false, null, null, false),
    (sec, 8, 'yes_no', 'Clean/Empty grease traps', false, null, null, false),
    (sec, 9, 'yes_no', 'Kanban Queue cleared of food residue', false, null, null, false),
    (sec, 10, 'yes_no', 'Wipe down thawing cabinets', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Breading', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Clean both breading tables', false, null, null, false),
    (sec, 1, 'yes_no', 'Clean rotation table', false, null, null, false),
    (sec, 2, 'yes_no', 'Cleaning Holding Cabinet Door', false, null, null, false),
    (sec, 3, 'yes_no', 'Clean Thawing Cabinet Doors', false, null, null, false),
    (sec, 4, 'yes_no', '4 Milkwash Ready', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dishes', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Clean compartment sink', false, null, null, false),
    (sec, 1, 'yes_no', 'Put away dishes in correct spot', false, null, null, false),
    (sec, 2, 'yes_no', 'Clean dirty dish rack', false, null, null, false),
    (sec, 3, 'yes_no', 'Clean inside & outside of dishwasher', false, null, null, false),
    (sec, 4, 'yes_no', 'Clean nearby stainless steel.', false, null, null, false),
    (sec, 5, 'yes_no', 'Ensure all dishes are washed', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Trash/Raw', 4) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Take out all trash', false, null, null, false),
    (sec, 1, 'yes_no', 'Close Dumpster lids and doors', false, null, null, false),
    (sec, 2, 'yes_no', 'Clean mop sink', false, null, null, false),
    (sec, 3, 'yes_no', 'Clean trash cart', false, null, null, false),
    (sec, 4, 'yes_no', 'Spray all trash cans/dust pans', false, null, null, false),
    (sec, 5, 'yes_no', 'Beverage area clean & cups thrown out', false, null, null, false),
    (sec, 6, 'yes_no', 'Ensure all towels/mop heads are in the dirty towel bin', false, null, null, false),
    (sec, 7, 'yes_no', 'Dumpster Pad is cleaned', false, null, null, true),
    (sec, 8, 'yes_no', 'Ensure all spray bottles are in utility cabinet', false, null, null, false),
    (sec, 9, 'yes_no', 'Catering Warmer Bags are turned off', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Leaders', 5) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Ensure Corn & Bean is rotation is complete', false, null, null, false),
    (sec, 1, 'yes_no', 'Ensure Mac & Cheese rotation is complete', false, null, null, false),
    (sec, 2, 'yes_no', 'Bun & Chicken Count Updated', false, null, null, false),
    (sec, 3, 'yes_no', 'All Team Members completed their checklists', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Great Food Audit - Waffle Potato Fries', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Packaged Waffle Potato Fries are not served after 2 minutes', false, null, null, false),
    (sec, 1, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, true),
    (sec, 2, 'yes_no', 'Waffle Potato Fry package appears full', false, null, null, false),
    (sec, 3, 'yes_no', 'Does Fries Meet Weight Requirements (SM - 3.4 / M - 4.4 / L - 6.4)', false, null, null, false),
    (sec, 4, 'yes_no', 'Fries meet color requirements', false, null, null, false),
    (sec, 5, 'temperature', 'Internal temperature of fries are 170°F or higher out of hot holding (chutes)', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 6, 'yes_no', 'There is not an excessive number of small pieces', false, null, null, true),
    (sec, 7, 'yes_no', 'Are the Waffle Potato Fries salted correctly, based on experience?', false, null, null, false),
    (sec, 8, 'yes_no', 'Do the Waffle Potato Fries have the correct texture, based on experience?', false, null, null, false),
    (sec, 9, 'yes_no', 'Do the Waffle Potato Fries have the proper taste, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Great Food Audit - Grilled Sandwich', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Chutes following LCD iPad & not overstocked?', false, null, null, false),
    (sec, 1, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, true),
    (sec, 2, 'yes_no', 'Clamshell is securely closed with both locking tabs secured, product not protruding from clamshell.', false, null, null, true),
    (sec, 3, 'yes_no', 'Sandwich is served in sandwich sleeve inside clamshell', false, null, null, false),
    (sec, 4, 'yes_no', 'Best grill marks of grilled filet are facing up', false, null, null, true),
    (sec, 5, 'yes_no', 'Grilled Chicken is correct color', false, null, null, false),
    (sec, 6, 'temperature', 'Internal temperature of cooked chicken is 140°F or higher out of hot holding (chutes)', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 7, 'yes_no', 'Weight of cooked filet is at least 3.3 oz (Spicy is at least 3.4oz)', false, null, null, false),
    (sec, 8, 'yes_no', 'Grilled filet is free of excessive carbon build up', false, null, null, false),
    (sec, 9, 'yes_no', 'There are 2 whole slices (3 if small) of tomato? (3/16" thick)', false, null, null, false),
    (sec, 10, 'yes_no', 'There are 2 Green Leaf lettuce leaves on grilled sandwich?', false, null, null, false),
    (sec, 11, 'yes_no', 'Bun is not torn or crushed, with no flaking or peeling', false, null, null, true),
    (sec, 12, 'yes_no', 'Bun heel & crown is toasted evenly to correct color', false, null, null, true),
    (sec, 13, 'yes_no', 'Does the bun have a fresh taste, based on experience?', false, null, null, false),
    (sec, 14, 'yes_no', 'Does the Grilled Chicken Sandwich filet taste properly marinated and free of carbon flavor, based on experience?', false, null, null, false),
    (sec, 15, 'yes_no', 'Is the Grilled Chicken Sandwich balanced by a ripe tomato and fresh lettuce texture, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Great Food Audit - Chicken Sandwich', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Chutes following LCD iPad & not overstocked?', false, null, null, false),
    (sec, 1, 'yes_no', 'Outside of packaging is free of residue, product, or excessive fingerprints, or smudges due to handling', false, null, null, true),
    (sec, 2, 'yes_no', 'Top of foil bag is pressed in and folded down twice (each fold 1⁄2” in width) to cover and secure opening', false, null, null, true),
    (sec, 3, 'yes_no', 'Bun is not torn or crushed, with no flaking or peeling', false, null, null, true),
    (sec, 4, 'yes_no', 'Bun heel & crown is toasted evenly to correct color', false, null, null, true),
    (sec, 5, 'temperature', 'Internal temperature of cooked chicken is 140°F or higher out of hot holding (chutes)', false, '{"holding_mode":"cold"}'::jsonb, (select id from public.food_items where name = 'Cold Foods' limit 1), false),
    (sec, 6, 'yes_no', 'Weight of cooked filet is at least 3.3 oz (Spicy is at least 3.4oz)', false, null, null, false),
    (sec, 7, 'yes_no', 'Filet is entirely covered in a generous layer of seasoned coater, free of large lumps or uncooked coater', false, null, null, true),
    (sec, 8, 'yes_no', 'Chicken filet is golden brown in appearance', false, null, null, false),
    (sec, 9, 'yes_no', 'Pickles are not hanging off bun heel', false, null, null, false),
    (sec, 10, 'yes_no', 'Does the bun have a fresh taste, based on experience?', false, null, null, false),
    (sec, 11, 'yes_no', 'Is the Chicken Sandwich balanced by a vinegar flavor, based on experience?', false, null, null, false),
    (sec, 12, 'yes_no', 'Does butter and toast on bun create proper caramelization, based on experience?', false, null, null, false),
    (sec, 13, 'yes_no', 'Does the Chicken Sandwich filet have proper flavor and is free of old oil taste, based on experience?', false, null, null, false),
    (sec, 14, 'yes_no', 'Is the texture of the Sandwich filet correct, based on experience?', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Genuine Hospitality Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'General', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'multi_choice', 'Are performing a Dine-In or Carry-Out Order?', false, '["Dine-In","Carry-Out"]'::jsonb, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dine-In Experience', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Team Members are cleanly shaven or facial hair is short, neatly groomed', false, null, null, false),
    (sec, 1, 'yes_no', 'Are Team Members polo shirts are tucked in and TeamStyle belt is worn?', false, null, null, false),
    (sec, 2, 'yes_no', 'Team Members are wearing Chick-fil-A TeamStyle outerwear?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is Silver nametag is visible on Team Member''s right chest', false, null, null, false),
    (sec, 4, 'yes_no', 'At least one Team Member is available to take orders at front counter or queuing area at all times', false, null, null, false),
    (sec, 5, 'yes_no', 'Conversations between Team Members cease when Customer approaches front counter (in order to focus on the Customer order)', false, null, null, false),
    (sec, 6, 'yes_no', 'Did Team Members speak with a friendly tone of voice', false, null, null, false),
    (sec, 7, 'yes_no', 'Did Team Members create eye contact with Guests?', false, null, null, false),
    (sec, 8, 'yes_no', 'Did Team Members share a smile?', false, null, null, false),
    (sec, 9, 'yes_no', 'When thanked by Guest, Team Members responded with ''My Pleasure''', false, null, null, false),
    (sec, 10, 'yes_no', 'Table Marker is given to dine-in Guest, if the meal is not ready by end of Front Counter Transaction', false, null, null, false),
    (sec, 11, 'yes_no', 'Dine-in tray is used for delivering meal to dine-in Guest', false, null, null, false),
    (sec, 12, 'yes_no', 'Did you experience 2nd Mile Service Moment(s)?', false, null, null, false),
    (sec, 13, 'yes_no', 'Dining Room music is audible to guests unless noise created by customers is significant enough to make dining room music indiscernible', false, null, null, false),
    (sec, 14, 'yes_no', 'Condiment pods are stocked with high usage items', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Carry-Out Experience', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Team Members polo shirts are tucked in and TeamStyle belt is worn?', false, null, null, false),
    (sec, 1, 'yes_no', 'Team Members are cleanly shaven or facial hair is short, neatly groomed', false, null, null, false),
    (sec, 2, 'yes_no', 'Is Silver nametag is visible on Team Member''s right chest', false, null, null, false),
    (sec, 3, 'yes_no', 'Did Team Members create eye contact with Guests?', false, null, null, false),
    (sec, 4, 'yes_no', 'Did Team Member speak with a friendly tone of voice?', false, null, null, false),
    (sec, 5, 'yes_no', 'Did Team Member speak with a friendly tone of voice?', false, null, null, false),
    (sec, 6, 'yes_no', 'When thanked by Guest, Team Members responded with ''My Pleasure''', false, null, null, false),
    (sec, 7, 'yes_no', 'Did Team Member attempt meal delivery prior to placing meal on pickup shelf?', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Drive-Thru Experience', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Do Team Members appear attentive towards the guests? (Example Standing around in circles on phones/not paying attention)', false, null, null, false),
    (sec, 1, 'yes_no', 'Team Members are cleanly shaven or facial hair is short ,neatly groomed', false, null, null, false),
    (sec, 2, 'yes_no', 'Team Members are wearing Chick-fil-A TeamStyle pants, skirts or shorts for outside role', false, null, null, false),
    (sec, 3, 'yes_no', 'Are Team Members polo shirts are tucked in and TeamStyle belt is worn?', false, null, null, false),
    (sec, 4, 'yes_no', 'Are Team Members wearing Chick-fil-A TeamStyle outerwear?', false, null, null, false),
    (sec, 5, 'yes_no', 'Is Silver nametag is visible on Team Member''s right chest', false, null, null, false),
    (sec, 6, 'yes_no', 'Do Team Members create eye contact with Guests?', false, null, null, false),
    (sec, 7, 'yes_no', 'Did Team Members spoke with a friendly tone of voice', false, null, null, false),
    (sec, 8, 'yes_no', 'Did Team Members share a smile?', false, null, null, false),
    (sec, 9, 'yes_no', 'Before order was received, did team member greet the guest with their name?', false, null, null, false),
    (sec, 10, 'yes_no', 'When thanked by Guest, Team Members responded with ''My Pleasure''', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Fast & Accurate Service Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dine-In/Carry Out Experience', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'multi_choice', 'This is a Dine-In or Carry-Out Order?', false, '["Dine-In","Carry-Out"]'::jsonb, null, false),
    (sec, 1, 'yes_no', 'Did the Team Member ask the Customer for their choice of sauce(s)', false, null, null, false),
    (sec, 2, 'yes_no', 'Did the Team Member confirm the order', false, null, null, false),
    (sec, 3, 'yes_no', 'Did the Team Member confirm the order', false, null, null, false),
    (sec, 4, 'yes_no', 'Food and Beverage served correctly', false, null, null, false),
    (sec, 5, 'yes_no', 'Exterior of cup is clean and lid is seal properly', false, null, null, false),
    (sec, 6, 'yes_no', 'Served with paper goods and utensils', false, null, null, false),
    (sec, 7, 'yes_no', 'Condiments served correctly?', false, null, null, false),
    (sec, 8, 'yes_no', 'Was Honey Roasted BBQ served with the Grilled Chicken Sandwich', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Drive-Thru Experience', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Team Member offers handheld menu if Drive-Thru menu is not clearly visible to Customer', false, null, null, false),
    (sec, 1, 'yes_no', 'Did the Team Member ask the Customer for their choice of sauce(s)', false, null, null, false),
    (sec, 2, 'yes_no', 'Did the Team Member confirm the order', false, null, null, false),
    (sec, 3, 'yes_no', 'Receipt is given to Customer', false, null, null, false),
    (sec, 4, 'yes_no', 'Food and Beverage served correctly', false, null, null, false),
    (sec, 5, 'yes_no', 'Exterior of cup is clean and lid is seal properly', false, null, null, false),
    (sec, 6, 'yes_no', 'Correct dimple(s) is pressed on lid for flavor of drink', false, null, null, false),
    (sec, 7, 'yes_no', 'Served with paper goods and utensils', false, null, null, false),
    (sec, 8, 'yes_no', 'Condiments served correctly?', false, null, null, false),
    (sec, 9, 'yes_no', 'Was Honey Roasted BBQ served with the Grilled Chicken Sandwich', false, null, null, false),
    (sec, 10, 'yes_no', 'Before order was received, did team member confirm the guests name?', false, null, null, false),
    (sec, 11, 'yes_no', 'Once order was received, shopper could exit Drive-Thru line', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Clean & Safe Environment Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Team Member Appearance', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Team Members working inside the restaurant is wearing black slip-resistant shoes', false, null, null, false),
    (sec, 1, 'yes_no', 'Order Takers: Yellow, red or orange Hi-Vis reflective safety wear with 360-degree coverage is worn', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dine-In Experience', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Hand Sanitizer station is present within the restaurant dining/entry area', false, null, null, true),
    (sec, 1, 'yes_no', 'Hand sanitizer dispenser is stocked and dispensing', false, null, null, false),
    (sec, 2, 'yes_no', 'Are indoor trash receptacles not overfull/overflowing', false, null, null, true),
    (sec, 3, 'yes_no', 'Dining Room: Fluorescent lighting is functional and uniform in color, type and wattage and lenses are in good condition (not cracked or broken)', false, null, null, false),
    (sec, 4, 'yes_no', 'Menu Board: Fluorescent lighting is functional and uniform in color, type and wattage and lenses are in good condition (not cracked or broken)', false, null, null, false),
    (sec, 5, 'yes_no', 'Are outdoor trash receptacles not overfull/overflowing', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Outside of Building', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Dumpster gate/door is closed (when not in use)', false, null, null, false),
    (sec, 1, 'yes_no', 'Dumpster lid is closed (when not in use)', false, null, null, true),
    (sec, 2, 'yes_no', 'Is the Dumpster Pad swept and well maintained?', false, null, null, true),
    (sec, 3, 'yes_no', 'Is there an excessive amount of garbage near the back door area?', false, null, null, true),
    (sec, 4, 'yes_no', 'Back door of Restaurant is kept closed (when not in use)', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Bathroom Experience', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are the trash receptacles overfull/overflowing?', false, null, null, true),
    (sec, 1, 'yes_no', 'Hand sanitizer dispenser is stocked and dispensing in the restroom', false, null, null, false),
    (sec, 2, 'yes_no', 'Paper towels are stocked and dispensing in the restroom', false, null, null, false),
    (sec, 3, 'yes_no', 'If present, Baby changing station is clean and in good condition', false, null, null, true),
    (sec, 4, 'yes_no', 'Team Member hand-washing signage is present in the restroom', false, null, null, true),
    (sec, 5, 'yes_no', 'Fluorescent lighting is functional and uniform in color, type and wattage and lenses are in good condition (not cracked or broken)', false, null, null, true),
    (sec, 6, 'yes_no', 'Hand soap dispenser is stocked and dispensing in the restroom', false, null, null, false),
    (sec, 7, 'yes_no', 'Toilet paper is available in the restroom stall', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Prep Closing Checklist', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Prep Table', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'All dividers are cleaned and located inside the upper cavity', false, null, null, false),
    (sec, 1, 'yes_no', 'The lower cavity of the prep table is clean', false, null, null, false),
    (sec, 2, 'yes_no', 'The upper cavity of the prep table is clean', false, null, null, false),
    (sec, 3, 'yes_no', 'The outside of the prep table is clean (Sides Included)', false, null, null, false),
    (sec, 4, 'yes_no', 'The prep sink is clean and has no leftover food residue', false, null, null, false),
    (sec, 5, 'yes_no', 'All prep items in the lower cavity have a new date label', false, null, null, false),
    (sec, 6, 'yes_no', 'All handles doors inside/outside on prep tables', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Prep Bulk', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Lemonade table top and bottom also faucet', false, null, null, false),
    (sec, 1, 'yes_no', 'Mixing table mostly bottom', false, null, null, false),
    (sec, 2, 'yes_no', 'Wipe down sugar bin', false, null, null, false);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooler', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'There is 3 Buckets of Corn & Bean/Corn EACH located inside the cooler', false, null, null, false);
end $$;

do $$
declare tpl uuid; sec uuid;
begin
  insert into public.checklist_templates (name, description, active)
  values ('Prep Food Safety Audit', 'Imported from KitchenIQ (Farmingdale).', true) returning id into tpl;
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Prep Table Area', 0) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Do Sugar Bins have a Label?', false, null, null, false),
    (sec, 1, 'yes_no', 'Is Sugar Scoop stored inside the Sugar Bin with the handle up?', false, null, null, true),
    (sec, 2, 'yes_no', 'Is the Egg Slicer in it''s own container?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is prep tabled cleaned and well maintained?', false, null, null, true),
    (sec, 4, 'yes_no', 'Is area swept and free of tripping hazards?', false, null, null, true),
    (sec, 5, 'yes_no', 'Are all kanbans with prepared products properly dated and labeled?', false, null, null, false),
    (sec, 6, 'yes_no', 'Are foods properly dated & labeled in the lower cavity of the prep table?', false, null, null, false),
    (sec, 7, 'text', 'If you answered "no" to the prior question, please insert the items that were not properly labeled.', false, null, null, false),
    (sec, 8, 'temperature', 'Take temperature of the Romaine in the upper rail of the salad prep table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 9, 'temperature', 'Take temperature of the Lettuce/Cabbage blend in the upper rail of the salad prep table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 10, 'temperature', 'Take temperature of the Green Leaf in the upper rail of the salad prep table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 11, 'temperature', 'Take temperature of the Cheese Blend in the upper rail of the salad prep table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 12, 'temperature', 'Take temperature of the Spicy/Grilled chicken in the upper rail of the salad prep table', false, '{"holding_mode":"hot"}'::jsonb, (select id from public.food_items where name = 'Hot Foods' limit 1), false),
    (sec, 13, 'yes_no', 'Is the saber king slicer and all blade attachments properly cleaned and sanitized every 4 hours during continuous use? If the slicer is not in use, is the base and all blade attachments clean?', false, null, null, false),
    (sec, 14, 'yes_no', 'Using the appropriate test strips is produce wash at the proper concentration (0.751.0 oz/gal.)?', false, null, null, false),
    (sec, 15, 'yes_no', 'Is the salad spinner clean?', false, null, null, false),
    (sec, 16, 'yes_no', 'Is the bottom of the prep fridge cleaned and maintained?', false, null, null, true),
    (sec, 17, 'yes_no', 'Is the shelving above prep cleaned & maintained?', false, null, null, true),
    (sec, 18, 'yes_no', 'Is the shelving above the clean dishes cleaned & maintained?', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Dish Area', 1) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are Mac & Cheese Pans Properly Cleaned & Sanitized?', false, null, null, true),
    (sec, 1, 'yes_no', 'Please Observe 5 Dishes from the Clean Disk Rack and determine if they look clean (Check if item is clean)', false, null, null, true),
    (sec, 2, 'yes_no', 'Is the shelving above the clean dishes cleaned & maintained?', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooldown', 2) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Are all trays properly wrapped?', false, null, null, true),
    (sec, 1, 'yes_no', 'Are breaded filets one layer high on the pan?', false, null, null, true),
    (sec, 2, 'yes_no', 'Are grilled filets at a max of two layers high?', false, null, null, true),
    (sec, 3, 'yes_no', 'Are trays properly labeled?', false, null, null, true);
  insert into public.checklist_sections (template_id, name, sort)
  values (tpl, 'Cooler', 3) returning id into sec;
  insert into public.checklist_questions (section_id, sort, type, prompt, allow_na, choices, food_item_id, photo_required) values
    (sec, 0, 'yes_no', 'Is there 2 Buckets of Corn & Bean in the cooler?', false, null, null, false),
    (sec, 1, 'yes_no', 'Are there 3 Stacks of Mac & Cheese Rotation in the cooler?', false, null, null, true),
    (sec, 2, 'yes_no', 'Is the first Mac & Cheese completely thawed and ready to be used?', false, null, null, false),
    (sec, 3, 'yes_no', 'Is the following area in the cooler cleaned & maintained?', false, null, null, true);
end $$;
