-- Run this in the Supabase SQL Editor if you want jobs tied to the signed-in Google account.
-- This adds jobs.user_id and switches jobs/profiles to authenticated user ownership.
-- Also adds gender and race columns to profiles for EEO autofill.

alter table public.profiles
add column if not exists gender text,
add column if not exists race text;

alter table public.jobs
add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists jobs_user_id_idx on public.jobs (user_id);

drop policy if exists "Allow anonymous select" on public.jobs;
drop policy if exists "Allow anonymous insert" on public.jobs;
drop policy if exists "Allow anonymous update" on public.jobs;
drop policy if exists "Allow anonymous delete" on public.jobs;
drop policy if exists "authenticated insert jobs" on public.jobs;worked 

now its time to change the auto fill 

we'll do it one by one 

keep only the importatnt ones 

i think 
drop policy if exists "users can select own jobs" on public.jobs;
drop policy if exists "users can insert own jobs" on public.jobs;
drop policy if exists "users can update own jobs" on public.jobs;
drop policy if exists "users can delete own jobs" on public.jobs;

alter table public.jobs enable row level security;

create policy "users can select own jobs"
on public.jobs
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own jobs"
on public.jobs
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Allow anonymous profile select" on public.profiles;
drop policy if exists "Allow anonymous profile insert" on public.profiles;
drop policy if exists "Allow anonymous profile update" on public.profiles;
drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "authenticated upsert profiles" on public.profiles;
drop policy if exists "users can select own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;

alter table public.profiles enable row level security;

create policy "users can select own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

do $$
begin
    alter publication supabase_realtime add table public.jobs;
exception
    when duplicate_object then null;
end $$;

-- Optional one-time backfill if this is your personal database and you want to claim old rows:
-- update public.jobs
-- set user_id = 'YOUR_AUTH_USER_ID'
-- where user_id is null;
