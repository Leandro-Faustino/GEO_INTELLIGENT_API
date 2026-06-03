import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('entregas: monta entrega a partir de uma analise existente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteCompleto(app, token)
    const analiseId = await executarAnalise(app, token, clienteId)

    const res = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        analiseId,
        periodo: '2026-05',
        formato: 'planilha',
      },
    })

    assert.equal(res.statusCode, 201)
    const body = res.json<{
      id: string
      clienteId: string
      analiseId: string
      totalOportunidades: number
    }>()
    assert.equal(body.clienteId, clienteId)
    assert.equal(body.analiseId, analiseId)
    assert.ok(body.totalOportunidades > 0)
  } finally {
    await app.close()
  }
})

test('entregas: consulta entrega persistida e registra feedback', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteCompleto(app, token)
    const analiseId = await executarAnalise(app, token, clienteId)

    const entregaRes = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        analiseId,
        periodo: '2026-05',
        formato: 'planilha',
      },
    })
    const entregaId = entregaRes.json<{ id: string }>().id

    const buscar = await app.inject({
      method: 'GET',
      url: `/entregas/${entregaId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(buscar.statusCode, 200)
    assert.equal(buscar.json<{ id: string }>().id, entregaId)

    const feedback = await app.inject({
      method: 'POST',
      url: `/entregas/${entregaId}/feedback`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        observacoes: 'lead convertido parcialmente',
        resultados: [{ entidadeAlvoId: 'hotel-panorama', converteu: true, ticketReal: 850 }],
      },
    })

    assert.equal(feedback.statusCode, 200)
    const body = feedback.json<{
      entregaId: string
      resultados: Array<{ entidadeAlvoId: string; converteu: boolean; ticketReal?: number }>
    }>()
    assert.equal(body.entregaId, entregaId)
    assert.equal(body.resultados[0]?.entidadeAlvoId, 'hotel-panorama')
    assert.equal(body.resultados[0]?.converteu, true)
  } finally {
    await app.close()
  }
})

test('entregas: outro usuário não acessa entrega nem registra feedback de cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')

    const clienteId = await criarClienteCompleto(app, aliceToken)
    const analiseId = await executarAnalise(app, aliceToken, clienteId)

    const entregaRes = await app.inject({
      method: 'POST',
      url: '/entregas',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { clienteId, analiseId, periodo: '2026-05', formato: 'planilha' },
    })
    assert.equal(entregaRes.statusCode, 201)
    const entregaId = entregaRes.json<{ id: string }>().id

    const buscarBob = await app.inject({
      method: 'GET',
      url: `/entregas/${entregaId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    assert.equal(buscarBob.statusCode, 403)

    const feedbackBob = await app.inject({
      method: 'POST',
      url: `/entregas/${entregaId}/feedback`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { observacoes: 'tentativa não autorizada' },
    })
    assert.equal(feedbackBob.statusCode, 403)
  } finally {
    await app.close()
  }
})

async function criarClienteCompleto(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Entrega',
      segmento: 'varejo',
      cidade: 'São Paulo',
      vertical: 'colchoes',
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
        {
          identificador: 'buyer-1',
          nome: 'Hotel Aurora',
          tipo: 'pj',
          atributosOriginais: { cnae: '5510801', porte: 'medio', cidade: 'São Paulo' },
          ticketMedio: 1000,
          frequencia: 3,
          ativo: true,
        },
        {
          identificador: 'buyer-2',
          nome: 'Hotel Prisma',
          tipo: 'pj',
          atributosOriginais: { cnae: '5510801', porte: 'medio', cidade: 'São Paulo' },
          ticketMedio: 1200,
          frequencia: 4,
          ativo: true,
        },
        {
          identificador: 'buyer-3',
          nome: 'Hotel Central',
          tipo: 'pj',
          atributosOriginais: { cnae: '5510801', porte: 'medio', cidade: 'São Paulo' },
          ticketMedio: 1100,
          frequencia: 2,
          ativo: true,
        },
      ],
    },
  })

  const perfil = await app.inject({
    method: 'POST',
    url: '/perfis/derivar',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      clienteId,
      tipoAlvo: 'pj',
      nome: 'Perfil Entrega',
    },
  })

  assert.equal(perfil.statusCode, 201)
  return clienteId
}

async function executarAnalise(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  token: string,
  clienteId: string,
): Promise<string> {
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

  assert.equal(res.statusCode, 201)
  return res.json<{ id: string }>().id
}
