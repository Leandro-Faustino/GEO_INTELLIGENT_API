import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('entregas: montar entrega retorna 422 enquanto service nao existe', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId: 'cliente-1',
        periodo: '2026-05',
        formato: 'planilha',
      },
    })

    assert.equal(res.statusCode, 422)
    assert.match(res.json<{ message: string }>().message, /entrega/)
  } finally {
    await app.close()
  }
})

test('entregas: registrar feedback retorna 422 enquanto service nao existe', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/entregas/entrega-1/feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        observacoes: 'lead convertido parcialmente',
        resultados: [{ entidadeAlvoId: 'entidade-1', converteu: true }],
      },
    })

    assert.equal(res.statusCode, 422)
    assert.match(res.json<{ message: string }>().message, /feedback/)
  } finally {
    await app.close()
  }
})
