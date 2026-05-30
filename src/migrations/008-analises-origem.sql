-- 008: adiciona coluna origem à tabela analises
-- Distingue resultados gerados pelo motor Python dos gerados pelo fallback local.

alter table analises
  add column if not exists origem text
    check (origem in ('motor', 'local'))
    default 'local';

comment on column analises.origem is
  'Indica qual engine gerou a análise: motor (Python kNN + classificador) ou local (fallback estatístico).';
