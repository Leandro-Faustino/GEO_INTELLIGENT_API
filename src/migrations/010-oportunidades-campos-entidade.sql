alter table oportunidades
  add column if not exists entidade_nome text not null default '',
  add column if not exists entidade_cidade text not null default '',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
