import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('raio-x: retorna 503 quando motor nao esta configurado', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/raio-x',
      headers: { authorization: `Bearer ${token}` },
      payload: { compradores: compradoresDeTeste() },
    })

    assert.equal(res.statusCode, 503)
    assert.equal(
      res.json<{ message: string }>().message,
      'Motor de inteligência indisponível.',
    )
  } finally {
    await app.close()
  }
})

test('raio-x: serializa resposta tipada e remove campos extras', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    ;(app as unknown as { motor: { raioX: (payload: unknown) => Promise<unknown> } }).motor =
      {
        async raioX(payload: unknown) {
          const body = payload as {
            compradores: Array<{ atributos_originais?: { cidade?: string } }>
          }
          assert.equal(body.compradores[0]?.atributos_originais?.cidade, 'São Paulo')

          return {
            retrato: {
              frase: 'O cliente ideal se concentra em Cidade: São Paulo.',
              complemento: '67% da base ativa já apresenta recompra.',
              secreto: 'nao deve sair',
            },
            fatores: [
              {
                atributo: 'Cidade',
                pesoPercentual: 67,
                descricao: '67% dos clientes ativos compartilham cidade = São Paulo.',
                interno: true,
              },
            ],
            estatisticas: {
              totalClientes: 4,
              ativos: 3,
              comRecompra: 2,
              percentualFieis: 67,
              ticketMedio: 1200,
              ticketMin: 900,
              ticketMax: 1500,
              debug: 'nao deve sair',
            },
            segmentos: [
              {
                segmento: 'Cidade: São Paulo',
                quantidade: 2,
                percentual: 67,
                extra: 'nao deve sair',
              },
            ],
            potencial: {
              mensagem:
                'A maior tração está em Cidade: São Paulo, com 67% de fidelização na base ativa.',
              cta: 'Priorize prospecção em segmentos com o mesmo perfil dominante.',
              extra: 'nao deve sair',
            },
            segredo: 'nao deve sair',
          }
        },
      }

    const res = await app.inject({
      method: 'POST',
      url: '/raio-x',
      headers: { authorization: `Bearer ${token}` },
      payload: { compradores: compradoresDeTeste() },
    })

    const body = res.json<{
      retrato: { frase: string; complemento: string; secreto?: string }
      fatores: Array<{ atributo: string; pesoPercentual: number; interno?: boolean }>
      estatisticas: { totalClientes: number; debug?: string }
      potencial: { cta: string; extra?: string }
      segredo?: string
    }>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.retrato.frase, 'O cliente ideal se concentra em Cidade: São Paulo.')
    assert.equal(body.estatisticas.totalClientes, 4)
    assert.equal(body.segredo, undefined)
    assert.equal(body.retrato.secreto, undefined)
    assert.equal(body.fatores[0]?.interno, undefined)
    assert.equal(body.estatisticas.debug, undefined)
    assert.equal(body.potencial.extra, undefined)
  } finally {
    await app.close()
  }
})

test('raio-x: propaga erro 422 de pre-condicao do motor', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    ;(app as unknown as { motor: { raioX: () => Promise<unknown> } }).motor = {
      async raioX() {
        throw Object.assign(new Error('Mínimo de 3 compradores ativos.'), {
          statusCode: 422,
        })
      },
    }

    const res = await app.inject({
      method: 'POST',
      url: '/raio-x',
      headers: { authorization: `Bearer ${token}` },
      payload: { compradores: compradoresDeTeste() },
    })

    assert.equal(res.statusCode, 422)
    assert.equal(res.json<{ message: string }>().message, 'Mínimo de 3 compradores ativos.')
  } finally {
    await app.close()
  }
})

function compradoresDeTeste() {
  return [
    comprador('c1', 'Hotel A', 'São Paulo', 1200, 3, true),
    comprador('c2', 'Hotel B', 'São Paulo', 1500, 2, true),
    comprador('c3', 'Hotel C', 'Campinas', 900, 1, true),
    comprador('c4', 'Hotel D', 'Curitiba', 500, 0, false),
  ]
}

function comprador(
  identificador: string,
  nome: string,
  cidade: string,
  ticketMedio: number,
  frequencia: number,
  ativo: boolean,
) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: {
      cidade,
      segmento: 'hotelaria',
      porte: 'medio',
    },
    ticketMedio,
    frequencia,
    ativo,
  }
}
