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

const CNAES_FORNECEDORES: Record<string, string[]> = {
  '5510801': ['3104700', '4649401', '4759801'],
  '5590699': ['3104700', '4649401'],
  '8711501': ['3104700', '4771702', '4773300'],
}

export class CompetitivaService {
  constructor(
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
    private readonly baseInternaRepo: IBaseInternaRepository,
  ) {}

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

    const criterioCnae = perfil.criterios.find(
      (criterio) => criterio.nome.toLocaleLowerCase('pt-BR') === 'cnae',
    )
    const cnaesAlvo = Array.isArray(criterioCnae?.valorMin)
      ? criterioCnae!.valorMin.map(normalizarCnae)
      : criterioCnae?.valorMin
        ? [normalizarCnae(criterioCnae.valorMin)]
        : []

    const cnaesFornecedores = new Set<string>()
    for (const cnae of cnaesAlvo) {
      for (const fornecedor of CNAES_FORNECEDORES[cnae] ?? []) {
        cnaesFornecedores.add(fornecedor)
      }
    }

    if (cnaesAlvo.length === 0 || cnaesFornecedores.size === 0) {
      throw Object.assign(
        new Error(
          'Não há mapeamento competitivo disponível para o CNAE principal deste perfil.',
        ),
        { statusCode: 422 },
      )
    }

    const entidades = await this.entidadeRepo.buscarPorEscopo(regiao)
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    const proprios = new Set(
      base?.compradores.map((comprador) => comprador.identificador) ?? [],
    )

    const concorrentes = entidades
      .filter((entidade) => {
        const cnae = normalizarCnae(entidade.atributos['cnae'])
        return cnaesFornecedores.has(cnae) && !proprios.has(entidade.identificador)
      })
      .map((entidade) => ({
        nome: entidade.nome,
        identificador: entidade.identificador,
        cnae: normalizarCnae(entidade.atributos['cnae']),
        cidade: String(
          entidade.atributos['cidade'] ?? entidade.atributos['municipio'] ?? '',
        ),
        distanciaEstimada: 0,
        presenca: [regiao],
      }))

    const concentracao = classificarConcentracao(concorrentes.length)

    return {
      clienteId,
      regiao,
      concorrentes,
      totalFornecedoresRegiao: concorrentes.length,
      concentracao,
      insight: gerarInsight(concorrentes.length, concentracao, regiao),
    }
  }
}

function classificarConcentracao(
  total: number,
): 'baixa' | 'moderada' | 'alta' {
  if (total <= 2) return 'baixa'
  if (total <= 6) return 'moderada'
  return 'alta'
}

function gerarInsight(
  total: number,
  concentracao: 'baixa' | 'moderada' | 'alta',
  regiao: string,
): string {
  if (total === 0) {
    return `Nenhum concorrente potencial identificado em ${regiao}. Oportunidade de pioneirismo.`
  }

  return `${total} potenciais concorrentes em ${regiao} (concentração ${concentracao}). ${
    concentracao === 'alta'
      ? 'Mercado competitivo: diferenciação e execução local serão decisivas.'
      : 'Há espaço para crescer com posicionamento adequado.'
  }`
}

function normalizarCnae(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '')
}
