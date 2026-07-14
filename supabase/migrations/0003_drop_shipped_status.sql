-- Simplify the status model down to two states: an order now starts out
-- as 未回單 (unreturned) with all the shipping details already editable,
-- and moves to 已回單 (returned) once staff confirms the driver's slip
-- came back. The separate 出貨單 (shipped) status is no longer used.

update public."JHDN_orders"
set status = 'unreturned',
    unreturned_date = coalesce(unreturned_date, order_date)
where status = 'shipped';

alter table public."JHDN_orders"
  drop constraint if exists "JHDN_orders_status_check";

alter table public."JHDN_orders"
  add constraint "JHDN_orders_status_check"
  check (status in ('returned', 'unreturned'));

alter table public."JHDN_orders"
  alter column status set default 'unreturned';
