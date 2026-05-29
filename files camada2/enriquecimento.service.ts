/**
 * Serviço de Enriquecimento de Perfil (C2.2).
 *
 * Amplia os atributos dos compradores com dados de fontes externas
 * (CNPJ, IBGE, Geocoder), re-deriva o perfil com atributos novos,
 * e mostra o DIFF: quais fatores apareceram que não existiam antes.
 *
 * Fundamento na documentação do projeto:
 *
 *  Node.js Design Patterns, Cap. 5 — Parallel execution:
 *    "All the spider() tasks are started in the loop at once, in the
 *     same event loop cycle." Usamos Promise.allSettled (não .all)
 *     porque não queremos que uma fonte falhando rejeite todas.
 *
 *  TypeScript Microservices, Cap. 7 — Client resiliency patterns:
 *    "Fallback: rather than generating an exception, the consumer
 *     will try to carry out an alternative way." Se uma fonte falha,
 *     continuamos com as demais (fallback parcial). O circuit breaker
 *     de cada adapter já vem do BaseAdapter.
 *
 *    "Bulkhead: we break the calls to remote resources into their own
 *     bulkheads and reduce the risk." Cada adapter opera isolado —
 *     falha de um não afeta os outros.
 *
 *  Distributed Systems, Cap. 8 — Idempotency:
 *    Enriquecer a mesma base duas vezes produz o mesmo resultado
 *    (sem side effects). Safe to retry.
 *
 * Padrão: DI por construtor, erros com statusCode (Fastify Cap. 3),
 * reusa a lógica de extrairCriterios do DerivacaoService.
 */
import type {
  IBaseInternaRepository,
  IPerfilRepository,
  CriterioDerivadoDTO,
  CompradorConhecidoDTO,
} from '../repositories/interfaces/index.js'
import type { IAdaptadorFonte } from '../adapters/base-adapter.js'
import { DerivacaoService } from './derivacao.service.js'

// ── Tipos públicos do serviço ─────────────────────────────────

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

// ── Campos de metadados que NÃO são atributos de negócio ──────
const CAMPOS_META = new Set([
  'fonte', 'enriquecidoEm', 'identificador', 'codigoSetor', 'endereco',
])

// ── Mapa de atributo → fonte (para o diff) ────────────────────
const ATRIBUTO_FONTE: Record<string, string> = {
  razaoSocial: 'cnpj', situacao: 'cnpj', dataAbertura: 'cnpj',
  naturezaJuridica: 'cnpj', capitalSocial: 'cnpj', cnaePrincipal: 'cnpj',
  rendaMediaPc: 'ibge', populacao: 'ibge', densidadeHabKm2: 'ibge', idh: 'ibge',
  latitude: 'geocoder', longitude: 'geocoder', bairro: 'geocoder',
  setorCensitario: 'geocoder', municipio: 'geocoder', uf: 'geocoder',
  confianca: 'geocoder',
}

// ── Nomes contínuos conhecidos (heurística código-vs-grandeza) ─
const CONTINUOS = [
  'ticket', 'valor', 'preco', 'renda', 'faturamento', 'receita',
  'area', 'idade', 'distancia', 'quantidade', 'capital', 'populacao',
  'densidade', 'idh', 'confianca', 'latitude', 'longitude',
]

export class EnriquecimentoService {
  constructor(
    private readonly baseInternaRepo: IBaseInternaRepository,
    private readonly perfilRepo: IPerfilRepository,
    private readonly fontes: FonteEnriquecimento[],
  ) {}

  /**
   * Enriquece os compradores e re-deriva o perfil.
   *
   * Fluxo:
   *  1. Busca base interna e valida pré-condição (CO2)
   *  2. Deriva perfil ORIGINAL (atributos atuais)
   *  3. Para cada comprador, chama adapters em PARALELO
   *     (Promise.allSettled — Node.js Design Patterns Cap. 5)
   *  4. Mergea atributos novos SEM sobrescrever os originais
   *  5. Extrai critérios do perfil ENRIQUECIDO
   *  6. Calcula DIFF: quais critérios são novos e com qual peso
   */
  async enriquecer(
    clienteId: string,
    fontesDesejadas?: string[],
  ): Promise<ResultadoEnriquecimento> {
    // ── 1. Busca e validação ──────────────────────────────────
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    if (!base) {
      throw Object.assign(
        new Error('Base interna não encontrada. Importe a base antes de enriquecer.'),
        { statusCode: 404 },
      )
    }

    const bonsCompradores = base.compradores.filter(
      (c) => c.ativo && c.frequencia >= 2,
    )
    if (bonsCompradores.length < 3) {
      throw Object.assign(
        new Error(
          `Mínimo de 3 compradores ativos com recompra. Encontrados: ${bonsCompradores.length}.`,
        ),
        { statusCode: 422 },
      )
    }

    // ── 2. Perfil ORIGINAL (antes do enriquecimento) ──────────
    const derivacao = new DerivacaoService(this.baseInternaRepo, this.perfilRepo)
    const perfilOriginal = await derivacao.derivarPerfil(clienteId, 'pj')
    const nomesOriginais = new Set(perfilOriginal.criterios.map((c) => c.nome))

    // ── 3. Enriquece em paralelo com fallback parcial ─────────
    const fontesAtivas = fontesDesejadas
      ? this.fontes.filter((f) => fontesDesejadas.includes(f.nome))
      : this.fontes

    const fontesConsultadas: string[] = []
    const fontesComFalha: string[] = []

    const compradoresEnriquecidos = await this.enriquecerTodos(
      bonsCompradores,
      fontesAtivas,
      fontesConsultadas,
      fontesComFalha,
    )

    // ── 5. Extrai critérios do perfil ENRIQUECIDO ─────────────
    const criteriosEnriquecidos = this.extrairCriteriosEnriquecidos(
      compradoresEnriquecidos,
    )

    // ── 6. DIFF: quais fatores são NOVOS ──────────────────────
    const novosFatores: FatorDescoberto[] = criteriosEnriquecidos
      .filter((c) => !nomesOriginais.has(c.nome))
      .map((c) => ({
        atributo: c.nome,
        peso: c.peso,
        pesoPercentual: Math.round(c.peso * 100),
        descricao: this.descreverCriterio(c),
        fonte: ATRIBUTO_FONTE[c.nome] ?? 'desconhecida',
      }))
      .sort((a, b) => b.peso - a.peso)

    return {
      perfilOriginal: {
        totalFatores: perfilOriginal.criterios.length,
        criterios: perfilOriginal.criterios,
      },
      perfilEnriquecido: {
        totalFatores: criteriosEnriquecidos.length,
        criterios: criteriosEnriquecidos,
      },
      novosFatores,
      fontesConsultadas,
      fontesComFalha,
      compradoresEnriquecidos: compradoresEnriquecidos.length,
    }
  }

  // ── Enriquecimento paralelo ─────────────────────────────────

  /**
   * Para cada comprador, chama todos os adapters em paralelo.
   *
   * Node.js Design Patterns, Cap. 5: "Promise.all() will reject as
   * soon as any of the promises reject." Por isso usamos
   * Promise.allSettled — queremos TODAS as respostas, inclusive
   * as que falharam, para implementar fallback parcial.
   *
   * TypeScript Microservices, Cap. 7: "Bulkhead: we break the calls
   * into their own bulkheads." Cada adapter é um bulkhead isolado.
   */
  private async enriquecerTodos(
    compradores: CompradorConhecidoDTO[],
    fontes: FonteEnriquecimento[],
    fontesConsultadas: string[],
    fontesComFalha: string[],
  ): Promise<Array<{ atributos: Record<string, unknown> }>> {
    const resultado: Array<{ atributos: Record<string, unknown> }> = []

    for (const comprador of compradores) {
      const atributosMergeados = { ...comprador.atributosOriginais }

      // Dispara TODAS as fontes em paralelo para este comprador
      const promises = fontes.map(async (fonte) => {
        try {
          const dados = await fonte.adapter.enriquecer(comprador.identificador)
          return { fonte: fonte.nome, dados, sucesso: true as const }
        } catch {
          return { fonte: fonte.nome, dados: {} as Record<string, unknown>, sucesso: false as const }
        }
      })

      // Promise.allSettled: espera TODAS, não rejeita se alguma falhar
      const resultados = await Promise.allSettled(promises)

      for (const r of resultados) {
        if (r.status !== 'fulfilled') continue
        const { fonte, dados, sucesso } = r.value

        // Registra a fonte como consultada
        if (!fontesConsultadas.includes(fonte)) {
          fontesConsultadas.push(fonte)
        }

        if (sucesso) {
          // Mergea atributos NOVOS (não sobrescreve os originais)
          for (const [chave, valor] of Object.entries(dados)) {
            if (CAMPOS_META.has(chave)) continue
            if (chave in atributosMergeados) continue // não sobrescreve
            atributosMergeados[chave] = valor
          }
        } else {
          // TypeScript Microservices Cap. 7 — Fallback parcial:
          // registra falha mas continua com as demais fontes
          if (!fontesComFalha.includes(fonte)) {
            fontesComFalha.push(fonte)
          }
        }
      }

      resultado.push({ atributos: atributosMergeados })
    }

    return resultado
  }

  // ── Extração de critérios (mesma lógica do DerivacaoService) ─

  /**
   * Extrai critérios dos atributos enriquecidos.
   *
   * Replica a lógica de DerivacaoService.extrairCriterios() para
   * operar sobre os atributos já mergeados. Inclui a heurística
   * de código-vs-grandeza (CNAE é categórico, não numérico).
   */
  private extrairCriteriosEnriquecidos(
    compradores: Array<{ atributos: Record<string, unknown> }>,
  ): CriterioDerivadoDTO[] {
    // Agrupa valores por nome de atributo
    const atributos = new Map<string, unknown[]>()
    for (const c of compradores) {
      for (const [nome, valor] of Object.entries(c.atributos)) {
        if (valor === undefined || valor === null) continue
        if (!atributos.has(nome)) atributos.set(nome, [])
        atributos.get(nome)!.push(valor)
      }
    }

    const pesoBase = Math.max(0.1, 0.8 / Math.max(atributos.size, 1))
    const criterios: CriterioDerivadoDTO[] = []

    for (const [nome, valores] of atributos) {
      const nums = valores.map((v) => Number(v)).filter(Number.isFinite)

      // Heurística código-vs-grandeza: evita tratar CNAE como range
      const nomeLower = nome.toLowerCase()
      const ehContinuo = CONTINUOS.some((k) => nomeLower.includes(k))
      const distintos = new Set(nums).size
      const todosInteiros = nums.every((n) => Number.isInteger(n))
      const magnitudeCodigo = nums.length > 0 && nums.every((n) => Math.abs(n) >= 10000)
      const temRepeticao = distintos < nums.length
      const pareceCodigo = !ehContinuo && todosInteiros && magnitudeCodigo && temRepeticao

      const ehNumerico = nums.length >= valores.length * 0.8 && !pareceCodigo

      if (ehNumerico) {
        criterios.push({
          nome,
          valorMin: Math.min(...nums),
          valorMax: Math.max(...nums),
          peso: this.arredondar(pesoBase),
          tipoComparacao: 'range',
        })
      } else {
        const freq = new Map<string, number>()
        for (const v of valores) {
          const s = String(v)
          freq.set(s, (freq.get(s) ?? 0) + 1)
        }
        const topValores = [...freq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([v]) => v)

        criterios.push({
          nome,
          valorMin: topValores,
          valorMax: topValores,
          peso: this.arredondar(pesoBase),
          tipoComparacao: 'enum',
        })
      }
    }

    return criterios
  }

  // ── Helpers ─────────────────────────────────────────────────

  private descreverCriterio(c: CriterioDerivadoDTO): string {
    if (c.tipoComparacao === 'enum') {
      const valores = Array.isArray(c.valorMin)
        ? c.valorMin.slice(0, 3).map(String)
        : [String(c.valorMin)]
      return `Valores predominantes: ${valores.join(', ')}`
    }
    return `Tipicamente entre ${Math.round(Number(c.valorMin))} e ${Math.round(Number(c.valorMax))}`
  }

  private arredondar(valor: number): number {
    return Math.round(valor * 100) / 100
  }
}
