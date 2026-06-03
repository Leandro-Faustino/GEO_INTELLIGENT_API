import type { Pool } from 'pg'
import type {
  BaseInternaDTO,
  CompradorConhecidoDTO,
  IBaseInternaRepository,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'

export class BaseInternaPgRepository implements IBaseInternaRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(base: BaseInternaDTO): Promise<BaseInternaDTO> {
    return runInClienteContext(this.pool, base.clienteId, async (client) => {
      const baseResult = await client.query<{ id: string }>(
        `insert into bases_internas (cliente_id, periodo, total_registros)
         values ($1, $2, $3)
         on conflict (cliente_id, periodo) do update set total_registros = excluded.total_registros
         returning id`,
        [base.clienteId, base.periodo, base.totalRegistros],
      )
      const baseId = baseResult.rows[0]!.id

      await client.query('delete from compradores_conhecidos where base_interna_id = $1', [
        baseId,
      ])

      for (const comprador of base.compradores) {
        await client.query(
          `insert into compradores_conhecidos
            (base_interna_id, identificador, nome, tipo, atributos_originais, ticket_medio, frequencia, ativo)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            baseId,
            comprador.identificador,
            comprador.nome,
            comprador.tipo,
            JSON.stringify(comprador.atributosOriginais),
            comprador.ticketMedio,
            comprador.frequencia,
            comprador.ativo,
          ],
        )
      }
      return base
    })
  }

  async buscarPorCliente(clienteId: string): Promise<BaseInternaDTO | null> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const baseResult = await client.query(
        `select id, cliente_id, periodo, total_registros
         from bases_internas
         where cliente_id = $1
         order by created_at desc
         limit 1`,
        [clienteId],
      )
      const base = baseResult.rows[0]
      if (!base) return null

      const compradoresResult = await client.query(
        `select identificador, nome, tipo, atributos_originais, ticket_medio, frequencia, ativo
         from compradores_conhecidos
         where base_interna_id = $1
         order by created_at asc`,
        [base.id],
      )

      return {
        clienteId: String(base.cliente_id),
        periodo: String(base.periodo),
        totalRegistros: Number(base.total_registros),
        compradores: compradoresResult.rows.map(mapComprador),
      }
    })
  }
}

export class PgBaseInternaRepository extends BaseInternaPgRepository {}

function mapComprador(row: Record<string, unknown>): CompradorConhecidoDTO {
  return {
    identificador: String(row['identificador']),
    nome: String(row['nome']),
    tipo: String(row['tipo']),
    atributosOriginais: (row['atributos_originais'] as Record<string, unknown>) ?? {},
    ticketMedio: Number(row['ticket_medio']),
    frequencia: Number(row['frequencia']),
    ativo: Boolean(row['ativo']),
  }
}
