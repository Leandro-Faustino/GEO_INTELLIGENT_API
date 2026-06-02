import type { Pool, PoolClient } from 'pg'
import type {
  AnaliseDTO,
  AnaliseResumoDTO,
  IAnaliseRepository,
  OportunidadeDTO,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'
import { toIso } from './utils.js'

export class AnalisePgRepository implements IAnaliseRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(analise: AnaliseDTO): Promise<AnaliseDTO> {
    return runInClienteContext(this.pool, analise.clienteId, async (client) => {
      const analiseResult = await client.query(
        `INSERT INTO analises
          (id, cliente_id, perfil_id, tipo, escopo, versao_modelo, origem, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
          perfil_id = excluded.perfil_id,
          tipo = excluded.tipo,
          escopo = excluded.escopo,
          versao_modelo = excluded.versao_modelo,
          origem = excluded.origem,
          updated_at = excluded.updated_at
         RETURNING id, cliente_id, perfil_id, tipo, escopo, versao_modelo, origem, created_at, updated_at`,
        [
          analise.id,
          analise.clienteId,
          analise.perfilId ?? null,
          analise.tipo,
          analise.escopo,
          analise.versaoModelo,
          analise.origem ?? 'local',
          analise.createdAt,
          analise.updatedAt,
        ],
      )

      await client.query('DELETE FROM oportunidades WHERE analise_id = $1', [analise.id])

      if (analise.oportunidades.length > 0) {
        await inserirOportunidades(client, analise.id, analise.oportunidades)
      }

      return { ...mapAnalise(analiseResult.rows[0]), oportunidades: analise.oportunidades }
    })
  }

  async buscarPorId(id: string): Promise<AnaliseDTO | null> {
    const result = await this.pool.query(
      `SELECT id, cliente_id, perfil_id, tipo, escopo, versao_modelo, origem, created_at, updated_at
       FROM analises WHERE id = $1`,
      [id],
    )
    if (!result.rows[0]) return null

    return {
      ...mapAnalise(result.rows[0]),
      oportunidades: await buscarOportunidades(this.pool, id),
    }
  }

  async buscarPorIdParaCliente(id: string, clienteId: string): Promise<AnaliseDTO | null> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `SELECT id, cliente_id, perfil_id, tipo, escopo, versao_modelo, origem, created_at, updated_at
         FROM analises WHERE id = $1 AND cliente_id = $2`,
        [id, clienteId],
      )
      if (!result.rows[0]) return null

      return {
        ...mapAnalise(result.rows[0]),
        oportunidades: await buscarOportunidades(client, id),
      }
    })
  }

  async listarPorCliente(
    clienteId: string,
    limit: number,
    offset: number,
    filtros?: { escopo?: string; origem?: string },
  ): Promise<{ items: AnaliseResumoDTO[]; total: number }> {
    const [itemsResult, countResult] = await Promise.all([
      this.pool.query(
        `SELECT a.id, a.cliente_id, a.perfil_id, a.tipo, a.escopo, a.versao_modelo, a.origem,
                a.created_at, a.updated_at,
                (SELECT count(*)::int FROM oportunidades o WHERE o.analise_id = a.id) AS total_oportunidades
         FROM analises a
         WHERE a.cliente_id = $1
           AND ($4::text IS NULL OR a.escopo = $4)
           AND ($5::text IS NULL OR a.origem = $5)
         ORDER BY a.created_at DESC
         LIMIT $2 OFFSET $3`,
        [clienteId, limit, offset, filtros?.escopo ?? null, filtros?.origem ?? null],
      ),
      this.pool.query(
        `SELECT count(*)::int AS total FROM analises
         WHERE cliente_id = $1
           AND ($2::text IS NULL OR escopo = $2)
           AND ($3::text IS NULL OR origem = $3)`,
        [clienteId, filtros?.escopo ?? null, filtros?.origem ?? null],
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
}

export class PgAnaliseRepository extends AnalisePgRepository {}

async function inserirOportunidades(
  client: PoolClient,
  analiseId: string,
  oportunidades: OportunidadeDTO[],
): Promise<void> {
  await client.query(
    `INSERT INTO oportunidades
      (id, analise_id, entidade_alvo_id, tipo, justificativa, gancho_abordagem,
       prioridade, score_valor, score_similaridade, score_prob_conversao)
     SELECT unnest($1::uuid[]), $2, unnest($3::text[]), unnest($4::text[]),
            unnest($5::text[]), unnest($6::text[]),
            unnest($7::text[]), unnest($8::numeric[]),
            unnest($9::numeric[]), unnest($10::numeric[])`,
    [
      oportunidades.map((o) => o.id),
      analiseId,
      oportunidades.map((o) => o.entidadeAlvoId),
      oportunidades.map((o) => o.tipo),
      oportunidades.map((o) => o.justificativa),
      oportunidades.map((o) => o.ganchoAbordagem),
      oportunidades.map((o) => o.prioridade),
      oportunidades.map((o) => o.score.valor),
      oportunidades.map((o) => o.score.similaridade),
      oportunidades.map((o) => o.score.probConversao),
    ],
  )
}

async function buscarOportunidades(
  client: Pool | PoolClient,
  analiseId: string,
): Promise<OportunidadeDTO[]> {
  const result = await client.query(
    `SELECT id, entidade_alvo_id, tipo, justificativa, gancho_abordagem,
      prioridade, score_valor, score_similaridade, score_prob_conversao
     FROM oportunidades
     WHERE analise_id = $1
     ORDER BY score_valor DESC`,
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

function mapAnalise(row: Record<string, unknown>): Omit<AnaliseDTO, 'oportunidades'> {
  const origem = row['origem']
  return {
    id: String(row['id']),
    clienteId: String(row['cliente_id']),
    ...(row['perfil_id'] != null ? { perfilId: String(row['perfil_id']) } : {}),
    tipo: String(row['tipo']),
    escopo: String(row['escopo']),
    versaoModelo: String(row['versao_modelo']),
    ...(origem === 'motor' || origem === 'local' ? { origem } : {}),
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  }
}
