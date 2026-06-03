create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null,
  entidade_alvo_id text not null,
  entidade_nome text not null,
  entidade_cidade text not null default '',
  score numeric(5,4) not null check (score >= 0 and score <= 1),
  mensagem text not null,
  status text not null check (status in ('novo', 'visto', 'descartado', 'convertido')),
  criado_em timestamptz not null default now(),
  unique (cliente_id, entidade_alvo_id)
);

create index if not exists idx_alertas_cliente on alertas(cliente_id, criado_em desc);
create index if not exists idx_alertas_cliente_status on alertas(cliente_id, status);

alter table alertas enable row level security;

drop policy if exists tenant_isolation_alertas on alertas;
create policy tenant_isolation_alertas on alertas
  for all to geolead_app
  using (cliente_id = current_setting('app.current_cliente_id', true)::uuid);

grant select, insert, update, delete on alertas to geolead_app;
