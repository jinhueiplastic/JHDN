-- Daily auto-provisioning now creates 200 order numbers instead of 300
-- (the website's client-side fallback provisioning was lowered to match).
create or replace function public.jhdn_provision_daily_orders()
returns void
language plpgsql
as $$
declare
  target_date date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into public."JHDN_orders" (order_date, order_number, status, unreturned_date)
  select target_date, n, null, null
  from generate_series(1, 200) as n
  on conflict (order_date, order_number) do nothing;
end;
$$;
