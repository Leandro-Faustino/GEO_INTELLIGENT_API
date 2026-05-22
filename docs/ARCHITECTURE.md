# Arquitetura - GeoLead API

## Regra Geral

A evolução da estrutura é aditiva. A base segura existente continua ativa e as novas camadas organizam o domínio GeoLead por bounded context.

## Ordem de Boot

1. `plugins/`: configuração, segurança, suporte, autenticação, datasource, cache e OpenAPI.
2. `schemas/`: contratos JSON Schema registrados via `fastify.addSchema()`.
3. `routes/`: endpoints carregados por contexto de negócio.

## Camadas

| Camada | Diretório | Regra |
| --- | --- | --- |
| Plugins | `src/plugins/` | Plugins Fastify numerados para ordem determinística. |
| Schemas | `src/schemas/` | 14 contratos TypeBox por domínio e schemas compartilhados. |
| Routes | `src/routes/` | Bounded contexts HTTP; autohooks aplicam políticas por pasta. |
| Services | `src/services/` | Lógica de negócio pura, sem Fastify, HTTP ou banco. |
| Repositories | `src/repositories/` | Interfaces e implementações concretas de persistência. |
| Adapters | `src/adapters/` | Integração com fontes externas atrás de uma interface comum. |
| Migrations | `src/migrations/` | DDL versionado e executável por script. |

## Schemas

A camada `src/schemas/` segue o padrão de loader dedicado: `src/schemas/loader.ts`
registra todos os contratos com `fastify.addSchema()` depois dos plugins e antes
das rotas.

São registrados 14 schemas com `$id` único no formato:

```text
schema:geolead:<dominio>:<escopo>
```

Distribuição:

- `shared/`: `id-params`, `pagination`, `error`.
- `clientes/`: criação, atualização, resposta e importação de base interna.
- `perfis/`: derivação e resposta do perfil ideal.
- `analises/`: execução de lookalike e resposta ranqueada.
- `entregas/`: montagem, feedback e resposta da entrega.

Todo schema de entrada usa `additionalProperties: false`. Combinado com
`removeAdditional: 'all'` no Ajv, isso remove campos extras antes dos handlers
e reduz risco de mass assignment.

## Regras de Dependência

- Routes podem chamar services e usar schemas.
- Services dependem apenas de interfaces de repositories/adapters.
- Repositories concretos ficam isolados em `repositories/pg/`.
- Adapters implementam `IAdaptadorFonte`.
- Segurança transversal fica em plugins e autohooks.

## Compatibilidade

Os endpoints usados pelos testes OWASP permanecem disponíveis:

- `POST /auth/login`
- `GET /auth/me`
- `GET /documents/:id`
- `GET /admin/stats`
- `POST /fetch-remote`

## Rotas

A camada `src/routes/` possui 6 bounded contexts e 15 arquivos:

- `auth/`: login e consulta das claims do usuário.
- `clientes/`: cadastro, listagem, busca, atualização e importação da base interna.
- `perfis/`: derivação, busca e listagem por cliente.
- `analises/`: execução e consulta de lookalike.
- `entregas/`: montagem, consulta e feedback.
- `admin/`: estatísticas protegidas por RBAC.

Cada subpasta de contexto tem um `autohooks.ts`. Os contextos `clientes/`,
`perfis/`, `analises/` e `entregas/` aplicam `fastify.authenticate`; `admin/`
aplica `authenticate` e `requireRole('admin')`; `auth/` permanece público e
registra tentativas de login.

## Preparação para Microsserviços

A camada de services concentra os casos de uso de negócio. Para extrair processamento pesado para Python, o gateway Node.js mantém autenticação, rate limit, CORS e validação; o serviço Python implementa contratos equivalentes aos services/adapters.
