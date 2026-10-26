-- Phase 6a-2 correction repair: distinguish a real revision conflict from
-- every other safe correction failure, and retain diagnostic SQL details in
-- server logs without exposing them to the browser.
do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'app.correct_portfolio_snapshot_mfa1_inner(uuid,text,jsonb,jsonb,jsonb,uuid)'::pg_catalog.regprocedure
  ) into v_definition;

  if pg_catalog.strpos(v_definition, 'Snapshot is not correction-chain leaf') = 0 then
    raise exception using errcode = 'P0001', message = 'Expected correction leaf check was not found';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'raise exception using errcode = ''22023'', message = ''Snapshot is not correction-chain leaf'';',
    'raise exception using errcode = ''P0001'', message = ''Snapshot is not correction-chain leaf'';'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'when check_violation or string_data_right_truncation or numeric_value_out_of_range\n       or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then\n    raise exception using errcode = ''22023'', message = ''Invalid snapshot correction'';\n  when unique_violation then\n    raise exception using errcode = ''P0001'', message = ''Snapshot is not correction-chain leaf'';',
    'when check_violation or string_data_right_truncation or numeric_value_out_of_range\n       or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then\n    raise log ''Snapshot correction failed: class=validation code=% message=%'', SQLSTATE, SQLERRM;\n    raise exception using errcode = ''22023'', message = ''Invalid snapshot correction'';\n  when unique_violation then\n    raise log ''Snapshot correction failed: class=integrity code=% message=%'', SQLSTATE, SQLERRM;\n    raise exception using errcode = ''P0001'', message = ''Snapshot is not correction-chain leaf'';'
  );

  execute v_definition;
end;
$$;
