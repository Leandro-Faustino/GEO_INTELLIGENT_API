import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('clientes: cria cliente autenticado usando schema GeoLead', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Cliente Teste',
        segmento: 'varejo',
        cidade: 'São Paulo',
        vertical: 'imoveis',
        role: 'admin',
      },
    })

    assert.equal(res.statusCode, 201)
    assert.equal(res.json<{ razaoSocial: string }>().razaoSocial, 'Cliente Teste')
  } finally {
    await app.close()
  }
})

test('clientes: lista com paginação usando defaults do schema', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.equal(res.json<{ limit: number; offset: number }>().limit, 20)
    assert.equal(res.json<{ limit: number; offset: number }>().offset, 0)
  } finally {
    await app.close()
  }
})

test('clientes: rota protegida sem token retorna 401', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({ method: 'GET', url: '/clientes' })

    assert.equal(res.statusCode, 401)
  } finally {
    await app.close()
  }
})

test('clientes: mass assignment e descartado pelo schema', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Cliente Sem Role',
        segmento: 'varejo',
        cidade: 'São Paulo',
        vertical: 'imoveis',
        role: 'admin',
      },
    })

    assert.equal(res.statusCode, 201)
    assert.equal(res.json<{ role?: string }>().role, undefined)
  } finally {
    await app.close()
  }
})

test('clientes: importa base interna', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const cliente = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Cliente Base',
        segmento: 'varejo',
        cidade: 'São Paulo',
        vertical: 'imoveis',
      },
    })
    const clienteId = cliente.json<{ id: string }>().id

    const res = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          {
            identificador: 'comprador-1',
            nome: 'Comprador Teste',
            tipo: 'pj',
            atributosOriginais: {},
            ticketMedio: 100,
            frequencia: 2,
            ativo: true,
          },
        ],
      },
    })

    assert.equal(res.statusCode, 201)
    assert.equal(res.json<{ totalImportados: number }>().totalImportados, 1)
  } finally {
    await app.close()
  }
})
