# Práticas de Persistência

## Divisão

| Banco | Uso |
| --- | --- |
| PostgreSQL | Dados relacionais e transacionais: clientes, base interna, perfis, análises, oportunidades, entregas e feedbacks. |
| MongoDB | Entidades-alvo e territórios, com atributos flexíveis e índice geoespacial `2dsphere`. |
| Redis | Cache-aside para fontes externas, scores e dados caros de recomputar. |

## Operação

A aplicação usa `DB_ENABLED=false` por padrão. Nesse modo, os repositórios em memória continuam ativos e a API sobe sem infraestrutura externa.

Com `DB_ENABLED=true`, o plugin `42-datasource.ts` conecta os bancos configurados:

- `POSTGRES_URL` ou `DATABASE_URL`
- `MONGO_URL`
- `REDIS_URL`

O plugin `45-services.ts` escolhe as implementações concretas sem alterar services, rotas ou schemas.

## PostgreSQL

- UUID como chave primária.
- Queries parametrizadas.
- Constraints `CHECK`.
- Índices em FKs e filtros do motor.
- RLS para isolamento por tenant via `app.current_cliente_id`.

## MongoDB

- Coleção `entidades_alvo`.
- Índice `2dsphere` em `location`.
- `bulkWrite` com upsert para carga em lote.
- Campos flexíveis em `atributos`.

## Redis

- `remember()` implementa cache-aside.
- TTL padrão configurável por `CACHE_TTL_SECONDS`.
- Fallback em memória quando `REDIS_URL` não está configurado.
- Os adapters de fontes externas usam `CachedFonteAdapter`, preservando o mesmo
  contrato com Redis ou memória.
