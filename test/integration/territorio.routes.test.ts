import assert from 'node:assert/strict'
import { type FastifyInstance } from 'fastify'
import { test } from 'node:test'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('territorio: analisa regiões e recomenda a melhor', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await prepararPerfil(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/territorio/analisar',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        regioes: ['zona-sul', 'zona-norte'],
        limiar: 0.1,
      },
    })

    const body = res.json<{ regiaoRecomendada: string; regioesAnalisadas: number }>()
    assert.equal(res.statusCode, 200)
    assert.equal(body.regioesAnalisadas, 2)
    assert.equal(body.regiaoRecomendada, 'zona-sul')
  } finally {
    await app.close()
  }
})

test('territorio: outro usuário não acessa cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await prepararPerfil(app, aliceToken)

    const res = await app.inject({
      method: 'POST',
      url: '/territorio/analisar',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        clienteId,
        regioes: ['zona-sul', 'zona-norte'],
      },
    })

    assert.equal(res.statusCode, 403)
  } finally {
    await app.close()
  }
})

async function prepararPerfil(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Território',
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

  await app.inject({
    method: 'POST',
    url: '/perfis/derivar',
    headers: { authorization: `Bearer ${token}` },
    payload: { clienteId, tipoAlvo: 'pj' },
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
