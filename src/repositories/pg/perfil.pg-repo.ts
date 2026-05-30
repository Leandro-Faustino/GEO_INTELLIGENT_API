import type { Pool } from 'pg'
import type {
  CriterioDerivadoDTO,
  IPerfilRepository,
  PerfilIdealDTO,
} from '../interfaces/index.js'
import { runInClienteContext } from './tenant-context.js'

export class PerfilPgRepository implements IPerfilRepository {
  constructor(private readonly pool: Pool) {}

  async salvar(perfil: PerfilIdealDTO): Promise<PerfilIdealDTO> {
    return runInClienteContext(this.pool, perfil.clienteId, async (client) => {
      const perfilResult = await client.query(
        `insert into perfis_ideais
          (id, cliente_id, nome, tipo, hipotetico, exclusoes, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (id) do update set
          nome = excluded.nome,
          tipo = excluded.tipo,
          hipotetico = excluded.hipotetico,
          exclusoes = excluded.exclusoes,
          updated_at = excluded.updated_at
         returning id, cliente_id, nome, tipo, hipotetico, exclusoes, created_at, updated_at`,
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

      await client.query('delete from criterios_derivados where perfil_id = $1', [
        perfil.id,
      ])

      for (const criterio of perfil.criterios) {
        await client.query(
          `insert into criterios_derivados
            (perfil_id, nome, valor_min, valor_max, peso, tipo_comparacao)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            perfil.id,
            criterio.nome,
            JSON.stringify(criterio.valorMin),
            JSON.stringify(criterio.valorMax),
            criterio.peso,
            criterio.tipoComparacao,
          ],
        )
      }
      return { ...mapPerfil(perfilResult.rows[0]), criterios: perfil.criterios }
    })
  }

  async buscarPorId(id: string): Promise<PerfilIdealDTO | null> {
    const result = await this.pool.query(
      `select id, cliente_id, nome, tipo, hipotetico, exclusoes, created_at, updated_at
       from perfis_ideais where id = $1`,
      [id],
    )
    if (!result.rows[0]) return null

    return {
      ...mapPerfil(result.rows[0]),
      criterios: await this.buscarCriterios(id, this.pool),
    }
  }

  async buscarPorCliente(clienteId: string): Promise<PerfilIdealDTO[]> {
    return runInClienteContext(this.pool, clienteId, async (client) => {
      const result = await client.query(
        `select id, cliente_id, nome, tipo, hipotetico, exclusoes, created_at, updated_at
         from perfis_ideais where cliente_id = $1 order by created_at desc`,
        [clienteId],
      )

      const perfis: PerfilIdealDTO[] = []
      for (const row of result.rows) {
        perfis.push({
          ...mapPerfil(row),
          criterios: await this.buscarCriterios(String(row.id), client),
        })
      }
      return perfis
    })
  }

  private async buscarCriterios(
    perfilId: string,
    client: { query: Pool['query'] },
  ): Promise<CriterioDerivadoDTO[]> {
    const result = await client.query(
      `select nome, valor_min, valor_max, peso, tipo_comparacao
       from criterios_derivados where perfil_id = $1`,
      [perfilId],
    )
    return result.rows.map((row) => ({
      nome: String(row.nome),
      valorMin: row.valor_min,
      valorMax: row.valor_max,
      peso: Number(row.peso),
      tipoComparacao: row.tipo_comparacao,
    }))
  }
}

export class PgPerfilRepository extends PerfilPgRepository {}

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

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
