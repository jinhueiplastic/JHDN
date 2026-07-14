-- Automatically create the day's 300 order numbers at 00:01 Taipei time,
-- instead of waiting for someone to open the website and trigger the
-- on-demand provisioning in loadOrders(). This gives the Sheet sync queue
-- a head start overnight so the new day's board is already synced by the
-- time anyone starts using the site in the morning.

create extension if not exists pg_cron;

create or replace function public.jhdn_provision_daily_orders()
returns void
language plpgsql
as $$
declare
  target_date date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into public."JHDN_orders" (order_date, order_number, status, unreturned_date)
  select target_date, n, 'unreturned', target_date
  from generate_series(1, 300) as n
  on conflict (order_date, order_number) do nothing;
end;
$$;

-- pg_cron runs on the server's clock (UTC on Supabase), so 00:01 Taipei
-- (UTC+8, no DST) is 16:01 UTC the previous day.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'jhdn-provision-daily-orders') then
    perform cron.unschedule('jhdn-provision-daily-orders');
  end if;
end $$;

select cron.schedule(
  'jhdn-provision-daily-orders',
  '1 16 * * *',
  $$select public.jhdn_provision_daily_orders();$$
);
