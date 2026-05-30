import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
  SetorCensitarioResolver,
  validarSetoresCensitariosGeoJson,
} from '../../src/services/setor-censitario.service.js'

const fixturePath = resolve('test/fixtures/setores-censitarios.geojson')
const fixtureInvalidaPath = resolve('test/fixtures/setores-invalidos.geojson')

test('setor censitario: desabilitado retorna null sem arquivo configurado', async () => {
  const resolver = new SetorCensitarioResolver()

  assert.equal(resolver.habilitado, false)
  assert.equal(await resolver.resolver(-26.3044, -48.8456), null)
})

test('setor censitario: resolve ponto dentro de Polygon por latitude/longitude', async () => {
  const resolver = new SetorCensitarioResolver({ geojsonPath: fixturePath })

  assert.equal(resolver.habilitado, true)
  assert.equal(await resolver.resolver(-26.3044, -48.8456), '420910205000001')
})

test('setor censitario: retorna null para ponto fora da malha carregada', async () => {
  const resolver = new SetorCensitarioResolver({ geojsonPath: fixturePath })

  assert.equal(await resolver.resolver(-27.0, -49.0), null)
})

test('setor censitario: respeita buracos em Polygon', async () => {
  const resolver = new SetorCensitarioResolver({ geojsonPath: fixturePath })

  assert.equal(await resolver.resolver(-26.333, -48.897), '420910205000002')
  assert.equal(await resolver.resolver(-26.33, -48.89), null)
})

test('setor censitario: resolve ponto dentro de MultiPolygon', async () => {
  const resolver = new SetorCensitarioResolver({ geojsonPath: fixturePath })

  assert.equal(await resolver.resolver(-26.30, -48.82), '420910205000003')
  assert.equal(await resolver.resolver(-26.30, -48.79), '420910205000003')
})

test('setor censitario: valida GeoJSON operacional antes de configurar no app', async () => {
  const validacao = await validarSetoresCensitariosGeoJson(fixturePath)

  assert.equal(validacao.valido, true)
  assert.equal(validacao.totalFeatures, 3)
  assert.equal(validacao.totalSetores, 3)
  assert.deepEqual(validacao.codigosDuplicados, [])
  assert.deepEqual(validacao.erros, [])
})

test('setor censitario: validação rejeita GeoJSON sem setores válidos', async () => {
  const validacao = await validarSetoresCensitariosGeoJson(fixtureInvalidaPath)

  assert.equal(validacao.valido, false)
  assert.equal(validacao.totalFeatures, 1)
  assert.equal(validacao.totalSetores, 0)
  assert.ok(validacao.erros.some((erro) => erro.includes('Nenhuma feature válida')))
})

test('setor censitario: validação reporta arquivo ausente', async () => {
  const validacao = await validarSetoresCensitariosGeoJson(
    resolve('test/fixtures/nao-existe.geojson'),
  )

  assert.equal(validacao.valido, false)
  assert.equal(validacao.totalFeatures, 0)
  assert.equal(validacao.totalSetores, 0)
  assert.ok(validacao.erros.length > 0)
})
