-- Replace the instant per-row webhook push with a queue: a bulk action on
-- the site (e.g. auto-provisioning 300 order numbers for a new date) used
-- to fire hundreds of near-simultaneous HTTP calls straight from Postgres,
-- which overwhelmed Apps Script's execution limits and silently dropped or
-- reordered rows in the Sheet. Now the trigger just inserts a queue row
-- (fast, no network call), and a time-driven Apps Script trigger drains the
-- queue in order, one row at a time, on its own pace.

create table if not exists public."JHDN_sync_queue" (
  id bigint generated always as identity primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public."JHDN_sync_queue" enable row level security;

drop policy if exists "JHDN anon full access" on public."JHDN_sync_queue";
create policy "JHDN anon full access" on public."JHDN_sync_queue"
  for all
  to anon, authenticated
  using (true)
  with check (true);

create or replace function public.jhdn_notify_orders_webhook()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public."JHDN_sync_queue" (payload)
  values (
    jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
      'old_record', case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end
    )
  );
  return coalesce(NEW, OLD);
end;
$$;

-- The trigger itself (created in 0005) already points at this function name,
-- so redefining the function above is all that's needed to switch it from
-- "call the webhook directly" to "enqueue for Apps Script to drain".
