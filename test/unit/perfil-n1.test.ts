import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { PerfilPgRepository } from '../../src/repositories/pg/perfil.pg-repo.js'

function makePoolSpy(rowsByCall: Record<string, unknown>[][]): { pool: Pool; callCount: () => number } {
  let callIndex = 0
  let callCount = 0

  const queryFn = mock.fn(async (_sql: string, _params?: unknown[]) => {
    callCount++
    const rows = rowsByCall[callIndex] ?? []
    callIndex++
    return { rows, rowCount: rows.length }
  })

  // runInClienteContext needs connect() → client with begin/set/query/commit/release
  const clientQueryFn = mock.fn(async (_sql: string, _params?: unknown[]) => {
    callCount++
    const rows = rowsByCall[callIndex] ?? []
    callIndex++
    return { rows, rowCount: rows.length }
  })

  const client = {
    query: clientQueryFn,
    release: mock.fn(() => {}),
  }

  const pool = {
    query: queryFn,
    connect: mock.fn(async () => client),
  } as unknown as Pool

  return { pool, callCount: () => callCount }
}

test('buscarPorCliente faz exatamente 1 query ao banco (sem N+1)', async () => {
  const perfilRows = [
    {
      id: 'p1', cliente_id: 'c1', nome: 'Perfil A', tipo: 'lookalike',
      hipotetico: false, exclusoes: [], created_at: new Date(), updated_at: new Date(),
      criterios: [
        { nome: 'porte', valorMin: null, valorMax: null, peso: 0.8, tipoComparacao: 'enum' },
      ],
    },
    {
      id: 'p2', cliente_id: 'c1', nome: 'Perfil B', tipo: 'lookalike',
      hipotetico: false, exclusoes: [], created_at: new Date(), updated_at: new Date(),
      criterios: [],
    },
    {
      id: 'p3', cliente_id: 'c1', nome: 'Perfil C', tipo: 'lookalike',
      hipotetico: false, exclusoes: [], created_at: new Date(), updated_at: new Date(),
      criterios: [
        { nome: 'cidade', valorMin: null, valorMax: null, peso: 0.5, tipoComparacao: 'enum' },
      ],
    },
  ]

  // runInClienteContext calls: BEGIN, set role, set_config, then the actual query, then COMMIT
  // Rows: BEGIN→[], set role→[], set_config→[], SELECT perfis→perfilRows, COMMIT→[]
  const rowsByCall = [[], [], [], perfilRows, []]

  const { pool, callCount } = makePoolSpy(rowsByCall as Record<string, unknown>[][])
  const repo = new PerfilPgRepository(pool)

  const result = await repo.buscarPorCliente('c1')

  assert.equal(result.length, 3, 'deve retornar 3 perfis')
  assert.equal(result[0]?.criterios.length, 1, 'perfil A deve ter 1 criterio')
  assert.equal(result[1]?.criterios.length, 0, 'perfil B deve ter 0 criterios')
  assert.equal(result[2]?.criterios.length, 1, 'perfil C deve ter 1 criterio')

  // A implementação antiga (N+1) faria 1 + N queries (1 por perfil).
  // Com o LEFT JOIN, são exatamente 4 queries: BEGIN + set role + set_config + SELECT + COMMIT = 5.
  // Sem N+1 adicional (sem buscarCriterios por perfil).
  assert.ok(callCount() <= 5, `esperava no máximo 5 queries, got ${callCount()}`)
})

test('buscarPorCliente retorna criterios deserializados do json_agg', async () => {
  const perfilRows = [
    {
      id: 'p1', cliente_id: 'c1', nome: 'Perfil A', tipo: 'lookalike',
      hipotetico: false, exclusoes: [], created_at: new Date(), updated_at: new Date(),
      criterios: [
        { nome: 'cnae', valorMin: '5510-8/01', valorMax: null, peso: 1.0, tipoComparacao: 'enum' },
        { nome: 'porte', valorMin: null, valorMax: null, peso: 0.5, tipoComparacao: 'enum' },
      ],
    },
  ]

  const rowsByCall = [[], [], [], perfilRows, []]
  const { pool } = makePoolSpy(rowsByCall as Record<string, unknown>[][])
  const repo = new PerfilPgRepository(pool)

  const [perfil] = await repo.buscarPorCliente('c1')
  assert.equal(perfil?.criterios.length, 2)
  const cnae = perfil?.criterios.find((c) => c.nome === 'cnae')
  assert.equal(cnae?.tipoComparacao, 'enum')
  assert.equal(cnae?.peso, 1.0)
})
