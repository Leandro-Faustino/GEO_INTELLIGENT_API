import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AdaptadorCNPJ } from '../../src/adapters/cnpj.adapter.js'

const fetchOriginal = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

describe('AdaptadorCNPJ', () => {
  test('modo mock retorna entidades do piloto sem URL', async () => {
    const adapter = new AdaptadorCNPJ()

    const entidades = await adapter.consultar({
      cnaes: ['5510801'],
      municipio: 'Joinville',
    })

    assert.ok(entidades.length > 0)
    for (const entidade of entidades) {
      const atributos = entidade['atributos'] as Record<string, unknown>
      assert.equal(atributos['cnae'], '5510801')
    }
  })

  test('filtra por município no mock', async () => {
    const adapter = new AdaptadorCNPJ()

    const joinville = await adapter.consultar({ cnaes: [], municipio: 'Joinville' })
    const floripa = await adapter.consultar({ cnaes: [], municipio: 'Florianopolis' })

    assert.notDeepEqual(
      joinville.map((entidade) => entidade['identificador']),
      floripa.map((entidade) => entidade['identificador']),
    )
  })

  test('CNAE inexistente retorna vazio no mock', async () => {
    const adapter = new AdaptadorCNPJ()

    const entidades = await adapter.consultar({
      cnaes: ['0000000'],
      municipio: 'Joinville',
    })

    assert.equal(entidades.length, 0)
  })

  test('entidades mock têm formato EntidadeAlvo esperado', async () => {
    const adapter = new AdaptadorCNPJ()

    const [entidade] = await adapter.consultar({
      cnaes: ['5510801'],
      municipio: 'Joinville',
    })

    assert.ok(entidade?.['identificador'])
    assert.ok(entidade?.['nome'])
    assert.equal(entidade?.['fonte'], 'cnpj-receita-federal')
    assert.ok('latitude' in entidade!)
    assert.ok('longitude' in entidade!)
    assert.ok('atributos' in entidade!)
  })
})

describe('AdaptadorCNPJ com API externa', () => {
  test('chama API configurada e normaliza resposta', async () => {
    let chamadaUrl = ''
    let ultimoPayload: Record<string, unknown> | null = null
    let authorization: string | undefined

    globalThis.fetch = async (input, init) => {
      chamadaUrl = String(input)
      authorization = new Headers(init?.headers).get('authorization') ?? undefined
      ultimoPayload = JSON.parse(String(init?.body)) as Record<string, unknown>

      return new Response(
        JSON.stringify({
          empresas: [
            {
              cnpj: '12345678000190',
              razao_social: 'Hotel API Real',
              cnae_principal: '5510801',
              porte: 3,
              idade_anos: 8,
              municipio: 'Joinville',
              logradouro: 'Rua API, 10',
              latitude: -26.3,
              longitude: -48.8,
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    const adapter = new AdaptadorCNPJ({
      apiUrl: 'https://cnpj.example.test',
      apiKey: 'test-api-key',
    })

    const entidades = await adapter.consultar({
      cnaes: ['5510801'],
      municipio: 'Joinville',
      limit: 10,
    })

    assert.equal(chamadaUrl, 'https://cnpj.example.test/empresas')
    assert.deepEqual(ultimoPayload, {
      cnaes: ['5510801'],
      municipio: 'Joinville',
      limit: 10,
    })
    assert.equal(authorization, 'Bearer test-api-key')
    assert.equal(entidades.length, 1)
    assert.equal(entidades[0]?.['identificador'], '12345678000190')
    assert.equal(entidades[0]?.['nome'], 'Hotel API Real')
    assert.equal(entidades[0]?.['fonte'], 'cnpj-receita-federal')
    assert.deepEqual(entidades[0]?.['atributos'], {
      cnae: '5510801',
      porte: 3,
      idadeAnos: 8,
      municipio: 'Joinville',
    })
  })
})
