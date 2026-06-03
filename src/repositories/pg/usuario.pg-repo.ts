import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type {
  CriarUsuarioInput,
  IUsuarioRepository,
  UsuarioDTO,
} from '../interfaces/usuario.repository.js'

export class UsuarioPgRepository implements IUsuarioRepository {
  constructor(private readonly pool: Pool) {}

  async buscarPorEmail(email: string): Promise<UsuarioDTO | null> {
    const result = await this.pool.query(
      `SELECT id, email, senha_hash, role, ativo, created_at, updated_at
       FROM usuarios WHERE email = $1 AND ativo = true`,
      [email],
    )
    const row = result.rows[0]
    return row ? mapRow(row) : null
  }

  async buscarPorId(id: string): Promise<UsuarioDTO | null> {
    const result = await this.pool.query(
      `SELECT id, email, senha_hash, role, ativo, created_at, updated_at
       FROM usuarios WHERE id = $1`,
      [id],
    )
    const row = result.rows[0]
    return row ? mapRow(row) : null
  }

  async listar(
    limit: number,
    offset: number,
  ): Promise<{ total: number; items: UsuarioDTO[] }> {
    const [countResult, rowsResult] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM usuarios WHERE ativo = true'),
      this.pool.query(
        `SELECT id, email, senha_hash, role, ativo, created_at, updated_at
         FROM usuarios WHERE ativo = true
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
    ])
    return {
      total: Number(countResult.rows[0].count),
      items: rowsResult.rows.map(mapRow),
    }
  }

  async criar(input: CriarUsuarioInput): Promise<UsuarioDTO> {
    const now = new Date().toISOString()
    const result = await this.pool.query(
      `INSERT INTO usuarios (id, email, senha_hash, role, ativo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, $5, $6)
       RETURNING id, email, senha_hash, role, ativo, created_at, updated_at`,
      [
        randomUUID(),
        input.email,
        input.senhaHash,
        input.role ?? 'user',
        now,
        now,
      ],
    )
    return mapRow(result.rows[0])
  }

  async desativar(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE usuarios SET ativo = false, updated_at = now() WHERE id = $1',
      [id],
    )
  }
}

function mapRow(row: Record<string, unknown>): UsuarioDTO {
  return {
    id: String(row['id']),
    email: String(row['email']),
    senhaHash: String(row['senha_hash']),
    role: String(row['role']) as 'user' | 'admin',
    ativo: Boolean(row['ativo']),
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  }
}
