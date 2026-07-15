-- Some days may need more than the usual 300 order numbers, so raise the
-- ceiling to 9999 (still fits the 4-digit zero-padded display format).
-- The daily auto-provisioning (migrations 0003/0007) still only creates
-- 1-300 by default; anything beyond that is added manually via the
-- "批次新增單號" button on the /daily page.

alter table public."JHDN_orders"
  drop constraint if exists "JHDN_orders_order_number_check";

alter table public."JHDN_orders"
  add constraint "JHDN_orders_order_number_check"
  check (order_number between 1 and 9999);
