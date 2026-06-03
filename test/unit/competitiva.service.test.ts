import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MemoryBaseInternaRepo,
  MemoryEntidadeAlvoRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import type {
  EntidadeAlvoDTO,
  PerfilIdealDTO,
} from '../../src/repositories/interfaces/index.js'
import { CompetitivaService } from '../../src/services/competitiva.service.js'

function perfil(clienteId: string): PerfilIdealDTO {
  const now = new Date().toISOString()
  return {
    id: 'perfil-1',
    clienteId,
    nome: 'Perfil Hotelaria',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: [],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510-8/01'],
        valorMax: ['5510-8/01'],
        peso: 1,
        tipoComparacao: 'enum',
      },
    ],
  }
}

function entidade(
  identificador: string,
  cnae: string,
  escopo: string,
): EntidadeAlvoDTO {
  return {
    identificador,
    nome: identificador,
    tipo: 'pj',
    atributos: { cnae, cidade: 'Joinville' },
    endereco: 'Rua Y',
    latitude: 0,
    longitude: 0,
    fonte: 'teste',
    escopo,
  }
}

test('competitiva: identifica concorrentes por CNAE compatível', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  const baseRepo = new MemoryBaseInternaRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo([
    entidade('colchao-1', '3104-7/00', 'centro'),
    entidade('enxoval-1', '4649-4/01', 'centro'),
    entidade('padaria-1', '4721-1/02', 'centro'),
  ])
  await perfilRepo.salvar(perfil('c1'))

  const service = new CompetitivaService(perfilRepo, entidadeRepo, baseRepo)
  const resultado = await service.analisar('c1', 'centro')

  assert.equal(resultado.totalFornecedoresRegiao, 2)
  assert.equal(resultado.concentracao, 'baixa')
  assert.ok(resultado.concorrentes.every((item) => item.cnae !== '4721102'))
})

test('competitiva: usa municipio como fallback para cidade', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  const baseRepo = new MemoryBaseInternaRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo([
    {
      identificador: 'colchao-1',
      nome: 'colchao-1',
      tipo: 'pj',
      atributos: { cnae: '3104-7/00', municipio: 'Joinville' },
      endereco: 'Rua Y',
      latitude: 0,
      longitude: 0,
      fonte: 'teste',
      escopo: 'centro',
    },
  ])
  await perfilRepo.salvar(perfil('c1'))

  const service = new CompetitivaService(perfilRepo, entidadeRepo, baseRepo)
  const resultado = await service.analisar('c1', 'centro')

  assert.equal(resultado.concorrentes[0]?.cidade, 'Joinville')
})

test('competitiva: CNAE sem mapeamento competitivo retorna 422', async () => {
  const now = new Date().toISOString()
  const perfilRepo = new MemoryPerfilRepo()
  await perfilRepo.salvar({
    id: 'perfil-2',
    clienteId: 'c2',
    nome: 'Perfil sem mapa',
    tipo: 'pj',
    hipotetico: false,
    exclusoes: [],
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['4721-1/02'],
        valorMax: ['4721-1/02'],
        peso: 1,
        tipoComparacao: 'enum',
      },
    ],
  })

  const service = new CompetitivaService(
    perfilRepo,
    new MemoryEntidadeAlvoRepo([]),
    new MemoryBaseInternaRepo(),
  )

  await assert.rejects(
    () => service.analisar('c2', 'centro'),
    (error: { statusCode?: number }) => error.statusCode === 422,
  )
})

test('competitiva: perfil ausente retorna 404', async () => {
  const service = new CompetitivaService(
    new MemoryPerfilRepo(),
    new MemoryEntidadeAlvoRepo([]),
    new MemoryBaseInternaRepo(),
  )

  await assert.rejects(
    () => service.analisar('sem-perfil', 'centro'),
    (error: { statusCode?: number }) => error.statusCode === 404,
  )
})
