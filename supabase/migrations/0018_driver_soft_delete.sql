-- Deleting a driver used to hard-delete the row, which meant there was no
-- way to look them up again in the picker even though their past orders
-- still reference the name. Switch to a soft "active" flag instead —
-- "deleting" now just flips this to false; the row (and the ability to
-- restore it or pick it as a 舊司機) stays.
alter table public."JHDN_drivers" add column if not exists active boolean not null default true;
