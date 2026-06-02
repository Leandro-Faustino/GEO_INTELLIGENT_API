import type { Pool } from 'pg'
import type {
  EnriquecimentoCompradorDTO,
  IEnriquecimentoCompradorRepository,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'
import { toIso } from './utils.js'

export class EnriquecimentoCompradorPgRepository
  implements IEnriquecimentoCompradorRepository
{
  constructor(private readonly pool: Pool) {}

  async salvar(
    enriquecimento: EnriquecimentoCompradorDTO,
  ): Promise<EnriquecimentoCompradorDTO> {
    return runInClienteContext(this.pool, enriquecimento.clienteId, async (client) => {
      const result = await client.query(
        `insert into enriquecimentos_compradores
          (id, cliente_id, comprador_identificador, comprador_nome, fonte, status, payload, erro, created_at, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id, cliente_id, comprador_identificador, comprador_nome, fonte, status, payload, erro, created_at, expires_at`,
        [
          enriquecimento.id,
          enriquecimento.clienteId,
          enriquecimento.compradorIdentificador,
          enriquecimento.compradorNome,
          enriquecimento.fonte,
          enriquecimento.status,
          JSON.stringify(enriquecimento.payload),
          enriquecimento.erro,
          enriquecimento.createdAt,
          enriquecimento.expiresAt,
        ],
      )

      return mapEnriquecimento(result.rows[0])
    })
  }

  async buscarPorCliente(
    clienteId: string,
    filtros: { compradorIdentificador?: string; fonte?: string } = {},
  ): Promise<EnriquecimentoCompradorDTO[]> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const params: unknown[] = [clienteId]
      const where = ['cliente_id = $1']

      if (filtros.compradorIdentificador) {
        params.push(filtros.compradorIdentificador)
        where.push(`comprador_identificador = $${params.length}`)
      }

      if (filtros.fonte) {
        params.push(filtros.fonte)
        where.push(`fonte = $${params.length}`)
      }

      const result = await client.query(
        `select id, cliente_id, comprador_identificador, comprador_nome, fonte, status, payload, erro, created_at, expires_at
         from enriquecimentos_compradores
         where ${where.join(' and ')}
         order by created_at desc`,
        params,
      )

      return result.rows.map(mapEnriquecimento)
    })
  }

  async buscarUltimosPorCliente(clienteId: string): Promise<EnriquecimentoCompradorDTO[]> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `select distinct on (comprador_identificador, fonte)
           id, cliente_id, comprador_identificador, comprador_nome, fonte, status, payload, erro, created_at, expires_at
         from enriquecimentos_compradores
         where cliente_id = $1 and status = 'sucesso'
         order by comprador_identificador, fonte, created_at desc`,
        [clienteId],
      )
      return result.rows.map(mapEnriquecimento)
    })
  }
}

export class PgEnriquecimentoCompradorRepository extends EnriquecimentoCompradorPgRepository {}

function mapEnriquecimento(row: Record<string, unknown>): EnriquecimentoCompradorDTO {
  return {
    id: String(row['id']),
    clienteId: String(row['cliente_id']),
    compradorIdentificador: String(row['comprador_identificador']),
    compradorNome: String(row['comprador_nome']),
    fonte: String(row['fonte']),
    status: String(row['status']) as EnriquecimentoCompradorDTO['status'],
    payload: (row['payload'] as Record<string, unknown>) ?? {},
    erro: String(row['erro'] ?? ''),
    createdAt: toIso(row['created_at']),
    expiresAt: row['expires_at'] ? toIso(row['expires_at']) : null,
  }
}

