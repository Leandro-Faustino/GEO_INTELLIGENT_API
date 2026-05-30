import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
  IdhMunicipalService,
  validarIdhMunicipalDataset,
} from '../../src/services/idh-municipal.service.js'

const fixturePath = resolve('test/fixtures/idh-municipal.json')
const fixtureInvalidaPath = resolve('test/fixtures/idh-municipal-invalido.json')

test('idh municipal: desabilitado retorna null sem dataset configurado', async () => {
  const service = new IdhMunicipalService()

  assert.equal(service.habilitado, false)
  assert.equal(await service.buscarPorCodigoIbge(4209102), null)
})

test('idh municipal: busca por codigo IBGE em dataset local', async () => {
  const service = new IdhMunicipalService({ datasetPath: fixturePath })

  const registro = await service.buscarPorCodigoIbge(4209102)

  assert.equal(service.habilitado, true)
  assert.equal(registro?.codigoIbge, 4209102)
  assert.equal(registro?.municipio, 'Joinville')
  assert.equal(registro?.uf, 'SC')
  assert.equal(registro?.idh, 0.809)
  assert.equal(registro?.ano, 2010)
})

test('idh municipal: retorna null para municipio ausente no dataset', async () => {
  const service = new IdhMunicipalService({ datasetPath: fixturePath })

  assert.equal(await service.buscarPorCodigoIbge(9999999), null)
})

test('idh municipal: valida dataset operacional válido', async () => {
  const validacao = await validarIdhMunicipalDataset(fixturePath)

  assert.equal(validacao.valido, true)
  assert.equal(validacao.totalRegistros, 2)
  assert.deepEqual(validacao.codigosDuplicados, [])
  assert.deepEqual(validacao.erros, [])
})

test('idh municipal: validação rejeita IDH fora do intervalo e duplicidade', async () => {
  const validacao = await validarIdhMunicipalDataset(fixtureInvalidaPath)

  assert.equal(validacao.valido, false)
  assert.equal(validacao.totalRegistros, 2)
  assert.deepEqual(validacao.codigosDuplicados, [4209102])
  assert.ok(validacao.erros.some((erro) => erro.includes('idh deve estar entre 0 e 1')))
  assert.ok(validacao.erros.some((erro) => erro.includes('municipio é obrigatório')))
  assert.ok(validacao.erros.some((erro) => erro.includes('uf deve ter 2 letras')))
})
