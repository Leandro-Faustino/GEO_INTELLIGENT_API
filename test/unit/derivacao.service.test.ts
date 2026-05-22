import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DerivacaoService } from '../../src/services/derivacao.service.js'
import type {
  BaseInternaDTO,
  IBaseInternaRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../../src/repositories/interfaces/index.js'

class BaseInternaRepoFake implements IBaseInternaRepository {
  async salvar(base: BaseInternaDTO): Promise<BaseInternaDTO> {
    return base
  }

  async buscarPorCliente(): Promise<BaseInternaDTO> {
    return {
      clienteId: 'cliente-1',
      periodo: '2026-05',
      totalRegistros: 3,
      compradores: [
        comprador('hotel-a', 'medio', 1000),
        comprador('hotel-b', 'medio', 1200),
        comprador('hotel-c', 'pequeno', 900),
      ],
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

test('DerivacaoService extrai criterios estatisticos da base interna', async () => {
  const service = new DerivacaoService(new BaseInternaRepoFake(), new PerfilRepoFake())
  const perfil = await service.derivarPerfil('cliente-1', 'pj')

  assert.equal(perfil.clienteId, 'cliente-1')
  assert.equal(perfil.hipotetico, false)
  assert.ok(perfil.criterios.some((criterio) => criterio.nome === 'cnae'))
  assert.ok(perfil.criterios.some((criterio) => criterio.nome === 'ticketMedio'))
})

function comprador(identificador: string, porte: string, ticketMedio: number) {
  return {
    identificador,
    nome: identificador,
    tipo: 'pj',
    atributosOriginais: {
      cnae: '5510-8/01',
      porte,
      cidade: 'São Paulo',
    },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}
