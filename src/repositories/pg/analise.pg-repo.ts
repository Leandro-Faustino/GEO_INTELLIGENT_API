import type { Pool } from 'pg'
import type {
  AnaliseDTO,
  AnaliseResumoDTO,
  IAnaliseRepository,
  OportunidadeDTO,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'

export class AnalisePgRepository implements IAnaliseRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(analise: AnaliseDTO): Promise<AnaliseDTO> {
    return runInClienteContext(this.pool, analise.clienteId, async (client) => {
      const analiseResult = await client.query(
        `insert into analises
          (id, cliente_id, tipo, escopo, versao_modelo, origem, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set
          tipo = excluded.tipo,
          escopo = excluded.escopo,
          versao_modelo = excluded.versao_modelo,
          origem = excluded.origem,
          updated_at = excluded.updated_at
         returning id, cliente_id, tipo, escopo, versao_modelo, origem, created_at, updated_at`,
        [
          analise.id,
          analise.clienteId,
          analise.tipo,
          analise.escopo,
          analise.versaoModelo,
          analise.origem ?? 'local',
          analise.createdAt,
          analise.updatedAt,
        ],
      )

      await client.query('delete from oportunidades where analise_id = $1', [
        analise.id,
      ])

      for (const oportunidade of analise.oportunidades) {
        await client.query(
          `insert into oportunidades
            (id, analise_id, entidade_alvo_id, tipo, justificativa, gancho_abordagem,
             prioridade, score_valor, score_similaridade, score_prob_conversao)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            oportunidade.id,
            analise.id,
            oportunidade.entidadeAlvoId,
            oportunidade.tipo,
            oportunidade.justificativa,
            oportunidade.ganchoAbordagem,
            oportunidade.prioridade,
            oportunidade.score.valor,
            oportunidade.score.similaridade,
            oportunidade.score.probConversao,
          ],
        )
      }
      return { ...mapAnalise(analiseResult.rows[0]), oportunidades: analise.oportunidades }
    })
  }

  async buscarPorId(id: string): Promise<AnaliseDTO | null> {
    const result = await this.pool.query(
      `select id, cliente_id, tipo, escopo, versao_modelo, origem, created_at, updated_at
       from analises where id = $1`,
      [id],
    )
    if (!result.rows[0]) return null

    return {
      ...mapAnalise(result.rows[0]),
      oportunidades: await this.buscarOportunidades(id),
    }
  }

  async listarPorCliente(
    clienteId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: AnaliseResumoDTO[]; total: number }> {
    const [itemsResult, countResult] = await Promise.all([
      this.pool.query(
        `select a.id, a.cliente_id, a.tipo, a.escopo, a.versao_modelo, a.origem,
                a.created_at, a.updated_at,
                (select count(*)::int from oportunidades o where o.analise_id = a.id) as total_oportunidades
         from analises a
         where a.cliente_id = $1
         order by a.created_at desc
         limit $2 offset $3`,
        [clienteId, limit, offset],
      ),
      this.pool.query(
        'select count(*)::int as total from analises where cliente_id = $1',
        [clienteId],
      ),
    ])

    return {
      items: itemsResult.rows.map((row) => ({
        ...mapAnalise(row),
        totalOportunidades: Number(row['total_oportunidades'] ?? 0),
      })),
      total: Number(countResult.rows[0]?.total ?? 0),
    }
  }

  private async buscarOportunidades(analiseId: string): Promise<OportunidadeDTO[]> {
    const result = await this.pool.query(
      `select id, entidade_alvo_id, tipo, justificativa, gancho_abordagem,
        prioridade, score_valor, score_similaridade, score_prob_conversao
       from oportunidades
       where analise_id = $1
       order by score_valor desc`,
      [analiseId],
    )
    return result.rows.map((row) => ({
      id: String(row.id),
      entidadeAlvoId: String(row.entidade_alvo_id),
      tipo: String(row.tipo),
      justificativa: String(row.justificativa),
      ganchoAbordagem: String(row.gancho_abordagem),
      prioridade: row.prioridade,
      score: {
        valor: Number(row.score_valor),
        similaridade: Number(row.score_similaridade),
        probConversao: Number(row.score_prob_conversao),
      },
    }))
  }
}

export class PgAnaliseRepository extends AnalisePgRepository {}

function mapAnalise(row: Record<string, unknown>): Omit<AnaliseDTO, 'oportunidades'> {
  const origem = row['origem']
  return {
    id: String(row['id']),
    clienteId: String(row['cliente_id']),
    tipo: String(row['tipo']),
    escopo: String(row['escopo']),
    versaoModelo: String(row['versao_modelo']),
    ...(origem === 'motor' || origem === 'local' ? { origem } : {}),
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
