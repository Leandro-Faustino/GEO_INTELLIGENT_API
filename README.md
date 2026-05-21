# GEO Intelligent API

API Fastify + TypeScript com base de segurança, validação de ambiente, rate limiting, JWT, RBAC e testes automatizados de ataques OWASP API Security Top 10.

## Setup

```bash
npm install
cp .env.sample .env
npm run dev
```

Preencha `.env` com valores reais antes de rodar fora do ambiente de teste. O `JWT_SECRET` deve ter pelo menos 32 caracteres e nunca deve ser versionado.

## Comandos

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

## Segurança

A documentação das defesas e dos testes está em [src/security/README.md](src/security/README.md).

Arquivos sensíveis são bloqueados pelo `.gitignore`, incluindo `.env`, `.env.*`, chaves privadas, certificados, logs, `node_modules/` e `dist/`.
