/**
 * Serviço de Análise de Território (C2.1).
 *
 * Dado o perfil ideal e a base interna, identifica REGIÕES com alta
 * densidade de potencial NÃO ATENDIDO. Responde: "onde tem muita
 * gente parecida com meus clientes, mas eu não tenho cobertura?"
 *
 * Padrão: DI por construtor. Reusa o scoring de similaridade
 * (mesma lógica do AnaliseService e AlertaService).
 *
 * Elasticsearch Cookbook, Cap. 7: conceito de geotile_grid aggregation
 * aplicado via MongoDB aggregation pipeline — agrupar entidades por
 * área geográfica e pontuar por densidade.
 *
 * TypeScript Microservices Cap. 1 — Bulkhead: análise de território
 * pode ser pesada. Em produção, isolar em worker próprio.
 */
import type {
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
  IBaseInternaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
} from '../repositories/interfaces/index.js'

export interface RegiaoAnalise {
  nome: string
  totalCandidatos: number
  naoAtendidos: number
  potencialMedio: number
  scoreMaisAlto: number
  cobertura: number
  oportunidadesTop3: Array<{
    nome: string
    identificador: string
    score: number
  }>
}

export interface ResultadoTerritorio {
  clienteId: string
  regioesAnalisadas: number
  regioes: RegiaoAnalise[]
  regiaoRecomendada: string | null
}

export class TerritorioService {
  constructor(
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
    private readonly baseInternaRepo: IBaseInternaRepository,
  ) {}

  /**
   * Analisa múltiplas regiões e ranqueia por potencial não atendido.
   *
   * 1. Busca perfil e base interna
   * 2. Para cada região: busca entidades, remove já-clientes
   * 3. Calcula score de cada candidato
   * 4. Agrega: potencial médio, cobertura, top 3
   * 5. Ordena regiões por potencial não atendido (desc)
   */
  async analisar(
    clienteId: string,
    regioes: string[],
    limiar = 0.3,
  ): Promise<ResultadoTerritorio> {
    const perfis = await this.perfilRepo.buscarPorCliente(clienteId)
    const perfil = perfis[0]
    if (!perfil) {
      throw Object.assign(
        new Error('Nenhum perfil encontrado. Derive o perfil antes de analisar o território.'),
        { statusCode: 404 },
      )
    }

    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    const jaClientes = new Set(
      base?.compradores.map((c) => c.identificador) ?? [],
    )

    const resultadoRegioes: RegiaoAnalise[] = []

    for (const regiao of regioes) {
      const entidades = await this.entidadeRepo.buscarPorEscopo(regiao)

      // Separa candidatos de já-clientes
      const candidatos = entidades.filter((e) => !jaClientes.has(e.identificador))
      const clientesNaRegiao = entidades.length - candidatos.length

      // Calcula score de cada candidato
      const scored = candidatos
        .map((e) => ({
          nome: e.nome,
          identificador: e.identificador,
          score: this.calcularSimilaridade(perfil.criterios, e),
        }))
        .filter((s) => s.score >= limiar)
        .sort((a, b) => b.score - a.score)

      const potencialMedio = scored.length > 0
        ? Math.round((scored.reduce((s, e) => s + e.score, 0) / scored.length) * 100) / 100
        : 0

      const cobertura = entidades.length > 0
        ? Math.round((clientesNaRegiao / entidades.length) * 100) / 100
        : 0

      resultadoRegioes.push({
        nome: regiao,
        totalCandidatos: entidades.length,
        naoAtendidos: scored.length,
        potencialMedio,
        scoreMaisAlto: scored[0]?.score ?? 0,
        cobertura,
        oportunidadesTop3: scored.slice(0, 3).map((s) => ({
          nome: s.nome,
          identificador: s.identificador,
          score: Math.round(s.score * 100) / 100,
        })),
      })
    }

    // Ordena por: mais candidatos não atendidos × maior potencial médio
    resultadoRegioes.sort(
      (a, b) => (b.naoAtendidos * b.potencialMedio) - (a.naoAtendidos * a.potencialMedio),
    )

    return {
      clienteId,
      regioesAnalisadas: regioes.length,
      regioes: resultadoRegioes,
      regiaoRecomendada: resultadoRegioes[0]?.nome ?? null,
    }
  }

  private calcularSimilaridade(
    criterios: CriterioDerivadoDTO[],
    entidade: EntidadeAlvoDTO,
  ): number {
    if (criterios.length === 0) return 0

    let somaScore = 0
    let somaPeso = 0

    for (const criterio of criterios) {
      const valor = entidade.atributos[criterio.nome]
      if (valor === undefined) continue

      let matchScore = 0
      if (criterio.tipoComparacao === 'enum') {
        const aceitos = Array.isArray(criterio.valorMin)
          ? criterio.valorMin.map(String)
          : [String(criterio.valorMin)]
        matchScore = aceitos.includes(String(valor)) ? 1 : 0
      } else {
        const num = Number(valor)
        const min = Number(criterio.valorMin)
        const max = Number(criterio.valorMax)
        if (!Number.isNaN(num) && !Number.isNaN(min) && !Number.isNaN(max)) {
          if (num >= min && num <= max) {
            matchScore = 1
          } else {
            const range = max - min || 1
            const distancia = num < min ? min - num : num - max
            matchScore = Math.max(0, 1 - distancia / range)
          }
        }
      }

      somaScore += matchScore * criterio.peso
      somaPeso += criterio.peso
    }

    return somaPeso > 0 ? somaScore / somaPeso : 0
  }
}
