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

test('admin: usuario criado via repositorio consegue autenticar', async () => {
  const app = await buildTestApp()
  try {
    const adminToken = await loginAs(app, 'root@example.com', 'admin-secret-789')
    const email = 'novo.usuario@example.com'
    const senha = 'senha-criada-123'

    const criado = await app.inject({
      method: 'POST',
      url: '/admin/usuarios',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email, senha, role: 'user' },
    })

    assert.equal(criado.statusCode, 201)
    const usuario = criado.json<{ id: string; role: string }>()

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: senha },
    })

    assert.equal(login.statusCode, 200)
    const token = login.json<{ token: string }>().token
    assert.equal(typeof token, 'string')

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(me.statusCode, 200)
    assert.deepEqual(me.json(), { sub: usuario.id, role: usuario.role })
  } finally {
    await app.close()
  }
})
