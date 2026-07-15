-- Skip auto-provisioning on Sundays — no need to pre-create 200 order
-- numbers for a day nobody works. Manual "+ 批次新增單號" still works if
-- ever needed on a Sunday.
create or replace function public.jhdn_provision_daily_orders()
returns void
language plpgsql
as $$
declare
  target_date date := (now() at time zone 'Asia/Taipei')::date;
begin
  if extract(dow from target_date) = 0 then
    return;
  end if;

  insert into public."JHDN_orders" (order_date, order_number, status, unreturned_date)
  select target_date, n, null, null
  from generate_series(1, 200) as n
  on conflict (order_date, order_number) do nothing;
end;
$$;
