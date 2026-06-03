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
  // legacy aliases kept for backward compatibility
  entidadeNome: string
  entidadeCidade: string
  latitude: number | null
  longitude: number | null
  // canonical map fields (same data, preferred names)
  nome: string
  endereco: string
  lat: number | null
  lon: number | null
  faixaScore: 'alta' | 'media' | 'baixa'
  tipo: string
  justificativa: string
  ganchoAbordagem: string
  prioridade: 'alta' | 'media' | 'baixa'
  score: ScoreDTO
}

export interface CentroMapaDTO {
  lat: number
  lon: number
  zoom: number
}

export interface AnaliseDTO {
  id: string
  clienteId: string
  perfilId?: string
  tipo: string
  escopo: string
  versaoModelo: string
  origem?: 'motor' | 'local'
  oportunidades: OportunidadeDTO[]
  centroMapa?: CentroMapaDTO | null
  createdAt: string
  updatedAt: string
}

export interface MapaEntidadeDTO {
  identificador: string
  nome: string
  endereco: string
  lat: number | null
  lon: number | null
  score: number | null
  faixaScore: 'alta' | 'media' | 'baixa' | null
  jaCliente: boolean
}

export interface MapaResponseDTO {
  analiseId: string
  centroMapa: CentroMapaDTO | null
  totalEntidades: number
  entidades: MapaEntidadeDTO[]
}

export interface EntregaDTO {
  id: string
  clienteId: string
  analiseId: string
  tipo: string
  periodo: string
  formato: string
  totalOportunidades: number
  createdAt: string
  updatedAt: string
}

export interface FeedbackResultadoDTO {
  entidadeAlvoId: string
  converteu: boolean
  atributos: Record<string, unknown>
  ticketReal?: number
}

export interface FeedbackEntregaDTO {
  id: string
  entregaId: string
  exclusoes: string[]
  ajustes: Array<{
    criterio: string
    novoPeso?: number
    novoMin?: unknown
    novoMax?: unknown
  }>
  resultados: FeedbackResultadoDTO[]
  observacoes: string
  createdAt: string
}

export interface EnriquecimentoCompradorDTO {
  id: string
  clienteId: string
  compradorIdentificador: string
  compradorNome: string
  fonte: string
  status: 'sucesso' | 'falha'
  payload: Record<string, unknown>
  erro: string
  createdAt: string
  expiresAt: string | null
}

export interface IClienteRepository {
  salvar(cliente: ClienteDTO): Promise<ClienteDTO>
  buscarPorId(id: string): Promise<ClienteDTO | null>
  buscarPorIdDoOwner(id: string, ownerId: string): Promise<ClienteDTO | null>
  listar(limit: number, offset: number): Promise<{ items: ClienteDTO[]; total: number }>
  listarPorOwner(
    ownerId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: ClienteDTO[]; total: number }>
}

export interface IBaseInternaRepository {
  salvar(base: BaseInternaDTO): Promise<BaseInternaDTO>
  buscarPorCliente(clienteId: string): Promise<BaseInternaDTO | null>
}

export interface IPerfilRepository {
  salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO>
  buscarPorId(id: string): Promise<PerfilIdealDTO | null>
  buscarPorIdParaCliente(id: string, clienteId: string): Promise<PerfilIdealDTO | null>
  buscarPorCliente(
    clienteId: string,
    filtros?: { tipo?: string; limit?: number; offset?: number },
  ): Promise<PerfilIdealDTO[]>
}

export interface IEntidadeAlvoRepository {
  salvarLote(entidades: EntidadeAlvoDTO[]): Promise<void>
  buscarPorEscopo(escopo: string, tipo?: string): Promise<EntidadeAlvoDTO[]>
}

export type AnaliseResumoDTO = Omit<AnaliseDTO, 'oportunidades'> & {
  totalOportunidades: number
}

export interface IAnaliseRepository {
  salvar(analise: AnaliseDTO): Promise<AnaliseDTO>
  buscarPorId(id: string): Promise<AnaliseDTO | null>
  buscarPorIdParaCliente(id: string, clienteId: string): Promise<AnaliseDTO | null>
  listarPorCliente(
    clienteId: string,
    limit: number,
    offset: number,
    filtros?: { escopo?: string; origem?: string },
  ): Promise<{ items: AnaliseResumoDTO[]; total: number }>
}

export interface IEntregaRepository {
  salvar(entrega: EntregaDTO): Promise<EntregaDTO>
  buscarPorId(id: string): Promise<EntregaDTO | null>
  listarPorCliente(
    clienteId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: EntregaDTO[]; total: number }>
}

export interface IFeedbackRepository {
  salvar(feedback: FeedbackEntregaDTO): Promise<FeedbackEntregaDTO>
  buscarPorEntregaId(entregaId: string): Promise<FeedbackEntregaDTO[]>
}

export interface IEnriquecimentoCompradorRepository {
  salvar(enriquecimento: EnriquecimentoCompradorDTO): Promise<EnriquecimentoCompradorDTO>
  buscarPorCliente(
    clienteId: string,
    filtros?: { compradorIdentificador?: string; fonte?: string },
  ): Promise<EnriquecimentoCompradorDTO[]>
  buscarUltimosPorCliente(clienteId: string): Promise<EnriquecimentoCompradorDTO[]>
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


export type {
  UsuarioDTO,
  CriarUsuarioInput,
  IUsuarioRepository,
} from './usuario.repository.js'
