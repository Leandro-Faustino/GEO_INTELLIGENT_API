create extension if not exists "pgcrypto";

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null check (length(razao_social) between 1 and 200),
  segmento text not null,
  cidade text not null,
  endereco text not null default '',
  vertical text not null default '',
  parametros_negocio jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  periodicidade text not null,
  vertical text not null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'encerrado')),
  data_inicio date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_contratos_cliente on contratos(cliente_id);

create table if not exists bases_internas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  periodo text not null,
  total_registros integer not null default 0 check (total_registros >= 0),
  created_at timestamptz not null default now(),
  unique (cliente_id, periodo)
);
create index if not exists idx_bases_cliente on bases_internas(cliente_id);

create table if not exists compradores_conhecidos (
  id uuid primary key default gen_random_uuid(),
  base_interna_id uuid not null references bases_internas(id) on delete cascade,
  identificador text not null,
  nome text not null,
  tipo text not null check (tipo in ('pj', 'pf', 'territorio')),
  atributos_originais jsonb not null default '{}'::jsonb,
  ticket_medio numeric(14,2) not null default 0 check (ticket_medio >= 0),
  frequencia integer not null default 0 check (frequencia >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_compradores_base on compradores_conhecidos(base_interna_id);
create index if not exists idx_compradores_bons
  on compradores_conhecidos(base_interna_id)
  where ativo = true and frequencia >= 2;

create table if not exists perfis_ideais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('pj', 'pf', 'territorio')),
  hipotetico boolean not null default false,
  exclusoes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_perfis_cliente on perfis_ideais(cliente_id);

create table if not exists criterios_derivados (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfis_ideais(id) on delete cascade,
  nome text not null,
  valor_min jsonb,
  valor_max jsonb,
  peso numeric(4,3) not null check (peso >= 0 and peso <= 1),
  tipo_comparacao text not null check (tipo_comparacao in ('range', 'enum', 'distancia', 'booleano'))
);
create index if not exists idx_criterios_perfil on criterios_derivados(perfil_id);

create table if not exists analises (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  perfil_id uuid references perfis_ideais(id) on delete set null,
  tipo text not null,
  escopo text not null,
  versao_modelo text not null default '0.1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_analises_cliente on analises(cliente_id);

create table if not exists oportunidades (
  id uuid primary key default gen_random_uuid(),
  analise_id uuid not null references analises(id) on delete cascade,
  entidade_alvo_id text not null,
  tipo text not null,
  justificativa text not null,
  gancho_abordagem text not null,
  prioridade text not null check (prioridade in ('alta', 'media', 'baixa')),
  score_valor numeric(5,4) not null check (score_valor >= 0 and score_valor <= 1),
  score_similaridade numeric(5,4) not null,
  score_prob_conversao numeric(5,4) not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_oportunidades_analise on oportunidades(analise_id);
create index if not exists idx_oportunidades_score on oportunidades(analise_id, score_valor desc);

create table if not exists entregas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  contrato_id uuid references contratos(id) on delete set null,
  tipo text not null,
  periodo text not null,
  formato text not null default 'planilha',
  total_oportunidades integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_entregas_cliente on entregas(cliente_id);

create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas(id) on delete cascade,
  exclusoes jsonb not null default '[]'::jsonb,
  ajustes jsonb not null default '[]'::jsonb,
  resultados jsonb not null default '[]'::jsonb,
  observacoes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_feedbacks_entrega on feedbacks(entrega_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clientes_updated on clientes;
create trigger trg_clientes_updated before update on clientes
  for each row execute function set_updated_at();

drop trigger if exists trg_perfis_updated on perfis_ideais;
create trigger trg_perfis_updated before update on perfis_ideais
  for each row execute function set_updated_at();

drop trigger if exists trg_entregas_updated on entregas;
create trigger trg_entregas_updated before update on entregas
  for each row execute function set_updated_at();
