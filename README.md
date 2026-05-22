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

## Comandos

```bash
npm test
npm run test:unit
npm run test:integration
npm run typecheck
npm run build
npm audit --omit=dev
```

## Publicação no GitHub

Antes de abrir PR ou fazer push:

```bash
git status --short
npm run typecheck
npm run test:unit
npm run test:integration
npm test
npm run build
```

Não versione `.env`, credenciais reais, tokens, chaves privadas, certificados ou dumps de banco. Use secrets do GitHub Actions/ambiente de deploy para valores reais.

## Segurança

A documentação das defesas e dos testes está em [src/security/README.md](src/security/README.md).

Arquivos sensíveis são bloqueados pelo `.gitignore`, incluindo `.env`, `.env.*`, chaves privadas, certificados, logs, `node_modules/` e `dist/`.
