import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MemoryClienteRepo,
  MemoryPerfilRepo,
  MemoryAnaliseRepo,
  MemoryAlertaRepo,
  MemoryEntregaRepo,
  MemoryFeedbackRepo,
  MemoryEnriquecimentoCompradorRepo,
  MemoryBaseInternaRepo,
} from '../../src/repositories/memory/index.js'
import type {
  ClienteDTO,
  PerfilIdealDTO,
  AnaliseDTO,
  AlertaDTO,
  EntregaDTO,
  FeedbackEntregaDTO,
  EnriquecimentoCompradorDTO,
  BaseInternaDTO,
} from '../../src/repositories/interfaces/index.js'

function makeCliente(overrides: Partial<ClienteDTO> = {}): ClienteDTO {
  return {
    id: 'cliente-1',
    ownerId: 'owner-1',
    razaoSocial: 'Empresa Teste',
    segmento: 'hotelaria',
    cidade: 'São Paulo',
    endereco: 'Rua Teste, 1',
    vertical: 'hotelaria',
    parametrosNegocio: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makePerfil(overrides: Partial<PerfilIdealDTO> = {}): PerfilIdealDTO {
  return {
    id: 'perfil-1',
    clienteId: 'cliente-1',
    nome: 'Perfil A',
    tipo: 'lookalike',
    hipotetico: false,
    criterios: [{ nome: 'porte', valorMin: null, valorMax: null, peso: 0.8, tipoComparacao: 'enum' }],
    exclusoes: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeAnalise(overrides: Partial<AnaliseDTO> = {}): AnaliseDTO {
  return {
    id: 'analise-1',
    clienteId: 'cliente-1',
    tipo: 'lookalike',
    escopo: 'zona-sul',
    versaoModelo: '1.0',
    origem: 'local',
    oportunidades: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeAlerta(overrides: Partial<AlertaDTO> = {}): AlertaDTO {
  return {
    id: 'alerta-1',
    clienteId: 'cliente-1',
    tipo: 'novo_prospect',
    entidadeAlvoId: 'entidade-1',
    entidadeNome: 'Hotel Teste',
    entidadeCidade: 'São Paulo',
    score: 0.85,
    mensagem: 'Novo prospect identificado',
    status: 'novo',
    criadoEm: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── ClienteRepo ─────────────────────────────────────────────────────────────

describe('MemoryClienteRepo', () => {
  test('salvar e buscarPorId retornam o mesmo objeto', async () => {
    const repo = new MemoryClienteRepo()
    const cliente = makeCliente()
    await repo.salvar(cliente)
    const found = await repo.buscarPorId(cliente.id)
    assert.equal(found?.id, cliente.id)
    assert.equal(found?.razaoSocial, cliente.razaoSocial)
  })

  test('salvar duas vezes com mesmo id faz upsert', async () => {
    const repo = new MemoryClienteRepo()
    await repo.salvar(makeCliente({ razaoSocial: 'Original' }))
    await repo.salvar(makeCliente({ razaoSocial: 'Atualizado' }))
    const found = await repo.buscarPorId('cliente-1')
    assert.equal(found?.razaoSocial, 'Atualizado')
  })

  test('buscarPorId com id inexistente retorna null', async () => {
    const repo = new MemoryClienteRepo()
    assert.equal(await repo.buscarPorId('inexistente'), null)
  })

  test('buscarPorIdDoOwner filtra pelo ownerId correto', async () => {
    const repo = new MemoryClienteRepo()
    await repo.salvar(makeCliente({ ownerId: 'owner-A' }))
    assert.ok(await repo.buscarPorIdDoOwner('cliente-1', 'owner-A'))
    assert.equal(await repo.buscarPorIdDoOwner('cliente-1', 'owner-B'), null)
  })

  test('listar respeita paginacao', async () => {
    const repo = new MemoryClienteRepo()
    for (let i = 0; i < 5; i++) {
      await repo.salvar(makeCliente({ id: `c-${i}`, createdAt: `2024-01-0${i + 1}T00:00:00.000Z` }))
    }
    const { items, total } = await repo.listar(2, 0)
    assert.equal(total, 5)
    assert.equal(items.length, 2)
  })

  test('listarPorOwner isola dados por tenant', async () => {
    const repo = new MemoryClienteRepo()
    await repo.salvar(makeCliente({ id: 'c-owner-A', ownerId: 'owner-A' }))
    await repo.salvar(makeCliente({ id: 'c-owner-B', ownerId: 'owner-B' }))
    const { items } = await repo.listarPorOwner('owner-A', 10, 0)
    assert.equal(items.length, 1)
    assert.equal(items[0]!.ownerId, 'owner-A')
  })
})

// ─── PerfilRepo ──────────────────────────────────────────────────────────────

describe('MemoryPerfilRepo', () => {
  test('salvar e buscarPorId preservam criterios', async () => {
    const repo = new MemoryPerfilRepo()
    const perfil = makePerfil()
    await repo.salvar(perfil)
    const found = await repo.buscarPorId(perfil.id)
    assert.equal(found?.criterios.length, 1)
    assert.equal(found?.criterios[0]?.nome, 'porte')
  })

  test('buscarPorIdParaCliente filtra pelo clienteId correto', async () => {
    const repo = new MemoryPerfilRepo()
    await repo.salvar(makePerfil({ clienteId: 'cliente-A' }))
    assert.ok(await repo.buscarPorIdParaCliente('perfil-1', 'cliente-A'))
    assert.equal(await repo.buscarPorIdParaCliente('perfil-1', 'cliente-B'), null)
  })

  test('buscarPorCliente isola perfis por cliente', async () => {
    const repo = new MemoryPerfilRepo()
    await repo.salvar(makePerfil({ id: 'p-a', clienteId: 'cliente-A' }))
    await repo.salvar(makePerfil({ id: 'p-b', clienteId: 'cliente-B' }))
    const perfisA = await repo.buscarPorCliente('cliente-A')
    assert.equal(perfisA.length, 1)
    assert.equal(perfisA[0]!.clienteId, 'cliente-A')
  })

  test('upsert por id atualiza nome do perfil', async () => {
    const repo = new MemoryPerfilRepo()
    await repo.salvar(makePerfil({ nome: 'Original' }))
    await repo.salvar(makePerfil({ nome: 'Atualizado' }))
    const found = await repo.buscarPorId('perfil-1')
    assert.equal(found?.nome, 'Atualizado')
  })

  test('retorno de buscarPorId e original sao independentes', async () => {
    const repo = new MemoryPerfilRepo()
    const perfil = makePerfil()
    await repo.salvar(perfil)
    const found = await repo.buscarPorId(perfil.id)
    found!.nome = 'Modificado Externamente'
    const found2 = await repo.buscarPorId(perfil.id)
    assert.equal(found2?.nome, 'Perfil A')
  })
})

// ─── AnaliseRepo ─────────────────────────────────────────────────────────────

describe('MemoryAnaliseRepo', () => {
  test('buscarPorIdParaCliente filtra pelo clienteId', async () => {
    const repo = new MemoryAnaliseRepo()
    await repo.salvar(makeAnalise({ clienteId: 'cliente-A' }))
    assert.ok(await repo.buscarPorIdParaCliente('analise-1', 'cliente-A'))
    assert.equal(await repo.buscarPorIdParaCliente('analise-1', 'cliente-B'), null)
  })

  test('listarPorCliente isola e pagina', async () => {
    const repo = new MemoryAnaliseRepo()
    for (let i = 0; i < 3; i++) {
      await repo.salvar(makeAnalise({ id: `a-${i}`, clienteId: 'cliente-A', createdAt: `2024-01-0${i + 1}T00:00:00.000Z` }))
    }
    await repo.salvar(makeAnalise({ id: 'a-outro', clienteId: 'cliente-B' }))
    const { items, total } = await repo.listarPorCliente('cliente-A', 2, 0)
    assert.equal(total, 3)
    assert.equal(items.length, 2)
  })

  test('listarPorCliente retorna totalOportunidades correto', async () => {
    const repo = new MemoryAnaliseRepo()
    const analise = makeAnalise({
      oportunidades: [
        { id: 'o1', entidadeAlvoId: 'e1', tipo: 'pj', justificativa: 'x', ganchoAbordagem: 'y',
          prioridade: 'alta', score: { valor: 0.9, similaridade: 0.8, probConversao: 0.7 } },
      ],
    })
    await repo.salvar(analise)
    const { items } = await repo.listarPorCliente('cliente-1', 10, 0)
    assert.equal(items[0]?.totalOportunidades, 1)
  })
})

// ─── AlertaRepo ──────────────────────────────────────────────────────────────

describe('MemoryAlertaRepo', () => {
  test('atualizarStatus muda status e retorna alerta', async () => {
    const repo = new MemoryAlertaRepo()
    await repo.salvar(makeAlerta({ status: 'novo' }))
    const updated = await repo.atualizarStatus('alerta-1', 'visto')
    assert.equal(updated?.status, 'visto')
    const found = await repo.buscarPorId('alerta-1')
    assert.equal(found?.status, 'visto')
  })

  test('buscarPorCliente filtra por status', async () => {
    const repo = new MemoryAlertaRepo()
    await repo.salvar(makeAlerta({ id: 'a-novo', status: 'novo' }))
    await repo.salvar(makeAlerta({ id: 'a-visto', status: 'visto' }))
    const novos = await repo.buscarPorCliente('cliente-1', 'novo')
    assert.equal(novos.length, 1)
    assert.equal(novos[0]?.id, 'a-novo')
  })

  test('existeParaEntidade retorna true somente para o par cliente+entidade', async () => {
    const repo = new MemoryAlertaRepo()
    await repo.salvar(makeAlerta({ clienteId: 'c1', entidadeAlvoId: 'e1' }))
    assert.equal(await repo.existeParaEntidade('c1', 'e1'), true)
    assert.equal(await repo.existeParaEntidade('c1', 'e2'), false)
    assert.equal(await repo.existeParaEntidade('c2', 'e1'), false)
  })
})

// ─── EntregaRepo ─────────────────────────────────────────────────────────────

describe('MemoryEntregaRepo', () => {
  test('salvar e buscarPorId', async () => {
    const repo = new MemoryEntregaRepo()
    const entrega: EntregaDTO = {
      id: 'entrega-1', clienteId: 'c1', analiseId: 'a1', tipo: 'lookalike',
      periodo: '2024-01', formato: 'json', totalOportunidades: 5,
      createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    }
    await repo.salvar(entrega)
    const found = await repo.buscarPorId('entrega-1')
    assert.equal(found?.totalOportunidades, 5)
  })

  test('buscarPorId com id inexistente retorna null', async () => {
    const repo = new MemoryEntregaRepo()
    assert.equal(await repo.buscarPorId('nao-existe'), null)
  })
})

// ─── FeedbackRepo ────────────────────────────────────────────────────────────

describe('MemoryFeedbackRepo', () => {
  test('buscarPorEntregaId retorna feedbacks da entrega correta', async () => {
    const repo = new MemoryFeedbackRepo()
    const f1: FeedbackEntregaDTO = {
      id: 'f1', entregaId: 'e1', exclusoes: [], ajustes: [], resultados: [],
      observacoes: '', createdAt: '2024-01-01T00:00:00.000Z',
    }
    const f2: FeedbackEntregaDTO = { ...f1, id: 'f2', entregaId: 'e2' }
    await repo.salvar(f1)
    await repo.salvar(f2)
    const feedbacks = await repo.buscarPorEntregaId('e1')
    assert.equal(feedbacks.length, 1)
    assert.equal(feedbacks[0]?.id, 'f1')
  })
})

// ─── EnriquecimentoCompradorRepo ─────────────────────────────────────────────

describe('MemoryEnriquecimentoCompradorRepo', () => {
  test('buscarPorCliente filtra por compradorIdentificador', async () => {
    const repo = new MemoryEnriquecimentoCompradorRepo()
    const base: EnriquecimentoCompradorDTO = {
      id: 'eq-1', clienteId: 'c1', compradorIdentificador: 'cnpj-111',
      compradorNome: 'Empresa A', fonte: 'receitaws', status: 'sucesso',
      payload: {}, erro: '', createdAt: '2024-01-01T00:00:00.000Z', expiresAt: null,
    }
    await repo.salvar(base)
    await repo.salvar({ ...base, id: 'eq-2', compradorIdentificador: 'cnpj-222' })
    const result = await repo.buscarPorCliente('c1', { compradorIdentificador: 'cnpj-111' })
    assert.equal(result.length, 1)
  })

  test('buscarUltimosPorCliente retorna apenas status sucesso e deduplica', async () => {
    const repo = new MemoryEnriquecimentoCompradorRepo()
    const base: EnriquecimentoCompradorDTO = {
      id: 'eq-1', clienteId: 'c1', compradorIdentificador: 'cnpj-111',
      compradorNome: 'Empresa A', fonte: 'receitaws', status: 'sucesso',
      payload: {}, erro: '', createdAt: '2024-01-01T00:00:00.000Z', expiresAt: null,
    }
    await repo.salvar(base)
    await repo.salvar({ ...base, id: 'eq-2', status: 'falha', createdAt: '2024-01-02T00:00:00.000Z' })
    const result = await repo.buscarUltimosPorCliente('c1')
    assert.equal(result.length, 1)
    assert.equal(result[0]?.status, 'sucesso')
  })
})

// ─── BaseInternaRepo ─────────────────────────────────────────────────────────

describe('MemoryBaseInternaRepo', () => {
  test('buscarPorCliente retorna null se nao existe', async () => {
    const repo = new MemoryBaseInternaRepo()
    assert.equal(await repo.buscarPorCliente('c1'), null)
  })

  test('salvar e buscarPorCliente preservam compradores', async () => {
    const repo = new MemoryBaseInternaRepo()
    const base: BaseInternaDTO = {
      clienteId: 'c1', periodo: '2024-01', totalRegistros: 2,
      compradores: [
        { identificador: 'cnpj-1', nome: 'Empresa A', tipo: 'pj', atributosOriginais: {},
          ticketMedio: 1000, frequencia: 3, ativo: true },
      ],
    }
    await repo.salvar(base)
    const found = await repo.buscarPorCliente('c1')
    assert.equal(found?.compradores.length, 1)
    assert.equal(found?.compradores[0]?.identificador, 'cnpj-1')
  })

  test('salvar duas vezes sobrescreve base do cliente', async () => {
    const repo = new MemoryBaseInternaRepo()
    const base: BaseInternaDTO = { clienteId: 'c1', periodo: '2024-01', totalRegistros: 1, compradores: [] }
    await repo.salvar(base)
    await repo.salvar({ ...base, totalRegistros: 99 })
    const found = await repo.buscarPorCliente('c1')
    assert.equal(found?.totalRegistros, 99)
  })
})
