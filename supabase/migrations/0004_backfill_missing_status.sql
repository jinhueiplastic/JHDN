-- Defensive data fix: any existing row without a valid status (null, or
-- anything other than the two statuses the app now uses) defaults to 未回單.

update public."JHDN_orders"
set status = 'unreturned',
    unreturned_date = coalesce(unreturned_date, order_date)
where status is null or status not in ('unreturned', 'returned');
