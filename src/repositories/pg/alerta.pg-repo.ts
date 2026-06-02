import type { Pool } from 'pg'
import type { AlertaDTO, IAlertaRepository } from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'
import { toIso } from './utils.js'

export class AlertaPgRepository implements IAlertaRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(alerta: AlertaDTO): Promise<AlertaDTO> {
    return runInClienteContext(this.pool, alerta.clienteId, async (client) => {
      const result = await client.query(
        `insert into alertas
          (id, cliente_id, tipo, entidade_alvo_id, entidade_nome, entidade_cidade, score, mensagem, status, criado_em)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do update set
          tipo = excluded.tipo,
          entidade_nome = excluded.entidade_nome,
          entidade_cidade = excluded.entidade_cidade,
          score = excluded.score,
          mensagem = excluded.mensagem,
          status = excluded.status
         returning id, cliente_id, tipo, entidade_alvo_id, entidade_nome, entidade_cidade, score, mensagem, status, criado_em`,
        [
          alerta.id,
          alerta.clienteId,
          alerta.tipo,
          alerta.entidadeAlvoId,
          alerta.entidadeNome,
          alerta.entidadeCidade,
          alerta.score,
          alerta.mensagem,
          alerta.status,
          alerta.criadoEm,
        ],
      )

      return mapAlerta(result.rows[0])
    })
  }

  async buscarPorId(id: string): Promise<AlertaDTO | null> {
    const result = await this.pool.query(
      `select id, cliente_id, tipo, entidade_alvo_id, entidade_nome, entidade_cidade,
        score, mensagem, status, criado_em
       from alertas
       where id = $1`,
      [id],
    )
    return result.rows[0] ? mapAlerta(result.rows[0]) : null
  }

  async buscarPorCliente(
    clienteId: string,
    status?: AlertaDTO['status'],
  ): Promise<AlertaDTO[]> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = status
        ? await client.query(
            `select id, cliente_id, tipo, entidade_alvo_id, entidade_nome, entidade_cidade,
              score, mensagem, status, criado_em
             from alertas
             where cliente_id = $1 and status = $2
             order by criado_em desc`,
            [clienteId, status],
          )
        : await client.query(
            `select id, cliente_id, tipo, entidade_alvo_id, entidade_nome, entidade_cidade,
              score, mensagem, status, criado_em
             from alertas
             where cliente_id = $1
             order by criado_em desc`,
            [clienteId],
          )

      return result.rows.map(mapAlerta)
    })
  }

  async atualizarStatus(
    id: string,
    status: AlertaDTO['status'],
  ): Promise<AlertaDTO | null> {
    const result = await this.pool.query(
      `update alertas
       set status = $2
       where id = $1
       returning id, cliente_id, tipo, entidade_alvo_id, entidade_nome, entidade_cidade,
        score, mensagem, status, criado_em`,
      [id, status],
    )
    return result.rows[0] ? mapAlerta(result.rows[0]) : null
  }

  async existeParaEntidade(
    clienteId: string,
    entidadeAlvoId: string,
  ): Promise<boolean> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `select 1
         from alertas
         where cliente_id = $1 and entidade_alvo_id = $2
         limit 1`,
        [clienteId, entidadeAlvoId],
      )
      return (result.rowCount ?? 0) > 0
    })
  }
}

export class PgAlertaRepository extends AlertaPgRepository {}

function mapAlerta(row: Record<string, unknown>): AlertaDTO {
  return {
    id: String(row['id']),
    clienteId: String(row['cliente_id']),
    tipo: String(row['tipo']),
    entidadeAlvoId: String(row['entidade_alvo_id']),
    entidadeNome: String(row['entidade_nome']),
    entidadeCidade: String(row['entidade_cidade']),
    score: Number(row['score']),
    mensagem: String(row['mensagem']),
    status: String(row['status']) as AlertaDTO['status'],
    criadoEm: toIso(row['criado_em']),
  }
}

