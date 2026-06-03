import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  criarHashSenhaScrypt,
  findUserByCredentials,
} from '../../src/security/user-store.js'
import type { AppConfig } from '../../src/configs/env.schema.js'

test('user-store usa fixtures apenas fora de produção', () => {
  const user = findUserByCredentials('alice@example.com', 'alice-secret-123')

  assert.equal(user?.id, 'u1')
})

test('user-store em produção exige admin por hash scrypt do ambiente', () => {
  const config = {
    NODE_ENV: 'production',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD_HASH: criarHashSenhaScrypt('senha-forte', 'test-salt'),
  } as AppConfig

  const ok = findUserByCredentials('admin@example.com', 'senha-forte', config)
  const wrong = findUserByCredentials('alice@example.com', 'alice-secret-123', config)

  assert.equal(ok?.id, 'admin-env')
  assert.equal(ok?.role, 'admin')
  assert.equal(wrong, undefined)
})
