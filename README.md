# GEO Intelligent API

API Fastify + TypeScript com base de segurança, validação de ambiente, rate limiting, JWT, RBAC e testes automatizados de ataques OWASP API Security Top 10.

## Setup

```bash
npm install
cp .env.sample .env
npm run dev
```

Preencha `.env` com valores reais antes de rodar fora do ambiente de teste. O `JWT_SECRET` deve ter pelo menos 32 caracteres e nunca deve ser versionado.

## Docker local

```bash
cp .env.docker.example .env
npm run docker:up
```

O `docker-compose.yml` usa variáveis de ambiente com placeholders apenas para desenvolvimento local. Troque todos os valores de senha/segredo no `.env` local. O arquivo `.env` é ignorado pelo Git.

## Observabilidade

A API expõe métricas Prometheus em `/metrics` quando `METRICS_ENABLED=true`.
Tracing OpenTelemetry é iniciado com `TRACING_ENABLED=true` e exporta para
`OTEL_EXPORTER_OTLP_ENDPOINT`.

Para subir o stack local de observabilidade:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

## Comandos

```bash
npm test
npm run lint
npm run test:unit
npm run test:integration
npm run typecheck
npm run build
npm audit --omit=dev --audit-level=high
```

## CI/CD

O workflow `.github/workflows/ci.yml` roda em `push` e `pull_request` para
`main` e `develop`, com estágios de qualidade, testes, build, auditoria de
dependências e build Docker. O estágio de testes sobe PostgreSQL e Redis reais
como service containers e aplica as migrations antes da suíte.

O workflow `.github/workflows/cd.yml` roda apenas em tags `v*.*.*`, constrói a
imagem Docker e publica no GitHub Container Registry usando `GITHUB_TOKEN` do
próprio GitHub Actions. Dependências são mantidas pelo Dependabot em
`.github/dependabot.yml`.

## Publicação no GitHub

Antes de abrir PR ou fazer push:

```bash
git status --short
npm run typecheck
npm run test:unit
npm run test:integration
npm test
npm audit --omit=dev --audit-level=high
npm run build
docker build -t geolead-api:local .
```

Não versione `.env`, credenciais reais, tokens, chaves privadas, certificados ou dumps de banco. Use secrets do GitHub Actions/ambiente de deploy para valores reais.

## Segurança

A documentação das defesas e dos testes está em [src/security/README.md](src/security/README.md).

Arquivos sensíveis são bloqueados pelo `.gitignore`, incluindo `.env`, `.env.*`, chaves privadas, certificados, logs, `node_modules/` e `dist/`.
