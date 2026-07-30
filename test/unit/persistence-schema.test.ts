import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'src', 'migrations')

function carregarMigrations(): { nome: string; sql: string }[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((nome) => ({
      nome,
      sql: readFileSync(join(migrationsDir, nome), 'utf8'),
    }))
}

test('persistencia: schema versionado cobre tabelas centrais do dominio', () => {
  const sql = carregarMigrations()
    .map((item) => item.sql)
    .join('\n')

  assert.match(sql, /create table if not exists clientes/i)
  assert.match(sql, /create table if not exists bases_internas/i)
  assert.match(sql, /create table if not exists compradores_conhecidos/i)
  assert.match(sql, /create table if not exists perfis_ideais/i)
  assert.match(sql, /create table if not exists criterios_derivados/i)
  assert.match(sql, /create table if not exists analises/i)
  assert.match(sql, /create table if not exists oportunidades/i)
  assert.match(sql, /create table if not exists entregas/i)
  assert.match(sql, /create table if not exists feedbacks/i)
  assert.match(sql, /create table if not exists alertas/i)
})

test('persistencia: schema versionado cobre owner_id exigido pelo repositorio de clientes', () => {
  const sql = carregarMigrations()
    .map((item) => item.sql)
    .join('\n')

  assert.match(sql, /add column if not exists owner_id text not null default ''/i)
  assert.match(sql, /create index if not exists idx_clientes_owner_id on clientes\(owner_id\)/i)
})

test('persistencia: schema versionado mantem politicas de RLS nos agregados relacionais', () => {
  const sql = carregarMigrations()
    .map((item) => item.sql)
    .join('\n')

  assert.match(sql, /alter table clientes enable row level security/i)
  assert.match(sql, /alter table bases_internas enable row level security/i)
  assert.match(sql, /alter table perfis_ideais enable row level security/i)
  assert.match(sql, /alter table analises enable row level security/i)
  assert.match(sql, /alter table entregas enable row level security/i)
  assert.match(sql, /alter table alertas enable row level security/i)
  assert.match(sql, /current_setting\('app\.current_cliente_id', true\)::uuid/i)
})

test('persistencia: enriquecimentos concede permissao ao role da aplicacao', () => {
  const migration = carregarMigrations().find(
    (item) => item.nome === '006-enriquecimentos-compradores.sql',
  )

  assert.ok(migration)
  assert.match(
    migration.sql,
    /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+enriquecimentos_compradores\s+to\s+geolead_app/i,
  )
})
