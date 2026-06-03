/**
 * Serviço de Inteligência Competitiva (C2.3).
 *
 * Identifica quem mais FORNECE para o mesmo perfil de cliente.
 * No v1, usa inferência por CNAE: empresas com CNAE de fornecimento
 * no mesmo segmento, presentes na região, são concorrentes potenciais.
 *
 * Node.js Design Patterns — Adapter: cada fonte de dados de
 * concorrência é encapsulada via adapter, traduzindo formatos
 * distintos para o contrato interno.
 *
 * NOTA DE VIABILIDADE: dados de "quem fornece para quem" não existem
 * em fontes públicas brasileiras. O v1 usa proxy por CNAE (quem tem
 * atividade compatível na região). Fontes setoriais ou dados de NF
 * podem entrar como adapters futuros.
 */
import type {
  IBaseInternaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
} from '../repositories/interfaces/index.js'

export interface ConcorrenteDTO {
  nome: string
  identificador: string
  cnae: string
  cidade: string
  distanciaEstimada: number
  presenca: string[]
}

export interface ResultadoCompetitiva {
  clienteId: string
  regiao: string
  concorrentes: ConcorrenteDTO[]
  totalFornecedoresRegiao: number
  concentracao: 'baixa' | 'moderada' | 'alta'
  insight: string
}

/** CNAEs de fornecimento de colchão / hotelaria (extensível) */
const CNAES_FORNECEDORES: Record<string, string[]> = {
  '5510801': ['3104700', '4649401', '4759801'], // hotel ← colchão, têxtil, enxoval
  '5590699': ['3104700', '4649401'],             // pousada ← colchão, têxtil
  '8711501': ['3104700', '4771702', '4773300'],  // ILPI ← colchão, farmácia, ortopedia
}

export class CompetitivaService {
  constructor(
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
    private readonly baseInternaRepo: IBaseInternaRepository,
  ) {}

  /**
   * Analisa o cenário competitivo de uma região.
   *
   * 1. Busca perfil para identificar o CNAE-alvo
   * 2. Mapeia CNAEs de fornecimento para o segmento
   * 3. Busca entidades com esses CNAEs na região (via repo)
   * 4. Remove a própria empresa do cliente
   * 5. Estima concentração do mercado
   */
  async analisar(
    clienteId: string,
    regiao: string,
  ): Promise<ResultadoCompetitiva> {
    const perfis = await this.perfilRepo.buscarPorCliente(clienteId)
    const perfil = perfis[0]
    if (!perfil) {
      throw Object.assign(
        new Error('Nenhum perfil encontrado. Derive o perfil antes de analisar concorrência.'),
        { statusCode: 404 },
      )
    }

    // Identifica os CNAEs-alvo do perfil
    const criterioCnae = perfil.criterios.find((c) => c.nome === 'cnae')
    const cnaesAlvo = criterioCnae && Array.isArray(criterioCnae.valorMin)
      ? criterioCnae.valorMin.map(String)
      : []

    // Mapeia CNAEs de fornecedores para esses alvos
    const cnaesFornecedores = new Set<string>()
    for (const cnae of cnaesAlvo) {
      const forn = CNAES_FORNECEDORES[cnae]
      if (forn) forn.forEach((f) => cnaesFornecedores.add(f))
    }

    // Busca entidades na região que tenham CNAE de fornecedor
    const todasEntidades = await this.entidadeRepo.buscarPorEscopo(regiao)
    const fornecedores = todasEntidades.filter((e) => {
      const cnae = String(e.atributos['cnae'] ?? '')
      return cnaesFornecedores.has(cnae)
    })

    // Remove a própria empresa (base interna)
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    const proprios = new Set(
      base?.compradores.map((c) => c.identificador) ?? [],
    )

    const concorrentes: ConcorrenteDTO[] = fornecedores
      .filter((e) => !proprios.has(e.identificador))
      .map((e) => ({
        nome: e.nome,
        identificador: e.identificador,
        cnae: String(e.atributos['cnae'] ?? ''),
        cidade: typeof e.endereco === 'string' ? e.endereco : '',
        distanciaEstimada: 0, // requer geocoding para cálculo real
        presenca: [regiao],
      }))

    const concentracao = this.classificarConcentracao(concorrentes.length)

    return {
      clienteId,
      regiao,
      concorrentes,
      totalFornecedoresRegiao: concorrentes.length,
      concentracao,
      insight: this.gerarInsight(concorrentes.length, concentracao, regiao),
    }
  }

  private classificarConcentracao(total: number): 'baixa' | 'moderada' | 'alta' {
    if (total <= 2) return 'baixa'
    if (total <= 6) return 'moderada'
    return 'alta'
  }

  private gerarInsight(total: number, concentracao: string, regiao: string): string {
    if (total === 0) {
      return `Nenhum concorrente direto identificado em ${regiao}. Oportunidade de ser o primeiro.`
    }
    return `${total} potenciais concorrentes em ${regiao} (concentração ${concentracao}). ` +
      (concentracao === 'alta'
        ? 'Mercado competitivo — diferenciação será importante.'
        : 'Espaço para crescer com posicionamento adequado.')
  }
}
