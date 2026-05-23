import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

describe('Rotas de negócio', () => {
  let app: FastifyInstance
  let token: string

  before(async () => {
    app = await buildTestApp()
    token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
  })

  after(async () => {
    await app.close()
  })

  const auth = () => ({ authorization: `Bearer ${token}` })

  test('cria e lê um cliente', async () => {
    const criar = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: auth(),
      payload: {
        razaoSocial: 'Colchões Sul',
        segmento: 'colchao',
        cidade: 'Joinville',
        vertical: 'varejo',
      },
    })
    assert.equal(criar.statusCode, 201)
    const { id } = criar.json<{ id: string }>()

    const ler = await app.inject({
      method: 'GET',
      url: `/clientes/${id}`,
      headers: auth(),
    })

    assert.equal(ler.statusCode, 200)
    assert.equal(ler.json<{ razaoSocial: string }>().razaoSocial, 'Colchões Sul')
  })

  test('rejeita cliente sem campos obrigatórios', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: auth(),
      payload: { razaoSocial: 'Incompleto' },
    })

    assert.equal(resposta.statusCode, 400)
  })

  test('exige autenticação', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/clientes',
      payload: {
        razaoSocial: 'Sem Token',
        segmento: 'x',
        cidade: 'y',
        vertical: 'z',
      },
    })

    assert.equal(resposta.statusCode, 401)
  })

  test('cliente inexistente retorna 404', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/clientes/00000000-0000-0000-0000-000000000000',
      headers: auth(),
    })

    assert.equal(resposta.statusCode, 404)
  })

  test('fluxo cria cliente, importa base e deriva perfil', async () => {
    const cliente = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: auth(),
      payload: {
        razaoSocial: 'Fluxo Completo',
        segmento: 'colchao',
        cidade: 'Joinville',
        vertical: 'varejo',
      },
    })
    const clienteId = cliente.json<{ id: string }>().id

    const base = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: auth(),
      payload: {
        periodo: '2026-05',
        compradores: [
          comprador('h1', 12_000, 4),
          comprador('h2', 8_000, 3),
          comprador('h3', 15_000, 5),
        ],
      },
    })
    assert.equal(base.statusCode, 201)

    const perfil = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: auth(),
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    assert.equal(perfil.statusCode, 201)
    assert.ok(perfil.json<{ criterios: unknown[] }>().criterios.length > 0)
  })

  test('derivar perfil sem base interna falha com 404', async () => {
    const cliente = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: auth(),
      payload: {
        razaoSocial: 'Sem Base',
        segmento: 'x',
        cidade: 'y',
        vertical: 'z',
      },
    })
    const clienteId = cliente.json<{ id: string }>().id

    const resposta = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: auth(),
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    assert.equal(resposta.statusCode, 404)
  })
})

function comprador(identificador: string, ticketMedio: number, frequencia: number) {
  return {
    identificador,
    nome: `Hotel ${identificador}`,
    tipo: 'pj',
    atributosOriginais: { cnae: '5510801', porte: 3 },
    ticketMedio,
    frequencia,
    ativo: true,
  }
}
