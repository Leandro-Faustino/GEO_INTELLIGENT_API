# Documento de Entrega - Caso de Uso

## Projeto

**Nome:** GeoLead API  
**Tipo:** API REST segura e modular  
**Descrição:** API Fastify + TypeScript para inteligência geográfica de leads, com autenticação JWT, RBAC, validação de schemas, PostgreSQL, Redis opcional, OpenAPI, migrations e organização por bounded contexts.

## Objetivo do Caso de Uso

Disponibilizar uma base backend segura para cadastrar clientes, importar base interna, derivar perfis ideais, executar análises lookalike, montar entregas e registrar feedbacks. A base OWASP anterior foi preservada e a evolução estrutural foi feita de forma aditiva.

## Tecnologias Utilizadas

| Tecnologia | Uso no projeto |
| --- | --- |
| Node.js >= 20 | Runtime da aplicação |
| TypeScript | Tipagem estática |
| Fastify 5 | Framework HTTP |
| TypeBox | Schemas tipados de entrada e saída |
| PostgreSQL | Persistência relacional |
| Redis | Cache opcional |
| Docker / Compose | Ambiente local com app, PostgreSQL e Redis |
| Swagger / OpenAPI | Documentação em `/docs` |
| JWT / RBAC | Autenticação e autorização |
| Helmet / CORS / Rate Limit | Segurança HTTP |
| ESLint / Prettier | Qualidade e formatação |
| node:test | Testes unitários, integração e segurança |

## Estrutura de Pastas

```text
GEO_INTELLIGENT_API/
├── .env.sample
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md
│   └── ENTREGA_CASO_DE_USO.md
├── scripts/
│   ├── migrate.ts
│   └── seed.ts
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── test-helper.ts
│   ├── adapters/
│   │   ├── base-adapter.ts
│   │   ├── cnpj.adapter.ts
│   │   ├── geocoder.adapter.ts
│   │   ├── ibge.adapter.ts
│   │   └── registro-imoveis.adapter.ts
│   ├── configs/
│   │   └── env.schema.ts
│   ├── migrations/
│   │   ├── 001-create-clientes.sql
│   │   ├── 002-create-compradores.sql
│   │   ├── 003-create-perfis.sql
│   │   ├── 004-create-entidades-alvo.sql
│   │   ├── 005-create-analises.sql
│   │   └── 006-create-entregas.sql
│   ├── plugins/
│   │   ├── 00-config.ts
│   │   ├── 10-security.ts
│   │   ├── 20-support.ts
│   │   ├── 30-auth.ts
│   │   ├── 40-nosql-guard.ts
│   │   ├── 42-datasource.ts
│   │   ├── 55-cache.ts
│   │   └── 60-swagger.ts
│   ├── repositories/
│   │   ├── interfaces/
│   │   └── pg/
│   ├── routes/
│   │   ├── autohooks.ts
│   │   ├── root.routes.ts
│   │   ├── secure.routes.ts
│   │   ├── admin/
│   │   ├── analises/
│   │   ├── auth/
│   │   ├── clientes/
│   │   ├── entregas/
│   │   └── perfis/
│   ├── schemas/
│   │   ├── loader.ts
│   │   ├── shared/
│   │   ├── clientes/
│   │   ├── perfis/
│   │   ├── analises/
│   │   └── entregas/
│   ├── security/
│   ├── services/
│   └── types/
└── test/
    ├── owasp.security.test.ts
    ├── fixtures/
    ├── integration/
    └── unit/
```

## Camadas

| Camada | Diretório | Responsabilidade |
| --- | --- | --- |
| Plugins | `src/plugins/` | Boot determinístico, segurança, datasource, cache e OpenAPI. |
| Schemas | `src/schemas/` | 14 contratos TypeBox registrados antes das rotas via `loader.ts`. |
| Routes | `src/routes/` | Endpoints por bounded context. |
| Services | `src/services/` | Regras de negócio puras, sem Fastify ou banco. |
| Repositories | `src/repositories/` | Interfaces e implementação PostgreSQL. |
| Adapters | `src/adapters/` | Integrações externas com interface comum. |
| Migrations | `src/migrations/` | DDL versionado. |
| Tests | `test/` | Segurança, unidade, integração e fixtures. |

## Schemas Registrados

Os schemas usam `$id` único no padrão `schema:geolead:<domínio>:<escopo>` e são carregados em `app.ts` na ordem `plugins -> schemas -> routes`.

| Domínio | Quantidade | Escopos |
| --- | ---: | --- |
| `shared` | 3 | `id-params`, `pagination`, `error` |
| `clientes` | 4 | `create-body`, `update-body`, `response`, `importar-base` |
| `perfis` | 2 | `derivar-body`, `response` |
| `analises` | 2 | `executar-body`, `response` |
| `entregas` | 3 | `montar-body`, `feedback-body`, `response` |

Todos os schemas de entrada usam `additionalProperties: false`, reforçando a proteção contra mass assignment.

## package.json

```json
{
  "name": "api-base",
  "version": "0.1.0",
  "description": "Base segura de API Fastify + TypeScript",
  "type": "module",
  "main": "dist/server.js",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "rimraf dist && tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "test": "node --import tsx test/owasp.security.test.ts",
    "test:security": "node --import tsx test/owasp.security.test.ts",
    "test:unit": "node --import tsx --test test/unit/**/*.test.ts",
    "test:integration": "node --import tsx --test test/integration/**/*.test.ts",
    "lint": "eslint . --ext .ts",
    "lint:fix": "eslint . --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "audit": "npm audit --omit=dev",
    "migrate": "tsx scripts/migrate.ts",
    "seed": "tsx scripts/seed.ts"
  }
}
```

Dependências principais adicionadas nesta fase:

- `@fastify/postgres`
- `@fastify/redis`
- `@fastify/swagger`
- `@fastify/swagger-ui`
- `pg`

## Endpoints Principais

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/` | Info da API |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |
| `POST` | `/auth/login` | Login JWT |
| `GET` | `/auth/me` | Usuário autenticado |
| `GET` | `/clientes` | Listar clientes |
| `POST` | `/clientes` | Criar cliente |
| `GET` | `/clientes/:id` | Buscar cliente por ID |
| `PATCH` | `/clientes/:id` | Atualizar cliente parcialmente |
| `POST` | `/clientes/:id/base-interna` | Importar base interna |
| `POST` | `/perfis/derivar` | Derivar perfil ideal |
| `GET` | `/perfis/:id` | Consultar perfil |
| `GET` | `/perfis?clienteId=` | Listar perfis do cliente |
| `POST` | `/analises/executar` | Executar lookalike |
| `GET` | `/analises/:id` | Consultar análise |
| `POST` | `/entregas` | Montar entrega |
| `GET` | `/entregas/:id` | Consultar entrega |
| `POST` | `/entregas/:id/feedback` | Registrar feedback |
| `GET` | `/admin/stats` | Demo RBAC preservada para OWASP |
| `GET` | `/documents/:id` | Demo BOLA preservada para OWASP |
| `POST` | `/fetch-remote` | Demo SSRF preservada para OWASP |

## Como Executar

```bash
npm install
cp .env.sample .env
npm run dev
```

Com Docker:

```bash
docker compose up --build
```

Migrations e seed:

```bash
npm run migrate
npm run seed
```

## Validação

```bash
npm run typecheck
npm test
npm run test:unit
npm run test:integration
npm run build
npm audit --omit=dev
```

## Arquivos para Entrega

Entregar `src/`, `test/`, `docs/`, `scripts/`, `Dockerfile`, `docker-compose.yml`, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json` e `.env.sample`.

Não entregar `.env` real, `node_modules/`, `dist/`, logs locais, chaves privadas, certificados ou segredos.
