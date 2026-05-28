import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('alertas: escanear exige autenticação', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/alertas/escanear',
      payload: { clienteId: 'c1', escopo: 'zona-sul' },
    })

    assert.equal(res.statusCode, 401)
  } finally {
    await app.close()
  }
})

test('alertas: escanear, listar e atualizar status', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await prepararPerfil(app, token)

    const scan = await app.inject({
      method: 'POST',
      url: '/alertas/escanear',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, escopo: 'zona-sul', limiar: 0.1 },
    })

    assert.equal(scan.statusCode, 200)
    const scanBody = scan.json<{
      alertasGerados: Array<{ id: string }>
      totalEscaneadas: number
    }>()
    assert.ok(scanBody.totalEscaneadas > 0)

    const lista = await app.inject({
      method: 'GET',
      url: `/alertas?clienteId=${clienteId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(lista.statusCode, 200)
    const alertas = lista.json<Array<{ id: string; status: string }>>()
    assert.ok(alertas.length >= scanBody.alertasGerados.length)

    if (scanBody.alertasGerados.length > 0) {
      const patch = await app.inject({
        method: 'PATCH',
        url: `/alertas/${scanBody.alertasGerados[0]!.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'visto' },
      })

      assert.equal(patch.statusCode, 200)
      assert.equal(patch.json<{ status: string }>().status, 'visto')
    }
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
      razaoSocial: 'Cliente Alertas',
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
        comprador('hotel-a', 'Hotel A', 'medio', 1000),
        comprador('hotel-b', 'Hotel B', 'pequeno', 900),
        comprador('hotel-c', 'Hotel C', 'medio', 1100),
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
