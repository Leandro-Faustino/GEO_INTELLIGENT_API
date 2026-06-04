import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DerivacaoService } from '../../src/services/derivacao.service.js'
import type {
  BaseInternaDTO,
  CompradorConhecidoDTO,
  IBaseInternaRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../../src/repositories/interfaces/index.js'

class BaseInternaRepoFake implements IBaseInternaRepository {
  constructor(private readonly compradores: CompradorConhecidoDTO[]) {}

  async salvar(base: BaseInternaDTO): Promise<BaseInternaDTO> {
    return base
  }

  async buscarPorCliente(): Promise<BaseInternaDTO> {
    return {
      clienteId: 'cliente-1',
      periodo: '2026-05',
      totalRegistros: this.compradores.length,
      compradores: this.compradores,
    }
  }
}

class PerfilRepoFake implements IPerfilRepository {
  async salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO> {
    return perfil
  }

  async buscarPorId(): Promise<PerfilIdealDTO | null> {
    return null
  }

  async buscarPorCliente(): Promise<PerfilIdealDTO[]> {
    return []
  }
}

// --- helpers de fixture ---

function compradorPJ(id: string, porte: string, ticketMedio: number): CompradorConhecidoDTO {
  return {
    identificador: id,
    nome: id,
    tipo: 'pj',
    atributosOriginais: { cnae: '5510-8/01', porte, cidade: 'São Paulo' },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}

function compradorPF(id: string, profissao: string, ticketMedio: number): CompradorConhecidoDTO {
  return {
    identificador: id,
    nome: id,
    tipo: 'pf',
    atributosOriginais: { idade: 35, renda: 8000, profissao },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}

function service(compradores: CompradorConhecidoDTO[]): DerivacaoService {
  return new DerivacaoService(new BaseInternaRepoFake(compradores), new PerfilRepoFake())
}

// --- testes existentes (backward compat) ---

test('DerivacaoService extrai criterios estatisticos da base interna', async () => {
  const svc = service([
    compradorPJ('hotel-a', 'medio', 1000),
    compradorPJ('hotel-b', 'medio', 1200),
    compradorPJ('hotel-c', 'pequeno', 900),
  ])
  const perfil = await svc.derivarPerfil('cliente-1', 'pj')

  assert.equal(perfil.clienteId, 'cliente-1')
  assert.equal(perfil.hipotetico, false)
  assert.ok(perfil.criterios.some((c) => c.nome === 'cnae'))
  assert.ok(perfil.criterios.some((c) => c.nome === 'ticketMedio'))
})

// --- testes de base mista ---

test('derivarPerfil com tipoAlvo="pj" em base mista usa SOMENTE os PJ', async () => {
  const svc = service([
    compradorPJ('hotel-a', 'medio', 1000),
    compradorPJ('hotel-b', 'grande', 1500),
    compradorPJ('hotel-c', 'pequeno', 900),
    compradorPF('ana', 'dentista', 3000),
    compradorPF('bruno', 'medico', 4000),
  ])
  const perfil = await svc.derivarPerfil('cliente-1', 'pj')

  assert.ok(
    perfil.criterios.some((c) => c.nome === 'cnae'),
    'perfil PJ deve ter critério cnae',
  )
  assert.ok(
    !perfil.criterios.some((c) => c.nome === 'idade'),
    'perfil PJ não deve ter critério idade',
  )
  assert.ok(
    !perfil.criterios.some((c) => c.nome === 'profissao'),
    'perfil PJ não deve ter critério profissao',
  )
})

test('derivarPerfil com tipoAlvo="pf" em base mista usa SOMENTE os PF', async () => {
  const svc = service([
    compradorPJ('hotel-a', 'medio', 1000),
    compradorPJ('hotel-b', 'grande', 1500),
    compradorPF('ana', 'dentista', 3000),
    compradorPF('bruno', 'medico', 4000),
    compradorPF('carla', 'advogada', 3500),
  ])
  const perfil = await svc.derivarPerfil('cliente-1', 'pf')

  assert.ok(
    perfil.criterios.some((c) => c.nome === 'renda' || c.nome === 'profissao'),
    'perfil PF deve ter critério de atributo PF',
  )
  assert.ok(
    !perfil.criterios.some((c) => c.nome === 'cnae'),
    'perfil PF não deve ter critério cnae',
  )
})

test('derivarPerfil com tipoAlvo="pf" em base só PJ lança 422 com mensagem descritiva', async () => {
  const svc = service([
    compradorPJ('hotel-a', 'medio', 1000),
    compradorPJ('hotel-b', 'grande', 1500),
    compradorPJ('hotel-c', 'pequeno', 900),
    compradorPJ('hotel-d', 'medio', 1100),
    compradorPJ('hotel-e', 'grande', 2000),
  ])

  await assert.rejects(
    () => svc.derivarPerfil('cliente-1', 'pf'),
    (err: NodeJS.ErrnoException & { statusCode?: number }) => {
      assert.equal(err.statusCode, 422)
      assert.ok(
        err.message.includes("tipo 'pf'"),
        `mensagem deve citar o tipo ausente: ${err.message}`,
      )
      assert.ok(
        err.message.includes('PJ') || err.message.includes('pj'),
        `mensagem deve mostrar o que a base contém: ${err.message}`,
      )
      return true
    },
  )
})

test('derivarPerfil com tipoAlvo="pj" mas poucos PJ qualificados lança 422', async () => {
  const pjInativo = { ...compradorPJ('hotel-sem-recompra', 'medio', 500), frequencia: 1 }
  const svc = service([
    compradorPJ('hotel-ok', 'medio', 1000),
    pjInativo,
    compradorPF('ana', 'dentista', 3000),
    compradorPF('bruno', 'medico', 4000),
    compradorPF('carla', 'advogada', 3500),
  ])

  await assert.rejects(
    () => svc.derivarPerfil('cliente-1', 'pj'),
    (err: NodeJS.ErrnoException & { statusCode?: number }) => {
      assert.equal(err.statusCode, 422)
      assert.ok(
        err.message.includes('PJ'),
        `mensagem deve mencionar PJ: ${err.message}`,
      )
      assert.ok(
        err.message.includes('1') || err.message.includes('Encontrados'),
        `mensagem deve informar quantos foram encontrados: ${err.message}`,
      )
      return true
    },
  )
})

test('derivarPerfil com base 100% PF funciona normalmente', async () => {
  const svc = service([
    compradorPF('ana', 'dentista', 3000),
    compradorPF('bruno', 'medico', 4000),
    compradorPF('carla', 'advogada', 3500),
    compradorPF('diego', 'engenheiro', 5000),
  ])
  const perfil = await svc.derivarPerfil('cliente-1', 'pf')

  assert.equal(perfil.tipo, 'pf')
  assert.ok(perfil.criterios.length >= 2, 'perfil PF deve ter ao menos 2 critérios')
  assert.ok(
    perfil.criterios.some((c) => c.nome === 'renda' || c.nome === 'idade'),
    'perfil PF deve ter critério de atributo PF',
  )
})
