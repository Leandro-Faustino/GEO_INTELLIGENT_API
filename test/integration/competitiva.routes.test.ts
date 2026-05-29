import assert from 'node:assert/strict'
import { type FastifyInstance } from 'fastify'
import { test } from 'node:test'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('competitiva: identifica fornecedores compatíveis na região', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await prepararPerfil(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/competitiva/analisar',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        regiao: 'fornecedores-centro',
      },
    })

    const body = res.json<{
      totalFornecedoresRegiao: number
      concentracao: string
      concorrentes: Array<{ cnae: string }>
    }>()
    assert.equal(res.statusCode, 200)
    assert.equal(body.totalFornecedoresRegiao, 2)
    assert.equal(body.concentracao, 'baixa')
    assert.deepEqual(
      body.concorrentes.map((item) => item.cnae).sort(),
      ['3104700', '4649401'],
    )
  } finally {
    await app.close()
  }
})

test('competitiva: perfil sem mapeamento competitivo retorna 422', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const cliente = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        razaoSocial: 'Cliente Sem Mapa',
        segmento: 'padaria',
        cidade: 'São Paulo',
        vertical: 'varejo',
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
            identificador: 'padaria-1',
            nome: 'Padaria 1',
            tipo: 'pj',
            atributosOriginais: {
              cnae: '4721-1/02',
              porte: 'medio',
              cidade: 'São Paulo',
            },
            ticketMedio: 500,
            frequencia: 2,
            ativo: true,
          },
          {
            identificador: 'padaria-2',
            nome: 'Padaria 2',
            tipo: 'pj',
            atributosOriginais: {
              cnae: '4721-1/02',
              porte: 'medio',
              cidade: 'São Paulo',
            },
            ticketMedio: 450,
            frequencia: 2,
            ativo: true,
          },
          {
            identificador: 'padaria-3',
            nome: 'Padaria 3',
            tipo: 'pj',
            atributosOriginais: {
              cnae: '4721-1/02',
              porte: 'medio',
              cidade: 'São Paulo',
            },
            ticketMedio: 480,
            frequencia: 2,
            ativo: true,
          },
        ],
      },
    })

    await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/competitiva/analisar',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        clienteId,
        regiao: 'fornecedores-centro',
      },
    })

    assert.equal(res.statusCode, 422)
  } finally {
    await app.close()
  }
})

test('competitiva: outro usuário não acessa cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await prepararPerfil(app, aliceToken)

    const res = await app.inject({
      method: 'POST',
      url: '/competitiva/analisar',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {
        clienteId,
        regiao: 'fornecedores-centro',
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
      razaoSocial: 'Cliente Competitiva',
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
