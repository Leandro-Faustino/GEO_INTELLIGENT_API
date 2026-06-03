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
  AnaliseDTO,
  EntidadeAlvoDTO,
  OportunidadeDTO,
} from '../../src/repositories/interfaces/index.js'

function entidade(id: string, lat: number, lon: number, escopo = 'test-city'): EntidadeAlvoDTO {
  return {
    identificador: id,
    nome: `Entidade ${id}`,
    tipo: 'pj',
    atributos: {},
    endereco: `Rua ${id}, 1`,
    latitude: lat,
    longitude: lon,
    fonte: 'teste',
    escopo,
  }
}

function oportunidade(entidadeAlvoId: string, scoreValor: number): OportunidadeDTO {
  return {
    id: `op-${entidadeAlvoId}`,
    entidadeAlvoId,
    entidadeNome: `Entidade ${entidadeAlvoId}`,
    entidadeCidade: 'test-city',
    nome: `Entidade ${entidadeAlvoId}`,
    endereco: `Rua ${entidadeAlvoId}, 1`,
    lat: null,
    lon: null,
    faixaScore: scoreValor >= 0.8 ? 'alta' : scoreValor >= 0.5 ? 'media' : 'baixa',
    tipo: 'pj',
    justificativa: 'teste',
    ganchoAbordagem: 'teste',
    prioridade: 'media',
    score: { valor: scoreValor, similaridade: scoreValor, probConversao: scoreValor * 0.8 },
    latitude: null,
    longitude: null,
  }
}

async function montarService(opts: {
  entidades?: EntidadeAlvoDTO[]
  analise?: AnaliseDTO
  compradores?: string[]
}) {
  const entidadeRepo = new MemoryEntidadeAlvoRepo(opts.entidades ?? [])
  const analiseRepo = new MemoryAnaliseRepo()
  const baseRepo = new MemoryBaseInternaRepo()
  const perfilRepo = new MemoryPerfilRepo()

  if (opts.analise) {
    await analiseRepo.salvar(opts.analise)
  }
  if (opts.compradores?.length) {
    const now = new Date().toISOString()
    await baseRepo.salvar({
      clienteId: opts.analise!.clienteId,
      periodo: '2026-01',
      totalRegistros: opts.compradores.length,
      compradores: opts.compradores.map((id) => ({
        identificador: id,
        nome: id,
        tipo: 'pj',
        atributosOriginais: {},
        ticketMedio: 1000,
        frequencia: 2,
        ativo: true,
        createdAt: now,
      })),
    })
  }

  return new AnaliseService(perfilRepo, entidadeRepo, baseRepo, analiseRepo)
}

const now = new Date().toISOString()

describe('AnaliseService.buscarDadosMapa', () => {
  test('retorna null para análise inexistente', async () => {
    const service = await montarService({})
    const result = await service.buscarDadosMapa('id-inexistente')
    assert.equal(result, null)
  })

  test('retorna todas as entidades do escopo com scores', async () => {
    const ents = [
      entidade('e1', -23.5, -46.6),
      entidade('e2', -23.6, -46.7),
      entidade('e3', -23.7, -46.8),
    ]
    const analise: AnaliseDTO = {
      id: 'analise-1',
      clienteId: 'cliente-1',
      tipo: 'pj',
      escopo: 'test-city',
      versaoModelo: '0.1.0',
      origem: 'local',
      oportunidades: [oportunidade('e1', 0.9), oportunidade('e2', 0.6)],
      createdAt: now,
      updatedAt: now,
    }

    const service = await montarService({ entidades: ents, analise })
    const result = await service.buscarDadosMapa('analise-1')

    assert.ok(result !== null)
    assert.equal(result.analiseId, 'analise-1')
    assert.equal(result.totalEntidades, 3)
    assert.equal(result.entidades.filter((e) => e.score !== null).length, 2)
    assert.equal(result.entidades.find((e) => e.identificador === 'e3')?.score, null)

    const e1 = result.entidades.find((e) => e.identificador === 'e1')!
    assert.equal(e1.faixaScore, 'alta')
    assert.equal(e1.score, 0.9)

    const e2 = result.entidades.find((e) => e.identificador === 'e2')!
    assert.equal(e2.faixaScore, 'media')
  })

  test('marca jaCliente=true para compradores da base interna', async () => {
    const ents = [entidade('e1', -23.5, -46.6), entidade('e2', -23.6, -46.7)]
    const analise: AnaliseDTO = {
      id: 'analise-2',
      clienteId: 'cliente-2',
      tipo: 'pj',
      escopo: 'test-city',
      versaoModelo: '0.1.0',
      origem: 'local',
      oportunidades: [],
      createdAt: now,
      updatedAt: now,
    }

    const service = await montarService({ entidades: ents, analise, compradores: ['e1'] })
    const result = await service.buscarDadosMapa('analise-2')

    assert.ok(result !== null)
    assert.equal(result.entidades.find((e) => e.identificador === 'e1')?.jaCliente, true)
    assert.equal(result.entidades.find((e) => e.identificador === 'e2')?.jaCliente, false)
  })

  test('calcula centroMapa como média das coordenadas das entidades', async () => {
    const ents = [
      entidade('e1', -10.0, -50.0),
      entidade('e2', -20.0, -40.0),
    ]
    const analise: AnaliseDTO = {
      id: 'analise-3',
      clienteId: 'cliente-3',
      tipo: 'pj',
      escopo: 'test-city',
      versaoModelo: '0.1.0',
      origem: 'local',
      oportunidades: [],
      createdAt: now,
      updatedAt: now,
    }

    const service = await montarService({ entidades: ents, analise })
    const result = await service.buscarDadosMapa('analise-3')

    assert.ok(result !== null)
    assert.ok(result.centroMapa !== null)
    assert.equal(result.centroMapa!.lat, -15.0)
    assert.equal(result.centroMapa!.lon, -45.0)
    assert.equal(result.centroMapa!.zoom, 12)
  })
})
