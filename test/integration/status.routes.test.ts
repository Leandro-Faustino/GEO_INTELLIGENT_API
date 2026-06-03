import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp } from '../../src/test-helper.js'

test('status: health check retorna ok quando dependencias opcionais estao desabilitadas', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({ method: 'GET', url: '/health' })
    const body = res.json<{
      status: string
      checks: Record<string, string>
    }>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.status, 'ok')
    assert.deepEqual(body.checks, {
      postgres: 'disabled',
      mongodb: 'disabled',
      redis: 'not-configured',
    })
  } finally {
    await app.close()
  }
})

test('status: health check retorna 503 quando postgres configurado nao responde', async () => {
  const app = await buildTestApp({
    DB_ENABLED: 'true',
    DATABASE_URL: 'postgresql://localhost:1/geolead_test',
  })
  try {
    const res = await app.inject({ method: 'GET', url: '/health' })
    const body = res.json<{
      status: string
      checks: Record<string, string>
    }>()

    assert.equal(res.statusCode, 503)
    assert.equal(body.status, 'unhealthy')
    assert.equal(body.checks.postgres, 'down')
  } finally {
    await app.close()
  }
})

test('status: swagger aplica seguranca global e libera rotas publicas', async () => {
  const app = await buildTestApp({ SWAGGER_ENABLED: 'true' })
  try {
    const document = (
      app as unknown as {
        swagger: () => {
          security?: Array<Record<string, string[]>>
          paths: Record<string, Record<string, { security?: unknown }>>
        }
      }
    ).swagger()

    assert.deepEqual(document.security, [{ bearerAuth: [] }])
    assert.deepEqual(document.paths['/auth/login']?.post?.security, [])
    assert.deepEqual(document.paths['/health']?.get?.security, [])
    assert.deepEqual(document.paths['/']?.get?.security, [])
  } finally {
    await app.close()
  }
})
