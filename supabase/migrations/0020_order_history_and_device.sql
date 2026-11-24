-- 1) Which computer made each change ("updated_by")
-- 2) An append-only history of every change to JHDN_orders, so any day can
--    be rolled back to an earlier point in time with plain SQL.
--
-- There is no login on the site, so each browser names itself once
-- ("櫃台", "倉庫"...) and sends that name on every request in the
-- `x-jhdn-device` header (base64 of the UTF-8 text, since HTTP headers
-- can't carry Chinese directly). Triggers read it from PostgREST's
-- request.headers, so the site never has to write these columns itself.

alter table public."JHDN_orders" add column if not exists updated_by text;

-- Name of whoever is making the current change:
--   * jhdn.device setting, if set in this transaction (used by restore)
--   * the browser's x-jhdn-device header
--   * '未命名電腦' for a web request without a name
--   * '系統' for anything with no web request at all (pg_cron, SQL editor)
create or replace function public.jhdn_current_device()
returns text
language plpgsql
stable
as $$
declare
  override text := nullif(current_setting('jhdn.device', true), '');
  raw_headers text := nullif(current_setting('request.headers', true), '');
  encoded text;
begin
  if override is not null then
    return override;
  end if;
  if raw_headers is null then
    return '系統';
  end if;
  begin
    encoded := nullif(raw_headers::json ->> 'x-jhdn-device', '');
    if encoded is null then
      return '未命名電腦';
    end if;
    return left(convert_from(decode(encoded, 'base64'), 'UTF8'), 50);
  exception when others then
    return '未命名電腦';
  end;
end;
$$;

create or replace function public.jhdn_stamp_updated_by()
returns trigger
language plpgsql
as $$
begin
  new.updated_by := public.jhdn_current_device();
  return new;
end;
$$;

drop trigger if exists jhdn_orders_stamp_updated_by on public."JHDN_orders";
create trigger jhdn_orders_stamp_updated_by
  before insert or update on public."JHDN_orders"
  for each row
  execute function public.jhdn_stamp_updated_by();

create table if not exists public."JHDN_order_history" (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  order_id uuid not null,
  order_date date not null,
  order_number smallint not null,
  device text,
  old_row jsonb,
  new_row jsonb
);

create index if not exists jhdn_order_history_order_idx
  on public."JHDN_order_history" (order_id, changed_at);
create index if not exists jhdn_order_history_date_idx
  on public."JHDN_order_history" (order_date, changed_at);

-- Read-only from the site: the browser can look at history but never edit
-- or delete it. Only the trigger below (security definer) writes rows.
alter table public."JHDN_order_history" enable row level security;
revoke all on public."JHDN_order_history" from anon, authenticated;
grant select on public."JHDN_order_history" to anon, authenticated;
drop policy if exists "JHDN anon read history" on public."JHDN_order_history";
create policy "JHDN anon read history" on public."JHDN_order_history"
  for select
  to anon, authenticated
  using (true);

create or replace function public.jhdn_record_order_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public."JHDN_orders";
begin
  -- An update that didn't actually change anything (same values saved
  -- again) isn't worth a history row.
  if TG_OP = 'UPDATE'
     and (to_jsonb(new) - 'updated_at' - 'updated_by')
       = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return new;
  end if;

  r := case when TG_OP = 'DELETE' then old else new end;
  insert into public."JHDN_order_history"
    (op, order_id, order_date, order_number, device, old_row, new_row)
  values (
    TG_OP,
    r.id,
    r.order_date,
    r.order_number,
    public.jhdn_current_device(),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists jhdn_orders_history on public."JHDN_orders";
create trigger jhdn_orders_history
  after insert or update or delete on public."JHDN_orders"
  for each row
  execute function public.jhdn_record_order_history();

-- Roll one day's orders back to how they looked at `p_at`, using the
-- history above. Not callable from the website — run it from the Supabase
-- SQL editor, e.g.:
--
--   select public.jhdn_restore_orders('2026-11-23', '2026-11-23 15:00+08');
--
-- For each order of that day that has any history:
--   * latest change at/before p_at  -> its state after that change
--   * otherwise, first change after -> its state before that change
--     (an INSERT there means the order didn't exist yet at p_at)
-- Returns how many orders were changed. The restore itself shows up in the
-- history (device '還原'), so it can be undone the same way.
create or replace function public.jhdn_restore_orders(p_date date, p_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  target jsonb;
  changed integer := 0;
begin
  perform set_config('jhdn.device', '還原', true);

  for rec in
    with ids as (
      select distinct order_id from public."JHDN_order_history" where order_date = p_date
    )
    select
      ids.order_id,
      exists (select 1 from public."JHDN_order_history" h
        where h.order_id = ids.order_id and h.changed_at <= p_at) as has_before,
      (select h.new_row from public."JHDN_order_history" h
        where h.order_id = ids.order_id and h.changed_at <= p_at
        order by h.changed_at desc, h.id desc limit 1) as before_row,
      (select h.op from public."JHDN_order_history" h
        where h.order_id = ids.order_id and h.changed_at > p_at
        order by h.changed_at asc, h.id asc limit 1) as after_op,
      (select h.old_row from public."JHDN_order_history" h
        where h.order_id = ids.order_id and h.changed_at > p_at
        order by h.changed_at asc, h.id asc limit 1) as after_old_row
    from ids
  loop
    if rec.has_before then
      target := rec.before_row;           -- null when that change was a DELETE
    elsif rec.after_op is null or rec.after_op = 'INSERT' then
      target := null;                     -- didn't exist yet
    else
      target := rec.after_old_row;
    end if;

    if target is null then
      delete from public."JHDN_orders" where id = rec.order_id;
      if found then changed := changed + 1; end if;
    elsif not exists (
      select 1 from public."JHDN_orders" o
      where o.id = rec.order_id
        and (to_jsonb(o) - 'updated_at' - 'updated_by')
          = (target - 'updated_at' - 'updated_by')
    ) then
      delete from public."JHDN_orders" where id = rec.order_id;
      -- Free the (date, number) slot in case a different row took it since.
      delete from public."JHDN_orders"
        where order_date = (target ->> 'order_date')::date
          and order_number = (target ->> 'order_number')::smallint;
      insert into public."JHDN_orders"
        select * from jsonb_populate_record(null::public."JHDN_orders", target);
      changed := changed + 1;
    end if;
  end loop;

  return changed;
end;
$$;

revoke all on function public.jhdn_restore_orders(date, timestamptz) from public, anon, authenticated;
