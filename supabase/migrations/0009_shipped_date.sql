-- 實際出貨日: the actual date the shipment went out, separate from
-- order_date (the day's batch) and unreturned_date (status date).
-- Set by the website once a price type is chosen on a 未回單 row,
-- defaulting to that day but editable.

alter table public."JHDN_orders"
  add column if not exists shipped_date date;
