/**
 * Smoke test do AdaptadorIBGE contra a API pública real.
 *
 * Só roda quando IBGE_BASE_URL está configurado. Use:
 *   IBGE_BASE_URL=https://servicodados.ibge.gov.br/api npm run test:smoke:ibge
 *
 * Município de referência: Joinville – SC (código IBGE 4209102).
 * É um município grande o suficiente para ter dados de população e PIB
 * disponíveis em todos os períodos da API de Agregados.
 */
import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import { AdaptadorIBGE } from '../../src/adapters/ibge.adapter.js'

const IBGE_BASE_URL = process.env['IBGE_BASE_URL'] ?? ''
const CODIGO_JOINVILLE = 4209102
const UF_JOINVILLE = 'SC'

const skip = !IBGE_BASE_URL
  ? { skip: 'IBGE_BASE_URL não configurado — defina para rodar este smoke test' }
  : {}

describe('IBGE smoke — API pública real', skip, () => {
  let adapter: AdaptadorIBGE

  before(() => {
    adapter = new AdaptadorIBGE({ baseUrl: IBGE_BASE_URL, defaultUf: UF_JOINVILLE })
  })

  test('modo é hibrido quando baseUrl está configurado', () => {
    assert.equal(adapter.modo, 'hibrido')
  })

  test('consultar: lista municípios de SC e inclui Joinville', async () => {
    const resultados = await adapter.consultar({ uf: 'SC', municipio: 'Joinville' })

    assert.ok(resultados.length >= 1, 'deve retornar ao menos um resultado')

    const joinville = resultados.find((r) => r['nome'] === 'Joinville')
    assert.ok(joinville, 'Joinville deve estar na lista')
    assert.equal(joinville['tipo'], 'territorio')
    assert.equal(joinville['fonte'], 'ibge-censo')

    const atributos = joinville['atributos'] as Record<string, unknown>
    assert.equal(atributos['codigoIbge'], CODIGO_JOINVILLE)
    assert.equal(atributos['uf'], UF_JOINVILLE)
  })

  test('enriquecer: retorna população e PIB reais por código IBGE', async () => {
    const resultado = await adapter.enriquecer(String(CODIGO_JOINVILLE))

    assert.equal(resultado['codigoIbge'], CODIGO_JOINVILLE)
    assert.equal(resultado['municipio'], 'Joinville')
    assert.equal(resultado['uf'], UF_JOINVILLE)
    assert.equal(resultado['fonte'], 'ibge-censo')
    assert.ok(typeof resultado['enriquecidoEm'] === 'string', 'enriquecidoEm deve ser string ISO')

    const populacao = resultado['populacao'] as number
    assert.ok(populacao > 100_000, `população esperada > 100k, recebida: ${populacao}`)
    assert.ok(populacao < 5_000_000, `população esperada < 5M, recebida: ${populacao}`)

    const pibMilReais = resultado['pibMilReais'] as number
    assert.ok(pibMilReais > 1_000, `PIB esperado > R$1 bilhão, recebido: ${pibMilReais} mil reais`)

    const pibPerCapita = resultado['pibPerCapitaEstimado'] as number
    assert.ok(pibPerCapita > 0, 'pibPerCapitaEstimado deve ser calculado')
  })

  test('enriquecer: retorna { encontrado: false } para código inválido (API retorna 200 com [])', async () => {
    // A API pública do IBGE retorna 200 com array vazio para códigos municipais inválidos.
    // O adapter detecta a resposta como "não encontrado" verificando se é array ou falta o campo id.
    const resultado = await adapter.enriquecer('9999999')

    assert.equal(resultado['encontrado'], false)
    assert.equal(resultado['fonte'], 'ibge-censo')
  })

  test('enriquecerComContexto: resolve por nome de cidade e UF', async () => {
    const resultado = await adapter.enriquecerComContexto({
      identificador: 'teste-contexto',
      nome: 'Empresa Teste',
      tipo: 'pj',
      atributos: { cidade: 'Joinville', uf: 'SC' },
    })

    assert.equal(resultado['codigoIbge'], CODIGO_JOINVILLE)
    assert.equal(resultado['municipio'], 'Joinville')

    const populacao = resultado['populacao'] as number
    assert.ok(populacao > 0, 'população deve ser maior que zero')
  })

  test('contrato: campos obrigatórios sempre presentes na resposta', async () => {
    const resultado = await adapter.enriquecer(String(CODIGO_JOINVILLE))

    const camposObrigatorios = [
      'codigoIbge',
      'municipio',
      'uf',
      'populacao',
      'populacaoAno',
      'pibMilReais',
      'pibAno',
      'pibPerCapitaEstimado',
      'fonte',
      'enriquecidoEm',
    ]

    for (const campo of camposObrigatorios) {
      assert.ok(campo in resultado, `campo obrigatório ausente: ${campo}`)
    }
  })
})
