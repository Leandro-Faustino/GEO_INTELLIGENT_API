import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('admin: usuario comum recebe 403 em /admin/stats', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 403)
  } finally {
    await app.close()
  }
})

test('admin: admin acessa /admin/stats', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'root@example.com', 'admin-secret-789')
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(typeof res.json<{ uptime: number }>().uptime, 'number')
  } finally {
    await app.close()
  }
})
