-- The history trigger function only needs to run as a trigger; don't also
-- expose it as /rest/v1/rpc/jhdn_record_order_history. (Triggers don't
-- check EXECUTE when they fire, so this doesn't stop history recording.)
revoke all on function public.jhdn_record_order_history() from public, anon, authenticated;
