alter table oportunidades
  add column if not exists nome text not null default '',
  add column if not exists endereco text not null default '',
  add column if not exists faixa_score text not null default 'baixa';
