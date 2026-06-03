import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AnaliseService } from '../../src/services/analise.service.js'
import {
  MemoryAnaliseRepo,
  MemoryBaseInternaRepo,
  MemoryEntidadeAlvoRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import type {
  EntidadeAlvoDTO,
  PerfilIdealDTO,
} from '../../src/repositories/interfaces/index.js'

function perfilHotelaria(
  clienteId: string,
  exclusoes: string[] = [],
): PerfilIdealDTO {
  const now = new Date().toISOString()
  return {
    id: 'perfil-1',
    clienteId,
    nome: 'Hotelaria',
    tipo: 'pj',
    hipotetico: false,
    exclusoes,
    createdAt: now,
    updatedAt: now,
    criterios: [
      {
        nome: 'cnae',
        valorMin: ['5510801'],
        valorMax: ['5510801'],
        peso: 0.6,
        tipoComparacao: 'enum',
      },
      {
        nome: 'porte',
        valorMin: 2,
        valorMax: 4,
        peso: 0.4,
        tipoComparacao: 'range',
      },
    ],
  }
}

function entidade(id: string, cnae: string, porte: number): EntidadeAlvoDTO {
  return {
    identificador: id,
    nome: `Entidade ${id}`,
    tipo: 'pj',
    atributos: { cnae, porte },
    endereco: 'Rua X, Joinville',
    latitude: 0,
    longitude: 0,
    fonte: 'teste',
    escopo: 'Joinville',
  }
}

async function montar(
  clienteId: string,
  entidades: EntidadeAlvoDTO[],
  exclusoes: string[] = [],
) {
  const perfilRepo = new MemoryPerfilRepo()
  const entidadeRepo = new MemoryEntidadeAlvoRepo([])
  const baseRepo = new MemoryBaseInternaRepo()
  const analiseRepo = new MemoryAnaliseRepo()
  await perfilRepo.salvar(perfilHotelaria(clienteId, exclusoes))
  await entidadeRepo.salvarLote(entidades)

  const service = new AnaliseService(
    perfilRepo,
    entidadeRepo,
    baseRepo,
    analiseRepo,
  )
  return { service, baseRepo, analiseRepo }
}

describe('AnaliseService', () => {
  test('hotel similar gera oportunidade de alta prioridade', async () => {
    const { service } = await montar('c1', [entidade('e1', '5510801', 3)])

    const analise = await service.executarLookalike('c1', 'Joinville', 0.1)

    assert.equal(analise.oportunidades.length, 1)
    assert.equal(analise.oportunidades[0]?.entidadeAlvoId, 'e1')
    assert.equal(analise.oportunidades[0]?.prioridade, 'alta')
  })

  test('entidade dissimilar fica abaixo do limiar', async () => {
    const { service } = await montar('c1', [entidade('padaria', '4721102', 1)])

    const analise = await service.executarLookalike('c1', 'Joinville', 0.8)

    assert.equal(analise.oportunidades.length, 0)
  })

  test('exclui quem já é cliente', async () => {
    const { service, baseRepo } = await montar('c1', [
      entidade('e1', '5510801', 3),
    ])
    await baseRepo.salvar({
      clienteId: 'c1',
      periodo: '2026-05',
      totalRegistros: 1,
      compradores: [
        {
          identificador: 'e1',
          nome: 'Já cliente',
          tipo: 'pj',
          atributosOriginais: {},
          ticketMedio: 100,
          frequencia: 3,
          ativo: true,
        },
      ],
    })

    const analise = await service.executarLookalike('c1', 'Joinville', 0.1)

    assert.equal(analise.oportunidades.length, 0)
  })

  test('respeita exclusões do perfil', async () => {
    const { service } = await montar('c1', [entidade('e1', '5510801', 3)], ['e1'])

    const analise = await service.executarLookalike('c1', 'Joinville', 0.1)

    assert.equal(analise.oportunidades.length, 0)
  })

  test('perfil ausente gera 404', async () => {
    const service = new AnaliseService(
      new MemoryPerfilRepo(),
      new MemoryEntidadeAlvoRepo([]),
      new MemoryBaseInternaRepo(),
      new MemoryAnaliseRepo(),
    )

    await assert.rejects(
      () => service.executarLookalike('sem-perfil', 'Joinville'),
      (error: { statusCode?: number }) => error.statusCode === 404,
    )
  })

  test('ranqueia por similaridade decrescente e salva análise', async () => {
    const { service, analiseRepo } = await montar('c1', [
      entidade('match-perfeito', '5510801', 3),
      entidade('match-parcial', '5510801', 5),
    ])

    const analise = await service.executarLookalike('c1', 'Joinville', 0)
    const salva = await analiseRepo.buscarPorId(analise.id)

    assert.ok(analise.oportunidades.length >= 2)
    assert.ok(
      analise.oportunidades[0]!.score.valor >=
        analise.oportunidades[1]!.score.valor,
    )
    assert.equal(salva?.id, analise.id)
  })
})
