alter table app.positions
  add constraint positions_last_event_at_minimum_check
  check (last_event_at >= timestamptz '1970-01-01 00:00:00+00');

alter table app.position_events
  add constraint position_events_occurred_at_minimum_check
  check (occurred_at >= timestamptz '1970-01-01 00:00:00+00');

alter table app.manual_assets
  add constraint manual_assets_value_as_of_minimum_check
  check (value_as_of >= timestamptz '1970-01-01 00:00:00+00');

alter table app.liabilities
  add constraint liabilities_balance_as_of_minimum_check
  check (balance_as_of >= timestamptz '1970-01-01 00:00:00+00');

create function app.reject_future_current_state_timestamp()
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

create trigger positions_reject_future_last_event_at
before insert or update of last_event_at on app.positions
for each row execute function app.reject_future_current_state_timestamp();

create trigger manual_assets_reject_future_value_as_of
before insert or update of value_as_of on app.manual_assets
for each row execute function app.reject_future_current_state_timestamp();

create trigger liabilities_reject_future_balance_as_of
before insert or update of balance_as_of on app.liabilities
for each row execute function app.reject_future_current_state_timestamp();

do $$
declare
  v_definition text;
  v_marker text := E'  v_fingerprint := md5(pg_catalog.jsonb_build_object(';
begin
  select pg_get_functiondef('app.create_position_mfa1_inner(uuid,uuid,text,text,text,numeric,numeric,timestamptz,text,uuid)'::regprocedure)
  into v_definition;

  if position(v_marker in v_definition) = 0 then
    raise exception using errcode = 'P0001', message = 'Expected create_position timestamp validation marker was not found';
  end if;

  v_definition := replace(v_definition, v_marker,
    $timestamp_validation$  if p_occurred_at < timestamptz '1970-01-01 00:00:00+00' then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if p_occurred_at > pg_catalog.now() + interval '5 minutes' then
    raise exception using errcode = '22008', message = 'Timestamp cannot be more than five minutes in the future';
  end if;

$timestamp_validation$ || v_marker);
  execute v_definition;

  select pg_get_functiondef('app.edit_position_mfa1_inner(uuid,text,uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,timestamptz,text,uuid)'::regprocedure)
  into v_definition;

  if position(v_marker in v_definition) = 0
     or position($chronological_marker$  if p_occurred_at < v_position.last_event_at then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if v_position.status$chronological_marker$ in v_definition) = 0 then
    raise exception using errcode = 'P0001', message = 'Expected edit_position timestamp validation marker was not found';
  end if;

  v_definition := replace(v_definition, v_marker,
    $timestamp_validation$  if p_occurred_at < timestamptz '1970-01-01 00:00:00+00' then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if p_occurred_at > pg_catalog.now() + interval '5 minutes' then
    raise exception using errcode = '22008', message = 'Timestamp cannot be more than five minutes in the future';
  end if;

$timestamp_validation$ || v_marker);
  v_definition := replace(v_definition,
    $chronological_marker$  if p_occurred_at < v_position.last_event_at then
    raise exception using errcode = '22023', message = 'Invalid position intent';
  end if;

  if v_position.status$chronological_marker$,
    $chronological_replacement$  if p_occurred_at < v_position.last_event_at then
    raise exception using errcode = 'P5001', message = 'Position event cannot precede the most recently recorded event';
  end if;

  if v_position.status$chronological_replacement$);
  execute v_definition;
end;
$$;
