import type { Pool } from 'pg'
import type { ClienteDTO, IClienteRepository } from '../interfaces/index.js'

export class ClientePgRepository implements IClienteRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(cliente: ClienteDTO): Promise<ClienteDTO> {
    const result = await this.pool.query(
      `insert into clientes
        (id, razao_social, segmento, cidade, endereco, vertical, parametros_negocio, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do update set
        razao_social = excluded.razao_social,
        segmento = excluded.segmento,
        cidade = excluded.cidade,
        endereco = excluded.endereco,
        vertical = excluded.vertical,
        parametros_negocio = excluded.parametros_negocio,
        updated_at = excluded.updated_at
       returning id, razao_social, segmento, cidade, endereco, vertical,
        parametros_negocio, created_at, updated_at`,
      [
        cliente.id,
        cliente.razaoSocial,
        cliente.segmento,
        cliente.cidade,
        cliente.endereco,
        cliente.vertical,
        JSON.stringify(cliente.parametrosNegocio),
        cliente.createdAt,
        cliente.updatedAt,
      ],
    )
    return mapCliente(result.rows[0])
  }

  async buscarPorId(id: string): Promise<ClienteDTO | null> {
    const result = await this.pool.query(
      `select id, razao_social, segmento, cidade, endereco, vertical,
        parametros_negocio, created_at, updated_at
       from clientes where id = $1`,
      [id],
    )
    return result.rows[0] ? mapCliente(result.rows[0]) : null
  }

  async listar(limit: number, offset: number): Promise<{ items: ClienteDTO[]; total: number }> {
    const result = await this.pool.query(
      `select id, razao_social, segmento, cidade, endereco, vertical,
        parametros_negocio, created_at, updated_at, count(*) over() as total_count
       from clientes
       order by created_at desc
       limit $1 offset $2`,
      [limit, offset],
    )

    return {
      items: result.rows.map(mapCliente),
      total: Number(result.rows[0]?.total_count ?? 0),
    }
  }
}

export class PgClienteRepository extends ClientePgRepository {}

function mapCliente(row: Record<string, unknown>): ClienteDTO {
  return {
    id: String(row['id']),
    razaoSocial: String(row['razao_social']),
    segmento: String(row['segmento']),
    cidade: String(row['cidade']),
    endereco: String(row['endereco']),
    vertical: String(row['vertical']),
    parametrosNegocio: (row['parametros_negocio'] as Record<string, unknown>) ?? {},
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
