import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  EnriquecimentoContexto,
  IAdaptadorFonte,
} from '../../src/adapters/base-adapter.js'
import {
  MemoryBaseInternaRepo,
  MemoryEnriquecimentoCompradorRepo,
  MemoryPerfilRepo,
} from '../../src/repositories/memory/index.js'
import { EnriquecimentoService } from '../../src/services/enriquecimento.service.js'

function fakeAdapter(
  nome: string,
  dados: Record<string, unknown>,
  opts: { isOptional?: boolean } = {},
): { nome: string; adapter: IAdaptadorFonte } {
  return {
    nome,
    adapter: {
      nome,
      modo: 'mock',
      circuitState: 'closed',
      consecutiveFailures: 0,
      isOptional: opts.isOptional,
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
      modo: 'mock',
      circuitState: 'closed',
      consecutiveFailures: 0,
      async consultar() {
        return []
      },
      async enriquecer() {
        throw new Error(`${nome} fora do ar`)
      },
    },
  }
}

function fakeAdapterComContexto(
  nome: string,
  enriquecerComContexto: (
    contexto: EnriquecimentoContexto,
  ) => Promise<Record<string, unknown>>,
): { nome: string; adapter: IAdaptadorFonte } {
  return {
    nome,
    adapter: {
      nome,
      modo: 'mock',
      circuitState: 'closed',
      consecutiveFailures: 0,
      async consultar() {
        return []
      },
      async enriquecer() {
        throw new Error('adapter deve receber contexto')
      },
      enriquecerComContexto,
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

async function baseComCnpjECidade(clienteId = 'c1') {
  const baseRepo = new MemoryBaseInternaRepo()
  const perfilRepo = new MemoryPerfilRepo()

  await baseRepo.salvar({
    clienteId,
    periodo: '2024-12',
    totalRegistros: 3,
    compradores: [
      {
        identificador: '12345678000190',
        nome: 'Hotel Bela Vista',
        tipo: 'pj',
        atributosOriginais: { cnae: '5510801', cidade: 'Joinville', uf: 'SC' },
        ticketMedio: 12000,
        frequencia: 4,
        ativo: true,
      },
      {
        identificador: '22345678000190',
        nome: 'Hotel Solar',
        tipo: 'pj',
        atributosOriginais: { cnae: '5510801', cidade: 'Joinville', uf: 'SC' },
        ticketMedio: 8000,
        frequencia: 3,
        ativo: true,
      },
      {
        identificador: '32345678000190',
        nome: 'Pousada do Mar',
        tipo: 'pj',
        atributosOriginais: { cnae: '5590699', cidade: 'Joinville', uf: 'SC' },
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

test('enriquecimento: persiste auditoria de sucesso e falha por comprador/fonte', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const enriquecimentoRepo = new MemoryEnriquecimentoCompradorRepo()
  const fontes = [
    fakeAdapter('ibge-censo', { populacao: 14000 }),
    fakeAdapterQuebrado('geocoder-quebrado'),
  ]

  const service = new EnriquecimentoService(
    baseRepo,
    perfilRepo,
    fontes,
    enriquecimentoRepo,
  )
  await service.enriquecer('c1')

  const todos = await enriquecimentoRepo.buscarPorCliente('c1')
  const sucessos = todos.filter((item) => item.status === 'sucesso')
  const falhas = todos.filter((item) => item.status === 'falha')

  assert.equal(todos.length, 6)
  assert.equal(sucessos.length, 3)
  assert.equal(falhas.length, 3)
  assert.ok(sucessos.every((item) => item.payload['populacao'] === 14000))
  assert.ok(falhas.every((item) => item.erro.includes('fora do ar')))
  assert.ok(todos.every((item) => item.expiresAt))

  const apenasIbge = await enriquecimentoRepo.buscarPorCliente('c1', {
    fonte: 'ibge-censo',
  })
  assert.equal(apenasIbge.length, 3)

  const apenasHotel1 = await enriquecimentoRepo.buscarPorCliente('c1', {
    compradorIdentificador: 'hotel-1',
  })
  assert.equal(apenasHotel1.length, 2)
})

test('enriquecimento: passa contexto de cidade/UF para IBGE quando identificador é CNPJ', async () => {
  const { baseRepo, perfilRepo } = await baseComCnpjECidade()
  const fontes = [
    fakeAdapterComContexto('ibge-censo', async (contexto) => {
      assert.match(contexto.identificador, /^\d{14}$/)
      assert.equal(contexto.atributos['cidade'], 'Joinville')
      assert.equal(contexto.atributos['uf'], 'SC')
      return {
        municipio: contexto.atributos['cidade'],
        uf: contexto.atributos['uf'],
        populacao: 616317,
        pibPerCapitaEstimado: 74962.83,
        fonte: 'ibge-censo',
        enriquecidoEm: new Date().toISOString(),
      }
    }),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1', ['ibge-censo'])

  assert.deepEqual(resultado.fontesConsultadas, ['ibge-censo'])
  assert.deepEqual(resultado.fontesComFalha, [])
  assert.ok(resultado.novosFatores.some((fator) => fator.atributo === 'populacao'))
  assert.ok(
    resultado.novosFatores.some(
      (fator) => fator.atributo === 'pibPerCapitaEstimado',
    ),
  )
})

test('enriquecimento: executa geocoder antes do IBGE para enriquecer contexto', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const fontes = [
    fakeAdapter('geocoder', { municipio: 'Joinville', uf: 'SC' }),
    fakeAdapterComContexto('ibge-censo', async (contexto) => {
      assert.equal(contexto.atributos['municipio'], 'Joinville')
      assert.equal(contexto.atributos['uf'], 'SC')
      return {
        populacao: 616317,
        pibPerCapitaEstimado: 74962.83,
        fonte: 'ibge-censo',
        enriquecidoEm: new Date().toISOString(),
      }
    }),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  assert.deepEqual(resultado.fontesConsultadas.sort(), ['geocoder', 'ibge-censo'])
  assert.deepEqual(resultado.fontesComFalha, [])
  assert.ok(resultado.novosFatores.some((fator) => fator.atributo === 'populacao'))
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

test('enriquecimento: novosFatores inclui campo suporte entre 0 e 1', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const fontes = [fakeAdapter('ibge-censo', { populacao: 14000, idh: 0.78 })]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  assert.ok(resultado.novosFatores.length > 0)
  assert.ok(resultado.novosFatores.every((fator) => fator.suporte >= 0 && fator.suporte <= 1))
})

test('enriquecimento: fator com suporte baixo (< 20%) é descartado dos critérios', async () => {
  const baseRepo = new MemoryBaseInternaRepo()
  const perfilRepo = new MemoryPerfilRepo()

  await baseRepo.salvar({
    clienteId: 'c1',
    periodo: '2024-12',
    totalRegistros: 6,
    compradores: [
      { identificador: 'h1', nome: 'H1', tipo: 'pj', atributosOriginais: { cnae: '5510801' }, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h2', nome: 'H2', tipo: 'pj', atributosOriginais: { cnae: '5510801' }, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h3', nome: 'H3', tipo: 'pj', atributosOriginais: { cnae: '5510801' }, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h4', nome: 'H4', tipo: 'pj', atributosOriginais: { cnae: '5510801' }, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h5', nome: 'H5', tipo: 'pj', atributosOriginais: { cnae: '5510801' }, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h6', nome: 'H6', tipo: 'pj', atributosOriginais: { cnae: '5510801' }, ticketMedio: 1000, frequencia: 2, ativo: true },
    ],
  })

  let chamadas = 0
  const fontes = [
    {
      nome: 'ibge-censo',
      adapter: {
        nome: 'ibge-censo',
        modo: 'mock' as const,
        circuitState: 'closed',
        consecutiveFailures: 0,
        async consultar() { return [] },
        async enriquecer(identificador: string) {
          chamadas++
          if (identificador === 'h1') {
            // suporte = 1/6 ≈ 0.167 < SUPORTE_MINIMO (0.2) → deve ser descartado
            return { atributoRaro: 'raro', populacao: 14000, fonte: 'ibge-censo', enriquecidoEm: new Date().toISOString() }
          }
          return { populacao: 14000, fonte: 'ibge-censo', enriquecidoEm: new Date().toISOString() }
        },
      } satisfies IAdaptadorFonte,
    },
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  assert.equal(chamadas, 6)
  const atributoRaroFator = resultado.novosFatores.find((f) => f.atributo === 'atributoRaro')
  assert.equal(atributoRaroFator, undefined, 'atributo com suporte 1/6 ≈ 0.167 deve ser descartado (< 0.2)')
  assert.ok(resultado.novosFatores.some((f) => f.atributo === 'populacao'))
})

test('enriquecimento: setorCensitario com alta granularidade é descartado', async () => {
  const baseRepo = new MemoryBaseInternaRepo()
  const perfilRepo = new MemoryPerfilRepo()

  await baseRepo.salvar({
    clienteId: 'c1',
    periodo: '2024-12',
    totalRegistros: 3,
    compradores: [
      { identificador: 'h1', nome: 'H1', tipo: 'pj', atributosOriginais: {}, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h2', nome: 'H2', tipo: 'pj', atributosOriginais: {}, ticketMedio: 1000, frequencia: 2, ativo: true },
      { identificador: 'h3', nome: 'H3', tipo: 'pj', atributosOriginais: {}, ticketMedio: 1000, frequencia: 2, ativo: true },
    ],
  })

  const setores = ['420910205000010', '420910205000020', '420910205000030']
  let idx = 0
  const fontes = [
    {
      nome: 'geocoder',
      adapter: {
        nome: 'geocoder',
        modo: 'mock' as const,
        circuitState: 'closed',
        consecutiveFailures: 0,
        async consultar() { return [] },
        async enriquecer() {
          return {
            setorCensitario: setores[idx++],
            municipio: 'Joinville',
            fonte: 'geocoder',
            enriquecidoEm: new Date().toISOString(),
          }
        },
      } satisfies IAdaptadorFonte,
    },
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes)
  const resultado = await service.enriquecer('c1')

  const setorFator = resultado.novosFatores.find((f) => f.atributo === 'setorCensitario')
  assert.equal(setorFator, undefined, 'setor censitário único por comprador deve ser descartado')
  assert.ok(resultado.novosFatores.some((f) => f.atributo === 'municipio'))
})

test('enriquecimento: fonte isOptional não contribui para critérios do perfil', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const enriquecimentoRepo = new MemoryEnriquecimentoCompradorRepo()
  const fontes = [
    fakeAdapter('registro-imoveis', { tipoImovel: 'apartamento', valorVenal: 350000 }, { isOptional: true }),
    fakeAdapter('ibge-censo', { populacao: 14000 }),
  ]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes, enriquecimentoRepo)
  const resultado = await service.enriquecer('c1')

  assert.equal(resultado.novosFatores.find((f) => f.atributo === 'tipoImovel'), undefined,
    'atributo de fonte isOptional não deve virar critério')
  assert.equal(resultado.novosFatores.find((f) => f.atributo === 'valorVenal'), undefined,
    'atributo de fonte isOptional não deve virar critério')
  assert.ok(resultado.novosFatores.some((f) => f.atributo === 'populacao'),
    'ibge deve continuar contribuindo normalmente')

  const todos = await enriquecimentoRepo.buscarPorCliente('c1')
  assert.ok(todos.some((item) => item.fonte === 'registro-imoveis' && item.status === 'sucesso'),
    'fonte isOptional ainda deve ser auditada')
})

test('enriquecimento: buscarCompradoresConsolidados mescla original + enriquecimentos', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const enriquecimentoRepo = new MemoryEnriquecimentoCompradorRepo()
  const fontes = [fakeAdapter('ibge-censo', { populacao: 14000, idh: 0.78 })]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes, enriquecimentoRepo)
  await service.enriquecer('c1')

  const consolidados = await service.buscarCompradoresConsolidados('c1')
  assert.equal(consolidados.length, 3)
  for (const comprador of consolidados) {
    assert.ok('populacao' in comprador.atributosConsolidados)
    assert.ok('cnae' in comprador.atributosConsolidados)
    assert.ok(comprador.fontesAplicadas.includes('ibge-censo'))
  }
})

test('enriquecimento: buscarUltimosPorCliente retorna somente o enriquecimento mais recente por comprador+fonte', async () => {
  const { baseRepo, perfilRepo } = await baseComHoteis()
  const enriquecimentoRepo = new MemoryEnriquecimentoCompradorRepo()
  const fontes = [fakeAdapter('ibge-censo', { populacao: 14000 })]

  const service = new EnriquecimentoService(baseRepo, perfilRepo, fontes, enriquecimentoRepo)
  await service.enriquecer('c1')
  await service.enriquecer('c1')

  const todos = await enriquecimentoRepo.buscarPorCliente('c1')
  const ultimos = await enriquecimentoRepo.buscarUltimosPorCliente('c1')

  assert.equal(todos.filter((t) => t.status === 'sucesso').length, 6)
  assert.equal(ultimos.length, 3)
  assert.ok(ultimos.every((u) => u.status === 'sucesso'))
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
