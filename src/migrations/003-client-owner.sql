alter table clientes
  add column if not exists owner_id text not null default '';

create index if not exists idx_clientes_owner_id on clientes(owner_id);
