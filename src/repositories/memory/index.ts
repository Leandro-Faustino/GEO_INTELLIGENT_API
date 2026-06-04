import type {
  AnaliseDTO,
  BaseInternaDTO,
  ClienteDTO,
  EntidadeAlvoDTO,
  EntregaDTO,
  IAnaliseRepository,
  IBaseInternaRepository,
  IClienteRepository,
  IEntidadeAlvoRepository,
  IEntregaRepository,
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

  async contarTodos(): Promise<number> {
    return this.items.size
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

  async contarTodos(): Promise<number> {
    return this.items.size
  }

  async listarPorCliente(clienteId: string, limit: number, offset: number): Promise<{ items: AnaliseDTO[]; total: number }> {
    const all = [...this.items.values()]
      .filter((a) => a.clienteId === clienteId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: clone(all.slice(offset, offset + limit)), total: all.length }
  }
}

export class MemoryEntregaRepo implements IEntregaRepository {
  private readonly items = new Map<string, EntregaDTO>()

  async salvar(entrega: EntregaDTO): Promise<EntregaDTO> {
    this.items.set(entrega.id, clone({ ...entrega, analiseId: entrega.analiseId ?? null }))
    return clone(entrega)
  }

  async buscarPorId(id: string): Promise<EntregaDTO | null> {
    const item = this.items.get(id)
    return item ? clone(item) : null
  }

  async listarPorCliente(clienteId: string, limit: number, offset: number): Promise<{ items: EntregaDTO[]; total: number }> {
    const all = [...this.items.values()]
      .filter((e) => e.clienteId === clienteId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { items: clone(all.slice(offset, offset + limit)), total: all.length }
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
  ]
}
