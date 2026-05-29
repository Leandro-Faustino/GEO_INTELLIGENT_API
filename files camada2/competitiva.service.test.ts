import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CompetitivaService } from '../../src/services/competitiva.service.js'
import {
  MemoryBaseInternaRepo,
  MemoryEntidadeAlvoRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'

const now = new Date().toISOString()

test('competitiva: sem perfil lança 404', async () => {
  const service = new CompetitivaService(
    new MemoryPerfilRepo(), new MemoryEntidadeAlvoRepo(), new MemoryBaseInternaRepo(),
  )
  await assert.rejects(
    () => service.analisar('sem-perfil', 'zona-sul'),
    (err: { statusCode?: number }) => err.statusCode === 404,
  )
})

test('competitiva: classifica concentração corretamente', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  await perfilRepo.salvar({
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510801'], valorMax: ['5510801'], peso: 1, tipoComparacao: 'enum' },
    ],
  })

  const service = new CompetitivaService(
    perfilRepo, new MemoryEntidadeAlvoRepo(), new MemoryBaseInternaRepo(),
  )
  // MemoryEntidadeAlvoRepo tem fixtures com CNAEs de hotel, não de fornecedor.
  // Então o resultado será 0 concorrentes (nenhum CNAE de fornecimento).
  const resultado = await service.analisar('c1', 'zona-sul')

  assert.equal(resultado.concentracao, 'baixa')
  assert.ok(resultado.insight.includes('zona-sul'))
})

test('competitiva: retorna insight legível', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  await perfilRepo.salvar({
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510801'], valorMax: ['5510801'], peso: 1, tipoComparacao: 'enum' },
    ],
  })

  const service = new CompetitivaService(
    perfilRepo, new MemoryEntidadeAlvoRepo(), new MemoryBaseInternaRepo(),
  )
  const resultado = await service.analisar('c1', 'zona-sul')

  assert.ok(typeof resultado.insight === 'string')
  assert.ok(resultado.insight.length > 10)
})
