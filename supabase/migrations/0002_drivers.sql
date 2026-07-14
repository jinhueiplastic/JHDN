-- Driver master list, so the website can offer a click-to-select picker
-- instead of free-text typing for driver names.

create table if not exists public."JHDN_drivers" (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public."JHDN_drivers" enable row level security;

drop policy if exists "JHDN anon full access" on public."JHDN_drivers";
create policy "JHDN anon full access" on public."JHDN_drivers"
  for all
  to anon, authenticated
  using (true)
  with check (true);
