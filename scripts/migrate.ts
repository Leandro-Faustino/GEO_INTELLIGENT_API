import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', 'src', 'migrations')

async function migrate(): Promise<void> {
  const connectionString = process.env['POSTGRES_URL'] || process.env['DATABASE_URL']
  if (!connectionString) {
    throw new Error('POSTGRES_URL ou DATABASE_URL é obrigatório para executar migrations.')
  }

  const pool = new pg.Pool({ connectionString })

  try {
    await pool.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `)

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()

    const appliedResult = await pool.query<{ version: string }>(
      'select version from schema_migrations',
    )
    const applied = new Set(appliedResult.rows.map((row) => row.version))
    let executed = 0

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      if (applied.has(version)) {
        console.log(`skip ${version}: já aplicada`)
        continue
      }

      const sql = readFileSync(join(migrationsDir, file), 'utf8')
      const client = await pool.connect()

      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into schema_migrations (version) values ($1)', [
          version,
        ])
        await client.query('commit')
        console.log(`ok ${version}: aplicada`)
        executed++
      } catch (error) {
        await client.query('rollback')
        console.error(`erro ${version}: rollback executado`)
        throw error
      } finally {
        client.release()
      }
    }

    console.log(
      executed > 0
        ? `${executed} migration(s) aplicada(s).`
        : 'Banco já está atualizado.',
    )
  } finally {
    await pool.end()
  }
}

await migrate()
