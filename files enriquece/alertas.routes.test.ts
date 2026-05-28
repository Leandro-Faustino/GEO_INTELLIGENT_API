import { test } from 'node:test'
import assert from 'node:assert/strict'
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

test('alertas: escanear com perfil gera alertas', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const auth = { authorization: `Bearer ${token}` }

    // 1. Criar cliente
    const c = await app.inject({
      method: 'POST', url: '/clientes', headers: auth,
      payload: { razaoSocial: 'Alerta Test', segmento: 'colchao', cidade: 'SP', vertical: 'varejo' },
    })
    const clienteId = c.json<{ id: string }>().id

    // 2. Importar base
    await app.inject({
      method: 'POST', url: `/clientes/${clienteId}/base-interna`, headers: auth,
      payload: {
        periodo: '2024',
        compradores: [
          { identificador: 'h1', nome: 'Hotel A', tipo: 'pj', atributosOriginais: { cnae: '5510-8/01', porte: 3 }, ticketMedio: 10000, frequencia: 3, ativo: true },
          { identificador: 'h2', nome: 'Hotel B', tipo: 'pj', atributosOriginais: { cnae: '5510-8/01', porte: 2 }, ticketMedio: 8000, frequencia: 4, ativo: true },
          { identificador: 'h3', nome: 'Hotel C', tipo: 'pj', atributosOriginais: { cnae: '5510-8/01', porte: 4 }, ticketMedio: 12000, frequencia: 2, ativo: true },
        ],
      },
    })

    // 3. Derivar perfil
    await app.inject({
      method: 'POST', url: '/perfis/derivar', headers: auth,
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    // 4. Escanear alertas
    const scan = await app.inject({
      method: 'POST', url: '/alertas/escanear', headers: auth,
      payload: { clienteId, escopo: 'zona-sul', limiar: 0.1 },
    })
    assert.equal(scan.statusCode, 200)
    const body = scan.json<{ alertasGerados: unknown[]; totalEscaneadas: number }>()
    assert.ok(body.totalEscaneadas > 0, 'deve ter escaneado entidades')

    // 5. Listar alertas
    const lista = await app.inject({
      method: 'GET', url: `/alertas?clienteId=${clienteId}`, headers: auth,
    })
    assert.equal(lista.statusCode, 200)

    // 6. Se gerou alertas, atualizar status
    if (body.alertasGerados.length > 0) {
      const alertaId = (body.alertasGerados[0] as { id: string }).id
      const patch = await app.inject({
        method: 'PATCH', url: `/alertas/${alertaId}`, headers: auth,
        payload: { status: 'visto' },
      })
      assert.equal(patch.statusCode, 200)
      assert.equal(patch.json<{ status: string }>().status, 'visto')
    }
  } finally {
    await app.close()
  }
})
