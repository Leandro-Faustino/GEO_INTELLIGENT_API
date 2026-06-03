import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

const fetchOriginal = globalThis.fetch
const setoresFixturePath = resolve('test/fixtures/setores-censitarios.geojson')

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

test('perfis: deriva perfil a partir da base interna', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)
    const res = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })

    assert.equal(res.statusCode, 201)
    assert.equal(res.json<{ tipo: string }>().tipo, 'pj')
    assert.ok(res.json<{ criterios: unknown[] }>().criterios.length >= 4)
  } finally {
    await app.close()
  }
})

test('perfis: lista por cliente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)
    const res = await app.inject({
      method: 'GET',
      url: `/perfis?clienteId=${clienteId}`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.json<unknown[]>(), [])
  } finally {
    await app.close()
  }
})

test('perfis: enriquece perfil e persiste nova versão', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['ibge-censo', 'geocoder'] },
    })

    const body = res.json<{
      perfilOriginal: { totalFatores: number }
      perfilEnriquecido: { totalFatores: number }
      fontesConsultadas: string[]
    }>()

    assert.equal(res.statusCode, 200)
    assert.ok(body.perfilEnriquecido.totalFatores > body.perfilOriginal.totalFatores)
    assert.deepEqual(body.fontesConsultadas.sort(), ['geocoder', 'ibge-censo'])

    const perfis = await app.perfilRepo.buscarPorCliente(clienteId)
    assert.equal(perfis.length, 1)
    assert.equal(perfis[0]?.criterios.length, body.perfilEnriquecido.totalFatores)
  } finally {
    await app.close()
  }
})

test('perfis: persiste e expõe auditoria dos enriquecimentos por comprador', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)

    const enriquecer = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['ibge-censo', 'geocoder'] },
    })
    assert.equal(enriquecer.statusCode, 200)

    const listar = await app.inject({
      method: 'GET',
      url: `/enriquecimentos/compradores?clienteId=${clienteId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    const todos = listar.json<
      Array<{
        compradorIdentificador: string
        compradorNome: string
        fonte: string
        status: string
        payload: Record<string, unknown>
        erro: string
        createdAt: string
        expiresAt: string | null
      }>
    >()

    assert.equal(listar.statusCode, 200)
    assert.equal(todos.length, 8)
    assert.ok(todos.every((item) => item.status === 'sucesso'))
    assert.ok(todos.every((item) => item.erro === ''))
    assert.ok(todos.every((item) => item.createdAt))
    assert.ok(todos.every((item) => item.expiresAt))
    assert.ok(todos.some((item) => item.fonte === 'ibge-censo' && 'populacao' in item.payload))
    assert.ok(todos.some((item) => item.fonte === 'geocoder' && 'latitude' in item.payload))

    const porFonte = await app.inject({
      method: 'GET',
      url: `/enriquecimentos/compradores?clienteId=${clienteId}&fonte=ibge-censo`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(porFonte.statusCode, 200)
    assert.equal(porFonte.json<unknown[]>().length, 4)

    const porComprador = await app.inject({
      method: 'GET',
      url: `/enriquecimentos/compradores?clienteId=${clienteId}&compradorIdentificador=hotel-bela-vista`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(porComprador.statusCode, 200)
    assert.equal(porComprador.json<unknown[]>().length, 2)
  } finally {
    await app.close()
  }
})

test('perfis: enriquece via IBGE real usando cidade/UF quando identificador é CNPJ', async () => {
  const chamadasIbge: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    chamadasIbge.push(url)

    if (url.endsWith('/v1/localidades/estados/SC/municipios')) {
      return jsonResponse([municipioIbgeFixture(4209102, 'Joinville', 'SC')])
    }

    if (url.includes('/v3/agregados/6579/')) {
      return jsonResponse(agregadoIbgeFixture('2024', '616317'))
    }

    if (url.includes('/v3/agregados/5938/')) {
      return jsonResponse(agregadoIbgeFixture('2022', '49815877'))
    }

    return jsonResponse({}, 404)
  }

  const app = await buildTestApp({ IBGE_BASE_URL: 'https://ibge.test/api' })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBaseCnpjCidade(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['ibge-censo'] },
    })
    const body = res.json<{
      novosFatores: Array<{ atributo: string }>
      fontesConsultadas: string[]
      fontesComFalha: string[]
    }>()

    assert.equal(res.statusCode, 200)
    assert.deepEqual(body.fontesConsultadas, ['ibge-censo'])
    assert.deepEqual(body.fontesComFalha, [])
    assert.ok(body.novosFatores.some((fator) => fator.atributo === 'populacao'))
    assert.ok(
      body.novosFatores.some(
        (fator) => fator.atributo === 'pibPerCapitaEstimado',
      ),
    )
    assert.equal(
      chamadasIbge.some((url) => url.endsWith('/v1/localidades/municipios/1234567')),
      false,
    )
  } finally {
    await app.close()
  }
})

test('perfis: usa geocoder real antes do IBGE para CNPJ com endereco', async () => {
  const chamadas: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    chamadas.push(url)

    if (url.startsWith('https://nominatim.test/search')) {
      return jsonResponse([
        {
          lat: '-26.3044',
          lon: '-48.8456',
          importance: 0.62,
          address: {
            suburb: 'Centro',
            city: 'Joinville',
            state: 'Santa Catarina',
            country_code: 'br',
          },
        },
      ])
    }

    if (url.endsWith('/v1/localidades/estados/SC/municipios')) {
      return jsonResponse([municipioIbgeFixture(4209102, 'Joinville', 'SC')])
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
    NOMINATIM_BASE_URL: 'https://nominatim.test',
    NOMINATIM_USER_AGENT: 'GeoLeadTest/1.0 (dev@example.com)',
    NOMINATIM_THROTTLE_MS: '0',
    GEOCODER_PROVIDER_MODE: 'nominatim-selfhosted',
    SETORES_CENSITARIOS_GEOJSON_PATH: setoresFixturePath,
  })
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBaseCnpjEndereco(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['geocoder', 'ibge-censo'] },
    })
    const body = res.json<{
      novosFatores: Array<{ atributo: string }>
      fontesConsultadas: string[]
      fontesComFalha: string[]
    }>()

    const primeiraGeocoder = chamadas.findIndex((url) =>
      url.startsWith('https://nominatim.test'),
    )
    const primeiraIbge = chamadas.findIndex((url) => url.startsWith('https://ibge.test'))

    assert.equal(res.statusCode, 200)
    assert.deepEqual(body.fontesConsultadas.sort(), ['geocoder', 'ibge-censo'])
    assert.deepEqual(body.fontesComFalha, [])
    assert.ok(primeiraGeocoder >= 0)
    assert.ok(primeiraIbge > primeiraGeocoder)
    assert.ok(body.novosFatores.some((fator) => fator.atributo === 'latitude'))
    assert.ok(body.novosFatores.some((fator) => fator.atributo === 'longitude'))
    assert.ok(body.novosFatores.some((fator) => fator.atributo === 'setorCensitario'))
    assert.ok(body.novosFatores.some((fator) => fator.atributo === 'populacao'))
    assert.ok(
      body.novosFatores.some(
        (fator) => fator.atributo === 'pibPerCapitaEstimado',
      ),
    )
  } finally {
    await app.close()
  }
})

test('perfis: base mista — derivar pj usa só compradores pj, derivar pf usa só compradores pf', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const cliente = await app.inject({
      method: 'POST',
      url: '/clientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { razaoSocial: 'Cliente Misto', segmento: 'varejo', cidade: 'São Paulo', vertical: 'saude' },
    })
    const clienteId = cliente.json<{ id: string }>().id

    await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          // 4 PJ com atributo cnae
          { identificador: '11222333000181', nome: 'Empresa A', tipo: 'pj', atributosOriginais: { cnae: '4771701', porte: 'medio' }, ticketMedio: 1000, frequencia: 3, ativo: true },
          { identificador: '22333444000172', nome: 'Empresa B', tipo: 'pj', atributosOriginais: { cnae: '4771701', porte: 'medio' }, ticketMedio: 1200, frequencia: 2, ativo: true },
          { identificador: '33444555000163', nome: 'Empresa C', tipo: 'pj', atributosOriginais: { cnae: '4771701', porte: 'pequeno' }, ticketMedio: 800, frequencia: 4, ativo: true },
          { identificador: '44555666000154', nome: 'Empresa D', tipo: 'pj', atributosOriginais: { cnae: '4771701', porte: 'medio' }, ticketMedio: 950, frequencia: 2, ativo: true },
          // 4 PF com atributo faixaRenda
          { identificador: '111.222.333-44', nome: 'Ana Silva', tipo: 'pf', atributosOriginais: { faixaRenda: 'B', cidade: 'São Paulo' }, ticketMedio: 200, frequencia: 5, ativo: true },
          { identificador: '222.333.444-55', nome: 'Bruno Costa', tipo: 'pf', atributosOriginais: { faixaRenda: 'B', cidade: 'São Paulo' }, ticketMedio: 180, frequencia: 3, ativo: true },
          { identificador: '333.444.555-66', nome: 'Carla Lima', tipo: 'pf', atributosOriginais: { faixaRenda: 'C', cidade: 'São Paulo' }, ticketMedio: 150, frequencia: 2, ativo: true },
          { identificador: '444.555.666-77', nome: 'Diego Melo', tipo: 'pf', atributosOriginais: { faixaRenda: 'B', cidade: 'São Paulo' }, ticketMedio: 220, frequencia: 4, ativo: true },
        ],
      },
    })

    const resPJ = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })
    const perfilPJ = resPJ.json<{ tipo: string; criterios: Array<{ nome: string }> }>()
    assert.equal(resPJ.statusCode, 201)
    assert.equal(perfilPJ.tipo, 'pj')
    // Perfil PJ deve ter critérios de PJ (cnae, porte) mas NÃO atributos de PF
    assert.ok(perfilPJ.criterios.some((c) => c.nome === 'cnae'), 'cnae deve estar nos critérios PJ')
    assert.ok(!perfilPJ.criterios.some((c) => c.nome === 'faixaRenda'), 'faixaRenda não deve vazar para perfil PJ')

    const resPF = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pf' },
    })
    const perfilPF = resPF.json<{ tipo: string; criterios: Array<{ nome: string }> }>()
    assert.equal(resPF.statusCode, 201)
    assert.equal(perfilPF.tipo, 'pf')
    // Perfil PF deve ter critérios de PF (faixaRenda, cidade) mas NÃO atributos de PJ
    assert.ok(perfilPF.criterios.some((c) => c.nome === 'faixaRenda'), 'faixaRenda deve estar nos critérios PF')
    assert.ok(!perfilPF.criterios.some((c) => c.nome === 'cnae'), 'cnae não deve vazar para perfil PF')
  } finally {
    await app.close()
  }
})

test('perfis: enriquecer com fonte inválida retorna 422', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBase(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['fonte-inexistente'] },
    })

    assert.equal(res.statusCode, 422)
  } finally {
    await app.close()
  }
})

test('perfis: enriquecer base PF reporta cnpj-receita-federal em fontesComFalha sem contaminar perfil', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const clienteId = await criarClienteComBaseCPF(app, token)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, fontes: ['cnpj-receita-federal'] },
    })

    const body = res.json<{
      perfilOriginal: { totalFatores: number }
      perfilEnriquecido: { totalFatores: number }
      fontesConsultadas: string[]
      fontesComFalha: string[]
    }>()

    assert.equal(res.statusCode, 200)
    assert.ok(body.fontesConsultadas.includes('cnpj-receita-federal'))
    assert.ok(body.fontesComFalha.includes('cnpj-receita-federal'), 'CPF deve aparecer em fontesComFalha')
    // Perfil não deve ter mais critérios do que o original (nenhum dado PJ falso mesclado)
    assert.equal(body.perfilEnriquecido.totalFatores, body.perfilOriginal.totalFatores)
  } finally {
    await app.close()
  }
})

test('perfis: outro usuário não enriquece cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await criarClienteComBase(app, aliceToken)

    const res = await app.inject({
      method: 'POST',
      url: '/perfis/enriquecer',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { clienteId, fontes: ['ibge-censo'] },
    })

    assert.equal(res.statusCode, 403)
  } finally {
    await app.close()
  }
})

test('perfis: outro usuário não deriva, lista nem consulta perfis de cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await criarClienteComBase(app, aliceToken)

    const derivarAlice = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })
    const perfilId = derivarAlice.json<{ id: string }>().id

    const derivarBob = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${bobToken}` },
      payload: { clienteId, tipoAlvo: 'pj' },
    })
    assert.equal(derivarBob.statusCode, 403)

    const listarBob = await app.inject({
      method: 'GET',
      url: `/perfis?clienteId=${clienteId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    assert.equal(listarBob.statusCode, 403)

    const buscarBob = await app.inject({
      method: 'GET',
      url: `/perfis/${perfilId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    })
    assert.equal(buscarBob.statusCode, 403)
  } finally {
    await app.close()
  }
})

test('perfis: outro usuário não lista auditoria de enriquecimento de cliente alheio', async () => {
  const app = await buildTestApp()
  try {
    const aliceToken = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const bobToken = await loginAs(app, 'bob@example.com', 'bob-secret-456')
    const clienteId = await criarClienteComBase(app, aliceToken)

    const res = await app.inject({
      method: 'GET',
      url: `/enriquecimentos/compradores?clienteId=${clienteId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    })

    assert.equal(res.statusCode, 403)
  } finally {
    await app.close()
  }
})

async function criarClienteComBase(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Perfil',
      segmento: 'hotelaria',
      cidade: 'São Paulo',
      vertical: 'turismo',
    },
  })
  const clienteId = cliente.json<{ id: string }>().id

  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/base-interna`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      periodo: '2026-05',
      compradores: [
        comprador('hotel-bela-vista', 'Hotel Bela Vista', 'medio', 1200),
        comprador('hotel-a', 'Hotel A', 'medio', 1100),
        comprador('hotel-b', 'Hotel B', 'pequeno', 900),
        comprador('hotel-c', 'Hotel C', 'medio', 1300),
      ],
    },
  })

  return clienteId
}

async function criarClienteComBaseCnpjCidade(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Perfil IBGE',
      segmento: 'hotelaria',
      cidade: 'Joinville',
      vertical: 'turismo',
    },
  })
  const clienteId = cliente.json<{ id: string }>().id

  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/base-interna`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      periodo: '2026-05',
      compradores: [
        compradorComCidade('12345678000190', 'Hotel Bela Vista', 1200),
        compradorComCidade('22345678000190', 'Hotel A', 1100),
        compradorComCidade('32345678000190', 'Hotel B', 900),
        compradorComCidade('42345678000190', 'Hotel C', 1300),
      ],
    },
  })

  return clienteId
}

async function criarClienteComBaseCnpjEndereco(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Perfil Geocoder',
      segmento: 'hotelaria',
      cidade: 'Joinville',
      vertical: 'turismo',
    },
  })
  const clienteId = cliente.json<{ id: string }>().id

  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/base-interna`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      periodo: '2026-05',
      compradores: [
        compradorComEndereco('12345678000190', 'Hotel Bela Vista', 1200),
        compradorComEndereco('22345678000190', 'Hotel A', 1100),
        compradorComEndereco('32345678000190', 'Hotel B', 900),
      ],
    },
  })

  return clienteId
}

async function criarClienteComBaseCPF(
  app: FastifyInstance,
  token: string,
): Promise<string> {
  const cliente = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Cliente Base PF',
      segmento: 'academia',
      cidade: 'São Paulo',
      vertical: 'fitness',
    },
  })
  const clienteId = cliente.json<{ id: string }>().id

  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/base-interna`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      periodo: '2026-05',
      compradores: [
        compradorCPF('234.567.890-12', 'Ana Costa', 800),
        compradorCPF('345.678.901-23', 'Bruno Lima', 600),
        compradorCPF('456.789.012-34', 'Carla Melo', 750),
        compradorCPF('567.890.123-45', 'Diego Silva', 700),
      ],
    },
  })

  return clienteId
}

function compradorCPF(identificador: string, nome: string, ticketMedio: number) {
  return {
    identificador,
    nome,
    tipo: 'pf',
    atributosOriginais: { cidade: 'São Paulo', uf: 'SP' },
    ticketMedio,
    frequencia: 3,
    ativo: true,
  }
}

function comprador(
  identificador: string,
  nome: string,
  porte: string,
  ticketMedio: number,
) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: {
      cnae: '5510-8/01',
      porte,
      cidade: 'São Paulo',
    },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}

function compradorComCidade(
  identificador: string,
  nome: string,
  ticketMedio: number,
) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: {
      cnae: '5510-8/01',
      cidade: 'Joinville',
      uf: 'SC',
    },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}

function compradorComEndereco(
  identificador: string,
  nome: string,
  ticketMedio: number,
) {
  return {
    identificador,
    nome,
    tipo: 'pj',
    atributosOriginais: {
      cnae: '5510-8/01',
      logradouro: 'Rua das Palmeiras',
      numero: '120',
      bairro: 'Centro',
    },
    ticketMedio,
    frequencia: 2,
    ativo: true,
  }
}

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
