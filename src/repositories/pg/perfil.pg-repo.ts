import type { Pool, PoolClient } from 'pg'
import type {
  CriterioDerivadoDTO,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'
import { toIso } from './utils.js'

const SELECT_PERFIL_COM_CRITERIOS = `
  SELECT
    p.id, p.cliente_id, p.nome, p.tipo, p.hipotetico, p.exclusoes,
    p.created_at, p.updated_at,
    COALESCE(
      json_agg(
        json_build_object(
          'nome',           c.nome,
          'valorMin',       c.valor_min,
          'valorMax',       c.valor_max,
          'peso',           c.peso::float,
          'tipoComparacao', c.tipo_comparacao
        ) ORDER BY c.nome
      ) FILTER (WHERE c.perfil_id IS NOT NULL),
      '[]'::json
    ) AS criterios
  FROM perfis_ideais p
  LEFT JOIN criterios_derivados c ON c.perfil_id = p.id`

export class PerfilPgRepository implements IPerfilRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO> {
    return runInClienteContext(this.pool, perfil.clienteId, async (client) => {
      const perfilResult = await client.query(
        `INSERT INTO perfis_ideais
          (id, cliente_id, nome, tipo, hipotetico, exclusoes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
          nome = excluded.nome,
          tipo = excluded.tipo,
          hipotetico = excluded.hipotetico,
          exclusoes = excluded.exclusoes,
          updated_at = excluded.updated_at
         RETURNING id, cliente_id, nome, tipo, hipotetico, exclusoes, created_at, updated_at`,
        [
          perfil.id,
          perfil.clienteId,
          perfil.nome,
          perfil.tipo,
          perfil.hipotetico,
          JSON.stringify(perfil.exclusoes),
          perfil.createdAt,
          perfil.updatedAt,
        ],
      )

      await client.query('DELETE FROM criterios_derivados WHERE perfil_id = $1', [perfil.id])

      if (perfil.criterios.length > 0) {
        await inserirCriterios(client, perfil.id, perfil.criterios)
      }

      return { ...mapPerfil(perfilResult.rows[0]), criterios: perfil.criterios }
    })
  }

  async buscarPorId(id: string): Promise<PerfilIdealDTO | null> {
    const result = await this.pool.query(
      `${SELECT_PERFIL_COM_CRITERIOS} WHERE p.id = $1 GROUP BY p.id`,
      [id],
    )
    return result.rows[0] ? mapPerfilComCriterios(result.rows[0]) : null
  }

  async buscarPorIdParaCliente(id: string, clienteId: string): Promise<PerfilIdealDTO | null> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `${SELECT_PERFIL_COM_CRITERIOS} WHERE p.id = $1 AND p.cliente_id = $2 GROUP BY p.id`,
        [id, clienteId],
      )
      return result.rows[0] ? mapPerfilComCriterios(result.rows[0]) : null
    })
  }

  async buscarPorCliente(
    clienteId: string,
    filtros?: { tipo?: string; limit?: number; offset?: number },
  ): Promise<PerfilIdealDTO[]> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `${SELECT_PERFIL_COM_CRITERIOS}
         WHERE p.cliente_id = $1
           AND ($2::text IS NULL OR p.tipo = $2)
         GROUP BY p.id
         ORDER BY p.created_at DESC
         LIMIT $3 OFFSET $4`,
        [clienteId, filtros?.tipo ?? null, filtros?.limit ?? null, filtros?.offset ?? 0],
      )
      return result.rows.map(mapPerfilComCriterios)
    })
  }
}

export class PgPerfilRepository extends PerfilPgRepository {}

async function inserirCriterios(
  client: PoolClient,
  perfilId: string,
  criterios: CriterioDerivadoDTO[],
): Promise<void> {
  await client.query(
    `INSERT INTO criterios_derivados (perfil_id, nome, valor_min, valor_max, peso, tipo_comparacao)
     SELECT $1, unnest($2::text[]), unnest($3::jsonb[]), unnest($4::jsonb[]),
            unnest($5::numeric[]), unnest($6::text[])`,
    [
      perfilId,
      criterios.map((c) => c.nome),
      criterios.map((c) => JSON.stringify(c.valorMin)),
      criterios.map((c) => JSON.stringify(c.valorMax)),
      criterios.map((c) => c.peso),
      criterios.map((c) => c.tipoComparacao),
    ],
  )
}

function mapPerfilComCriterios(row: Record<string, unknown>): PerfilIdealDTO {
  return {
    ...mapPerfil(row),
    criterios: Array.isArray(row['criterios'])
      ? (row['criterios'] as Record<string, unknown>[]).map(mapCriterioFromJson)
      : [],
  }
}

function mapCriterioFromJson(obj: Record<string, unknown>): CriterioDerivadoDTO {
  return {
    nome: String(obj['nome']),
    valorMin: obj['valorMin'],
    valorMax: obj['valorMax'],
    peso: Number(obj['peso']),
    tipoComparacao: obj['tipoComparacao'] as CriterioDerivadoDTO['tipoComparacao'],
  }
}

function mapPerfil(row: Record<string, unknown>): Omit<PerfilIdealDTO, 'criterios'> {
  return {
    id: String(row['id']),
    clienteId: String(row['cliente_id']),
    nome: String(row['nome']),
    tipo: String(row['tipo']),
    hipotetico: Boolean(row['hipotetico']),
    exclusoes: Array.isArray(row['exclusoes']) ? row['exclusoes'].map(String) : [],
    createdAt: toIso(row['created_at']),
    updatedAt: toIso(row['updated_at']),
  }
}
