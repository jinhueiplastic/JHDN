-- 外縣市運費：勾選「外縣市」時可以額外填寫運費，之後才補填也可以。
alter table public."JHDN_orders" add column if not exists out_of_county_fee numeric;
