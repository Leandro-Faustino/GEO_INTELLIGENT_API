import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('analises: executa lookalike e retorna oportunidades ranqueadas', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await prepararPerfil(app, token)
    const res = await app.inject({
      method: 'POST',
      url: '/analises/executar',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        escopo: 'zona-sul',
        limiarSimilaridade: 0.3,
      },
    })

    const body = res.json<{
      totalOportunidades: number
      oportunidades: Array<{ entidadeAlvoId: string; score: { valor: number } }>
    }>()

    assert.equal(res.statusCode, 201)
    assert.equal(body.totalOportunidades, 3)
    assert.equal(body.oportunidades[0]?.entidadeAlvoId, 'hotel-panorama')
    assert.equal(
      body.oportunidades.some(
        (oportunidade) => oportunidade.entidadeAlvoId === 'hotel-bela-vista',
      ),
      false,
    )
    assert.ok(body.oportunidades[0]!.score.valor >= body.oportunidades[1]!.score.valor)
  } finally {
    await app.close()
  }
})

test('analises: outro usuário não executa nem consulta análise de cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await prepararPerfil(app, aliceToken)

    const analiseAlice = await app.inject({
      method: 'POST',
      url: '/analises/executar',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: {
        clienteId,
        escopo: 'zona-sul',
        limiarSimilaridade: 0.3,
      },
    })
    assert.equal(analiseAlice.statusCode, 201)
    const analiseId = analiseAlice.json<{ id: string }>().id

    const executarBob = await app.inject({
      method: 'POST',
      url: '/analises/executar',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        clienteId,
        escopo: 'zona-sul',
        limiarSimilaridade: 0.3,
      },
    })
    assert.equal(executarBob.statusCode, 403)

    const buscarBob = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    assert.equal(buscarBob.statusCode, 403)
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
      razaoSocial: 'Cliente Analise',
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
