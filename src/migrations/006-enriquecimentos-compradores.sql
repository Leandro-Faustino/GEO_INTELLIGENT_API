create table if not exists enriquecimentos_compradores (
  id uuid primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  comprador_identificador text not null,
  comprador_nome text not null default '',
  fonte text not null,
  status text not null check (status in ('sucesso', 'falha')),
  payload jsonb not null default '{}'::jsonb,
  erro text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_enriquecimentos_cliente_created
  on enriquecimentos_compradores (cliente_id, created_at desc);

create index if not exists idx_enriquecimentos_cliente_comprador
  on enriquecimentos_compradores (cliente_id, comprador_identificador, created_at desc);

create index if not exists idx_enriquecimentos_cliente_fonte
  on enriquecimentos_compradores (cliente_id, fonte, created_at desc);

alter table enriquecimentos_compradores enable row level security;

drop policy if exists enriquecimentos_compradores_tenant_isolation
  on enriquecimentos_compradores;

create policy enriquecimentos_compradores_tenant_isolation
  on enriquecimentos_compradores
  using (cliente_id::text = current_setting('app.current_cliente_id', true))
  with check (cliente_id::text = current_setting('app.current_cliente_id', true));
