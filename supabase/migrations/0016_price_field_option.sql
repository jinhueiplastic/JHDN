-- Records which option was picked in the 價格 dropdown (填單價/現銷價/
-- 發票金額/實際出貨日), independent of whether a value has actually been
-- filled in yet — needed to tell "picked 填單價 but left it blank" apart
-- from "never touched the dropdown at all".
alter table public."JHDN_orders" add column if not exists price_field_option text;

alter table public."JHDN_orders"
  drop constraint if exists "JHDN_orders_price_field_option_check";

alter table public."JHDN_orders"
  add constraint "JHDN_orders_price_field_option_check"
  check (
    price_field_option is null
    or price_field_option in ('order_price', 'cash_sale_price', 'invoice_price', 'shipped_date')
  );
