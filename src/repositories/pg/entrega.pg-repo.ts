import type { Pool } from 'pg'
import type { EntregaDTO, IEntregaRepository } from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'

export class EntregaPgRepository implements IEntregaRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(entrega: EntregaDTO): Promise<EntregaDTO> {
    return runInClienteContext(this.pool, entrega.clienteId, async (client) => {
      const result = await client.query(
        `insert into entregas
          (id, cliente_id, analise_id, tipo, periodo, formato, total_oportunidades, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set
          analise_id = excluded.analise_id,
          formato = excluded.formato,
          total_oportunidades = excluded.total_oportunidades,
          updated_at = excluded.updated_at
         returning id, cliente_id, analise_id, tipo, periodo, formato, total_oportunidades, created_at, updated_at`,
        [
          entrega.id,
          entrega.clienteId,
          entrega.analiseId,
          entrega.tipo,
          entrega.periodo,
          entrega.formato,
          entrega.totalOportunidades,
          entrega.createdAt,
          entrega.updatedAt,
        ],
      )
      return mapEntrega(result.rows[0])
    })
  }

  async buscarPorId(id: string): Promise<EntregaDTO | null> {
    const result = await this.pool.query(
      `select id, cliente_id, analise_id, tipo, periodo, formato, total_oportunidades, created_at, updated_at
       from entregas where id = $1`,
      [id],
    )
    return result.rows[0] ? mapEntrega(result.rows[0]) : null
  }
}

export class PgEntregaRepository extends EntregaPgRepository {}

function mapEntrega(row: Record<string, unknown>): EntregaDTO {
  return {
    id: String(row['id']),
    clienteId: String(row['cliente_id']),
    analiseId: String(row['analise_id']),
    tipo: String(row['tipo']),
    periodo: String(row['periodo']),
    formato: String(row['formato']),
    totalOportunidades: Number(row['total_oportunidades']),
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
