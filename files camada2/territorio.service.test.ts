import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TerritorioService } from '../../src/services/territorio.service.js'
import {
  MemoryBaseInternaRepo,
  MemoryEntidadeAlvoRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'

const now = new Date().toISOString()

test('território: analisa regiões e ranqueia por potencial', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo()
  const baseRepo = new MemoryBaseInternaRepo()

  await perfilRepo.salvar({
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510-8/01'], valorMax: ['5510-8/01'], peso: 1, tipoComparacao: 'enum' },
    ],
  })

  const service = new TerritorioService(perfilRepo, entidadeRepo, baseRepo)
  // MemoryEntidadeAlvoRepo tem fixtures em 'zona-sul'
  const resultado = await service.analisar('c1', ['zona-sul', 'regiao-vazia'], 0.1)

  assert.equal(resultado.regioesAnalisadas, 2)
  assert.ok(resultado.regioes.length === 2)
  // zona-sul deve ter candidatos, regiao-vazia não
  const zonaSul = resultado.regioes.find((r) => r.nome === 'zona-sul')
  assert.ok(zonaSul, 'zona-sul deve existir')
  assert.ok(zonaSul.totalCandidatos > 0)
  assert.ok(resultado.regiaoRecomendada === 'zona-sul')
})

test('território: sem perfil lança 404', async () => {
  const service = new TerritorioService(
    new MemoryPerfilRepo(), new MemoryEntidadeAlvoRepo(), new MemoryBaseInternaRepo(),
  )
  await assert.rejects(
    () => service.analisar('sem-perfil', ['x']),
    (err: { statusCode?: number }) => err.statusCode === 404,
  )
})

test('território: exclui já-clientes da contagem', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo()
  const baseRepo = new MemoryBaseInternaRepo()

  await perfilRepo.salvar({
    id: 'p1', clienteId: 'c1', nome: 'Hotel', tipo: 'pj',
    hipotetico: false, exclusoes: [], createdAt: now, updatedAt: now,
    criterios: [
      { nome: 'cnae', valorMin: ['5510-8/01'], valorMax: ['5510-8/01'], peso: 1, tipoComparacao: 'enum' },
    ],
  })
  // Marca uma entidade fixture como já-cliente
  await baseRepo.salvar({
    clienteId: 'c1', periodo: '2024', totalRegistros: 1,
    compradores: [{ identificador: 'hotel-panorama', nome: 'Já cliente', tipo: 'pj', atributosOriginais: {}, ticketMedio: 1, frequencia: 1, ativo: true }],
  })

  const service = new TerritorioService(perfilRepo, entidadeRepo, baseRepo)
  const resultado = await service.analisar('c1', ['zona-sul'], 0.1)
  const zonaSul = resultado.regioes[0]!
  assert.ok(zonaSul.cobertura > 0, 'cobertura deve ser > 0 (tem cliente)')
})
