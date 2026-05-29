import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('perfis: deriva perfil a partir da base interna', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)
    const res = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    assert.equal(res.statusCode, 201)
    assert.equal(res.json<{ tipo: string }>().tipo, 'pj')
    assert.ok(res.json<{ criterios: unknown[] }>().criterios.length >= 4)
  } finally {
    await app.close()
  }
})

test('perfis: lista por cliente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/perfis?clienteId=cliente-1',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.json<unknown[]>(), [])
  } finally {
    await app.close()
  }
})

test('perfis: enriquece perfil e persiste nova versão', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['ibge-censo', 'geocoder'] },
    })

    const body = res.json<{
      perfilOriginal: { totalFatores: number }
      perfilEnriquecido: { totalFatores: number }
      fontesConsultadas: string[]
    }>()

    assert.equal(res.statusCode, 200)
    assert.ok(body.perfilEnriquecido.totalFatores > body.perfilOriginal.totalFatores)
    assert.deepEqual(body.fontesConsultadas.sort(), ['geocoder', 'ibge-censo'])

    const perfis = await app.perfilRepo.buscarPorCliente(clienteId)
    assert.equal(perfis.length, 1)
    assert.equal(perfis[0]?.criterios.length, body.perfilEnriquecido.totalFatores)
  } finally {
    await app.close()
  }
})

test('perfis: enriquecer com fonte inválida retorna 422', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['fonte-inexistente'] },
    })

    assert.equal(res.statusCode, 422)
  } finally {
    await app.close()
  }
})

test('perfis: outro usuário não enriquece cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await criarClienteComBase(app, aliceToken)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { clienteId, fontes: ['ibge-censo'] },
    })

    assert.equal(res.statusCode, 403)
  } finally {
    await app.close()
  }
})

async function criarClienteComBase(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Perfil',
      segmento: 'hotelaria',
      cidade: 'São Paulo',
      vertical: 'turismo',
    },
  })
  const clienteId = cliente.json<{ id: string }>().id

  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/base-interna`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      periodo: '2026-05',
      compradores: [
        comprador('hotel-bela-vista', 'Hotel Bela Vista', 'medio', 1200),
        comprador('hotel-a', 'Hotel A', 'medio', 1100),
        comprador('hotel-b', 'Hotel B', 'pequeno', 900),
        comprador('hotel-c', 'Hotel C', 'medio', 1300),
      ],
    },
  })

  return clienteId
}

function comprador(
  identificador: string,
  nome: string,
  porte: string,
  ticketMedio: number,
) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: {
      cnae: '5510-8/01',
      porte,
      cidade: 'São Paulo',
    },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}
