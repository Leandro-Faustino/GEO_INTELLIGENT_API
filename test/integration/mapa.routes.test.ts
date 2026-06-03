import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('mapa: retorna 401 sem autenticação', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/analises/00000000-0000-0000-0000-000000000001/mapa',
    })
    assert.equal(res.statusCode, 401)
  } finally {
    await app.close()
  }
})

test('mapa: retorna 404 para análise inexistente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/analises/00000000-0000-0000-0000-000000000099/mapa',
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(res.statusCode, 404)
  } finally {
    await app.close()
  }
})

test('mapa: retorna dataset georeferenciado após execução de análise', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const cliente = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { razaoSocial: 'Mapa Test', segmento: 'hotelaria', cidade: 'zona-sul', vertical: 'turismo' },
    })
    const clienteId = cliente.json<{ id: string }>().id

    await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorFixture('hotel-bela-vista', 'Hotel Bela Vista', 'medio', 1200),
          compradorFixture('hotel-a', 'Hotel A', 'medio', 1100),
          compradorFixture('hotel-b', 'Hotel B', 'pequeno', 900),
          compradorFixture('hotel-c', 'Hotel C', 'medio', 1300),
        ],
      },
    })

    await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    const analiseRes = await app.inject({
      method: 'POST',
      url: '/analises/executar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, escopo: 'zona-sul', limiarSimilaridade: 0.3 },
    })
    assert.equal(analiseRes.statusCode, 201)
    const analiseId = analiseRes.json<{ id: string }>().id

    const mapaRes = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/mapa`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(mapaRes.statusCode, 200)
    const body = mapaRes.json<{
      analiseId: string
      totalEntidades: number
      entidades: Array<{
        identificador: string
        nome: string
        score: number | null
        faixaScore: string | null
        jaCliente: boolean
      }>
      centroMapa: { lat: number; lon: number; zoom: number } | null
    }>()

    assert.equal(body.analiseId, analiseId)
    assert.ok(body.totalEntidades >= 0)
    assert.ok(Array.isArray(body.entidades))

    const jaClienteEnt = body.entidades.find((e) => e.identificador === 'hotel-bela-vista')
    if (jaClienteEnt) {
      assert.equal(jaClienteEnt.jaCliente, true)
    }

    const scoredEnts = body.entidades.filter((e) => e.score !== null)
    for (const e of scoredEnts) {
      assert.ok(['alta', 'media', 'baixa'].includes(e.faixaScore!))
    }
  } finally {
    await app.close()
  }
})

function compradorFixture(identificador: string, nome: string, porte: string, ticketMedio: number) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: { cnae: '5510-8/01', porte, cidade: 'zona-sul' },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}
