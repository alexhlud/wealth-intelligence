create or replace function app.reject_future_current_state_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'positions' then
    if new.last_event_at > pg_catalog.now() + interval '5 minutes' then
      raise exception using errcode = '22008', message = 'Timestamp cannot be more than five minutes in the future';
    end if;
  end if;

  if tg_table_name = 'manual_assets' then
    if new.value_as_of > pg_catalog.now() + interval '5 minutes' then
      raise exception using errcode = '22008', message = 'Timestamp cannot be more than five minutes in the future';
    end if;
  end if;

  if tg_table_name = 'liabilities' then
    if new.balance_as_of > pg_catalog.now() + interval '5 minutes' then
      raise exception using errcode = '22008', message = 'Timestamp cannot be more than five minutes in the future';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app.reject_future_current_state_timestamp() from public, anon, authenticated;
