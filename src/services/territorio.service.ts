import type {
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
  IBaseInternaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
} from '../repositories/interfaces/index.js'

export interface OportunidadeTerritorio {
  nome: string
  identificador: string
  score: number
}

export interface RegiaoAnalise {
  nome: string
  totalEntidades: number
  naoAtendidos: number
  potencialMedio: number
  scoreMaisAlto: number
  cobertura: number
  oportunidadesTop3: OportunidadeTerritorio[]
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
      base?.compradores.map((comprador) => comprador.identificador) ?? [],
    )

    const regioesAnalisadas: RegiaoAnalise[] = []

    for (const regiao of regioes) {
      const entidades = await this.entidadeRepo.buscarPorEscopo(regiao)
      const clientesNaRegiao = entidades.filter((entidade) =>
        jaClientes.has(entidade.identificador),
      ).length
      const candidatos = entidades.filter(
        (entidade) =>
          !jaClientes.has(entidade.identificador) &&
          !perfil.exclusoes.includes(entidade.identificador),
      )

      const oportunidades = candidatos
        .map((entidade) => ({
          nome: entidade.nome,
          identificador: entidade.identificador,
          score: this.calcularSimilaridade(perfil.criterios, entidade),
        }))
        .filter((item) => item.score >= limiar)
        .sort((a, b) => b.score - a.score)

      const totalEntidades = entidades.length
      const naoAtendidos = oportunidades.length
      const potencialMedio =
        naoAtendidos === 0
          ? 0
          : arredondar(
              oportunidades.reduce((acc, item) => acc + item.score, 0) / naoAtendidos,
            )
      const cobertura =
        totalEntidades === 0
          ? 0
          : arredondar(clientesNaRegiao / totalEntidades)

      regioesAnalisadas.push({
        nome: regiao,
        totalEntidades,
        naoAtendidos,
        potencialMedio,
        scoreMaisAlto: arredondar(oportunidades[0]?.score ?? 0),
        cobertura,
        oportunidadesTop3: oportunidades.slice(0, 3).map((item) => ({
          ...item,
          score: arredondar(item.score),
        })),
      })
    }

    regioesAnalisadas.sort((a, b) => {
      const potencialB = b.naoAtendidos * b.potencialMedio
      const potencialA = a.naoAtendidos * a.potencialMedio
      return potencialB - potencialA
    })

    return {
      clienteId,
      regioesAnalisadas: regioes.length,
      regioes: regioesAnalisadas,
      regiaoRecomendada: regioesAnalisadas[0]?.nome ?? null,
    }
  }

  private calcularSimilaridade(
    criterios: CriterioDerivadoDTO[],
    entidade: EntidadeAlvoDTO,
  ): number {
    if (criterios.length === 0) return 0

    let somaPonderada = 0
    let somaPesos = 0

    for (const criterio of criterios) {
      somaPesos += criterio.peso
      const valor = entidade.atributos[criterio.nome]
      if (valor === undefined) continue

      somaPonderada += this.avaliarCriterio(criterio, valor) * criterio.peso
    }

    return somaPesos > 0 ? somaPonderada / somaPesos : 0
  }

  private avaliarCriterio(criterio: CriterioDerivadoDTO, valor: unknown): number {
    switch (criterio.tipoComparacao) {
      case 'range': {
        const numero = Number(valor)
        const min = Number(criterio.valorMin)
        const max = Number(criterio.valorMax)
        if (!Number.isFinite(numero) || !Number.isFinite(min) || !Number.isFinite(max)) {
          return 0
        }
        if (numero >= min && numero <= max) return 1

        const distancia = Math.min(Math.abs(numero - min), Math.abs(numero - max))
        const amplitude = Math.max(max - min, 1)
        return Math.max(0, 1 - distancia / amplitude)
      }
      case 'enum': {
        const aceitos = Array.isArray(criterio.valorMin)
          ? criterio.valorMin
          : [criterio.valorMin]
        return aceitos.map(String).includes(String(valor)) ? 1 : 0
      }
      case 'booleano':
        return valor === criterio.valorMin ? 1 : 0
      case 'distancia':
      default:
        return 0
    }
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}
