import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { IAdaptadorFonte } from '../../src/adapters/base-adapter.js'
import {
  MemoryBaseInternaRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import { EnriquecimentoService } from '../../src/services/enriquecimento.service.js'

function fakeAdapter(
  nome: string,
  dados: Record<string, unknown>,
): { nome: string; adapter: IAdaptadorFonte } {
  return {
    nome,
    adapter: {
      nome,
      async consultar() {
        return []
      },
      async enriquecer() {
        return { ...dados, fonte: nome, enriquecidoEm: new Date().toISOString() }
      },
    },
  }
}

function fakeAdapterQuebrado(nome: string): { nome: string; adapter: IAdaptadorFonte } {
  return {
    nome,
    adapter: {
      nome,
      async consultar() {
        return []
      },
      async enriquecer() {
        throw new Error(`${nome} fora do ar`)
      },
    },
  }
}

async function baseComHoteis(clienteId = 'c1') {
  const baseRepo = new MemoryBaseInternaRepo()
  const perfilRepo = new MemoryPerfilRepo()

  await baseRepo.salvar({
    clienteId,
    periodo: '2024-12',
    totalRegistros: 3,
    compradores: [
      {
        identificador: 'hotel-1',
        nome: 'Hotel Bela Vista',
        tipo: 'pj',
        atributosOriginais: { cnae: '5510801', porte: 3 },
        ticketMedio: 12000,
        frequencia: 4,
        ativo: true,
      },
      {
        identificador: 'hotel-2',
        nome: 'Hotel Solar',
        tipo: 'pj',
        atributosOriginais: { cnae: '5510801', porte: 2 },
        ticketMedio: 8000,
        frequencia: 3,
        ativo: true,
      },
      {
        identificador: 'pousada-1',
        nome: 'Pousada do Mar',
        tipo: 'pj',
        atributosOriginais: { cnae: '5590699', porte: 4 },
        ticketMedio: 15000,
        frequencia: 5,
        ativo: true,
      },
    ],
  })

  return { baseRepo, perfilRepo }
}

test('enriquecimento: descobre novos fatores via adapters', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const fontes = [
    fakeAdapter('ibge-censo', { rendaMediaPc: 3500, idh: 0.78, populacao: 14000 }),
    fakeAdapter('geocoder', { bairro: 'Centro', municipio: 'Joinville', latitude: -26.3 }),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  assert.ok(
    resultado.perfilEnriquecido.totalFatores > resultado.perfilOriginal.totalFatores,
  )
  assert.ok(resultado.novosFatores.length > 0)
  assert.ok(
    resultado.novosFatores.some((fator) =>
      ['rendaMediaPc', 'idh', 'populacao'].includes(fator.atributo),
    ),
  )
  assert.deepEqual(resultado.fontesConsultadas.sort(), ['geocoder', 'ibge-censo'])
  assert.deepEqual(resultado.fontesComFalha, [])
  assert.equal(resultado.compradoresEnriquecidos, 3)

  const perfis = await perfilRepo.buscarPorCliente('c1')
  assert.equal(perfis.length, 1)
  assert.equal(perfis[0]?.criterios.length, resultado.perfilEnriquecido.totalFatores)
})

test('enriquecimento: falha parcial não derruba as demais fontes', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const fontes = [
    fakeAdapter('ibge-censo', { rendaMediaPc: 3500, idh: 0.78 }),
    fakeAdapterQuebrado('geocoder-quebrado'),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  assert.ok(resultado.fontesConsultadas.includes('ibge-censo'))
  assert.ok(resultado.fontesComFalha.includes('geocoder-quebrado'))
  assert.ok(resultado.novosFatores.length > 0)
})

test('enriquecimento: base inexistente retorna 404', async () => {
  const service = new EnriquecimentoService(
    new MemoryBaseInternaRepo(),
    new MemoryPerfilRepo(),
    [],
  )

  await assert.rejects(
    () => service.enriquecer('cliente-inexistente'),
    (error: { statusCode?: number; message?: string }) => {
      assert.equal(error.statusCode, 404)
      assert.ok(error.message?.includes('Base interna'))
      return true
    },
  )
})

test('enriquecimento: fonte inválida retorna 422', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const service = new EnriquecimentoService(
    baseRepo,
    perfilRepo,
    [fakeAdapter('ibge-censo', { rendaMediaPc: 3500 })],
  )

  await assert.rejects(
    () => service.enriquecer('c1', ['fonte-inexistente']),
    (error: { statusCode?: number; message?: string }) => {
      assert.equal(error.statusCode, 422)
      assert.ok(error.message?.includes('Fontes inválidas'))
      return true
    },
  )
})

test('enriquecimento: poucos compradores elegíveis retorna 422', async () => {
  const baseRepo = new MemoryBaseInternaRepo()
  await baseRepo.salvar({
    clienteId: 'c1',
    periodo: '2024-12',
    totalRegistros: 2,
    compradores: [
      {
        identificador: 'h1',
        nome: 'Hotel Solo',
        tipo: 'pj',
        atributosOriginais: { cnae: '5510801' },
        ticketMedio: 10000,
        frequencia: 3,
        ativo: true,
      },
      {
        identificador: 'h2',
        nome: 'Hotel Unico',
        tipo: 'pj',
        atributosOriginais: { cnae: '5510801' },
        ticketMedio: 5000,
        frequencia: 1,
        ativo: true,
      },
    ],
  })

  const service = new EnriquecimentoService(baseRepo, new MemoryPerfilRepo(), [])

  await assert.rejects(
    () => service.enriquecer('c1'),
    (error: { statusCode?: number; message?: string }) => {
      assert.equal(error.statusCode, 422)
      assert.ok(error.message?.includes('Mínimo de 3'))
      return true
    },
  )
})
