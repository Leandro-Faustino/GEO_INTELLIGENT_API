/**
 * Smoke test do AdaptadorGeocoder contra a API pública Nominatim/OSM.
 *
 * Só roda quando NOMINATIM_BASE_URL e NOMINATIM_USER_AGENT estão configurados. Use:
 *   NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org \
 *   NOMINATIM_USER_AGENT="GeoLead/1.0 (seu@email.com)" \
 *   npm run test:smoke:nominatim
 *
 * Política de uso do Nominatim público: https://nominatim.org/release-docs/latest/api/Overview/#usage-policy
 * - User-Agent com e-mail identificável obrigatório
 * - Máximo 1 req/s (NOMINATIM_THROTTLE_MS >= 1100 recomendado para folga)
 *
 * Endereço de referência: Praça da Sé, São Paulo — bem indexado e estável.
 */
import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import { AdaptadorGeocoder } from '../../src/adapters/geocoder.adapter.js'

const NOMINATIM_BASE_URL = process.env['NOMINATIM_BASE_URL'] ?? ''
const NOMINATIM_USER_AGENT = process.env['NOMINATIM_USER_AGENT'] ?? ''
const NOMINATIM_THROTTLE_MS = Math.max(1100, Number(process.env['NOMINATIM_THROTTLE_MS'] ?? '1100'))

const ENDERECO_REFERENCIA = 'Praça da Sé, São Paulo, SP, Brasil'

// Brasil: lat [-33.8, -5.2], lng [-73.9, -34.7]
const BRASIL = { latMin: -33.8, latMax: -5.2, lngMin: -73.9, lngMax: -34.7 }

const skip =
  !NOMINATIM_BASE_URL || !NOMINATIM_USER_AGENT
    ? {
        skip: 'NOMINATIM_BASE_URL e NOMINATIM_USER_AGENT não configurados — defina para rodar este smoke test',
      }
    : {}

describe('Nominatim smoke — API pública real', skip, () => {
  let adapter: AdaptadorGeocoder

  before(() => {
    adapter = new AdaptadorGeocoder({
      baseUrl: NOMINATIM_BASE_URL,
      userAgent: NOMINATIM_USER_AGENT,
      throttleMs: NOMINATIM_THROTTLE_MS,
      providerMode: 'nominatim-public',
    })
  })

  test('modo é hibrido quando baseUrl e userAgent estão configurados', () => {
    assert.equal(adapter.modo, 'hibrido')
  })

  test('enriquecer: resolve endereço conhecido com coordenadas dentro do Brasil', async () => {
    const resultado = await adapter.enriquecer(ENDERECO_REFERENCIA)

    assert.equal(resultado['encontrado'], undefined, 'campo encontrado não deve existir em resposta positiva')
    assert.equal(resultado['endereco'], ENDERECO_REFERENCIA)

    const lat = resultado['latitude'] as number
    const lng = resultado['longitude'] as number

    assert.ok(typeof lat === 'number' && Number.isFinite(lat), `latitude deve ser número, recebido: ${lat}`)
    assert.ok(typeof lng === 'number' && Number.isFinite(lng), `longitude deve ser número, recebido: ${lng}`)
    assert.ok(lat >= BRASIL.latMin && lat <= BRASIL.latMax, `lat ${lat} fora dos limites do Brasil`)
    assert.ok(lng >= BRASIL.lngMin && lng <= BRASIL.lngMax, `lng ${lng} fora dos limites do Brasil`)

    assert.equal(resultado['pais'], 'BR')
    assert.equal(resultado['uf'], 'SP')
    assert.equal(resultado['fonte'], 'geocoder')
    assert.ok(typeof resultado['enriquecidoEm'] === 'string')
  })

  test('enriquecerComContexto: monta endereço a partir de atributos estruturados', async () => {
    const resultado = await adapter.enriquecerComContexto({
      identificador: '12345678000190',
      nome: 'Empresa Teste',
      tipo: 'pj',
      atributos: {
        logradouro: 'Avenida Paulista',
        numero: '1000',
        cidade: 'São Paulo',
        uf: 'SP',
      },
    })

    const lat = resultado['latitude'] as number
    const lng = resultado['longitude'] as number

    if (resultado['encontrado'] === false) {
      // Nominatim público pode não encontrar; registra mas não falha
      assert.equal(resultado['latitude'], null)
      return
    }

    assert.ok(typeof lat === 'number' && Number.isFinite(lat))
    assert.ok(lat >= BRASIL.latMin && lat <= BRASIL.latMax, `lat ${lat} fora do Brasil`)
    assert.equal(resultado['uf'], 'SP')
    assert.equal(resultado['pais'], 'BR')
  })

  test('enriquecer: retorna { encontrado: false } para endereço inexistente', async () => {
    const resultado = await adapter.enriquecer('Rua Inexistente XYZABC 99999 Brasil')

    assert.equal(resultado['encontrado'], false)
    assert.equal(resultado['latitude'], null)
    assert.equal(resultado['longitude'], null)
    assert.equal(resultado['setorCensitario'], null)
    assert.equal(resultado['fonte'], 'geocoder')
  })

  test('throttle: intervalo entre chamadas respeita NOMINATIM_THROTTLE_MS', async () => {
    const inicio = Date.now()

    await adapter.enriquecer(ENDERECO_REFERENCIA)
    await adapter.enriquecer(ENDERECO_REFERENCIA)

    const duracao = Date.now() - inicio
    assert.ok(
      duracao >= NOMINATIM_THROTTLE_MS,
      `2 chamadas devem demorar >= ${NOMINATIM_THROTTLE_MS}ms (throttle), duraram ${duracao}ms`,
    )
  })

  test('contrato: todos os campos obrigatórios presentes na resposta positiva', async () => {
    const resultado = await adapter.enriquecer(ENDERECO_REFERENCIA)

    if (resultado['encontrado'] === false) {
      assert.fail('endereço de referência deve ser encontrado pelo Nominatim')
    }

    const camposObrigatorios = [
      'endereco',
      'latitude',
      'longitude',
      'setorCensitario',
      'bairro',
      'municipio',
      'uf',
      'cep',
      'pais',
      'displayName',
      'confianca',
      'fonte',
      'enriquecidoEm',
    ]

    for (const campo of camposObrigatorios) {
      assert.ok(campo in resultado, `campo obrigatório ausente: ${campo}`)
    }
  })
})
