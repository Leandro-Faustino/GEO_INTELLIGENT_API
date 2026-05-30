import type { Pool } from 'pg'
import type {
  FeedbackEntregaDTO,
  FeedbackResultadoDTO,
  IFeedbackRepository,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'

export class FeedbackPgRepository implements IFeedbackRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(feedback: FeedbackEntregaDTO): Promise<FeedbackEntregaDTO> {
    const entregaResult = await this.pool.query<{ cliente_id: string }>(
      `select cliente_id from entregas where id = $1`,
      [feedback.entregaId],
    )
    const clienteId = entregaResult.rows[0]?.cliente_id
    if (!clienteId) {
      throw new Error(`Entrega '${feedback.entregaId}' não encontrada para salvar feedback.`)
    }

    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `insert into feedbacks
          (id, entrega_id, exclusoes, ajustes, resultados, observacoes, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, entrega_id, exclusoes, ajustes, resultados, observacoes, created_at`,
        [
          feedback.id,
          feedback.entregaId,
          JSON.stringify(feedback.exclusoes),
          JSON.stringify(feedback.ajustes),
          JSON.stringify(feedback.resultados),
          feedback.observacoes,
          feedback.createdAt,
        ],
      )

      return mapFeedback(result.rows[0])
    })
  }

  async buscarPorEntregaId(entregaId: string): Promise<FeedbackEntregaDTO[]> {
    const result = await this.pool.query(
      `select id, entrega_id, exclusoes, ajustes, resultados, observacoes, created_at
       from feedbacks
       where entrega_id = $1
       order by created_at desc`,
      [entregaId],
    )

    return result.rows.map(mapFeedback)
  }
}

export class PgFeedbackRepository extends FeedbackPgRepository {}

function mapFeedback(row: Record<string, unknown>): FeedbackEntregaDTO {
  return {
    id: String(row['id']),
    entregaId: String(row['entrega_id']),
    exclusoes: arrayStrings(row['exclusoes']),
    ajustes: arrayObjetos(row['ajustes']) as FeedbackEntregaDTO['ajustes'],
    resultados: arrayObjetos(row['resultados']).map(mapResultado),
    observacoes: String(row['observacoes'] ?? ''),
    createdAt: toIso(row['created_at']),
  }
}

function mapResultado(item: Record<string, unknown>): FeedbackResultadoDTO {
  const ticketReal = item['ticketReal'] ?? item['ticket_real']
  return {
    entidadeAlvoId: String(item['entidadeAlvoId'] ?? item['entidade_alvo_id'] ?? ''),
    converteu: Boolean(item['converteu']),
    atributos:
      item['atributos'] && typeof item['atributos'] === 'object' && !Array.isArray(item['atributos'])
        ? (item['atributos'] as Record<string, unknown>)
        : {},
    ...(ticketReal !== undefined ? { ticketReal: Number(ticketReal) } : {}),
  }
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function arrayObjetos(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : []
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
