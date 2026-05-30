import type {
  AlertaDTO,
  AnaliseDTO,
  AnaliseResumoDTO,
  BaseInternaDTO,
  ClienteDTO,
  EntidadeAlvoDTO,
  EnriquecimentoCompradorDTO,
  EntregaDTO,
  FeedbackEntregaDTO,
  IAlertaRepository,
  IAnaliseRepository,
  IBaseInternaRepository,
  IClienteRepository,
  IEntidadeAlvoRepository,
  IEnriquecimentoCompradorRepository,
  IEntregaRepository,
  IFeedbackRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../interfaces/index.js'

function clone<T>(value: T): T {
  return structuredClone(value)
}

export class MemoryClienteRepo implements IClienteRepository {
  private readonly items = new Map<string, ClienteDTO>()

  async salvar(cliente: ClienteDTO): Promise<ClienteDTO> {
    this.items.set(cliente.id, clone(cliente))
    return clone(cliente)
  }

  async buscarPorId(id: string): Promise<ClienteDTO | null> {
    const item = this.items.get(id)
    return item ? clone(item) : null
  }

  async buscarPorIdDoOwner(id: string, ownerId: string): Promise<ClienteDTO | null> {
    const item = this.items.get(id)
    if (!item || item.ownerId !== ownerId) return null
    return clone(item)
  }

  async listar(limit: number, offset: number): Promise<{ items: ClienteDTO[]; total: number }> {
    const all = [...this.items.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )

    return {
      items: clone(all.slice(offset, offset + limit)),
      total: all.length,
    }
  }

  async listarPorOwner(
    ownerId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: ClienteDTO[]; total: number }> {
    const all = [...this.items.values()]
      .filter((cliente) => cliente.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return {
      items: clone(all.slice(offset, offset + limit)),
      total: all.length,
    }
  }
}

export class MemoryBaseInternaRepo implements IBaseInternaRepository {
  private readonly items = new Map<string, BaseInternaDTO>()

  async salvar(base: BaseInternaDTO): Promise<BaseInternaDTO> {
    this.items.set(base.clienteId, clone(base))
    return clone(base)
  }

  async buscarPorCliente(clienteId: string): Promise<BaseInternaDTO | null> {
    const item = this.items.get(clienteId)
    return item ? clone(item) : null
  }
}

export class MemoryPerfilRepo implements IPerfilRepository {
  private readonly items = new Map<string, PerfilIdealDTO>()

  async salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO> {
    this.items.set(perfil.id, clone(perfil))
    return clone(perfil)
  }

  async buscarPorId(id: string): Promise<PerfilIdealDTO | null> {
    const item = this.items.get(id)
    return item ? clone(item) : null
  }

  async buscarPorCliente(clienteId: string): Promise<PerfilIdealDTO[]> {
    return clone(
      [...this.items.values()]
        .filter((perfil) => perfil.clienteId === clienteId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }
}

export class MemoryEntidadeAlvoRepo implements IEntidadeAlvoRepository {
  private readonly items = new Map<string, EntidadeAlvoDTO>()

  constructor(seed: EntidadeAlvoDTO[] = defaultEntidadesAlvo()) {
    for (const item of seed) {
      this.items.set(item.identificador, clone(item))
    }
  }

  async salvarLote(entidades: EntidadeAlvoDTO[]): Promise<void> {
    for (const entidade of entidades) {
      this.items.set(entidade.identificador, clone(entidade))
    }
  }

  async buscarPorEscopo(escopo: string): Promise<EntidadeAlvoDTO[]> {
    const normalizado = escopo.toLocaleLowerCase('pt-BR')
    return clone(
      [...this.items.values()].filter(
        (entidade) => entidade.escopo.toLocaleLowerCase('pt-BR') === normalizado,
      ),
    )
  }
}

export class MemoryAnaliseRepo implements IAnaliseRepository {
  private readonly items = new Map<string, AnaliseDTO>()

  async salvar(analise: AnaliseDTO): Promise<AnaliseDTO> {
    this.items.set(analise.id, clone(analise))
    return clone(analise)
  }

  async buscarPorId(id: string): Promise<AnaliseDTO | null> {
    const item = this.items.get(id)
    return item ? clone(item) : null
  }

  async listarPorCliente(
    clienteId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: AnaliseResumoDTO[]; total: number }> {
    const all = [...this.items.values()]
      .filter((analise) => analise.clienteId === clienteId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    const items: AnaliseResumoDTO[] = all
      .slice(offset, offset + limit)
      .map(({ oportunidades, ...rest }) => ({
        ...rest,
        totalOportunidades: oportunidades.length,
      }))
    return { items: clone(items), total: all.length }
  }
}

export class MemoryEntregaRepo implements IEntregaRepository {
  private readonly items = new Map<string, EntregaDTO>()

  async salvar(entrega: EntregaDTO): Promise<EntregaDTO> {
    this.items.set(entrega.id, clone(entrega))
    return clone(entrega)
  }

  async buscarPorId(id: string): Promise<EntregaDTO | null> {
    const item = this.items.get(id)
    return item ? clone(item) : null
  }
}

export class MemoryFeedbackRepo implements IFeedbackRepository {
  private readonly items = new Map<string, FeedbackEntregaDTO>()

  async salvar(feedback: FeedbackEntregaDTO): Promise<FeedbackEntregaDTO> {
    this.items.set(feedback.id, clone(feedback))
    return clone(feedback)
  }

  async buscarPorEntregaId(entregaId: string): Promise<FeedbackEntregaDTO[]> {
    return clone(
      [...this.items.values()]
        .filter((feedback) => feedback.entregaId === entregaId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }
}

export class MemoryEnriquecimentoCompradorRepo
  implements IEnriquecimentoCompradorRepository
{
  private readonly items = new Map<string, EnriquecimentoCompradorDTO>()

  async salvar(
    enriquecimento: EnriquecimentoCompradorDTO,
  ): Promise<EnriquecimentoCompradorDTO> {
    this.items.set(enriquecimento.id, clone(enriquecimento))
    return clone(enriquecimento)
  }

  async buscarPorCliente(
    clienteId: string,
    filtros: { compradorIdentificador?: string; fonte?: string } = {},
  ): Promise<EnriquecimentoCompradorDTO[]> {
    return clone(
      [...this.items.values()]
        .filter((item) => {
          if (item.clienteId !== clienteId) return false
          if (
            filtros.compradorIdentificador &&
            item.compradorIdentificador !== filtros.compradorIdentificador
          ) {
            return false
          }
          if (filtros.fonte && item.fonte !== filtros.fonte) return false
          return true
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  async buscarUltimosPorCliente(clienteId: string): Promise<EnriquecimentoCompradorDTO[]> {
    const latest = new Map<string, EnriquecimentoCompradorDTO>()
    const candidatos = [...this.items.values()]
      .filter((item) => item.clienteId === clienteId && item.status === 'sucesso')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    for (const item of candidatos) {
      const key = `${item.compradorIdentificador}::${item.fonte}`
      if (!latest.has(key)) {
        latest.set(key, item)
      }
    }

    return clone([...latest.values()])
  }
}

export class MemoryAlertaRepo implements IAlertaRepository {
  private readonly items = new Map<string, AlertaDTO>()

  async salvar(alerta: AlertaDTO): Promise<AlertaDTO> {
    this.items.set(alerta.id, clone(alerta))
    return clone(alerta)
  }

  async buscarPorId(id: string): Promise<AlertaDTO | null> {
    const item = this.items.get(id)
    return item ? clone(item) : null
  }

  async buscarPorCliente(
    clienteId: string,
    status?: AlertaDTO['status'],
  ): Promise<AlertaDTO[]> {
    return clone(
      [...this.items.values()]
        .filter((alerta) => {
          if (alerta.clienteId !== clienteId) return false
          return status ? alerta.status === status : true
        })
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    )
  }

  async atualizarStatus(
    id: string,
    status: AlertaDTO['status'],
  ): Promise<AlertaDTO | null> {
    const alerta = this.items.get(id)
    if (!alerta) return null

    const atualizado = { ...alerta, status }
    this.items.set(id, clone(atualizado))
    return clone(atualizado)
  }

  async existeParaEntidade(
    clienteId: string,
    entidadeAlvoId: string,
  ): Promise<boolean> {
    return [...this.items.values()].some(
      (alerta) =>
        alerta.clienteId === clienteId &&
        alerta.entidadeAlvoId === entidadeAlvoId,
    )
  }
}

function defaultEntidadesAlvo(): EntidadeAlvoDTO[] {
  return [
    {
      identificador: 'hotel-panorama',
      nome: 'Hotel Panorama',
      tipo: 'pj',
      atributos: { cnae: '5510-8/01', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Av. Paulista, 1000',
      latitude: -23.5632,
      longitude: -46.6544,
      fonte: 'fixture',
      escopo: 'zona-sul',
    },
    {
      identificador: 'hotel-top-class',
      nome: 'Hotel Top Class',
      tipo: 'pj',
      atributos: { cnae: '5510-8/01', porte: 'pequeno', cidade: 'São Paulo' },
      endereco: 'Rua Vergueiro, 1200',
      latitude: -23.5892,
      longitude: -46.6349,
      fonte: 'fixture',
      escopo: 'zona-sul',
    },
    {
      identificador: 'padaria-central',
      nome: 'Padaria Central',
      tipo: 'pj',
      atributos: { cnae: '1091-1/02', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Rua Domingos de Morais, 500',
      latitude: -23.5952,
      longitude: -46.6388,
      fonte: 'fixture',
      escopo: 'zona-sul',
    },
    {
      identificador: 'hotel-bela-vista',
      nome: 'Hotel Bela Vista',
      tipo: 'pj',
      atributos: { cnae: '5510-8/01', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Rua Treze de Maio, 210',
      latitude: -23.5559,
      longitude: -46.6456,
      fonte: 'fixture',
      escopo: 'zona-sul',
    },
    {
      identificador: 'hotel-norte-prime',
      nome: 'Hotel Norte Prime',
      tipo: 'pj',
      atributos: { cnae: '5510-8/01', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Rua Voluntários, 90',
      latitude: -23.5001,
      longitude: -46.6201,
      fonte: 'fixture',
      escopo: 'zona-norte',
    },
    {
      identificador: 'hotel-norte-comfort',
      nome: 'Hotel Norte Comfort',
      tipo: 'pj',
      atributos: { cnae: '5510-8/01', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Av. Cruzeiro do Sul, 500',
      latitude: -23.5121,
      longitude: -46.6241,
      fonte: 'fixture',
      escopo: 'zona-norte',
    },
    {
      identificador: 'fornecedor-colchao-1',
      nome: 'Colchoes Alpha',
      tipo: 'pj',
      atributos: { cnae: '3104-7/00', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Rua Augusta, 50',
      latitude: -23.5501,
      longitude: -46.6501,
      fonte: 'fixture',
      escopo: 'fornecedores-centro',
    },
    {
      identificador: 'fornecedor-enxoval-1',
      nome: 'Enxovais Beta',
      tipo: 'pj',
      atributos: { cnae: '4649-4/01', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Rua da Consolação, 200',
      latitude: -23.5511,
      longitude: -46.6511,
      fonte: 'fixture',
      escopo: 'fornecedores-centro',
    },
    {
      identificador: 'fornecedor-varejo-nao-compat',
      nome: 'Varejo Gama',
      tipo: 'pj',
      atributos: { cnae: '4721-1/02', porte: 'medio', cidade: 'São Paulo' },
      endereco: 'Rua Frei Caneca, 300',
      latitude: -23.5521,
      longitude: -46.6521,
      fonte: 'fixture',
      escopo: 'fornecedores-centro',
    },
  ]
}

import { randomUUID } from 'node:crypto'
import type {
  CriarUsuarioInput,
  IUsuarioRepository,
  UsuarioDTO,
} from '../interfaces/usuario.repository.js'

export class MemoryUsuarioRepo implements IUsuarioRepository {
  private readonly items = new Map<string, UsuarioDTO>()

  async buscarPorEmail(email: string): Promise<UsuarioDTO | null> {
    for (const u of this.items.values()) {
      if (u.email === email && u.ativo) return clone(u)
    }
    return null
  }

  async buscarPorId(id: string): Promise<UsuarioDTO | null> {
    const u = this.items.get(id)
    return u ? clone(u) : null
  }

  async listar(limit: number, offset: number): Promise<{ total: number; items: UsuarioDTO[] }> {
    const ativos = [...this.items.values()].filter((u) => u.ativo)
    return {
      total: ativos.length,
      items: ativos.slice(offset, offset + limit).map(clone),
    }
  }

  async criar(input: CriarUsuarioInput): Promise<UsuarioDTO> {
    const now = new Date().toISOString()
    const usuario: UsuarioDTO = {
      id: randomUUID(),
      email: input.email,
      senhaHash: input.senhaHash,
      role: input.role ?? 'user',
      ativo: true,
      createdAt: now,
      updatedAt: now,
    }
    this.items.set(usuario.id, usuario)
    return clone(usuario)
  }

  async desativar(id: string): Promise<void> {
    const u = this.items.get(id)
    if (u) {
      u.ativo = false
      u.updatedAt = new Date().toISOString()
    }
  }
}
