import { test, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { AnalisePgRepository } from '../../src/repositories/pg/analise.pg-repo.js'
import { PerfilPgRepository } from '../../src/repositories/pg/perfil.pg-repo.js'

/**
 * Cria um Pool mock que captura todas as queries SQL executadas, incluindo
 * as queries do contexto de tenant (set_config, set local role).
 */
function makeTenantCapturingPool(rowsForMainQuery: Record<string, unknown>[] = []) {
  const capturedQueries: string[] = []
  const capturedParams: unknown[][] = []

  const clientQuery = mock.fn(async (sql: string, params?: unknown[]) => {
    capturedQueries.push(sql.trim().replace(/\s+/g, ' '))
    capturedParams.push(params ?? [])
    if (sql.trim().toLowerCase().startsWith('select') || sql.trim().toLowerCase().startsWith('insert')) {
      return { rows: rowsForMainQuery, rowCount: rowsForMainQuery.length }
    }
    return { rows: [], rowCount: 0 }
  })

  const client = {
    query: clientQuery,
    release: mock.fn(() => {}),
  }

  const pool = {
    query: mock.fn(async (sql: string, params?: unknown[]) => {
      capturedQueries.push(sql.trim().replace(/\s+/g, ' '))
      capturedParams.push(params ?? [])
      return { rows: rowsForMainQuery, rowCount: rowsForMainQuery.length }
    }),
    connect: mock.fn(async () => client),
  } as unknown as Pool

  return {
    pool,
    capturedQueries,
    capturedParams,
    queriesContaining: (fragment: string) =>
      capturedQueries.filter((q) => q.toLowerCase().includes(fragment.toLowerCase())),
  }
}

// ─── AnalisePgRepository ─────────────────────────────────────────────────────

describe('AnalisePgRepository — isolamento de tenant', () => {
  test('buscarPorIdParaCliente usa runInClienteContext com o clienteId correto', async () => {
    const analiseRow = {
      id: 'analise-1', cliente_id: 'cliente-A', tipo: 'lookalike', escopo: 'zona-sul',
      versao_modelo: '1.0', origem: 'local',
      created_at: new Date(), updated_at: new Date(),
    }
    const { pool, capturedQueries, capturedParams } = makeTenantCapturingPool([analiseRow])
    const repo = new AnalisePgRepository(pool)

    const result = await repo.buscarPorIdParaCliente('analise-1', 'cliente-A')

    assert.ok(result !== null, 'deve retornar a analise')
    assert.equal(result?.id, 'analise-1')

    const setConfigQuery = capturedQueries.find((q) => q.includes('set_config'))
    assert.ok(setConfigQuery, 'deve chamar set_config para configurar o tenant')

    const clienteIdParam = capturedParams
      .find((_, i) => capturedQueries[i]?.includes('set_config'))
    assert.ok(
      clienteIdParam?.includes('cliente-A'),
      'o set_config deve receber o clienteId correto',
    )
  })

  test('buscarPorIdParaCliente retorna null para clienteId errado', async () => {
    const { pool } = makeTenantCapturingPool([])
    const repo = new AnalisePgRepository(pool)

    const result = await repo.buscarPorIdParaCliente('analise-1', 'cliente-errado')
    assert.equal(result, null)
  })

  test('buscarPorId nao usa runInClienteContext (para uso admin)', async () => {
    const analiseRow = {
      id: 'analise-1', cliente_id: 'cliente-A', tipo: 'lookalike', escopo: 'zona-sul',
      versao_modelo: '1.0', origem: 'local',
      created_at: new Date(), updated_at: new Date(),
    }
    const { pool, capturedQueries } = makeTenantCapturingPool([analiseRow])
    const repo = new AnalisePgRepository(pool)

    await repo.buscarPorId('analise-1')

    const setConfigQuery = capturedQueries.find((q) => q.includes('set_config'))
    assert.equal(setConfigQuery, undefined, 'buscarPorId nao deve usar contexto de tenant')
  })
})

// ─── PerfilPgRepository ──────────────────────────────────────────────────────

describe('PerfilPgRepository — isolamento de tenant', () => {
  test('buscarPorIdParaCliente usa runInClienteContext com o clienteId correto', async () => {
    const perfilRow = {
      id: 'perfil-1', cliente_id: 'cliente-A', nome: 'Perfil A', tipo: 'lookalike',
      hipotetico: false, exclusoes: [], criterios: [],
      created_at: new Date(), updated_at: new Date(),
    }
    const { pool, capturedQueries, capturedParams } = makeTenantCapturingPool([perfilRow])
    const repo = new PerfilPgRepository(pool)

    const result = await repo.buscarPorIdParaCliente('perfil-1', 'cliente-A')

    assert.ok(result !== null, 'deve retornar o perfil')
    assert.equal(result?.id, 'perfil-1')

    const setConfigQuery = capturedQueries.find((q) => q.includes('set_config'))
    assert.ok(setConfigQuery, 'deve chamar set_config para configurar o tenant')

    const clienteIdParam = capturedParams
      .find((_, i) => capturedQueries[i]?.includes('set_config'))
    assert.ok(
      clienteIdParam?.includes('cliente-A'),
      'o set_config deve receber o clienteId correto',
    )
  })

  test('buscarPorIdParaCliente inclui AND cliente_id na query SQL', async () => {
    const { pool, capturedQueries } = makeTenantCapturingPool([])
    const repo = new PerfilPgRepository(pool)

    await repo.buscarPorIdParaCliente('perfil-1', 'cliente-A')

    const selectQuery = capturedQueries.find(
      (q) => q.toLowerCase().includes('from perfis_ideais') || q.toLowerCase().includes('perfis_ideais p'),
    )
    assert.ok(selectQuery, 'deve ter query no perfis_ideais')
    assert.ok(
      selectQuery.toLowerCase().includes('p.cliente_id') || selectQuery.toLowerCase().includes('cliente_id'),
      'deve filtrar por cliente_id',
    )
  })

  test('buscarPorCliente usa runInClienteContext', async () => {
    const { pool, capturedQueries } = makeTenantCapturingPool([])
    const repo = new PerfilPgRepository(pool)

    await repo.buscarPorCliente('cliente-A')

    const setConfigQuery = capturedQueries.find((q) => q.includes('set_config'))
    assert.ok(setConfigQuery, 'buscarPorCliente deve usar contexto de tenant')
  })
})
