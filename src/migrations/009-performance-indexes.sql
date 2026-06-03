-- Índice composto para queries de paginação em analises.listarPorCliente()
create index if not exists idx_analises_cliente_criado
  on analises(cliente_id, created_at desc);

-- Índice composto para queries de listagem em perfis.buscarPorCliente()
create index if not exists idx_perfis_cliente_criado
  on perfis_ideais(cliente_id, created_at desc);
