-- Phase 6a-1 repair: name the JSON-object-key output column explicitly.
--
-- The prior current_quote_close function replacement aliased the set-returning
-- function as `k` but continued to reference `k.key`. PostgreSQL retained the
-- function's native column name, so every non-empty snapshot payload failed
-- with SQLSTATE 42703 before it could be validated or written.

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'app.insert_snapshot_revision(uuid,uuid,text,date,timestamptz,text,uuid,text,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
  ) into v_definition;

  if pg_catalog.strpos(v_definition, 'jsonb_object_keys(e.value) k') = 0 then
    raise exception using errcode = 'P0001', message = 'Expected snapshot JSON-key aliases were not found';
  end if;

  execute pg_catalog.replace(
    v_definition,
    'jsonb_object_keys(e.value) k',
    'jsonb_object_keys(e.value) as k(key)'
  );
end;
$$;
