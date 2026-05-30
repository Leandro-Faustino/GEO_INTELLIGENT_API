import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

const fetchOriginal = globalThis.fetch
const setoresFixturePath = resolve('test/fixtures/setores-censitarios.geojson')
const idhFixturePath = resolve('test/fixtures/idh-municipal.json')

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

test('fontes: lista adapters protegidos por JWT', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/fontes',
      headers: { authorization: `Bearer ${token}` },
    })

    const body = res.json<Array<{ nome: string; modo: string; circuitState: string }>>()

    assert.equal(res.statusCode, 200)
    assert.deepEqual(
      body.map((fonte) => fonte.nome).sort(),
      ['cnpj-receita-federal', 'geocoder', 'ibge-censo', 'registro-imoveis'].sort(),
    )
    assert.equal(body.find((fonte) => fonte.nome === 'cnpj-receita-federal')?.modo, 'mock')
    assert.ok(body.every((fonte) => ['real', 'mock', 'hibrido'].includes(fonte.modo)))
    assert.ok(body.every((fonte) => fonte.circuitState === 'closed'))
  } finally {
    await app.close()
  }
})

test('fontes: consultar CNPJ retorna empresas filtradas', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fontes/cnpj/consultar',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        parametros: {
          cnaes: ['5510801'],
          municipio: 'Joinville',
        },
      },
    })

    const body = res.json<{
      fonte: string
      total: number
      resultados: Array<{ nome: string; atributos: { cnae: string } }>
    }>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.fonte, 'cnpj-receita-federal')
    assert.equal(body.total, 3)
    assert.ok(body.resultados.every((resultado) => resultado.atributos.cnae === '5510801'))
  } finally {
    await app.close()
  }
})

test('fontes: lista IBGE como hibrido quando base real esta configurada', async () => {
  const app = await buildTestApp({
    IBGE_BASE_URL: 'https://servicodados.ibge.gov.br/api',
  })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/fontes',
      headers: { authorization: `Bearer ${token}` },
    })

    const body = res.json<Array<{ nome: string; modo: string }>>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.find((fonte) => fonte.nome === 'ibge-censo')?.modo, 'hibrido')
  } finally {
    await app.close()
  }
})

test('fontes: lista geocoder como hibrido quando Nominatim esta configurado', async () => {
  const app = await buildTestApp({
    NOMINATIM_BASE_URL: 'https://nominatim.test',
    NOMINATIM_USER_AGENT: 'GeoLeadTest/1.0 (dev@example.com)',
    NOMINATIM_THROTTLE_MS: '0',
    GEOCODER_PROVIDER_MODE: 'nominatim-selfhosted',
  })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/fontes',
      headers: { authorization: `Bearer ${token}` },
    })

    const body = res.json<Array<{ nome: string; modo: string }>>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.find((fonte) => fonte.nome === 'geocoder')?.modo, 'hibrido')
  } finally {
    await app.close()
  }
})

test('fontes: geocoder real enriquece endereco via endpoint HTTP interno', async () => {
  let chamadaUrl = ''
  let chamadaInit: RequestInit | undefined
  globalThis.fetch = async (input, init) => {
    chamadaUrl = String(input)
    chamadaInit = init
    return jsonResponse([
      {
        lat: '-26.3044',
        lon: '-48.8456',
        importance: 0.62,
        display_name: 'Rua das Palmeiras, Centro, Joinville, SC, Brasil',
        address: {
          suburb: 'Centro',
          city: 'Joinville',
          state: 'Santa Catarina',
          postcode: '89201-000',
          country_code: 'br',
        },
      },
    ])
  }

  const app = await buildTestApp({
    NOMINATIM_BASE_URL: 'https://nominatim.test',
    NOMINATIM_USER_AGENT: 'GeoLeadTest/1.0 (dev@example.com)',
    NOMINATIM_THROTTLE_MS: '0',
    GEOCODER_PROVIDER_MODE: 'nominatim-selfhosted',
    SETORES_CENSITARIOS_GEOJSON_PATH: setoresFixturePath,
  })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fontes/geocoder/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { identificador: 'Rua das Palmeiras 120 Joinville SC' },
    })

    const body = res.json<{
      latitude: number
      longitude: number
      setorCensitario: string
      bairro: string
      municipio: string
      uf: string
      confianca: number
    }>()
    const url = new URL(chamadaUrl)

    assert.equal(res.statusCode, 200)
    assert.equal(url.pathname, '/search')
    assert.equal(url.searchParams.get('format'), 'jsonv2')
    assert.equal(url.searchParams.get('addressdetails'), '1')
    assert.equal(url.searchParams.get('limit'), '1')
    assert.equal(url.searchParams.get('countrycodes'), 'br')
    assert.equal(
      (chamadaInit?.headers as Record<string, string>)['user-agent'],
      'GeoLeadTest/1.0 (dev@example.com)',
    )
    assert.equal(body.latitude, -26.3044)
    assert.equal(body.longitude, -48.8456)
    assert.equal(body.setorCensitario, '420910205000001')
    assert.equal(body.bairro, 'Centro')
    assert.equal(body.municipio, 'Joinville')
    assert.equal(body.uf, 'SC')
    assert.equal(body.confianca, 0.62)
  } finally {
    await app.close()
  }
})

test('fontes: geocoder real consulta lista de enderecos e normaliza retornos', async () => {
  const chamadas: string[] = []
  globalThis.fetch = async (input) => {
    chamadas.push(String(input))
    return jsonResponse([
      {
        lat: '-26.3044',
        lon: '-48.8456',
        address: {
          suburb: 'Centro',
          city: 'Joinville',
          state_code: 'SC',
          country_code: 'br',
        },
      },
    ])
  }

  const app = await buildTestApp({
    NOMINATIM_BASE_URL: 'https://nominatim.test',
    NOMINATIM_USER_AGENT: 'GeoLeadTest/1.0 (dev@example.com)',
    NOMINATIM_THROTTLE_MS: '0',
    GEOCODER_PROVIDER_MODE: 'nominatim-selfhosted',
  })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fontes/geocoder/consultar',
      headers: { authorization: `Bearer ${token}` },
      payload: { parametros: { enderecos: ['Rua A Joinville', 'Rua B Joinville'] } },
    })

    const body = res.json<{
      fonte: string
      total: number
      resultados: Array<{ latitude: number; longitude: number; uf: string }>
    }>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.fonte, 'geocoder')
    assert.equal(body.total, 2)
    assert.equal(chamadas.length, 2)
    assert.ok(body.resultados.every((resultado) => resultado.uf === 'SC'))
    assert.ok(body.resultados.every((resultado) => typeof resultado.latitude === 'number'))
    assert.ok(body.resultados.every((resultado) => typeof resultado.longitude === 'number'))
  } finally {
    await app.close()
  }
})

test('fontes: IBGE real adiciona IDH quando dataset municipal esta configurado', async () => {
  globalThis.fetch = async (input) => {
    const url = String(input)

    if (url.endsWith('/v1/localidades/municipios/4209102')) {
      return jsonResponse(municipioIbgeFixture(4209102, 'Joinville', 'SC'))
    }

    if (url.includes('/v3/agregados/6579/')) {
      return jsonResponse(agregadoIbgeFixture('2024', '616317'))
    }

    if (url.includes('/v3/agregados/5938/')) {
      return jsonResponse(agregadoIbgeFixture('2022', '49815877'))
    }

    return jsonResponse({}, 404)
  }

  const app = await buildTestApp({
    IBGE_BASE_URL: 'https://ibge.test/api',
    IDH_MUNICIPAL_DATASET_PATH: idhFixturePath,
  })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fontes/ibge/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { identificador: '4209102' },
    })

    const body = res.json<{
      codigoIbge: number
      municipio: string
      populacao: number
      pibMilReais: number
      pibPerCapitaEstimado: number
      idh: number
      idhAno: number
    }>()

    assert.equal(res.statusCode, 200)
    assert.equal(body.codigoIbge, 4209102)
    assert.equal(body.municipio, 'Joinville')
    assert.equal(body.populacao, 616317)
    assert.equal(body.pibMilReais, 49815877)
    assert.equal(body.pibPerCapitaEstimado, (49815877 * 1000) / 616317)
    assert.equal(body.idh, 0.809)
    assert.equal(body.idhAno, 2010)
  } finally {
    await app.close()
  }
})

test('fontes: rejeita fonte inexistente pelo schema', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fontes/desconhecida/consultar',
      headers: { authorization: `Bearer ${token}` },
      payload: { parametros: {} },
    })

    assert.equal(res.statusCode, 400)
  } finally {
    await app.close()
  }
})

test('fontes: enriquecer geocoder retorna coordenadas', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'POST',
      url: '/fontes/geocoder/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { identificador: 'Rua das Palmeiras, 120' },
    })

    const body = res.json<{ latitude: number; longitude: number; setorCensitario: string }>()

    assert.equal(res.statusCode, 200)
    assert.equal(typeof body.latitude, 'number')
    assert.equal(typeof body.longitude, 'number')
    assert.equal(body.setorCensitario, '4209102-001')
  } finally {
    await app.close()
  }
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function municipioIbgeFixture(id: number, nome: string, uf: string) {
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

function agregadoIbgeFixture(periodo: string, valor: string) {
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
