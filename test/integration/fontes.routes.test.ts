import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

test('fontes: lista adapters protegidos por JWT', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const res = await app.inject({
      method: 'GET',
      url: '/fontes',
      headers: { authorization: `Bearer ${token}` },
    })

    const body = res.json<Array<{ nome: string; circuitState: string }>>()

    assert.equal(res.statusCode, 200)
    assert.deepEqual(
      body.map((fonte) => fonte.nome).sort(),
      ['cnpj-receita-federal', 'geocoder', 'ibge-censo', 'registro-imoveis'].sort(),
    )
    assert.ok(body.every((fonte) => fonte.circuitState === 'CLOSED'))
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
    assert.ok(body.total >= 1)
    assert.ok(Array.isArray(body.resultados))
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

    const body = res.json<{ latitude: number; longitude: number }>()

    assert.equal(res.statusCode, 200)
    assert.equal(typeof body.latitude, 'number')
    assert.equal(typeof body.longitude, 'number')
  } finally {
    await app.close()
  }
})
