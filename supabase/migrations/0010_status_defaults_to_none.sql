-- New order numbers no longer default to 未回單 — they start with no
-- status at all until someone explicitly presses the "未回單" button (or
-- picks a driver, which jumps straight to 已回單) on the /daily page.
-- Rows with no status only show up under the "全部" tab.

alter table public."JHDN_orders" alter column status drop not null;
alter table public."JHDN_orders" alter column status drop default;

alter table public."JHDN_orders"
  drop constraint if exists "JHDN_orders_status_check";

alter table public."JHDN_orders"
  add constraint "JHDN_orders_status_check"
  check (status is null or status in ('unreturned', 'returned'));

-- The daily auto-provisioning job (0007) should match: no status, no
-- unreturned_date, until someone actually flags the order.
create or replace function public.jhdn_provision_daily_orders()
returns void
language plpgsql
as $$
declare
  target_date date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into public."JHDN_orders" (order_date, order_number, status, unreturned_date)
  select target_date, n, null, null
  from generate_series(1, 300) as n
  on conflict (order_date, order_number) do nothing;
end;
$$;
