-- Seed: real Farmingdale vendor directory transcribed from Naldo's KitchenIQ
-- mobile-app screenshots (2026-07-10). 46 vendors: Building Maintenance (25),
-- Equipment (5), Food Suppliers (4), and 12 sister Chick-fil-A store contacts
-- (each kept under its own per-store category, matching the source app).
--
-- Mapping: KitchenIQ "Point of Contact" -> rep_name; "Notes" -> notes; Call
-- number -> phone; the one captured email -> email. Delivery days were not in
-- the source. Source typos preserved on purpose (Autunes, Herber Plumbing,
-- "National Waste Servies", "Chick-fil-A Rosevevelt", "Levitown", "alaram").
-- All 9 sister-store phone numbers were verified against Google/Yelp/
-- chick-fil-a.com on 2026-07-10; personal-cell entries (Antonia, Omar, Dave
-- Parkes) kept as captured.
-- Autunes Repair phone corrected by Naldo 2026-07-10 (screenshot had an
-- invalid "(191)" number); see 20260710010000_fix_autunes_phone.sql for DBs
-- that ran the original version of this seed.
-- Ansul Systems, Locksmith, Oil Removal, Pest Control had no detail sheet:
-- seeded name + category only.
--
-- Idempotent + non-destructive: inserts only vendors whose (case-insensitive)
-- name is not already present; never updates or deletes existing rows.

insert into public.vendors (name, category, rep_name, phone, email, notes)
select v.name, v.category, v.rep_name, v.phone, v.email, v.notes
from (
  values
    -- Building Maintenance ---------------------------------------------------
    ('APS (Alarm Monitoring)', 'Building Maintenance', 'APS', '(844) 255-1569', null, 'Call when you need to cancel an alarm or pause an alaram'),
    ('APS (Technical Support)', 'Building Maintenance', null, '(608) 222-1111', null, 'supervisor extension 7280 7206 -Sean'),
    ('Action Air (Fridges)', 'Building Maintenance', 'Brian Gorman', '(631) 466-4124', null, null),
    ('Ansul Systems', 'Building Maintenance', null, null, null, null),
    ('Building Vents', 'Building Maintenance', 'Tom burrow Co', '(404) 351-1010', null, 'supply (small holes) return (square holes)'),
    ('Cardboard Removal', 'Building Maintenance', 'National Waste Servies', '(631) 242-0300', null, '631-242-0300'),
    ('Charter House', 'Building Maintenance', null, '(616) 796-1020', 'CFA@charter-house.com', 'any replacements parts for the dining room'),
    ('Clayton Fixtures', 'Building Maintenance', null, '(404) 363-1665', null, null),
    ('Compactors (Dining)', 'Building Maintenance', null, '(877) 860-6900', null, null),
    ('Electrician', 'Building Maintenance', 'Eddie Ryder', '(516) 297-1990', null, null),
    ('Fire Extinguishers', 'Building Maintenance', 'Fire Masters', '(317) 757-3760', null, 'Annual'),
    ('Flavored Mechanical Services', 'Building Maintenance', 'Brent Hall', '(631) 213-1120', null, null),
    ('Floor Cleaning', 'Building Maintenance', 'Marco Roca', '(631) 402-7680', null, null),
    ('Grease Trap Cleaning', 'Building Maintenance', 'Affordable Cesspool', '(631) 831-6841', null, null),
    ('Herber Plumbing', 'Building Maintenance', null, '(631) 666-9315', null, null),
    ('Hot Water Heater', 'Building Maintenance', 'Charlie Jr AO Smith', '(631) 905-7888', null, null),
    ('Irrigation', 'Building Maintenance', 'Robert Gold', '(516) 807-1238', null, null),
    ('Landscaping', 'Building Maintenance', 'J & M Design & Landscaping Joe Mannino', '(516) 807-0624', null, 'Weekly'),
    ('Locksmith', 'Building Maintenance', null, null, null, null),
    ('Oil Removal', 'Building Maintenance', null, null, null, null),
    ('Pest Control', 'Building Maintenance', null, null, null, null),
    ('Power Washing', 'Building Maintenance', 'Shoman Power Washing', '(631) 560-2722', null, 'Brandon Shoman'),
    ('Sewage/Drain Backups', 'Building Maintenance', 'Affordable Cesspool', '(631) 831-6841', null, 'As Needed'),
    ('Snow Removal', 'Building Maintenance', 'Brandon Shoman', '(631) 560-2722', null, 'Shoman Facility Maintenance'),
    ('Suffolk Laundry (towels)', 'Building Maintenance', 'Suffolk Laundry', '(631) 283-6824', null, 'Weekly'),
    -- Equipment ---------------------------------------------------------------
    ('Autunes Repair', 'Equipment', 'Autunes Repair', '(917) 402-8032', null, 'Bun Toaster & Egg Station'),
    ('Eagle', 'Equipment', null, '(516) 378-8500', null, null),
    ('Ecolab', 'Equipment', null, '(800) 529-5458', null, null),
    ('Ecolab Prep N Print Support', 'Equipment', 'Print', '(877) 603-1187', null, null),
    ('ProTek', 'Equipment', null, '(866) 773-7717', null, 'Oven & Dishwasher Repairs'),
    -- Food Suppliers ----------------------------------------------------------
    ('CO2', 'Food Suppliers', 'Tom Brusca BevCO2', '(516) 633-8563', null, 'Bi-Weekly'),
    ('Coca-Cola', 'Food Suppliers', null, '(800) 438-2653', null, null),
    ('Food Authority', 'Food Suppliers', null, '(631) 775-4500', null, '235 PINELAWN ROAD MELVILLE, NY 11747'),
    ('Schmidt Bakery', 'Food Suppliers', 'Margaret Swetz', '(800) 801-7655', null, 'SCHMIDT BAKING COMPANY 160 WILBER PLACE'),
    -- Sister Chick-fil-A stores (phones verified online 2026-07-10) -----------
    ('Chick-fil-A Commack', 'Chick-fil-A Commack', null, '(631) 499-1280', null, '656 Commack Rd, Commack, NY 11725'),
    ('Chick-fil-A Expressway Plaza', 'Chick-fil-A Expressway Plaza', null, '(631) 721-9844', null, '2280 N Ocean Ave Unit J, Farmingville, NY 11738'),
    ('Chick-fil-A Hicksville', 'Chick-fil-A Hicksville', null, '(516) 433-6305', null, '1401 Broadway Mall, Hicksville, NY 11801'),
    ('Chick-fil-A Huntington', 'Chick-fil-A Huntington', null, '(631) 944-8331', null, '200 E Jericho Turnpike, Huntington Station, NY 11746'),
    ('Chick-fil-A Huntington (Dave Parkes)', 'Chick-fil-A Huntington', 'Dave Parkes', '(862) 686-4560', null, null),
    ('Chick-fil-A Levitown', 'Chick-fil-A Levitown', null, '(516) 735-1341', null, '3859 Hempstead Tpke, Levittown, NY 11756'),
    ('Chick-fil-A Port Jefferson', 'Chick-fil-A Port Jefferson', null, '(631) 476-8100', null, '5184 Nesconset Hwy, Port Jefferson Station, NY 11776'),
    ('Chick-fil-A Roosevelt Field', 'Chick-fil-A Rosevevelt', null, '(516) 743-3636', null, '630 Old Country Rd, Garden City, NY 11530'),
    ('Chick-fil-A Roosevelt Field (Omar)', 'Chick-fil-A Rosevevelt', 'Omar', '(516) 450-2888', null, null),
    ('Chick-fil-A Smithtown', 'Chick-fil-A Smithtown', null, '(631) 360-3565', null, '530 Smithtown Bypass, Smithtown, NY 11787'),
    ('Chick-fil-A Westbury', 'Chick-fil-A Westbury', null, '(516) 222-2530', null, '1530 Old Country Rd, Westbury, NY 11590'),
    ('Chick-fil-A Westbury (Antonia)', 'Chick-fil-A Westbury', 'Antonia', '(934) 204-4050', null, null)
) as v(name, category, rep_name, phone, email, notes)
where not exists (
  select 1 from public.vendors existing where lower(existing.name) = lower(v.name)
);
