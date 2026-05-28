export interface ClienteDTO {
  id: string
  ownerId: string
  razaoSocial: string
  segmento: string
  cidade: string
  endereco: string
  vertical: string
  parametrosNegocio: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CompradorConhecidoDTO {
  identificador: string
  nome: string
  tipo: string
  atributosOriginais: Record<string, unknown>
  ticketMedio: number
  frequencia: number
  ativo: boolean
}

export interface BaseInternaDTO {
  clienteId: string
  periodo: string
  totalRegistros: number
  compradores: CompradorConhecidoDTO[]
}

export interface CriterioDerivadoDTO {
  nome: string
  valorMin: unknown
  valorMax: unknown
  peso: number
  tipoComparacao: 'range' | 'enum' | 'distancia' | 'booleano'
}

export interface PerfilIdealDTO {
  id: string
  clienteId: string
  nome: string
  tipo: string
  hipotetico: boolean
  criterios: CriterioDerivadoDTO[]
  exclusoes: string[]
  createdAt: string
  updatedAt: string
}

export interface EntidadeAlvoDTO {
  identificador: string
  nome: string
  tipo: string
  atributos: Record<string, unknown>
  endereco: string
  latitude: number
  longitude: number
  fonte: string
  escopo: string
}

export interface ScoreDTO {
  valor: number
  similaridade: number
  probConversao: number
}

export interface OportunidadeDTO {
  id: string
  entidadeAlvoId: string
  tipo: string
  justificativa: string
  ganchoAbordagem: string
  prioridade: 'alta' | 'media' | 'baixa'
  score: ScoreDTO
}

export interface AnaliseDTO {
  id: string
  clienteId: string
  tipo: string
  escopo: string
  versaoModelo: string
  oportunidades: OportunidadeDTO[]
  createdAt: string
  updatedAt: string
}

export interface EntregaDTO {
  id: string
  clienteId: string
  tipo: string
  periodo: string
  formato: string
  totalOportunidades: number
  createdAt: string
  updatedAt: string
}

export interface IClienteRepository {
  salvar(cliente: ClienteDTO): Promise<ClienteDTO>
  buscarPorId(id: string): Promise<ClienteDTO | null>
  listar(limit: number, offset: number): Promise<{ items: ClienteDTO[]; total: number }>
}

export interface IBaseInternaRepository {
  salvar(base: BaseInternaDTO): Promise<BaseInternaDTO>
  buscarPorCliente(clienteId: string): Promise<BaseInternaDTO | null>
}

export interface IPerfilRepository {
  salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO>
  buscarPorId(id: string): Promise<PerfilIdealDTO | null>
  buscarPorCliente(clienteId: string): Promise<PerfilIdealDTO[]>
}

export interface IEntidadeAlvoRepository {
  salvarLote(entidades: EntidadeAlvoDTO[]): Promise<void>
  buscarPorEscopo(escopo: string): Promise<EntidadeAlvoDTO[]>
}

export interface IAnaliseRepository {
  salvar(analise: AnaliseDTO): Promise<AnaliseDTO>
  buscarPorId(id: string): Promise<AnaliseDTO | null>
}

export interface IEntregaRepository {
  salvar(entrega: EntregaDTO): Promise<EntregaDTO>
  buscarPorId(id: string): Promise<EntregaDTO | null>
}

export interface AlertaDTO {
  id: string
  clienteId: string
  tipo: string
  entidadeAlvoId: string
  entidadeNome: string
  entidadeCidade: string
  score: number
  mensagem: string
  status: 'novo' | 'visto' | 'descartado' | 'convertido'
  criadoEm: string
}

export interface IAlertaRepository {
  salvar(alerta: AlertaDTO): Promise<AlertaDTO>
  buscarPorId(id: string): Promise<AlertaDTO | null>
  buscarPorCliente(
    clienteId: string,
    status?: AlertaDTO['status'],
  ): Promise<AlertaDTO[]>
  atualizarStatus(
    id: string,
    status: AlertaDTO['status'],
  ): Promise<AlertaDTO | null>
  existeParaEntidade(
    clienteId: string,
    entidadeAlvoId: string,
  ): Promise<boolean>
}
