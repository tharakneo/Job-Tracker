-- Ensure all autofill columns exist on the profiles table.
-- Run this in the Supabase SQL Editor.

alter table public.profiles
  add column if not exists first_name                  text,
  add column if not exists last_name                   text,
  add column if not exists email                       text,
  add column if not exists phone                       text,
  add column if not exists address_line1               text,
  add column if not exists linkedin_url                text,
  add column if not exists github_url                  text,
  add column if not exists portfolio_url               text,
  add column if not exists city                        text,
  add column if not exists state                       text,
  add column if not exists zip_code                    text,
  add column if not exists country                     text,
  -- Work Authorization
  add column if not exists work_authorized             boolean default true,
  add column if not exists requires_sponsorship_now    boolean default false,
  add column if not exists requires_sponsorship_future boolean default true,
  add column if not exists visa_type                   text,
  -- EEO Demographics
  add column if not exists gender                      text default 'Prefer not to say',
  add column if not exists race                        text default 'Prefer not to say',
  add column if not exists veteran_status              text default 'Prefer not to say',
  add column if not exists disability_status           text default 'Prefer not to say',
  -- Background Questions
  add column if not exists heard_from                  text default 'LinkedIn',
  add column if not exists is_18_or_older              boolean default true,
  add column if not exists willing_to_relocate         boolean default false,
  add column if not exists work_preference             text default 'Hybrid',
  add column if not exists updated_at                  timestamptz default now();
