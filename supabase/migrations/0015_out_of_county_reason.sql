-- 外縣市原因：勾選「外縣市」時可以額外填寫是什麼原因。
alter table public."JHDN_orders" add column if not exists out_of_county_reason text;
