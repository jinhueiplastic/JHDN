-- Lets drivers be manually reordered (instead of always alphabetical).
alter table public."JHDN_drivers" add column if not exists sort_order integer;

-- Backfill existing rows with a dense sequence based on current alphabetical
-- order, so every driver has a defined position to start reordering from.
with ordered as (
  select id, row_number() over (order by name asc) - 1 as rn
  from public."JHDN_drivers"
  where sort_order is null
)
update public."JHDN_drivers" d
set sort_order = ordered.rn
from ordered
where d.id = ordered.id;
