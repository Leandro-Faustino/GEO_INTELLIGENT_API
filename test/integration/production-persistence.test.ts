import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp } from '../../src/test-helper.js'
import { criarHashSenhaScrypt } from '../../src/security/user-store.js'

const adminHash = criarHashSenhaScrypt('admin-test-password', 'admin-test-salt')

test('produção com DB_ENABLED=true falha sem PostgreSQL configurado', async () => {
  await assert.rejects(
    () =>
      buildTestApp({
        NODE_ENV: 'production',
        DB_ENABLED: 'true',
        POSTGRES_URL: '',
        DATABASE_URL: '',
        MONGO_URL: '',
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD_HASH: adminHash,
      }),
    /POSTGRES_URL\/DATABASE_URL é obrigatório/,
  )
})

test('produção com DB_ENABLED=true falha sem MongoDB configurado', async () => {
  await assert.rejects(
    () =>
      buildTestApp({
        NODE_ENV: 'production',
        DB_ENABLED: 'true',
        POSTGRES_URL: 'postgresql://user:pass@127.0.0.1:1/geolead',
        DATABASE_URL: '',
        MONGO_URL: '',
        ADMIN_EMAIL: 'admin@example.com',
        ADMIN_PASSWORD_HASH: adminHash,
      }),
    /MONGO_URL é obrigatório/,
  )
})
