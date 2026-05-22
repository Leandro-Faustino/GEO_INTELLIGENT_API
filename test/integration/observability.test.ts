import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('observability: propaga x-request-id recebido', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-request-id': 'trace-do-python-123' },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['x-request-id'], 'trace-do-python-123')
  } finally {
    await app.close()
  }
})

test('observability: gera x-request-id quando ausente', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({ method: 'GET', url: '/' })

    assert.equal(res.statusCode, 200)
    assert.equal(typeof res.headers['x-request-id'], 'string')
    assert.ok(String(res.headers['x-request-id']).length > 0)
  } finally {
    await app.close()
  }
})

test('observability: /metrics expoe metricas default e HTTP por template de rota', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    await app.inject({
      method: 'GET',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
    })

    const metrics = await app.inject({ method: 'GET', url: '/metrics' })
    const body = metrics.body

    assert.equal(metrics.statusCode, 200)
    assert.match(String(metrics.headers['content-type']), /text\/plain/)
    assert.match(body, /process_cpu_user_seconds_total/)
    assert.match(body, /http_requests_total/)
    assert.match(body, /http_request_duration_seconds_bucket/)
    assert.match(body, /route="\/clientes"/)
  } finally {
    await app.close()
  }
})
