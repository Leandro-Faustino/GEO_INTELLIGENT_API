import pg from 'pg'

const { Pool } = pg

const databaseUrl = process.env['POSTGRES_URL'] || process.env['DATABASE_URL']

if (!databaseUrl) {
  throw new Error('POSTGRES_URL ou DATABASE_URL é obrigatório para executar seed.')
}

const pool = new Pool({ connectionString: databaseUrl })
const now = new Date().toISOString()

await pool.query(
  `
    insert into clientes
      (id, razao_social, segmento, cidade, endereco, vertical, parametros_negocio, created_at, updated_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    on conflict (id) do update set
      razao_social = excluded.razao_social,
      segmento = excluded.segmento,
      cidade = excluded.cidade,
      endereco = excluded.endereco,
      vertical = excluded.vertical,
      parametros_negocio = excluded.parametros_negocio,
      updated_at = excluded.updated_at
  `,
  [
    '00000000-0000-4000-8000-000000000001',
    'Cliente Demonstracao',
    'hotelaria',
    'Joinville',
    'Rua Demo, 100',
    'colchoes',
    JSON.stringify({ origem: 'seed' }),
    now,
    now,
  ],
)

await pool.end()
console.log('seed aplicado')
