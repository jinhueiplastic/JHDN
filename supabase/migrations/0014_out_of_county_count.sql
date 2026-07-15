-- 外縣市件數：勾選「外縣市」時可以額外填寫這一單有幾件。
alter table public."JHDN_orders" add column if not exists out_of_county_count integer;
