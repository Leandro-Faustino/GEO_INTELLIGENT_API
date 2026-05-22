import { randomUUID } from 'node:crypto'
import type {
  AnaliseDTO,
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
  IAnaliseRepository,
  IBaseInternaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
  OportunidadeDTO,
} from '../repositories/interfaces/index.js'

export class AnaliseService {
  constructor(
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
    private readonly baseInternaRepo: IBaseInternaRepository,
    private readonly analiseRepo: IAnaliseRepository,
  ) {}

  async executarLookalike(
    clienteId: string,
    escopo: string,
    limiar = 0.3,
  ): Promise<AnaliseDTO> {
    const perfis = await this.perfilRepo.buscarPorCliente(clienteId)
    const perfil = perfis[0]

    if (!perfil) {
      throw Object.assign(new Error('Nenhum perfil encontrado para este cliente.'), {
        statusCode: 404,
      })
    }

    const entidades = await this.entidadeRepo.buscarPorEscopo(escopo)
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    const jaClientes = new Set(
      base?.compradores.map((comprador) => comprador.identificador) ?? [],
    )
    const oportunidades: OportunidadeDTO[] = []

    for (const entidade of entidades) {
      if (jaClientes.has(entidade.identificador)) continue
      if (perfil.exclusoes.includes(entidade.identificador)) continue

      const similaridade = this.calcularSimilaridade(perfil.criterios, entidade)
      if (similaridade < limiar) continue

      oportunidades.push({
        id: randomUUID(),
        entidadeAlvoId: entidade.identificador,
        tipo: entidade.tipo,
        justificativa: `${Math.round(similaridade * 100)}% de similaridade com o perfil ideal.`,
        ganchoAbordagem: `${entidade.nome} possui perfil compatível com seus melhores clientes.`,
        prioridade:
          similaridade >= 0.8 ? 'alta' : similaridade >= 0.5 ? 'media' : 'baixa',
        score: {
          valor: arredondar(similaridade),
          similaridade: arredondar(similaridade),
          probConversao: arredondar(similaridade * 0.8),
        },
      })
    }

    oportunidades.sort((a, b) => b.score.valor - a.score.valor)

    const now = new Date().toISOString()
    return this.analiseRepo.salvar({
      id: randomUUID(),
      clienteId,
      tipo: perfil.tipo,
      escopo,
      versaoModelo: '0.1.0',
      oportunidades,
      createdAt: now,
      updatedAt: now,
    })
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
  return Math.round(valor * 1000) / 1000
}
