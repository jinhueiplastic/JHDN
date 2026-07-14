-- Real-time Google Sheet sync without needing the Supabase Dashboard's
-- Webhooks UI: a Postgres trigger calls the Apps Script Web App directly
-- via the pg_net extension every time a row in JHDN_orders changes.
--
-- If you ever redeploy the Apps Script and get a new /exec URL, or change
-- WEBHOOK_TOKEN, re-run this migration with the updated url below.

create extension if not exists pg_net with schema extensions;

create or replace function public.jhdn_notify_orders_webhook()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://script.google.com/macros/s/AKfycbweSKCq-CEBURkzLU9W8KPraPOeG8LQcR_YJYshXLxjQ1SmcV5HS60kTcPnWoJPA0_B/exec?token=gknsiognfognojdnfgosnfgisdkgs',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
      'old_record', case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists jhdn_orders_webhook on public."JHDN_orders";
create trigger jhdn_orders_webhook
  after insert or update or delete on public."JHDN_orders"
  for each row
  execute function public.jhdn_notify_orders_webhook();
