-- Admin-only "restore this order to a past version" for the /history page.
--
-- Nothing here changes how the existing pages work: it only adds a table
-- and a function.
--
-- Who counts as an admin: a Supabase Auth user (Authentication → Users)
-- that is ALSO listed in JHDN_admins. Being signed in alone isn't enough,
-- so it doesn't matter whether public sign-ups are enabled. Add one with:
--
--   insert into public."JHDN_admins" (user_id, display_name)
--   select id, '王小明' from auth.users where email = 'someone@example.com';

create table if not exists public."JHDN_admins" (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- A signed-in user can see only their own row (so the page can tell
-- whether they're an admin); nobody can edit the list from the site.
alter table public."JHDN_admins" enable row level security;
revoke all on public."JHDN_admins" from anon, authenticated;
grant select on public."JHDN_admins" to authenticated;
drop policy if exists "JHDN admin sees self" on public."JHDN_admins";
create policy "JHDN admin sees self" on public."JHDN_admins"
  for select
  to authenticated
  using (user_id = auth.uid());

-- Put one order back exactly as it was right after history entry
-- p_history_id. The change is recorded like any other, with device
-- '還原（<admin name>）', so a restore can itself be undone.
create or replace function public.jhdn_restore_order_version(p_history_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_name text;
  h public."JHDN_order_history";
  target jsonb;
  cols text;
  result jsonb;
begin
  select display_name into admin_name
  from public."JHDN_admins"
  where user_id = auth.uid();
  if admin_name is null then
    raise exception '沒有復原權限' using errcode = '42501';
  end if;

  select * into h from public."JHDN_order_history" where id = p_history_id;
  if not found then
    raise exception '找不到這筆紀錄';
  end if;
  if h.op = 'DELETE' then
    raise exception '這筆是刪除紀錄，請選刪除之前的版本';
  end if;
  target := h.new_row;

  perform set_config('jhdn.device', '還原（' || admin_name || '）', true);

  if exists (select 1 from public."JHDN_orders" where id = h.order_id) then
    -- Every column except the bookkeeping ones, so columns added later
    -- are restored too without touching this function.
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into cols
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'JHDN_orders'
      and column_name not in ('id', 'created_at', 'updated_at', 'updated_by');

    execute format(
      'update public."JHDN_orders" set (%s) = (select %s from jsonb_populate_record(null::public."JHDN_orders", $1)) where id = $2',
      cols, cols)
      using target, h.order_id;
  else
    -- The order was deleted since. Bring it back, unless its number has
    -- been reused by another row in the meantime.
    if exists (
      select 1 from public."JHDN_orders"
      where order_date = h.order_date and order_number = h.order_number
    ) then
      raise exception '這個單號現在已經有另一筆資料，無法復原';
    end if;
    insert into public."JHDN_orders"
      select * from jsonb_populate_record(null::public."JHDN_orders", target);
  end if;

  select to_jsonb(o) into result from public."JHDN_orders" o where id = h.order_id;
  return result;
end;
$$;

revoke all on function public.jhdn_restore_order_version(bigint) from public, anon;
grant execute on function public.jhdn_restore_order_version(bigint) to authenticated;
