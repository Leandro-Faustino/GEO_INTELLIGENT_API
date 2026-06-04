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

// Fakes mínimos — calcularComposicao não usa os repos
class BaseInternaRepoFake implements IBaseInternaRepository {
  async salvar(base: BaseInternaDTO): Promise<BaseInternaDTO> {
    return base
  }
  async buscarPorCliente(): Promise<null> {
    return null
  }
}

class PerfilRepoFake implements IPerfilRepository {
  async salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO> {
    return perfil
  }
  async buscarPorId(): Promise<null> {
    return null
  }
  async buscarPorCliente(): Promise<PerfilIdealDTO[]> {
    return []
  }
}

function makeService(): DerivacaoService {
  return new DerivacaoService(new BaseInternaRepoFake(), new PerfilRepoFake())
}

function comprador(
  id: string,
  tipo: string,
): CompradorConhecidoDTO {
  return {
    identificador: id,
    nome: id,
    tipo,
    atributosOriginais: {},
    ticketMedio: 0,
    frequencia: 0,
    ativo: true,
  }
}

test('calcularComposicao retorna contagem correta por tipo', () => {
  const svc = makeService()
  const compradores: CompradorConhecidoDTO[] = [
    comprador('a', 'pj'),
    comprador('b', 'pj'),
    comprador('c', 'pj'),
    comprador('d', 'pf'),
    comprador('e', 'pf'),
    comprador('f', 'territorio'),
  ]

  // calcularComposicao é público (sem modificador private)
  const result = svc.calcularComposicao(compradores)

  assert.equal(result['pj'], 3)
  assert.equal(result['pf'], 2)
  assert.equal(result['territorio'], 1)
  assert.equal(Object.keys(result).length, 3)
})

test('calcularComposicao com base vazia retorna objeto vazio', () => {
  const svc = makeService()
  const result = svc.calcularComposicao([])

  assert.deepEqual(result, {})
})

test('calcularComposicao com base de um único tipo retorna apenas esse tipo', () => {
  const svc = makeService()
  const compradores = [
    comprador('a', 'pj'),
    comprador('b', 'pj'),
  ]

  const result = svc.calcularComposicao(compradores)

  assert.equal(Object.keys(result).length, 1)
  assert.equal(result['pj'], 2)
  assert.equal(result['pf'], undefined)
})
