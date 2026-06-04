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

test('perfis: deriva perfil PF de base mista', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBaseMista(app, token)
    const res = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pf' },
    })

    assert.equal(res.statusCode, 201)
    const perfil = res.json<{ tipo: string; criterios: Array<{ nome: string }> }>()
    assert.equal(perfil.tipo, 'pf')
    assert.ok(
      perfil.criterios.some((c) => c.nome === 'renda' || c.nome === 'profissao'),
      'perfil PF deve ter critério de atributo PF',
    )
    assert.ok(
      !perfil.criterios.some((c) => c.nome === 'cnae'),
      'perfil PF não deve ter critério cnae',
    )
  } finally {
    await app.close()
  }
})

test('perfis: deriva perfil PJ de base mista sem contaminar com atributos PF', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBaseMista(app, token)
    const res = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    assert.equal(res.statusCode, 201)
    const perfil = res.json<{ tipo: string; criterios: Array<{ nome: string }> }>()
    assert.equal(perfil.tipo, 'pj')
    assert.ok(
      perfil.criterios.some((c) => c.nome === 'cnae'),
      'perfil PJ deve ter critério cnae',
    )
    assert.ok(
      !perfil.criterios.some((c) => c.nome === 'renda'),
      'perfil PJ não deve ter critério renda',
    )
  } finally {
    await app.close()
  }
})

test('perfis: derivar PF em base só PJ retorna 422 com mensagem descritiva', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)
    const res = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pf' },
    })

    assert.equal(res.statusCode, 422)
    const body = res.json<{ message: string }>()
    assert.ok(
      body.message.includes("tipo 'pf'"),
      `mensagem deve citar o tipo ausente: ${body.message}`,
    )
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
        compradorPJ('hotel-bela-vista', 'Hotel Bela Vista', 'medio', 1200),
        compradorPJ('hotel-a', 'Hotel A', 'medio', 1100),
        compradorPJ('hotel-b', 'Hotel B', 'pequeno', 900),
        compradorPJ('hotel-c', 'Hotel C', 'medio', 1300),
      ],
    },
  })

  return clienteId
}

async function criarClienteComBaseMista(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Base Mista',
      segmento: 'saude',
      cidade: 'Curitiba',
      vertical: 'saude',
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
        compradorPJ('clinica-a', 'Clínica A', 'medio', 5000),
        compradorPJ('clinica-b', 'Clínica B', 'grande', 8000),
        compradorPJ('clinica-c', 'Clínica C', 'pequeno', 3000),
        compradorPF('ana', 'Ana Silva', 'dentista', 3000),
        compradorPF('bruno', 'Bruno Lima', 'medico', 4000),
        compradorPF('carla', 'Carla Souza', 'advogada', 3500),
      ],
    },
  })

  return clienteId
}

function compradorPJ(
  identificador: string,
  nome: string,
  porte: string,
  ticketMedio: number,
) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: { cnae: '8630-5/04', porte, cidade: 'Curitiba' },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}

function compradorPF(
  identificador: string,
  nome: string,
  profissao: string,
  ticketMedio: number,
) {
  return {
    identificador,
    nome,
    tipo: 'pf',
    atributosOriginais: { idade: 38, renda: 9000, profissao },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}
