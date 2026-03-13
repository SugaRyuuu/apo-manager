create extension if not exists pgcrypto;

create table if not exists public.members (
  id text primary key,
  display_name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.appointments (
  id text primary key,
  name text not null,
  school_affiliation text not null,
  appointment_date date not null,
  owner_member_id text not null references public.members(id) on delete restrict,
  status_text text,
  score integer,
  traits text,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint appointments_score_range check (score is null or score between 1 and 100)
);

create table if not exists public.shifts (
  member_id text not null references public.members(id) on delete cascade,
  shift_date date not null,
  availability text not null check (availability in ('day', 'night', 'both', 'unavailable', 'unset')),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (member_id, shift_date)
);

alter table public.members enable row level security;
alter table public.appointments enable row level security;
alter table public.shifts enable row level security;

drop policy if exists "members_select_all" on public.members;
drop policy if exists "members_insert_all" on public.members;
drop policy if exists "members_update_all" on public.members;
drop policy if exists "appointments_select_all" on public.appointments;
drop policy if exists "appointments_insert_all" on public.appointments;
drop policy if exists "appointments_update_all" on public.appointments;
drop policy if exists "shifts_select_all" on public.shifts;
drop policy if exists "shifts_insert_all" on public.shifts;
drop policy if exists "shifts_update_all" on public.shifts;

create policy "members_select_all" on public.members for select to anon, authenticated using (true);
create policy "members_insert_all" on public.members for insert to anon, authenticated with check (true);
create policy "members_update_all" on public.members for update to anon, authenticated using (true) with check (true);

create policy "appointments_select_all" on public.appointments for select to anon, authenticated using (true);
create policy "appointments_insert_all" on public.appointments for insert to anon, authenticated with check (true);
create policy "appointments_update_all" on public.appointments for update to anon, authenticated using (true) with check (true);

create policy "shifts_select_all" on public.shifts for select to anon, authenticated using (true);
create policy "shifts_insert_all" on public.shifts for insert to anon, authenticated with check (true);
create policy "shifts_update_all" on public.shifts for update to anon, authenticated using (true) with check (true);
