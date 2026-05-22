alter table clientes enable row level security;
alter table contratos enable row level security;
alter table bases_internas enable row level security;
alter table perfis_ideais enable row level security;
alter table analises enable row level security;
alter table entregas enable row level security;

do $$
begin
  if not exists (select from pg_roles where rolname = 'geolead_app') then
    create role geolead_app nologin;
  end if;
end
$$;

drop policy if exists tenant_isolation_clientes on clientes;
create policy tenant_isolation_clientes on clientes
  for all to geolead_app
  using (id = current_setting('app.current_cliente_id', true)::uuid);

drop policy if exists tenant_isolation_contratos on contratos;
create policy tenant_isolation_contratos on contratos
  for all to geolead_app
  using (cliente_id = current_setting('app.current_cliente_id', true)::uuid);

drop policy if exists tenant_isolation_bases on bases_internas;
create policy tenant_isolation_bases on bases_internas
  for all to geolead_app
  using (cliente_id = current_setting('app.current_cliente_id', true)::uuid);

drop policy if exists tenant_isolation_perfis on perfis_ideais;
create policy tenant_isolation_perfis on perfis_ideais
  for all to geolead_app
  using (cliente_id = current_setting('app.current_cliente_id', true)::uuid);

drop policy if exists tenant_isolation_analises on analises;
create policy tenant_isolation_analises on analises
  for all to geolead_app
  using (cliente_id = current_setting('app.current_cliente_id', true)::uuid);

drop policy if exists tenant_isolation_entregas on entregas;
create policy tenant_isolation_entregas on entregas
  for all to geolead_app
  using (cliente_id = current_setting('app.current_cliente_id', true)::uuid);

grant usage on schema public to geolead_app;
grant select, insert, update, delete on all tables in schema public to geolead_app;
