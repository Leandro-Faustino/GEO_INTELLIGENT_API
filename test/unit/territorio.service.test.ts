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
import { TerritorioService } from '../../src/services/territorio.service.js'

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
        valorMin: ['5510801'],
        valorMax: ['5510801'],
        peso: 0.7,
        tipoComparacao: 'enum',
      },
      {
        nome: 'porte',
        valorMin: 2,
        valorMax: 4,
        peso: 0.3,
        tipoComparacao: 'range',
      },
    ],
  }
}

function entidade(
  identificador: string,
  escopo: string,
  cnae: string,
  porte: number,
): EntidadeAlvoDTO {
  return {
    identificador,
    nome: identificador,
    tipo: 'pj',
    atributos: { cnae, porte, cidade: 'Joinville' },
    endereco: 'Rua X',
    latitude: 0,
    longitude: 0,
    fonte: 'teste',
    escopo,
  }
}

test('territorio: ranqueia regiões por potencial não atendido', async () => {
  const perfilRepo = new MemoryPerfilRepo()
  const baseRepo = new MemoryBaseInternaRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo([
    entidade('sul-1', 'sul', '5510801', 3),
    entidade('sul-2', 'sul', '5510801', 2),
    entidade('norte-1', 'norte', '5510801', 3),
    entidade('norte-2', 'norte', '5510801', 3),
    entidade('norte-3', 'norte', '5510801', 4),
  ])
  await perfilRepo.salvar(perfil('c1'))
  await baseRepo.salvar({
    clienteId: 'c1',
    periodo: '2026-05',
    totalRegistros: 1,
    compradores: [
      {
        identificador: 'sul-1',
        nome: 'sul-1',
        tipo: 'pj',
        atributosOriginais: {},
        ticketMedio: 100,
        frequencia: 2,
        ativo: true,
      },
    ],
  })

  const service = new TerritorioService(perfilRepo, entidadeRepo, baseRepo)
  const resultado = await service.analisar('c1', ['sul', 'norte'], 0.3)

  assert.equal(resultado.regiaoRecomendada, 'norte')
  assert.equal(resultado.regioes[0]?.nome, 'norte')
  assert.equal(resultado.regioes[0]?.oportunidadesTop3.length, 3)
  assert.equal(resultado.regioes.find((item) => item.nome === 'sul')?.cobertura, 0.5)
})

test('territorio: perfil ausente retorna 404', async () => {
  const service = new TerritorioService(
    new MemoryPerfilRepo(),
    new MemoryEntidadeAlvoRepo([]),
    new MemoryBaseInternaRepo(),
  )

  await assert.rejects(
    () => service.analisar('sem-perfil', ['sul']),
    (error: { statusCode?: number }) => error.statusCode === 404,
  )
})
