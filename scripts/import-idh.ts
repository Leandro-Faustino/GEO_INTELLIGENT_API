/**
 * Importa e normaliza o ranking IDH Municipal do Atlas do Desenvolvimento Humano no Brasil
 * (PNUD Brasil / IPEA / FJP) para o formato JSON esperado pelo sistema.
 *
 * Uso:
 *   npm run import:idh -- <csv-de-entrada> [json-de-saida]
 *
 * Exemplos:
 *   npm run import:idh -- downloads/atlas-brasil-idhm.csv
 *   npm run import:idh -- downloads/atlas-brasil-idhm.csv data/idh/idh-municipal.json
 *
 * Formato CSV de entrada (Atlas Brasil, separador ponto-e-vírgula):
 *   Código IBGE;Município;UF;IDHM 2010
 *   3550308;São Paulo;SP;0,816
 */

import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { resolve, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

interface IdhRegistro {
  codigoIbge: number
  municipio: string
  uf: string
  idh: number
  ano: number
  fonte: string
}

const csvPath = process.argv[2]
const outputPath = process.argv[3] ?? 'data/idh/idh-municipal.json'

if (!csvPath) {
  console.error(
    'Uso: npm run import:idh -- <arquivo.csv> [saida.json]\n' +
      'Exemplo: npm run import:idh -- downloads/atlas-brasil-idhm.csv',
  )
  process.exit(2)
}

const csvAbsoluto = resolve(csvPath)
const outputAbsoluto = resolve(outputPath)

const rl = createInterface({
  input: createReadStream(csvAbsoluto, { encoding: 'latin1' }),
  crlfDelay: Infinity,
})

const registros: IdhRegistro[] = []
let header: string[] = []
let linhaNr = 0

for await (const linha of rl) {
  linhaNr++
  const partes = linha.split(';').map((p) => p.trim().replace(/"/g, ''))

  if (linhaNr === 1) {
    header = partes.map((h) => h.toLowerCase())
    continue
  }

  if (partes.length < 4 || !partes[0]) continue

  const codigoIbge = parseInt(partes[0] ?? '', 10)
  const municipio = partes[1] ?? ''
  const uf = partes[2] ?? ''
  const idhStr = (partes[3] ?? '').replace(',', '.')
  const idh = parseFloat(idhStr)

  if (isNaN(codigoIbge) || !municipio || !uf || isNaN(idh)) {
    console.warn(`Linha ${linhaNr}: ignorada (dados inválidos) → ${linha}`)
    continue
  }

  const anoMatch = header.find((h) => /\d{4}/.test(h))?.match(/\d{4}/)
  const ano = anoMatch ? parseInt(anoMatch[0], 10) : 2010

  registros.push({
    codigoIbge,
    municipio: normalizar(municipio),
    uf: uf.toUpperCase(),
    idh: Math.round(idh * 1000) / 1000,
    ano,
    fonte: 'PNUD Brasil',
  })
}

if (registros.length === 0) {
  console.error('Nenhum registro válido encontrado no CSV. Verifique o formato.')
  process.exit(1)
}

await mkdir(dirname(outputAbsoluto), { recursive: true })
await writeFile(outputAbsoluto, JSON.stringify(registros, null, 2), 'utf-8')

console.log(
  JSON.stringify({
    status: 'ok',
    totalImportados: registros.length,
    output: outputAbsoluto,
    amostra: registros.slice(0, 3),
  }, null, 2),
)

console.error(`\nValidando o dataset gerado...`)
const { validarIdhMunicipalDataset } = await import('../src/services/idh-municipal.service.js')
const validacao = await validarIdhMunicipalDataset(outputAbsoluto)

if (!validacao.valido) {
  console.error('Validação falhou:', validacao.erros)
  process.exit(1)
}

console.error(`✓ Dataset válido: ${validacao.totalRegistros} municípios, ${validacao.codigosDuplicados.length} duplicatas.`)

function normalizar(nome: string): string {
  return nome
    .replace(/ão/g, 'ão')
    .replace(/ç/g, 'ç')
    .trim()
}
