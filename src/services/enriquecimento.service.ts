import { randomUUID } from 'node:crypto'
import type {
  CriterioDerivadoDTO,
  CompradorConhecidoDTO,
  EnriquecimentoCompradorDTO,
  IBaseInternaRepository,
  IEnriquecimentoCompradorRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../repositories/interfaces/index.js'
import type {
  EnriquecimentoContexto,
  IAdaptadorFonte,
} from '../adapters/base-adapter.js'
import { DerivacaoService } from './derivacao.service.js'

export interface FonteEnriquecimento {
  nome: string
  adapter: IAdaptadorFonte
}

export interface FatorDescoberto {
  atributo: string
  peso: number
  pesoPercentual: number
  suporte: number
  descricao: string
  fonte: string
}

export interface ResultadoEnriquecimento {
  perfilOriginal: {
    totalFatores: number
    criterios: CriterioDerivadoDTO[]
  }
  perfilEnriquecido: {
    totalFatores: number
    criterios: CriterioDerivadoDTO[]
  }
  novosFatores: FatorDescoberto[]
  fontesConsultadas: string[]
  fontesComFalha: string[]
  compradoresEnriquecidos: number
}

const CAMPOS_META = new Set([
  'fonte',
  'enriquecidoEm',
  'identificador',
  'encontrado',
  'codigoSetor',
  'codigoIbge',
  'codigo_ibge',
  'endereco',
  'displayName',
  'cep',
  'pais',
  'idhAno',
])

const ATRIBUTO_FONTE: Record<string, string> = {
  razaoSocial: 'cnpj',
  situacao: 'cnpj',
  dataAbertura: 'cnpj',
  naturezaJuridica: 'cnpj',
  capitalSocial: 'cnpj',
  cnaePrincipal: 'cnpj',
  rendaMediaPc: 'ibge',
  populacao: 'ibge',
  densidadeHabKm2: 'ibge',
  idh: 'ibge',
  codigoIbge: 'ibge',
  microrregiao: 'ibge',
  regiaoImediata: 'ibge',
  pibMilReais: 'ibge',
  pibPerCapitaEstimado: 'ibge',
  latitude: 'geocoder',
  longitude: 'geocoder',
  bairro: 'geocoder',
  setorCensitario: 'geocoder',
  municipio: 'geocoder/ibge',
  uf: 'geocoder/ibge',
  confianca: 'geocoder',
}

const FONTES_DEPENDENTES_DE_CONTEXTO = new Set(['ibge-censo'])

const SUPORTE_MINIMO = 0.2
const GRANULARIDADE_MAX = 0.8
const LIFT_CAP = 3.0

const CONTINUOS = [
  'ticket',
  'valor',
  'preco',
  'renda',
  'faturamento',
  'receita',
  'area',
  'idade',
  'distancia',
  'quantidade',
  'capital',
  'populacao',
  'densidade',
  'pib',
  'idh',
  'confianca',
  'latitude',
  'longitude',
]

export interface CompradorConsolidado {
  identificador: string
  nome: string
  tipo: string
  ticketMedio: number
  frequencia: number
  atributosConsolidados: Record<string, unknown>
  fontesAplicadas: string[]
}

export class EnriquecimentoService {
  constructor(
    private readonly baseInternaRepo: IBaseInternaRepository,
    private readonly perfilRepo: IPerfilRepository,
    private readonly fontes: FonteEnriquecimento[],
    private readonly enriquecimentoRepo?: IEnriquecimentoCompradorRepository,
  ) {}

  async enriquecer(
    clienteId: string,
    fontesDesejadas?: string[],
  ): Promise<ResultadoEnriquecimento> {
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    if (!base) {
      throw Object.assign(
        new Error('Base interna não encontrada. Importe a base antes de enriquecer.'),
        { statusCode: 404 },
      )
    }

    const bonsCompradores = base.compradores.filter(
      (comprador) => comprador.ativo && comprador.frequencia >= 2,
    )
    if (bonsCompradores.length < 3) {
      throw Object.assign(
        new Error(
          `Mínimo de 3 compradores ativos com recompra. Encontrados: ${bonsCompradores.length}.`,
        ),
        { statusCode: 422 },
      )
    }

    const derivacao = new DerivacaoService(this.baseInternaRepo, this.perfilRepo)
    const fontesAtivas = this.validarFontesDesejadas(fontesDesejadas)
    const perfilOriginal = await derivacao.calcularPerfil(clienteId, 'pj')
    const nomesOriginais = new Set(perfilOriginal.criterios.map((criterio) => criterio.nome))

    const fontesConsultadas: string[] = []
    const fontesComFalha: string[] = []

    const compradoresEnriquecidos = await this.enriquecerTodos(
      clienteId,
      bonsCompradores,
      fontesAtivas,
      fontesConsultadas,
      fontesComFalha,
    )
    const criteriosComSuporte = this.extrairCriteriosEnriquecidos(compradoresEnriquecidos)

    const novosFatores: FatorDescoberto[] = criteriosComSuporte
      .filter(({ criterio }) => !nomesOriginais.has(criterio.nome))
      .map(({ criterio, suporte }) => ({
        atributo: criterio.nome,
        peso: criterio.peso,
        pesoPercentual: Math.round(criterio.peso * 100),
        suporte,
        descricao: this.descreverCriterio(criterio),
        fonte: ATRIBUTO_FONTE[criterio.nome] ?? 'desconhecida',
      }))
      .sort((a, b) => b.peso - a.peso)

    const perfilEnriquecido = await this.salvarPerfilEnriquecido(
      perfilOriginal,
      criteriosComSuporte.map(({ criterio }) => criterio),
    )

    return {
      perfilOriginal: {
        totalFatores: perfilOriginal.criterios.length,
        criterios: perfilOriginal.criterios,
      },
      perfilEnriquecido: {
        totalFatores: perfilEnriquecido.criterios.length,
        criterios: perfilEnriquecido.criterios,
      },
      novosFatores,
      fontesConsultadas,
      fontesComFalha,
      compradoresEnriquecidos: compradoresEnriquecidos.length,
    }
  }

  async buscarCompradoresConsolidados(clienteId: string): Promise<CompradorConsolidado[]> {
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    if (!base) {
      throw Object.assign(
        new Error('Base interna não encontrada.'),
        { statusCode: 404 },
      )
    }

    const enriquecimentos = this.enriquecimentoRepo
      ? await this.enriquecimentoRepo.buscarUltimosPorCliente(clienteId)
      : []

    const payloadsPorComprador = new Map<string, Record<string, unknown>>()
    const fontesPorComprador = new Map<string, Set<string>>()

    for (const enriquecimento of enriquecimentos) {
      const id = enriquecimento.compradorIdentificador
      const atual = payloadsPorComprador.get(id) ?? {}
      this.mesclarAtributos(atual, enriquecimento.payload)
      payloadsPorComprador.set(id, atual)

      const fontes = fontesPorComprador.get(id) ?? new Set<string>()
      fontes.add(enriquecimento.fonte)
      fontesPorComprador.set(id, fontes)
    }

    return base.compradores.map((comprador) => ({
      identificador: comprador.identificador,
      nome: comprador.nome,
      tipo: comprador.tipo,
      ticketMedio: comprador.ticketMedio,
      frequencia: comprador.frequencia,
      atributosConsolidados: {
        ...comprador.atributosOriginais,
        ...(payloadsPorComprador.get(comprador.identificador) ?? {}),
      },
      fontesAplicadas: [...(fontesPorComprador.get(comprador.identificador) ?? [])],
    }))
  }

  private async enriquecerTodos(
    clienteId: string,
    compradores: CompradorConhecidoDTO[],
    fontes: FonteEnriquecimento[],
    fontesConsultadas: string[],
    fontesComFalha: string[],
  ): Promise<Array<{ atributos: Record<string, unknown> }>> {
    const resultado: Array<{ atributos: Record<string, unknown> }> = []

    for (const comprador of compradores) {
      const atributosMergeados = { ...comprador.atributosOriginais }
      const fontesIndependentes = fontes.filter(
        (fonte) => !FONTES_DEPENDENTES_DE_CONTEXTO.has(fonte.nome),
      )
      const fontesDependentes = fontes.filter((fonte) =>
        FONTES_DEPENDENTES_DE_CONTEXTO.has(fonte.nome),
      )

      await this.executarFontesDoComprador(
        comprador,
        clienteId,
        atributosMergeados,
        fontesIndependentes,
        fontesConsultadas,
        fontesComFalha,
      )
      await this.executarFontesDoComprador(
        comprador,
        clienteId,
        atributosMergeados,
        fontesDependentes,
        fontesConsultadas,
        fontesComFalha,
      )

      resultado.push({ atributos: atributosMergeados })
    }

    return resultado
  }

  private async executarFontesDoComprador(
    comprador: CompradorConhecidoDTO,
    clienteId: string,
    atributosMergeados: Record<string, unknown>,
    fontes: FonteEnriquecimento[],
    fontesConsultadas: string[],
    fontesComFalha: string[],
  ): Promise<void> {
    const promises = fontes.map(async (fonte) => {
      const isOptional = fonte.adapter.isOptional ?? false
      try {
        const contexto = this.criarContexto(comprador, atributosMergeados)
        const dados = fonte.adapter.enriquecerComContexto
          ? await fonte.adapter.enriquecerComContexto(contexto)
          : await fonte.adapter.enriquecer(comprador.identificador)
        await this.registrarEnriquecimento({
          clienteId,
          comprador,
          fonte: fonte.nome,
          status: 'sucesso',
          payload: dados,
          erro: '',
        })
        return { fonte: fonte.nome, dados, sucesso: true as const, isOptional }
      } catch (error) {
        await this.registrarEnriquecimento({
          clienteId,
          comprador,
          fonte: fonte.nome,
          status: 'falha',
          payload: {},
          erro: error instanceof Error ? error.message : String(error),
        })
        return {
          fonte: fonte.nome,
          dados: {} as Record<string, unknown>,
          sucesso: false as const,
          isOptional,
        }
      }
    })

    const resultados = await Promise.allSettled(promises)

    for (const resultadoFonte of resultados) {
      if (resultadoFonte.status !== 'fulfilled') continue

      const { fonte, dados, sucesso, isOptional } = resultadoFonte.value
      if (!fontesConsultadas.includes(fonte)) {
        fontesConsultadas.push(fonte)
      }

      if (!sucesso) {
        if (!fontesComFalha.includes(fonte)) {
          fontesComFalha.push(fonte)
        }
        continue
      }

      if (!isOptional) {
        this.mesclarAtributos(atributosMergeados, dados)
      }
    }
  }

  private async registrarEnriquecimento(params: {
    clienteId: string
    comprador: CompradorConhecidoDTO
    fonte: string
    status: EnriquecimentoCompradorDTO['status']
    payload: Record<string, unknown>
    erro: string
  }): Promise<void> {
    if (!this.enriquecimentoRepo) return

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    await this.enriquecimentoRepo.salvar({
      id: randomUUID(),
      clienteId: params.clienteId,
      compradorIdentificador: params.comprador.identificador,
      compradorNome: params.comprador.nome,
      fonte: params.fonte,
      status: params.status,
      payload: params.payload,
      erro: params.erro,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
  }

  private criarContexto(
    comprador: CompradorConhecidoDTO,
    atributos: Record<string, unknown>,
  ): EnriquecimentoContexto {
    return {
      identificador: comprador.identificador,
      nome: comprador.nome,
      tipo: comprador.tipo,
      atributos: { ...atributos },
    }
  }

  private mesclarAtributos(
    destino: Record<string, unknown>,
    dados: Record<string, unknown>,
  ): void {
    for (const [chave, valor] of Object.entries(dados)) {
      if (CAMPOS_META.has(chave)) continue
      if (chave in destino) continue
      destino[chave] = valor
    }
  }

  private validarFontesDesejadas(fontesDesejadas?: string[]): FonteEnriquecimento[] {
    if (!fontesDesejadas) {
      return this.fontes
    }

    const fontesAtivas = this.fontes.filter((fonte) => fontesDesejadas.includes(fonte.nome))
    const nomesDisponiveis = new Set(this.fontes.map((fonte) => fonte.nome))
    const invalidas = [...new Set(fontesDesejadas)].filter((fonte) => !nomesDisponiveis.has(fonte))

    if (invalidas.length > 0) {
      throw Object.assign(
        new Error(
          `Fontes inválidas: ${invalidas.join(', ')}. Fontes disponíveis: ${this.fontes.map((fonte) => fonte.nome).join(', ')}.`,
        ),
        { statusCode: 422 },
      )
    }

    return fontesAtivas
  }

  private async salvarPerfilEnriquecido(
    perfilOriginal: PerfilIdealDTO,
    criteriosEnriquecidos: CriterioDerivadoDTO[],
  ): Promise<PerfilIdealDTO> {
    const now = new Date().toISOString()
    return this.perfilRepo.salvar({
      ...perfilOriginal,
      id: randomUUID(),
      nome: `${perfilOriginal.nome} enriquecido`,
      criterios: criteriosEnriquecidos,
      createdAt: now,
      updatedAt: now,
    })
  }

  private extrairCriteriosEnriquecidos(
    compradores: Array<{ atributos: Record<string, unknown> }>,
  ): Array<{ criterio: CriterioDerivadoDTO; suporte: number }> {
    const totalCompradores = compradores.length
    const atributos = new Map<string, unknown[]>()

    for (const comprador of compradores) {
      for (const [nome, valor] of Object.entries(comprador.atributos)) {
        if (valor === undefined || valor === null) continue
        const valores = atributos.get(nome) ?? []
        valores.push(valor)
        atributos.set(nome, valores)
      }
    }

    const atributosFiltrados: Array<[string, unknown[]]> = []
    for (const [nome, valores] of atributos) {
      const suporte = valores.length / totalCompradores
      if (suporte < SUPORTE_MINIMO) continue

      const nomeLower = nome.toLocaleLowerCase('pt-BR')
      if (nomeLower.includes('setor')) {
        const uniqueness = new Set(valores.map(String)).size / totalCompradores
        if (uniqueness > GRANULARIDADE_MAX) continue
      }

      atributosFiltrados.push([nome, valores])
    }

    const pesoBase = Math.max(0.1, 0.8 / Math.max(atributosFiltrados.length, 1))
    const resultado: Array<{ criterio: CriterioDerivadoDTO; suporte: number }> = []

    for (const [nome, valores] of atributosFiltrados) {
      const suporte = valores.length / totalCompradores
      const numericos = valores.map((valor) => Number(valor)).filter(Number.isFinite)
      const nomeLower = nome.toLocaleLowerCase('pt-BR')
      const ehContinuo = CONTINUOS.some((chave) => nomeLower.includes(chave))
      const distintos = new Set(numericos).size
      const todosInteiros = numericos.every((valor) => Number.isInteger(valor))
      const magnitudeCodigo =
        numericos.length > 0 && numericos.every((valor) => Math.abs(valor) >= 10000)
      const temRepeticao = distintos < numericos.length
      const pareceCodigo = !ehContinuo && todosInteiros && magnitudeCodigo && temRepeticao
      const ehNumerico = numericos.length >= valores.length * 0.8 && !pareceCodigo

      if (ehNumerico) {
        resultado.push({
          criterio: {
            nome,
            valorMin: Math.min(...numericos),
            valorMax: Math.max(...numericos),
            peso: this.arredondar(pesoBase),
            tipoComparacao: 'range',
          },
          suporte,
        })
        continue
      }

      const frequencias = new Map<string, number>()
      for (const valor of valores) {
        const chave = String(valor)
        frequencias.set(chave, (frequencias.get(chave) ?? 0) + 1)
      }

      const uniqueCount = frequencias.size
      const topFreq = uniqueCount > 0 ? Math.max(...frequencias.values()) : 1
      const topRelFreq = topFreq / totalCompradores
      const expected = uniqueCount > 0 ? 1 / uniqueCount : 1
      const lift = expected > 0 ? topRelFreq / expected : 1
      const pesoAjustado = this.arredondar(
        Math.min(pesoBase * Math.min(lift, LIFT_CAP), 1.0),
      )

      const topValores = [...frequencias.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([valor]) => valor)

      resultado.push({
        criterio: {
          nome,
          valorMin: topValores,
          valorMax: topValores,
          peso: pesoAjustado,
          tipoComparacao: 'enum',
        },
        suporte,
      })
    }

    return resultado
  }

  private descreverCriterio(criterio: CriterioDerivadoDTO): string {
    if (criterio.tipoComparacao === 'enum') {
      const valores = Array.isArray(criterio.valorMin)
        ? criterio.valorMin.slice(0, 3).map(String)
        : [String(criterio.valorMin)]
      return `Valores predominantes: ${valores.join(', ')}`
    }

    return `Tipicamente entre ${Math.round(Number(criterio.valorMin))} e ${Math.round(Number(criterio.valorMax))}`
  }

  private arredondar(valor: number): number {
    return Math.round(valor * 100) / 100
  }
}
