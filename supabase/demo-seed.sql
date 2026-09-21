-- DEMO DATA ONLY — not part of the production seed (supabase/seed.sql).
-- Populates a handful of fake profiles so the "search an existing profile,
-- claim it, see claimed/Pro examples" flows are demoable without waiting for
-- a real data source. Safe to delete at any time:
--   delete from profiles where slug like 'demo-%';

insert into profiles (slug, name, category, brokerage, city, license, status, rating, reviews_count, srs, top5, phone_e164, email, snippet)
values
  ('demo-jordan-reyes', 'Jordan Reyes', 'Real Estate Agent', 'Reyes Realty Group', 'Austin, TX', 'TX-0938217', 'unclaimed', 4.8, 62, 410, false, '+15125550142', 'jordan.reyes@example.com', null),
  ('demo-morgan-chen', 'Morgan Chen', 'Real Estate Agent', 'Peak Denver Realty', 'Denver, CO', 'CO-2201194', 'unclaimed', 4.9, 118, 690, true, '+13035550187', 'morgan.chen@example.com', 'Denver''s top-ranked residential agent for 2025, specializing in the Highlands and Cherry Creek.'),
  ('demo-amara-osei', 'Dr. Amara Osei', 'Dermatology', null, 'Chicago, IL', 'IL-MD-55210', 'unclaimed', 4.7, 34, 350, false, '+13125550199', 'amara.osei@example.com', null),
  ('demo-taylor-brooks', 'Taylor Brooks', 'Real Estate Agent', 'Sound Realty Partners', 'Seattle, WA', 'WA-1187744', 'claimed', 4.6, 89, 540, false, '+12065550120', 'taylor.brooks@example.com', 'Helping Seattle families find their next home for over a decade.'),
  ('demo-sam-whitfield', 'Sam Whitfield', 'Real Estate Agent', 'Whitfield & Co.', 'Miami, FL', 'FL-3309981', 'pro', 4.95, 203, 812, true, '+13055550166', 'sam.whitfield@example.com', 'Luxury waterfront specialist — top 1% of Miami-Dade agents by closed volume.')
on conflict (slug) do nothing;
