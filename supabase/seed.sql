-- Seed data: real product/pricing configuration only.
-- Deliberately does NOT seed any fake profiles, chat sessions, or claim data —
-- the plan requires production functionality to run against real data, not
-- mock rows. Populate `profiles` from a real data source/ingestion pipeline
-- or let the "create new profile" flow populate it organically.

insert into packages (code, name, monthly_price_cents, yearly_price_cents)
values ('core_pro', 'Pro', 6900, 69000)
on conflict (code) do nothing;

insert into addons (code, name, monthly_price_cents, yearly_price_cents, bundled_only)
values ('win_local_search', 'Win Local Search', 3000, 30000, true)
on conflict (code) do nothing;

insert into promo_codes (code, description, trial_charge_cents, active)
values ('TRIAL9.95', 'First-charge trial: $9.95 due today, full price billed at renewal', 995, true)
on conflict (code) do nothing;

insert into campaigns (name, kind, sequence_length, interval_days)
values ('Claim your profile', 'claim_sequence', 3, 15)
on conflict do nothing;

-- Fill the RAG knowledge base with the same facts the prototype's static
-- KNOWLEDGE/SUPPORT_KB arrays held. Embeddings are populated separately by a
-- one-off script (scripts/embed-knowledge.ts) once OPENAI/ANTHROPIC embedding
-- credentials are configured — this seed only inserts the source text.
insert into knowledge_chunks (source, content) values
  ('general_kb', 'Search Rank Score (SRS) is scored 0-850. Below 400 is Poor, 400-599 is Fair, 600-749 is Good, 750+ is Excellent.'),
  ('general_kb', 'Claimed profiles can reply to reviews, edit their business category, city, and bio, and see basic profile-completion guidance.'),
  ('general_kb', 'Pro profiles additionally get Web Analytics, Listings management, and priority placement guidance.'),
  ('general_kb', 'Profiles refresh their SRS nightly based on review velocity, reply rate, and profile completeness.'),
  ('general_kb', 'To unpublish a profile, the owner must contact support directly — there is no self-service unpublish action.'),
  ('general_kb', 'Only YouTube video links are accepted in the profile video field; other hosts are rejected.')
on conflict do nothing;
