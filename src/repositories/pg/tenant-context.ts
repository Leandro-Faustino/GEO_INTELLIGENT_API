import type { Pool, PoolClient } from 'pg'

export type ClienteScopedRunner<T> = (client: PoolClient) => Promise<T>

export async function runInClienteContext<T>(
  pool: Pool,
  clienteId: string,
  runner: ClienteScopedRunner<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role geolead_app')
    await client.query(`select set_config('app.current_cliente_id', $1, true)`, [
      clienteId,
    ])

    const result = await runner(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
