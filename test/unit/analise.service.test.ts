import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AnaliseService } from '../../src/services/analise.service.js'
import type {
  AnaliseDTO,
  BaseInternaDTO,
  EntidadeAlvoDTO,
  IAnaliseRepository,
  IBaseInternaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../../src/repositories/interfaces/index.js'

class PerfilRepoFake implements IPerfilRepository {
  async salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO> {
    return perfil
  }

  async buscarPorId(): Promise<PerfilIdealDTO | null> {
    return null
  }

  async buscarPorCliente(): Promise<PerfilIdealDTO[]> {
    return [
      {
        id: 'perfil-1',
        clienteId: 'cliente-1',
        nome: 'Perfil hoteis',
        tipo: 'pj',
        hipotetico: false,
        criterios: [
          {
            nome: 'cnae',
            valorMin: ['5510-8/01'],
            valorMax: ['5510-8/01'],
            peso: 0.7,
            tipoComparacao: 'enum',
          },
          {
            nome: 'porte',
            valorMin: ['medio'],
            valorMax: ['medio'],
            peso: 0.3,
            tipoComparacao: 'enum',
          },
        ],
        exclusoes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
  }
}

class EntidadeRepoFake implements IEntidadeAlvoRepository {
  async salvarLote(): Promise<void> {}

  async buscarPorEscopo(): Promise<EntidadeAlvoDTO[]> {
    return [
      entidade('hotel-panorama', 'Hotel Panorama', '5510-8/01', 'medio'),
      entidade('hotel-bela-vista', 'Hotel Bela Vista', '5510-8/01', 'medio'),
      entidade('padaria-central', 'Padaria Central', '1091-1/02', 'medio'),
    ]
  }
}

class BaseInternaRepoFake implements IBaseInternaRepository {
  async salvar(base: BaseInternaDTO): Promise<BaseInternaDTO> {
    return base
  }

  async buscarPorCliente(): Promise<BaseInternaDTO> {
    return {
      clienteId: 'cliente-1',
      periodo: '2026-05',
      totalRegistros: 1,
      compradores: [
        {
          identificador: 'hotel-bela-vista',
          nome: 'Hotel Bela Vista',
          tipo: 'pj',
          atributosOriginais: {},
          ticketMedio: 1000,
          frequencia: 3,
          ativo: true,
        },
      ],
    }
  }
}

class AnaliseRepoFake implements IAnaliseRepository {
  async salvar(analise: AnaliseDTO): Promise<AnaliseDTO> {
    return analise
  }

  async buscarPorId(): Promise<AnaliseDTO | null> {
    return null
  }
}

test('AnaliseService ranqueia oportunidades e exclui clientes conhecidos', async () => {
  const service = new AnaliseService(
    new PerfilRepoFake(),
    new EntidadeRepoFake(),
    new BaseInternaRepoFake(),
    new AnaliseRepoFake(),
  )
  const analise = await service.executarLookalike('cliente-1', 'zona-sul', 0.3)

  assert.equal(analise.oportunidades.length, 2)
  assert.equal(analise.oportunidades[0]?.entidadeAlvoId, 'hotel-panorama')
  assert.equal(
    analise.oportunidades.some(
      (oportunidade) => oportunidade.entidadeAlvoId === 'hotel-bela-vista',
    ),
    false,
  )
})

function entidade(
  identificador: string,
  nome: string,
  cnae: string,
  porte: string,
): EntidadeAlvoDTO {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributos: { cnae, porte },
    endereco: 'Rua Teste',
    latitude: 0,
    longitude: 0,
    fonte: 'fixture',
    escopo: 'zona-sul',
  }
}
