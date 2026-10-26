-- Phase 6a-2: a server-owned XNYS-session boundary for user-supplied history.
-- It creates immutable history only; it does not read or alter current facts.
create function app.create_historical_backfill(
  p_portfolio_id uuid, p_as_of_date date, p_positions jsonb,
  p_manual_assets jsonb, p_liabilities jsonb, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_close timestamptz;
begin
  perform app.require_mfa_assurance();
  if p_as_of_date is null or p_as_of_date > date '2027-12-31'
     or extract(isodow from p_as_of_date) not between 1 and 5
     or p_as_of_date in (date '2026-01-01', date '2026-01-19', date '2026-02-16', date '2026-04-03', date '2026-05-25', date '2026-06-19', date '2026-07-03', date '2026-09-07', date '2026-11-26', date '2026-12-25', date '2027-01-01', date '2027-01-18', date '2027-02-15', date '2027-03-26', date '2027-05-31', date '2027-06-18', date '2027-07-05', date '2027-09-06', date '2027-11-25', date '2027-12-24') then
    raise exception using errcode = '22023', message = 'Invalid historical XNYS session';
  end if;
  v_close := ((p_as_of_date::text || case when p_as_of_date in (date '2026-11-27', date '2026-12-24', date '2027-07-02', date '2027-11-26', date '2027-12-23') then ' 13:00:00' else ' 16:00:00' end) :: timestamp at time zone 'America/New_York');
  return app.create_portfolio_snapshot(p_portfolio_id, p_as_of_date, v_close, 'backfill', p_positions, p_manual_assets, p_liabilities, p_request_id);
end;
$$;
comment on function app.create_historical_backfill(uuid,date,jsonb,jsonb,jsonb,uuid)
is 'SECURITY DEFINER is required to derive the reviewed XNYS close and atomically append historical user-supplied facts; MFA and ownership are enforced by the called snapshot boundary.';
revoke all on function app.create_historical_backfill(uuid,date,jsonb,jsonb,jsonb,uuid) from public, anon;
grant execute on function app.create_historical_backfill(uuid,date,jsonb,jsonb,jsonb,uuid) to authenticated;
