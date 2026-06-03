import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CachedFonteAdapter } from '../../src/adapters/cached-fonte.adapter.js'
import { MemoryCacheService } from '../../src/services/cache.service.js'
import type { IAdaptadorFonte } from '../../src/adapters/base-adapter.js'

test('CachedFonteAdapter reutiliza cache em consultas equivalentes', async () => {
  let chamadas = 0
  const adapter = new CachedFonteAdapter(
    fakeAdapter({
      async consultar() {
        chamadas++
        return [{ identificador: 'e1' }]
      },
    }),
    new MemoryCacheService(60),
    60,
  )

  const primeira = await adapter.consultar({ municipio: 'Joinville', cnaes: ['5510801'] })
  const segunda = await adapter.consultar({ cnaes: ['5510801'], municipio: 'Joinville' })

  assert.deepEqual(primeira, [{ identificador: 'e1' }])
  assert.deepEqual(segunda, primeira)
  assert.equal(chamadas, 1)
})

test('CachedFonteAdapter reutiliza cache em enriquecimento e preserva metadata', async () => {
  let chamadas = 0
  const adapter = new CachedFonteAdapter(
    fakeAdapter({
      modo: 'hibrido',
      circuitState: 'half-open',
      async enriquecer(identificador) {
        chamadas++
        return { identificador, nome: 'Empresa Cacheada' }
      },
    }),
    new MemoryCacheService(60),
    60,
  )

  const primeira = await adapter.enriquecer('cnpj-001')
  const segunda = await adapter.enriquecer('cnpj-001')

  assert.equal(adapter.modo, 'hibrido')
  assert.equal(adapter.circuitState, 'half-open')
  assert.deepEqual(segunda, primeira)
  assert.equal(chamadas, 1)
})

function fakeAdapter(
  overrides: Partial<IAdaptadorFonte>,
): IAdaptadorFonte {
  return {
    nome: 'fonte-teste',
    modo: 'mock',
    circuitState: 'closed',
    async consultar() {
      return []
    },
    async enriquecer(identificador: string) {
      return { identificador }
    },
    ...overrides,
  }
}
