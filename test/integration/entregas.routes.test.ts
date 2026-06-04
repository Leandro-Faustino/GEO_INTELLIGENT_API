import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('entregas: montar entrega retorna 404 para cliente inexistente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId: 'cliente-inexistente',
        periodo: '2026-05',
        formato: 'planilha',
      },
    })

    assert.equal(res.statusCode, 404)
    assert.match(res.json<{ message: string }>().message, /cliente-inexistente/)
  } finally {
    await app.close()
  }
})

test('entregas: montar entrega válida retorna 201 com id e totalOportunidades', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const criarRes = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Empresa Entrega Test',
        segmento: 'hotelaria',
        cidade: 'Joinville',
        vertical: 'b2b',
      },
    })
    assert.equal(criarRes.statusCode, 201)
    const clienteId = criarRes.json<{ id: string }>().id

    const res = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        periodo: '2026-Q1',
        formato: 'planilha',
      },
    })

    const body = res.json<{ id: string; totalOportunidades: number; clienteId: string }>()
    assert.equal(res.statusCode, 201)
    assert.ok(body.id, 'deve retornar id')
    assert.equal(body.clienteId, clienteId)
    assert.equal(body.totalOportunidades, 0)
  } finally {
    await app.close()
  }
})

test('entregas: listar por clienteId retorna array paginado', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const criarRes = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Empresa Listar Test',
        segmento: 'hotelaria',
        cidade: 'Joinville',
        vertical: 'b2b',
      },
    })
    const clienteId = criarRes.json<{ id: string }>().id

    await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, periodo: '2026-Q1', formato: 'planilha' },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/entregas?clienteId=${clienteId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    const body = res.json<{ items: unknown[]; total: number }>()
    assert.equal(res.statusCode, 200)
    assert.ok(Array.isArray(body.items))
    assert.ok(body.total >= 1)
  } finally {
    await app.close()
  }
})

test('entregas: buscar por id retorna entrega criada', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const criarRes = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Empresa Buscar Test',
        segmento: 'hotelaria',
        cidade: 'Joinville',
        vertical: 'b2b',
      },
    })
    const clienteId = criarRes.json<{ id: string }>().id

    const criarEntregaRes = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, periodo: '2026-Q2', formato: 'pdf' },
    })
    const entregaId = criarEntregaRes.json<{ id: string }>().id

    const res = await app.inject({
      method: 'GET',
      url: `/entregas/${entregaId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    const body = res.json<{ id: string; formato: string }>()
    assert.equal(res.statusCode, 200)
    assert.equal(body.id, entregaId)
    assert.equal(body.formato, 'pdf')
  } finally {
    await app.close()
  }
})

test('entregas: registrar feedback retorna 404 para entrega inexistente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/entregas/entrega-que-nao-existe/feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        observacoes: 'lead convertido parcialmente',
        resultados: [{ entidadeAlvoId: 'entidade-1', converteu: true }],
      },
    })

    assert.equal(res.statusCode, 404)
  } finally {
    await app.close()
  }
})

test('entregas: formato inválido retorna 400', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId: 'qualquer',
        periodo: '2026-Q1',
        formato: 'csv',
      },
    })

    assert.equal(res.statusCode, 400)
  } finally {
    await app.close()
  }
})
