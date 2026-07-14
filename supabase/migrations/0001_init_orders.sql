-- Orders tracking table: one row per (order_date, order_number).
-- order_number ranges 0001-0300 and is zero-padded for display in the app,
-- but stored as smallint here for easy sorting/range queries.
--
-- Table, function, and policy names are all prefixed with JHDN_ / jhdn_
-- because this Supabase project is shared with another, unrelated site.
-- The prefix keeps this app's schema objects from colliding with (or
-- being visible to) anything the other site already created.

create table if not exists public."JHDN_orders" (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  order_number smallint not null check (order_number between 1 and 300),
  status text not null default 'shipped'
    check (status in ('shipped', 'returned', 'unreturned')),

  -- 出貨單 fields
  driver_name text,
  out_of_county boolean not null default false,
  order_price numeric(10, 2),
  cash_sale_price numeric(10, 2),
  invoice_price numeric(10, 2),

  -- 未回單 fields (auto-stamped date; driver_name doubles as the note here)
  unreturned_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (order_date, order_number)
);

create index if not exists jhdn_orders_order_date_idx on public."JHDN_orders" (order_date);
create index if not exists jhdn_orders_status_idx on public."JHDN_orders" (status);

create or replace function public.jhdn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jhdn_orders_set_updated_at on public."JHDN_orders";
create trigger jhdn_orders_set_updated_at
  before update on public."JHDN_orders"
  for each row
  execute function public.jhdn_set_updated_at();

alter table public."JHDN_orders" enable row level security;

-- Internal single-team tool with no login screen: allow the anon key
-- (used by the browser) full access. If this site is ever exposed
-- publicly, put it behind Supabase Auth or a reverse-proxy password
-- and scope this policy down accordingly.
drop policy if exists "JHDN anon full access" on public."JHDN_orders";
create policy "JHDN anon full access" on public."JHDN_orders"
  for all
  to anon, authenticated
  using (true)
  with check (true);
