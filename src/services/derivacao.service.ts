import { randomUUID } from 'node:crypto'
import type {
  CompradorConhecidoDTO,
  CriterioDerivadoDTO,
  IBaseInternaRepository,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../repositories/interfaces/index.js'

export class DerivacaoService {
  constructor(
    private readonly baseInternaRepo: IBaseInternaRepository,
    private readonly perfilRepo: IPerfilRepository,
  ) {}

  async derivarPerfil(
    clienteId: string,
    tipoAlvo: string,
    nome?: string,
  ): Promise<PerfilIdealDTO> {
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    if (!base) {
      throw Object.assign(new Error('Base interna não encontrada.'), {
        statusCode: 404,
      })
    }

    const bonsCompradores = base.compradores.filter(
      (comprador) => comprador.ativo && comprador.frequencia >= 2,
    )
    if (bonsCompradores.length < 3) {
      throw Object.assign(
        new Error(
          `Mínimo de 3 compradores com recompra. Encontrados: ${bonsCompradores.length}.`,
        ),
        { statusCode: 422 },
      )
    }

    const criterios = this.extrairCriterios(bonsCompradores)
    const tickets = bonsCompradores
      .map((comprador) => comprador.ticketMedio)
      .filter((ticket) => ticket > 0)

    if (tickets.length > 0) {
      criterios.push({
        nome: 'ticketMedio',
        valorMin: Math.min(...tickets) * 0.7,
        valorMax: Math.max(...tickets) * 1.3,
        peso: 0.2,
        tipoComparacao: 'range',
      })
    }

    const now = new Date().toISOString()
    return this.perfilRepo.salvar({
      id: randomUUID(),
      clienteId,
      nome: nome ?? `Perfil ${tipoAlvo} derivado`,
      tipo: tipoAlvo,
      hipotetico: false,
      criterios,
      exclusoes: [],
      createdAt: now,
      updatedAt: now,
    })
  }

  private extrairCriterios(
    compradores: CompradorConhecidoDTO[],
  ): CriterioDerivadoDTO[] {
    const atributos = new Map<string, unknown[]>()

    for (const comprador of compradores) {
      for (const [nome, valor] of Object.entries(comprador.atributosOriginais)) {
        const valores = atributos.get(nome) ?? []
        valores.push(valor)
        atributos.set(nome, valores)
      }
    }

    const pesoBase = Math.max(0.1, 0.8 / Math.max(atributos.size, 1))
    const criterios: CriterioDerivadoDTO[] = []

    for (const [nome, valores] of atributos) {
      const numericos = valores.map((valor) => Number(valor)).filter(Number.isFinite)

      if (
        numericos.length >= valores.length * 0.8 &&
        !isCodigoCategorico(nome, valores)
      ) {
        criterios.push({
          nome,
          valorMin: Math.min(...numericos),
          valorMax: Math.max(...numericos),
          peso: arredondar(pesoBase),
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
        peso: arredondar(pesoBase),
        tipoComparacao: 'enum',
      })
    }

    return criterios
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000
}

function isCodigoCategorico(nome: string, valores: unknown[]): boolean {
  const nomeNormalizado = nome.toLocaleLowerCase('pt-BR')
  if (
    nomeNormalizado.includes('cnae') ||
    nomeNormalizado.includes('codigo') ||
    nomeNormalizado.includes('código')
  ) {
    return true
  }

  return valores.some((valor) => {
    const texto = String(valor).replace(/\D/g, '')
    return texto.length >= 6
  })
}
