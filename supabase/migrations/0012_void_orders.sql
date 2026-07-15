-- Replace hard-delete of orders with a soft "作廢" (void) state that keeps
-- a reason on record, so nothing actually disappears from the database.
alter table public."JHDN_orders" add column if not exists void_reason text;

alter table public."JHDN_orders"
  drop constraint if exists "JHDN_orders_status_check";

alter table public."JHDN_orders"
  add constraint "JHDN_orders_status_check"
  check (status is null or status in ('unreturned', 'returned', 'voided'));
