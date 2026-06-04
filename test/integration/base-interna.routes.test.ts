import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

// --- helpers ---

async function criarCliente(app: FastifyInstance, token: string, nome = 'Cliente Base'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: nome,
      segmento: 'saude',
      cidade: 'Belo Horizonte',
      vertical: 'saude',
    },
  })
  return res.json<{ id: string }>().id
}

function compradorPJ(id: string) {
  return {
    identificador: id,
    nome: `Empresa ${id}`,
    tipo: 'pj',
    atributosOriginais: { cnae: '6201-5/00', porte: 'medio', cidade: 'BH' },
    ticketMedio: 2000,
    frequencia: 2,
    ativo: true,
  }
}

function compradorPF(id: string) {
  return {
    identificador: id,
    nome: `Pessoa ${id}`,
    tipo: 'pf',
    atributosOriginais: { idade: 32, renda: 7000, profissao: 'medico' },
    ticketMedio: 1500,
    frequencia: 2,
    ativo: true,
  }
}

// --- testes de importação ---

test('base-interna: importar base mista retorna composicao e tiposDetectados', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    const res = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorPJ('emp-a'),
          compradorPJ('emp-b'),
          compradorPJ('emp-c'),
          compradorPF('pf-a'),
          compradorPF('pf-b'),
        ],
      },
    })

    assert.equal(res.statusCode, 201)
    const body = res.json<{
      totalImportados: number
      composicao: Record<string, number>
      tiposDetectados: string[]
    }>()
    assert.equal(body.totalImportados, 5)
    assert.equal(body.composicao['pj'], 3)
    assert.equal(body.composicao['pf'], 2)
    assert.ok(body.tiposDetectados.includes('pj'))
    assert.ok(body.tiposDetectados.includes('pf'))
    assert.equal(body.tiposDetectados.length, 2)
  } finally {
    await app.close()
  }
})

test('base-interna: importar base só PJ retorna composicao apenas com pj', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    const res = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorPJ('emp-a'),
          compradorPJ('emp-b'),
          compradorPJ('emp-c'),
        ],
      },
    })

    assert.equal(res.statusCode, 201)
    const body = res.json<{
      composicao: Record<string, number>
      tiposDetectados: string[]
    }>()
    assert.equal(body.composicao['pj'], 3)
    assert.equal(body.composicao['pf'], undefined)
    assert.deepEqual(body.tiposDetectados, ['pj'])
  } finally {
    await app.close()
  }
})

// --- testes do endpoint GET composicao ---

test('base-interna: GET composicao retorna qualificados por tipo', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    // Importa base mista: 3 PJ + 2 PF, todos qualificados
    await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorPJ('emp-a'),
          compradorPJ('emp-b'),
          compradorPJ('emp-c'),
          compradorPF('pf-a'),
          compradorPF('pf-b'),
        ],
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/clientes/${clienteId}/base-interna/composicao`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = res.json<{
      clienteId: string
      totalCompradores: number
      composicao: Record<string, number>
      tiposDetectados: string[]
      qualificados: Record<string, { total: number; ativosComRecompra: number }>
    }>()
    assert.equal(body.clienteId, clienteId)
    assert.equal(body.totalCompradores, 5)
    assert.equal(body.composicao['pj'], 3)
    assert.equal(body.composicao['pf'], 2)
    assert.equal(body.qualificados['pj'].total, 3)
    assert.equal(body.qualificados['pj'].ativosComRecompra, 3)
    assert.equal(body.qualificados['pf'].total, 2)
    assert.equal(body.qualificados['pf'].ativosComRecompra, 2)
  } finally {
    await app.close()
  }
})

test('base-interna: GET composicao com compradores não qualificados mostra contagem correta', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token)

    const pjSemRecompra = { ...compradorPJ('emp-raro'), frequencia: 1 }
    const pfInativo = { ...compradorPF('pf-inativo'), ativo: false }

    await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorPJ('emp-a'),
          compradorPJ('emp-b'),
          compradorPJ('emp-c'),
          pjSemRecompra,
          compradorPF('pf-a'),
          pfInativo,
        ],
      },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/clientes/${clienteId}/base-interna/composicao`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = res.json<{
      qualificados: Record<string, { total: number; ativosComRecompra: number }>
    }>()
    assert.equal(body.qualificados['pj'].total, 4)
    assert.equal(body.qualificados['pj'].ativosComRecompra, 3)
    assert.equal(body.qualificados['pf'].total, 2)
    assert.equal(body.qualificados['pf'].ativosComRecompra, 1)
  } finally {
    await app.close()
  }
})

test('base-interna: GET composicao retorna 404 se cliente não existe', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/clientes/cliente-inexistente/base-interna/composicao',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 404)
  } finally {
    await app.close()
  }
})

// --- teste end-to-end: derivação PJ e PF independentes na mesma base mista ---

test('e2e: derivação PJ e PF independentes na mesma base mista não se contaminam', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarCliente(app, token, 'Cliente E2E Misto')

    // 1. Importar base mista
    const importRes = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorPJ('hotel-a'),
          compradorPJ('hotel-b'),
          compradorPJ('hotel-c'),
          compradorPJ('hotel-d'),
          compradorPF('dentista-a'),
          compradorPF('dentista-b'),
          compradorPF('dentista-c'),
          compradorPF('dentista-d'),
        ],
      },
    })
    assert.equal(importRes.statusCode, 201)

    // 2. GET composicao → deve mostrar { pj: 4, pf: 4 }
    const composicaoRes = await app.inject({
      method: 'GET',
      url: `/clientes/${clienteId}/base-interna/composicao`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(composicaoRes.statusCode, 200)
    const composicao = composicaoRes.json<{ composicao: Record<string, number> }>()
    assert.equal(composicao.composicao['pj'], 4)
    assert.equal(composicao.composicao['pf'], 4)

    // 3. Derivar PJ → perfil com cnae, SEM atributos PF
    const perfilPJRes = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })
    assert.equal(perfilPJRes.statusCode, 201)
    const perfilPJ = perfilPJRes.json<{ tipo: string; criterios: Array<{ nome: string }> }>()
    assert.equal(perfilPJ.tipo, 'pj')
    assert.ok(perfilPJ.criterios.some((c) => c.nome === 'cnae'))
    assert.ok(!perfilPJ.criterios.some((c) => c.nome === 'renda'))

    // 4. Derivar PF → perfil com atributos PF, SEM cnae
    const perfilPFRes = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pf' },
    })
    assert.equal(perfilPFRes.statusCode, 201)
    const perfilPF = perfilPFRes.json<{ tipo: string; criterios: Array<{ nome: string }> }>()
    assert.equal(perfilPF.tipo, 'pf')
    assert.ok(perfilPF.criterios.some((c) => c.nome === 'renda' || c.nome === 'profissao'))
    assert.ok(!perfilPF.criterios.some((c) => c.nome === 'cnae'))
  } finally {
    await app.close()
  }
})
