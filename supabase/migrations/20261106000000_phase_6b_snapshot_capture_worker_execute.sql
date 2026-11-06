-- Permit only the trusted scheduled worker to invoke its private write RPCs.
-- The existing public and browser-role revokes remain in force.

grant execute on function app.record_snapshot_capture_session(uuid,uuid,date,text,text,text)
  to service_role;
grant execute on function app.create_scheduled_portfolio_snapshot(uuid,uuid,date,timestamptz,text,jsonb,jsonb,jsonb,uuid)
  to service_role;
