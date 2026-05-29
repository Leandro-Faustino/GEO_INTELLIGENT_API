import { randomUUID } from 'node:crypto'
import type {
  CriterioDerivadoDTO,
  CompradorConhecidoDTO,
  IBaseInternaRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../repositories/interfaces/index.js'
import type { IAdaptadorFonte } from '../adapters/base-adapter.js'
import { DerivacaoService } from './derivacao.service.js'

export interface FonteEnriquecimento {
  nome: string
  adapter: IAdaptadorFonte
}

export interface FatorDescoberto {
  atributo: string
  peso: number
  pesoPercentual: number
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
  'codigoSetor',
  'endereco',
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
  latitude: 'geocoder',
  longitude: 'geocoder',
  bairro: 'geocoder',
  setorCensitario: 'geocoder',
  municipio: 'geocoder',
  uf: 'geocoder',
  confianca: 'geocoder',
}

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
  'idh',
  'confianca',
  'latitude',
  'longitude',
]

export class EnriquecimentoService {
  constructor(
    private readonly baseInternaRepo: IBaseInternaRepository,
    private readonly perfilRepo: IPerfilRepository,
    private readonly fontes: FonteEnriquecimento[],
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
      bonsCompradores,
      fontesAtivas,
      fontesConsultadas,
      fontesComFalha,
    )
    const criteriosEnriquecidos = this.extrairCriteriosEnriquecidos(compradoresEnriquecidos)

    const novosFatores: FatorDescoberto[] = criteriosEnriquecidos
      .filter((criterio) => !nomesOriginais.has(criterio.nome))
      .map((criterio) => ({
        atributo: criterio.nome,
        peso: criterio.peso,
        pesoPercentual: Math.round(criterio.peso * 100),
        descricao: this.descreverCriterio(criterio),
        fonte: ATRIBUTO_FONTE[criterio.nome] ?? 'desconhecida',
      }))
      .sort((a, b) => b.peso - a.peso)

    const perfilEnriquecido = await this.salvarPerfilEnriquecido(
      perfilOriginal,
      criteriosEnriquecidos,
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

  private async enriquecerTodos(
    compradores: CompradorConhecidoDTO[],
    fontes: FonteEnriquecimento[],
    fontesConsultadas: string[],
    fontesComFalha: string[],
  ): Promise<Array<{ atributos: Record<string, unknown> }>> {
    const resultado: Array<{ atributos: Record<string, unknown> }> = []

    for (const comprador of compradores) {
      const atributosMergeados = { ...comprador.atributosOriginais }
      const promises = fontes.map(async (fonte) => {
        try {
          const dados = await fonte.adapter.enriquecer(comprador.identificador)
          return { fonte: fonte.nome, dados, sucesso: true as const }
        } catch {
          return {
            fonte: fonte.nome,
            dados: {} as Record<string, unknown>,
            sucesso: false as const,
          }
        }
      })

      const resultados = await Promise.allSettled(promises)

      for (const resultadoFonte of resultados) {
        if (resultadoFonte.status !== 'fulfilled') continue

        const { fonte, dados, sucesso } = resultadoFonte.value
        if (!fontesConsultadas.includes(fonte)) {
          fontesConsultadas.push(fonte)
        }

        if (!sucesso) {
          if (!fontesComFalha.includes(fonte)) {
            fontesComFalha.push(fonte)
          }
          continue
        }

        for (const [chave, valor] of Object.entries(dados)) {
          if (CAMPOS_META.has(chave)) continue
          if (chave in atributosMergeados) continue
          atributosMergeados[chave] = valor
        }
      }

      resultado.push({ atributos: atributosMergeados })
    }

    return resultado
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
  ): CriterioDerivadoDTO[] {
    const atributos = new Map<string, unknown[]>()

    for (const comprador of compradores) {
      for (const [nome, valor] of Object.entries(comprador.atributos)) {
        if (valor === undefined || valor === null) continue
        const valores = atributos.get(nome) ?? []
        valores.push(valor)
        atributos.set(nome, valores)
      }
    }

    const pesoBase = Math.max(0.1, 0.8 / Math.max(atributos.size, 1))
    const criterios: CriterioDerivadoDTO[] = []

    for (const [nome, valores] of atributos) {
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
        criterios.push({
          nome,
          valorMin: Math.min(...numericos),
          valorMax: Math.max(...numericos),
          peso: this.arredondar(pesoBase),
          tipoComparacao: 'range',
        })
        continue
      }

      const frequencias = new Map<string, number>()
      for (const valor of valores) {
        const chave = String(valor)
        frequencias.set(chave, (frequencias.get(chave) ?? 0) + 1)
      }

      const topValores = [...frequencias.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([valor]) => valor)

      criterios.push({
        nome,
        valorMin: topValores,
        valorMax: topValores,
        peso: this.arredondar(pesoBase),
        tipoComparacao: 'enum',
      })
    }

    return criterios
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
