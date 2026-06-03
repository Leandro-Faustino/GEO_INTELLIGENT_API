import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { AdaptadorGeocoder } from '../../src/adapters/geocoder.adapter.js'
import { SetorCensitarioResolver } from '../../src/services/setor-censitario.service.js'

const fetchOriginal = globalThis.fetch
const setoresFixturePath = resolve('test/fixtures/setores-censitarios.geojson')

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

describe('AdaptadorGeocoder', () => {
  test('modo mock mantém contrato atual sem URL e User-Agent', async () => {
    const adapter = new AdaptadorGeocoder()

    assert.equal(adapter.modo, 'mock')

    const resultado = await adapter.enriquecer('Rua das Palmeiras, 120')

    assert.equal(resultado['endereco'], 'Rua das Palmeiras, 120')
    assert.equal(typeof resultado['latitude'], 'number')
    assert.equal(typeof resultado['longitude'], 'number')
    assert.equal(resultado['setorCensitario'], '4209102-001')
    assert.equal(resultado['municipio'], 'Joinville')
    assert.equal(resultado['uf'], 'SC')
    assert.equal(resultado['fonte'], 'geocoder')
  })

  test('nominatim-public com baseUrl mas sem User-Agent com e-mail lança erro de configuração', () => {
    assert.throws(
      () =>
        new AdaptadorGeocoder({
          baseUrl: 'https://nominatim.openstreetmap.org',
          providerMode: 'nominatim-public',
        }),
      (error: Error) => {
        assert.ok(error.message.includes('NOMINATIM_USER_AGENT'))
        return true
      },
    )
  })

  test('nominatim-public com throttleMs < 1000 lança erro de configuração', () => {
    assert.throws(
      () =>
        new AdaptadorGeocoder({
          baseUrl: 'https://nominatim.openstreetmap.org',
          userAgent: 'GeoLeadTest/1.0 (dev@example.com)',
          throttleMs: 500,
          providerMode: 'nominatim-public',
        }),
      (error: Error) => {
        assert.ok(error.message.includes('NOMINATIM_THROTTLE_MS'))
        return true
      },
    )
  })

  test('modo mock é mantido quando baseUrl não está configurada', () => {
    const adapter = new AdaptadorGeocoder()
    assert.equal(adapter.modo, 'mock')
  })

  test('modo hibrido chama Nominatim search e normaliza retorno para o contrato interno', async () => {
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
            road: 'Rua das Palmeiras',
            suburb: 'Centro',
            city: 'Joinville',
            state: 'Santa Catarina',
            postcode: '89201-000',
            country_code: 'br',
          },
        },
      ])
    }

    const adapter = new AdaptadorGeocoder({
      baseUrl: 'https://nominatim.openstreetmap.org',
      userAgent: 'GeoLeadTest/1.0 (dev@example.com)',
      throttleMs: 0,
      providerMode: 'nominatim-selfhosted',
      setorResolver: new SetorCensitarioResolver({
        geojsonPath: setoresFixturePath,
      }),
    })

    assert.equal(adapter.modo, 'hibrido')

    const resultado = await adapter.enriquecer('Rua das Palmeiras 120 Joinville SC')
    const url = new URL(chamadaUrl)

    assert.equal(url.origin, 'https://nominatim.openstreetmap.org')
    assert.equal(url.pathname, '/search')
    assert.equal(url.searchParams.get('q'), 'Rua das Palmeiras 120 Joinville SC')
    assert.equal(url.searchParams.get('format'), 'jsonv2')
    assert.equal(url.searchParams.get('addressdetails'), '1')
    assert.equal(url.searchParams.get('limit'), '1')
    assert.equal(url.searchParams.get('countrycodes'), 'br')
    assert.equal(
      (chamadaInit?.headers as Record<string, string>)['user-agent'],
      'GeoLeadTest/1.0 (dev@example.com)',
    )
    assert.equal((chamadaInit?.headers as Record<string, string>)['accept'], 'application/json')
    assert.deepEqual(resultado, {
      endereco: 'Rua das Palmeiras 120 Joinville SC',
      latitude: -26.3044,
      longitude: -48.8456,
      setorCensitario: '420910205000001',
      bairro: 'Centro',
      municipio: 'Joinville',
      uf: 'SC',
      cep: '89201-000',
      pais: 'BR',
      displayName: 'Rua das Palmeiras, Centro, Joinville, SC, Brasil',
      confianca: 0.62,
      fonte: 'geocoder',
      enriquecidoEm: resultado['enriquecidoEm'],
    })
  })

  test('modo hibrido retorna encontrado=false quando Nominatim não encontra endereço', async () => {
    globalThis.fetch = async () => jsonResponse([])

    const adapter = new AdaptadorGeocoder({
      baseUrl: 'https://nominatim.openstreetmap.org',
      userAgent: 'GeoLeadTest/1.0 (dev@example.com)',
      throttleMs: 0,
      providerMode: 'nominatim-selfhosted',
    })

    const resultado = await adapter.enriquecer('Endereço Inexistente')

    assert.equal(resultado['encontrado'], false)
    assert.equal(resultado['latitude'], null)
    assert.equal(resultado['longitude'], null)
    assert.equal(resultado['setorCensitario'], null)
    assert.equal(resultado['fonte'], 'geocoder')
  })

  test('modo hibrido propaga status 403 e 429 como erro protegido', async () => {
    globalThis.fetch = async () => jsonResponse({ error: 'blocked' }, 403)

    const adapter = new AdaptadorGeocoder({
      baseUrl: 'https://nominatim.openstreetmap.org',
      userAgent: 'GeoLeadTest/1.0 (dev@example.com)',
      throttleMs: 0,
      providerMode: 'nominatim-selfhosted',
      maxRetries: 0,
    })

    await assert.rejects(
      () => adapter.enriquecer('Rua das Palmeiras'),
      (error: { statusCode?: number; message?: string }) => {
        assert.equal(error.statusCode, 403)
        assert.ok(error.message?.includes('bloqueou'))
        return true
      },
    )

    globalThis.fetch = async () => jsonResponse({ error: 'rate limit' }, 429)

    await assert.rejects(
      () => adapter.enriquecer('Rua das Palmeiras'),
      (error: { statusCode?: number; message?: string }) => {
        assert.equal(error.statusCode, 502)
        assert.ok(error.message?.includes('rate limit'))
        return true
      },
    )
  })

  test('consultar aceita lista de endereços e remove entradas vazias', async () => {
    const chamadas: string[] = []
    globalThis.fetch = async (input) => {
      chamadas.push(String(input))
      return jsonResponse([
        {
          lat: '-26.3044',
          lon: '-48.8456',
          address: { city: 'Joinville', state_code: 'SC', country_code: 'br' },
        },
      ])
    }

    const adapter = new AdaptadorGeocoder({
      baseUrl: 'https://nominatim.openstreetmap.org',
      userAgent: 'GeoLeadTest/1.0 (dev@example.com)',
      throttleMs: 0,
      providerMode: 'nominatim-selfhosted',
    })

    const resultados = await adapter.consultar({
      enderecos: ['Rua A, Joinville', '', 'Rua B, Joinville'],
    })

    assert.equal(resultados.length, 2)
    assert.equal(chamadas.length, 2)
    assert.equal(new URL(chamadas[0]!).searchParams.get('q'), 'Rua A, Joinville')
    assert.equal(new URL(chamadas[1]!).searchParams.get('q'), 'Rua B, Joinville')
    assert.ok(resultados.every((resultado) => resultado['uf'] === 'SC'))
  })

  test('enriquecerComContexto monta endereço quando identificador é CNPJ', async () => {
    let chamadaUrl = ''
    globalThis.fetch = async (input) => {
      chamadaUrl = String(input)
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

    const adapter = new AdaptadorGeocoder({
      baseUrl: 'https://nominatim.openstreetmap.org',
      userAgent: 'GeoLeadTest/1.0 (dev@example.com)',
      throttleMs: 0,
      providerMode: 'nominatim-selfhosted',
      setorResolver: new SetorCensitarioResolver({
        geojsonPath: setoresFixturePath,
      }),
    })

    const resultado = await adapter.enriquecerComContexto({
      identificador: '12345678000190',
      nome: 'Comprador CNPJ',
      tipo: 'pj',
      atributos: {
        logradouro: 'Rua das Palmeiras',
        numero: '120',
        bairro: 'Centro',
        cidade: 'Joinville',
        uf: 'SC',
      },
    })

    assert.equal(
      new URL(chamadaUrl).searchParams.get('q'),
      'Rua das Palmeiras, 120, Centro, Joinville, SC',
    )
    assert.equal(resultado['municipio'], 'Joinville')
    assert.equal(resultado['uf'], 'SC')
    assert.equal(resultado['latitude'], -26.3044)
    assert.equal(resultado['longitude'], -48.8456)
    assert.equal(resultado['setorCensitario'], '420910205000001')
  })
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
