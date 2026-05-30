alter table entregas
  add column if not exists analise_id uuid references analises(id) on delete set null;

create index if not exists idx_entregas_analise_id on entregas(analise_id);
