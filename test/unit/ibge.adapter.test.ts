import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { AdaptadorIBGE } from '../../src/adapters/ibge.adapter.js'
import { IdhMunicipalService } from '../../src/services/idh-municipal.service.js'

const fetchOriginal = globalThis.fetch
const idhFixturePath = resolve('test/fixtures/idh-municipal.json')

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

describe('AdaptadorIBGE', () => {
  test('modo mock mantém contrato atual sem URL real', async () => {
    const adapter = new AdaptadorIBGE()

    assert.equal(adapter.modo, 'mock')

    const resultados = await adapter.consultar({ municipio: 'Joinville' })

    assert.ok(resultados.length > 0)
    assert.equal(resultados[0]?.['fonte'], 'ibge-censo')
    assert.equal((resultados[0]?.['atributos'] as Record<string, unknown>)['populacao'] !== undefined, true)
  })

  test('modo hibrido consulta municípios reais por UF e normaliza como território', async () => {
    const chamadas: string[] = []
    globalThis.fetch = async (input) => {
      chamadas.push(String(input))
      return jsonResponse([
        municipioFixture(4209102, 'Joinville', 'SC'),
        municipioFixture(4205407, 'Florianópolis', 'SC'),
      ])
    }

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
    })

    assert.equal(adapter.modo, 'hibrido')

    const resultados = await adapter.consultar({
      uf: 'SC',
      municipio: 'Joinville',
    })

    assert.equal(chamadas[0], 'https://servicodados.ibge.gov.br/api/v1/localidades/estados/SC/municipios')
    assert.equal(resultados.length, 1)
    assert.deepEqual(resultados[0], {
      identificador: '4209102',
      nome: 'Joinville',
      tipo: 'territorio',
      endereco: 'Joinville, SC',
      latitude: null,
      longitude: null,
      fonte: 'ibge-censo',
      atributos: {
        codigoIbge: 4209102,
        municipio: 'Joinville',
        microrregiao: 'Joinville',
        regiaoImediata: 'Joinville',
        uf: 'SC',
      },
    })
  })

  test('modo hibrido enriquece município com população e PIB municipal', async () => {
    const chamadas: string[] = []
    globalThis.fetch = async (input) => {
      const url = String(input)
      chamadas.push(url)

      if (url.endsWith('/v1/localidades/municipios/4209102')) {
        return jsonResponse(municipioFixture(4209102, 'Joinville', 'SC'))
      }

      if (url.includes('/v3/agregados/6579/')) {
        return jsonResponse(agregadoFixture('2024', '616317'))
      }

      if (url.includes('/v3/agregados/5938/')) {
        return jsonResponse(agregadoFixture('2022', '72445.67'))
      }

      return jsonResponse({}, 404)
    }

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
    })

    const resultado = await adapter.enriquecer('4209102')

    assert.ok(chamadas.includes('https://servicodados.ibge.gov.br/api/v1/localidades/municipios/4209102'))
    assert.equal(resultado['codigoIbge'], 4209102)
    assert.equal(resultado['municipio'], 'Joinville')
    assert.equal(resultado['populacao'], 616317)
    assert.equal(resultado['populacaoAno'], '2024')
    assert.equal(resultado['pibMilReais'], 72445.67)
    assert.equal(resultado['pibAno'], '2022')
    assert.equal(resultado['pibPerCapitaEstimado'], (72445.67 * 1000) / 616317)
    assert.equal(resultado['idh'], undefined)
    assert.equal(resultado['fonte'], 'ibge-censo')
  })

  test('código inválido: API retorna 200 com [] e adapter devolve { encontrado: false }', async () => {
    globalThis.fetch = async () => jsonResponse([]) // IBGE retorna 200 com array vazio

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
    })

    const resultado = await adapter.enriquecer('9999999')

    assert.equal(resultado['encontrado'], false)
    assert.equal(resultado['fonte'], 'ibge-censo')
    assert.ok(typeof resultado['enriquecidoEm'] === 'string')
  })

  test('modo hibrido resolve município por nome usando UF padrão', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input)

      if (url.endsWith('/v1/localidades/estados/SC/municipios')) {
        return jsonResponse([
          municipioFixture(4209102, 'Joinville', 'SC'),
        ])
      }

      return jsonResponse(agregadoFixture('2024', '1000'))
    }

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
    })

    const resultado = await adapter.enriquecer('Joinville')

    assert.equal(resultado['codigoIbge'], 4209102)
    assert.equal(resultado['populacao'], 1000)
    assert.equal(resultado['populacaoAno'], '2024')
    assert.equal(resultado['pibMilReais'], 1000)
    assert.equal(resultado['pibAno'], '2024')
    assert.equal(resultado['pibPerCapitaEstimado'], 1000)
  })

  test('modo hibrido usa cidade/UF do contexto quando identificador é CNPJ', async () => {
    const chamadas: string[] = []
    globalThis.fetch = async (input) => {
      const url = String(input)
      chamadas.push(url)

      if (url.endsWith('/v1/localidades/estados/SC/municipios')) {
        return jsonResponse([municipioFixture(4209102, 'Joinville', 'SC')])
      }

      if (url.includes('/v3/agregados/6579/')) {
        return jsonResponse(agregadoFixture('2024', '616317'))
      }

      if (url.includes('/v3/agregados/5938/')) {
        return jsonResponse(agregadoFixture('2022', '49815877'))
      }

      return jsonResponse({}, 404)
    }

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
    })

    const resultado = await adapter.enriquecerComContexto({
      identificador: '12345678000190',
      nome: 'Comprador CNPJ',
      tipo: 'pj',
      atributos: { cidade: 'Joinville', uf: 'SC' },
    })

    assert.equal(
      chamadas.some((url) => url.endsWith('/v1/localidades/municipios/1234567')),
      false,
    )
    assert.ok(
      chamadas.includes(
        'https://servicodados.ibge.gov.br/api/v1/localidades/estados/SC/municipios',
      ),
    )
    assert.equal(resultado['codigoIbge'], 4209102)
    assert.equal(resultado['municipio'], 'Joinville')
    assert.equal(resultado['populacao'], 616317)
    assert.equal(resultado['pibMilReais'], 49815877)
    assert.equal(resultado['pibPerCapitaEstimado'], (49815877 * 1000) / 616317)
  })

  test('modo hibrido adiciona IDH quando dataset municipal está configurado', async () => {
    globalThis.fetch = async (input) => {
      const url = String(input)

      if (url.endsWith('/v1/localidades/municipios/4209102')) {
        return jsonResponse(municipioFixture(4209102, 'Joinville', 'SC'))
      }

      if (url.includes('/v3/agregados/6579/')) {
        return jsonResponse(agregadoFixture('2024', '616317'))
      }

      if (url.includes('/v3/agregados/5938/')) {
        return jsonResponse(agregadoFixture('2022', '49815877'))
      }

      return jsonResponse({}, 404)
    }

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
      idhService: new IdhMunicipalService({ datasetPath: idhFixturePath }),
    })

    const resultado = await adapter.enriquecer('4209102')

    assert.equal(resultado['codigoIbge'], 4209102)
    assert.equal(resultado['idh'], 0.809)
    assert.equal(resultado['idhAno'], 2010)
  })

  test('cache: lista de municípios por UF é buscada apenas uma vez para chamadas consecutivas', async () => {
    let chamadas = 0
    globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.includes('/v1/localidades/estados/SC/municipios')) chamadas++
      if (url.includes('/v3/agregados/')) return jsonResponse(agregadoFixture('2024', '1000'))
      return jsonResponse([municipioFixture(4209102, 'Joinville', 'SC')])
    }

    const adapter = new AdaptadorIBGE({
      baseUrl: 'https://servicodados.ibge.gov.br/api',
    })

    await adapter.enriquecer('Joinville')
    await adapter.enriquecer('Joinville')
    await adapter.enriquecer('Joinville')

    assert.equal(chamadas, 1, 'a lista de municípios da UF deve ser buscada só uma vez')
  })
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function municipioFixture(id: number, nome: string, uf: string) {
  return {
    id,
    nome,
    microrregiao: {
      nome: 'Joinville',
      mesorregiao: {
        UF: { sigla: uf },
      },
    },
    'regiao-imediata': {
      nome: 'Joinville',
    },
  }
}

function agregadoFixture(periodo: string, valor: string) {
  return [
    {
      resultados: [
        {
          series: [
            {
              serie: {
                [periodo]: valor,
              },
            },
          ],
        },
      ],
    },
  ]
}
