-- MFA-1: Once a caller has a verified MFA factor, only an AAL2 JWT may use
-- their app data. Users with no verified factor retain an AAL1 bootstrap path.
-- SECURITY DEFINER is required because `authenticated` deliberately has no
-- direct privilege on Supabase Auth factor secrets/rows. It exposes only a
-- boolean derived from the caller's own JWT and verified-factor existence.
create function app.mfa_assurance_satisfied()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select array[coalesce((select auth.jwt() ->> 'aal'), 'aal1')] <@ (
    select case
      when count(*) > 0 then array['aal2']
      else array['aal1', 'aal2']
    end
    from auth.mfa_factors
    where user_id = (select auth.uid())
      and status = 'verified'
  );
$$;

comment on function app.mfa_assurance_satisfied()
is 'SECURITY DEFINER is required to read Supabase Auth factor state without granting browser roles access to auth.mfa_factors; it returns only whether the caller JWT AAL is sufficient for that caller.';

revoke all on function app.mfa_assurance_satisfied() from public, anon;
grant execute on function app.mfa_assurance_satisfied() to authenticated;

create function app.require_mfa_assurance()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not app.mfa_assurance_satisfied() then
    raise exception using errcode = '42501', message = 'MFA verification required';
  end if;
end;
$$;

comment on function app.require_mfa_assurance()
is 'Checks the caller JWT AAL against that caller''s verified Supabase Auth MFA factors. It is SECURITY INVOKER and is only callable by approved SECURITY DEFINER financial-write RPCs.';

revoke all on function app.require_mfa_assurance() from public, anon, authenticated;

create policy profiles_mfa_assurance on app.profiles as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy portfolios_mfa_assurance on app.portfolios as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy accounts_mfa_assurance on app.accounts as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy positions_mfa_assurance on app.positions as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy manual_assets_mfa_assurance on app.manual_assets as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy liabilities_mfa_assurance on app.liabilities as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy position_events_mfa_assurance on app.position_events as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy portfolio_snapshots_mfa_assurance on app.portfolio_snapshots as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy snapshot_positions_mfa_assurance on app.snapshot_positions as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy snapshot_manual_assets_mfa_assurance on app.snapshot_manual_assets as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));
create policy snapshot_liabilities_mfa_assurance on app.snapshot_liabilities as restrictive for all to authenticated using ((select app.mfa_assurance_satisfied())) with check ((select app.mfa_assurance_satisfied()));

-- The original implementations become non-public SECURITY INVOKER internals.
-- The public, elevated entry points below check MFA before invoking them.
alter function app.create_position(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid)
  rename to create_position_mfa1_inner;
alter function app.create_position_mfa1_inner(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid)
  security invoker;
revoke all on function app.create_position_mfa1_inner(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid) from public, anon, authenticated;

alter function app.edit_position(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid)
  rename to edit_position_mfa1_inner;
alter function app.edit_position_mfa1_inner(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid)
  security invoker;
revoke all on function app.edit_position_mfa1_inner(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid) from public, anon, authenticated;

alter function app.create_portfolio_snapshot(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid)
  rename to create_portfolio_snapshot_mfa1_inner;
alter function app.create_portfolio_snapshot_mfa1_inner(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid)
  security invoker;
revoke all on function app.create_portfolio_snapshot_mfa1_inner(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;

alter function app.correct_portfolio_snapshot(uuid, text, jsonb, jsonb, jsonb, uuid)
  rename to correct_portfolio_snapshot_mfa1_inner;
alter function app.correct_portfolio_snapshot_mfa1_inner(uuid, text, jsonb, jsonb, jsonb, uuid)
  security invoker;
revoke all on function app.correct_portfolio_snapshot_mfa1_inner(uuid, text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;

create function app.create_position(
  p_portfolio_id uuid, p_account_id uuid, p_symbol text, p_security_name text,
  p_asset_type text, p_quantity numeric, p_average_cost numeric,
  p_occurred_at timestamptz, p_notes text, p_request_id uuid
) returns table (position_id uuid, event_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_mfa_assurance();
  return query select * from app.create_position_mfa1_inner(p_portfolio_id, p_account_id, p_symbol, p_security_name, p_asset_type, p_quantity, p_average_cost, p_occurred_at, p_notes, p_request_id);
end;
$$;
comment on function app.create_position(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid)
is 'SECURITY DEFINER is required to atomically create a position and its immutable initial event while authenticated clients have no direct write grants; ownership and MFA assurance are derived from auth.uid() and the JWT.';

create function app.edit_position(
  p_position_id uuid, p_event_type text, p_new_account_id uuid, p_new_symbol text,
  p_new_security_name text, p_new_asset_type text, p_new_quantity numeric,
  p_new_average_cost numeric, p_split_numerator numeric, p_split_denominator numeric,
  p_dividend_amount numeric, p_occurred_at timestamptz, p_notes text, p_request_id uuid
) returns table (position_id uuid, event_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_mfa_assurance();
  return query select * from app.edit_position_mfa1_inner(p_position_id, p_event_type, p_new_account_id, p_new_symbol, p_new_security_name, p_new_asset_type, p_new_quantity, p_new_average_cost, p_split_numerator, p_split_denominator, p_dividend_amount, p_occurred_at, p_notes, p_request_id);
end;
$$;
comment on function app.edit_position(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid)
is 'SECURITY DEFINER is required to atomically update a position and append its immutable event while authenticated clients have no direct write grants; ownership and MFA assurance are derived from auth.uid() and the JWT.';

create function app.create_portfolio_snapshot(
  p_portfolio_id uuid, p_as_of_date date, p_market_close_at timestamptz,
  p_source text, p_positions jsonb, p_manual_assets jsonb, p_liabilities jsonb,
  p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_mfa_assurance();
  return app.create_portfolio_snapshot_mfa1_inner(p_portfolio_id, p_as_of_date, p_market_close_at, p_source, p_positions, p_manual_assets, p_liabilities, p_request_id);
end;
$$;
comment on function app.create_portfolio_snapshot(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid)
is 'SECURITY DEFINER is required to atomically append a complete immutable snapshot while authenticated clients have read-only history grants; ownership and MFA assurance are derived from auth.uid() and the JWT.';

create function app.correct_portfolio_snapshot(
  p_snapshot_id uuid, p_reason text, p_positions jsonb, p_manual_assets jsonb,
  p_liabilities jsonb, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_mfa_assurance();
  return app.correct_portfolio_snapshot_mfa1_inner(p_snapshot_id, p_reason, p_positions, p_manual_assets, p_liabilities, p_request_id);
end;
$$;
comment on function app.correct_portfolio_snapshot(uuid, text, jsonb, jsonb, jsonb, uuid)
is 'SECURITY DEFINER is required to atomically append a complete immutable snapshot correction while authenticated clients have read-only history grants; ownership, correction-chain leaf state, and MFA assurance are derived from auth.uid() and the JWT.';

revoke all on function app.create_position(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid) from public, anon;
revoke all on function app.edit_position(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid) from public, anon;
revoke all on function app.create_portfolio_snapshot(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid) from public, anon;
revoke all on function app.correct_portfolio_snapshot(uuid, text, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function app.create_position(uuid, uuid, text, text, text, numeric, numeric, timestamptz, text, uuid) to authenticated;
grant execute on function app.edit_position(uuid, text, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, text, uuid) to authenticated;
grant execute on function app.create_portfolio_snapshot(uuid, date, timestamptz, text, jsonb, jsonb, jsonb, uuid) to authenticated;
grant execute on function app.correct_portfolio_snapshot(uuid, text, jsonb, jsonb, jsonb, uuid) to authenticated;
