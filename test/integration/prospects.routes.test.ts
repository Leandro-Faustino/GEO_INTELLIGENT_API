import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

async function criarCliente(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  token: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Prospects',
      segmento: 'saude',
      cidade: 'Joinville',
      vertical: 'saude',
    },
  })
  return res.json<{ id: string }>().id
}

function prospect(id: string, lat?: number, lon?: number) {
  return {
    identificador: id,
    nome: `Prospect ${id}`,
    tipo: 'pf',
    atributos: { profissao: 'dentista', idade: 38, renda: 9000, bairro: 'Centro' },
    endereco: 'Rua das Flores, 1',
    ...(lat !== undefined ? { latitude: lat } : {}),
    ...(lon !== undefined ? { longitude: lon } : {}),
  }
}

test('prospects: importar lote retorna contadores corretos', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    const res = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/prospects`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        escopo: 'joinville-pf-2026',
        prospects: [
          prospect('pf-001', -26.304, -48.846),
          prospect('pf-002', -26.308, -48.840),
          prospect('pf-003'),  // sem coordenadas
        ],
      },
    })

    assert.equal(res.statusCode, 201)
    const body = res.json<{
      escopo: string
      totalImportados: number
      comCoordenadas: number
      semCoordenadas: number
    }>()
    assert.equal(body.escopo, 'joinville-pf-2026')
    assert.equal(body.totalImportados, 3)
    assert.equal(body.comCoordenadas, 2)
    assert.equal(body.semCoordenadas, 1)
  } finally {
    await app.close()
  }
})

test('prospects: importar lote PJ funciona com os mesmos campos', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    const res = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/prospects`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        escopo: 'joinville-pj-2026',
        prospects: [
          {
            identificador: 'cnpj-001',
            nome: 'Empresa A',
            tipo: 'pj',
            atributos: { cnae: '8630-5/04', porte: 'medio' },
            latitude: -26.3,
            longitude: -48.85,
          },
        ],
      },
    })

    assert.equal(res.statusCode, 201)
    assert.equal(res.json<{ totalImportados: number }>().totalImportados, 1)
    assert.equal(res.json<{ comCoordenadas: number }>().comCoordenadas, 1)
  } finally {
    await app.close()
  }
})

test('prospects: identificadores duplicados no lote retornam 422', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    const res = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/prospects`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        escopo: 'joinville-pf-2026',
        prospects: [
          prospect('pf-001', -26.304, -48.846),
          prospect('pf-001', -26.308, -48.840), // duplicado
        ],
      },
    })

    assert.equal(res.statusCode, 422)
    assert.ok(
      res.json<{ message: string }>().message.toLowerCase().includes('duplicado'),
    )
  } finally {
    await app.close()
  }
})

test('prospects: cliente inexistente retorna 404', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const res = await app.inject({
      method: 'POST',
      url: '/clientes/cliente-nao-existe/prospects',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        escopo: 'escopo-qualquer',
        prospects: [prospect('pf-001', -26.304, -48.846)],
      },
    })

    assert.equal(res.statusCode, 404)
  } finally {
    await app.close()
  }
})

test('prospects: rota exige autenticação (401)', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/clientes/qualquer-id/prospects',
      payload: {
        escopo: 'teste',
        prospects: [prospect('pf-001')],
      },
    })

    assert.equal(res.statusCode, 401)
  } finally {
    await app.close()
  }
})
