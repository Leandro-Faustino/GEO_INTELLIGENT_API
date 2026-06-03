import { randomUUID } from 'node:crypto'
import type {
  FeedbackEntregaDTO,
  IAnaliseRepository,
  IEntregaRepository,
  IFeedbackRepository,
  EntregaDTO,
  FeedbackResultadoDTO,
} from '../repositories/interfaces/index.js'

export interface RegistrarFeedbackInput {
  exclusoes?: string[] | undefined
  ajustes?: FeedbackEntregaDTO['ajustes'] | undefined
  resultados?:
    | Array<{
    entidadeAlvoId: string
    converteu: boolean
    ticketReal?: number
  }>
    | undefined
  observacoes?: string | undefined
}

export class EntregaService {
  constructor(
    private readonly entregas: IEntregaRepository,
    private readonly feedbacks: IFeedbackRepository,
    private readonly analises: IAnaliseRepository,
  ) {}

  async montarEntrega(
    clienteId: string,
    analiseId: string,
    periodo: string,
    formato: string,
  ): Promise<EntregaDTO> {
    const analise = await this.analises.buscarPorId(analiseId)
    if (!analise || analise.clienteId !== clienteId) {
      throw Object.assign(
        new Error('Análise não encontrada para este cliente.'),
        { statusCode: 404 },
      )
    }

    const now = new Date().toISOString()
    return this.entregas.salvar({
      id: randomUUID(),
      clienteId,
      analiseId,
      tipo: analise.tipo,
      periodo,
      formato,
      totalOportunidades: analise.oportunidades.length,
      createdAt: now,
      updatedAt: now,
    })
  }

  async buscarEntregaPorId(id: string): Promise<EntregaDTO | null> {
    return this.entregas.buscarPorId(id)
  }

  async registrarFeedback(
    entregaId: string,
    input: RegistrarFeedbackInput,
  ): Promise<FeedbackEntregaDTO> {
    const entrega = await this.entregas.buscarPorId(entregaId)
    if (!entrega) {
      throw Object.assign(new Error('Entrega não encontrada.'), {
        statusCode: 404,
      })
    }

    const analise = await this.analises.buscarPorId(entrega.analiseId)
    const oportunidadesPorEntidade = new Map(
      (analise?.oportunidades ?? []).map((oportunidade) => [
        oportunidade.entidadeAlvoId,
        oportunidade,
      ]),
    )

    const resultados: FeedbackResultadoDTO[] = (input.resultados ?? []).map((resultado) => {
      const oportunidade = oportunidadesPorEntidade.get(resultado.entidadeAlvoId)

      return {
        entidadeAlvoId: resultado.entidadeAlvoId,
        converteu: resultado.converteu,
        ...(resultado.ticketReal !== undefined
          ? { ticketReal: resultado.ticketReal }
          : {}),
        atributos: oportunidade?.score
          ? {
              prioridade: oportunidade.prioridade,
              score: oportunidade.score.valor,
            }
          : {},
      }
    })

    const feedback: FeedbackEntregaDTO = {
      id: randomUUID(),
      entregaId,
      exclusoes: input.exclusoes ?? [],
      ajustes: input.ajustes ?? [],
      resultados,
      observacoes: input.observacoes ?? '',
      createdAt: new Date().toISOString(),
    }

    return this.feedbacks.salvar(feedback)
  }
}
