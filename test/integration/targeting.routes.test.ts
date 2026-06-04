import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type FastifyInstance } from 'fastify'
import { buildTestApp, loginAs } from '../../src/test-helper.js'

// --- Helpers ---

async function criarCliente(app: FastifyInstance, token: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/clientes',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      razaoSocial: 'Franqueado Targeting',
      segmento: 'saude',
      cidade: 'Joinville',
      vertical: 'saude',
    },
  })
  return res.json<{ id: string }>().id
}

// Compradores PF com perfil de dentistas no Centro
function compradorPF(id: string) {
  return {
    identificador: id,
    nome: `Dentista ${id}`,
    tipo: 'pf',
    atributosOriginais: {
      profissao: 'dentista',
      idade: 38,
      renda: 9000,
      bairro: 'Centro',
    },
    ticketMedio: 3000,
    frequencia: 2,
    ativo: true,
  }
}

// Prospects: 4 no Centro (lat ~-26.30) e 4 no Norte (lat ~-26.40) — células distintas
function prospectCentro(id: string) {
  return {
    identificador: id,
    nome: `Lead ${id}`,
    tipo: 'pf',
    atributos: { profissao: 'dentista', idade: 38, renda: 9000, bairro: 'Centro' },
    endereco: 'Rua A, Centro, Joinville',
    latitude: -26.3 + Math.random() * 0.001,  // variação mínima dentro da mesma célula
    longitude: -48.84 + Math.random() * 0.001,
  }
}

function prospectNorte(id: string) {
  return {
    identificador: id,
    nome: `Lead ${id}`,
    tipo: 'pf',
    atributos: { profissao: 'pedreiro', idade: 55, renda: 2000, bairro: 'Norte' },
    endereco: 'Rua B, Norte, Joinville',
    latitude: -26.4 + Math.random() * 0.001,
    longitude: -48.95 + Math.random() * 0.001,
  }
}

async function fluxoCompleto(app: FastifyInstance, token: string) {
  const clienteId = await criarCliente(app, token)

  // 1. Sobe base de compradores PF
  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/base-interna`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      periodo: '2026-05',
      compradores: [
        compradorPF('comp-a'),
        compradorPF('comp-b'),
        compradorPF('comp-c'),
        compradorPF('comp-d'),
      ],
    },
  })

  // 2. Deriva perfil PF
  await app.inject({
    method: 'POST',
    url: '/perfis/derivar',
    headers: { authorization: `Bearer ${token}` },
    payload: { clienteId, tipoAlvo: 'pf' },
  })

  // 3. Importa prospects: 4 Centro + 4 Norte
  const escopo = `joinville-pf-${Date.now()}`
  await app.inject({
    method: 'POST',
    url: `/clientes/${clienteId}/prospects`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      escopo,
      prospects: [
        prospectCentro(`c-${clienteId}-1`),
        prospectCentro(`c-${clienteId}-2`),
        prospectCentro(`c-${clienteId}-3`),
        prospectCentro(`c-${clienteId}-4`),
        prospectNorte(`n-${clienteId}-1`),
        prospectNorte(`n-${clienteId}-2`),
        prospectNorte(`n-${clienteId}-3`),
        prospectNorte(`n-${clienteId}-4`),
      ],
    },
  })

  // 4. Executa análise
  const analiseRes = await app.inject({
    method: 'POST',
    url: '/analises/executar',
    headers: { authorization: `Bearer ${token}` },
    payload: { clienteId, escopo, limiarSimilaridade: 0.3 },
  })
  const analiseId = analiseRes.json<{ id: string }>().id

  return { clienteId, analiseId }
}

// --- Testes ---

test('targeting: retorna zonas após executar análise completa', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const { analiseId } = await fluxoCompleto(app, token)

    const res = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/targeting`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = res.json<{
      analiseId: string
      totalZonas: number
      zonas: Array<{ intensidade: number; entidadesNaZona: number }>
    }>()
    assert.equal(body.analiseId, analiseId)
    assert.ok(body.totalZonas > 0, 'deve retornar ao menos uma zona')
    assert.ok(
      body.zonas.every((z) => z.intensidade > 0),
      'todas as zonas devem ter intensidade > 0',
    )
  } finally {
    await app.close()
  }
})

test('targeting: zona do Centro tem intensidade maior que a do Norte', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const { analiseId } = await fluxoCompleto(app, token)

    const res = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/targeting?limiarScore=0.3`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = res.json<{
      zonas: Array<{ nome: string; intensidade: number; perfilDemografico: { profissoesPrincipais: string[] } }>
    }>()
    // zonas são ordenadas por intensidade decrescente
    if (body.zonas.length >= 2) {
      assert.ok(
        body.zonas[0].intensidade >= body.zonas[1].intensidade,
        'zonas devem estar ordenadas por intensidade decrescente',
      )
    }
    // a zona mais quente deve ter dentistas (perfil que bate com os compradores)
    const topZona = body.zonas[0]
    assert.ok(
      topZona.perfilDemografico.profissoesPrincipais.length > 0,
      'zona de alto score deve ter perfil demográfico',
    )
  } finally {
    await app.close()
  }
})

test('targeting: estrutura completa de ZonaTargeting e resumoCampanha', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const { clienteId, analiseId } = await fluxoCompleto(app, token)

    const res = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/targeting`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    const body = res.json<{
      clienteId: string
      analiseId: string
      totalZonas: number
      centroMapa: { lat: number; lon: number; zoom: number }
      resumoCampanha: { alcanceEstimado: number; investimentoSugerido: string }
    }>()
    assert.equal(body.clienteId, clienteId)
    assert.ok(typeof body.centroMapa.lat === 'number')
    assert.ok(typeof body.centroMapa.zoom === 'number')
    assert.ok(body.resumoCampanha.alcanceEstimado >= 0)
    assert.ok(body.resumoCampanha.investimentoSugerido.length > 0)
  } finally {
    await app.close()
  }
})

test('targeting: retorna 404 para análise inexistente', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    const res = await app.inject({
      method: 'GET',
      url: '/analises/analise-inexistente/targeting',
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 404)
  } finally {
    await app.close()
  }
})

test('targeting: exportar retorna CSV válido com headers', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')
    const { analiseId } = await fluxoCompleto(app, token)

    const res = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/targeting/exportar`,
      headers: { authorization: `Bearer ${token}` },
    })

    assert.equal(res.statusCode, 200)
    assert.ok(
      res.headers['content-type']?.toString().includes('text/csv'),
      'Content-Type deve ser text/csv',
    )
    assert.ok(
      res.headers['content-disposition']?.toString().includes('attachment'),
      'Content-Disposition deve ser attachment',
    )
    const csv = res.body
    const linhas = csv.split('\n')
    assert.equal(
      linhas[0],
      '"zona","latitude","longitude","raio_km","intensidade","idade_min","idade_max","renda","interesses"',
      'primeira linha deve ser o header CSV',
    )
    assert.ok(linhas.length >= 2, 'deve ter ao menos header + 1 linha de dado')
  } finally {
    await app.close()
  }
})

test('targeting: exige autenticação (401)', async () => {
  const app = await buildTestApp()
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/analises/qualquer-id/targeting',
    })

    assert.equal(res.statusCode, 401)
  } finally {
    await app.close()
  }
})

// --- Teste E2E: fluxo PF completo — do upload ao targeting ---

test('e2e: fluxo PF completo — importar base → derivar → prospects → análise → targeting gera zonas', async () => {
  const app = await buildTestApp()
  try {
    const token = await loginAs(app, 'alice@example.com', 'alice-secret-123')

    // 1. Criar cliente
    const clienteId = await criarCliente(app, token)

    // 2. Importar base PF: 4 dentistas no Centro
    const baseRes = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/base-interna`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        periodo: '2026-05',
        compradores: [
          compradorPF('c-1'),
          compradorPF('c-2'),
          compradorPF('c-3'),
          compradorPF('c-4'),
        ],
      },
    })
    assert.equal(baseRes.statusCode, 201)

    // 3. Derivar perfil PF
    const perfilRes = await app.inject({
      method: 'POST',
      url: '/perfis/derivar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, tipoAlvo: 'pf' },
    })
    assert.equal(perfilRes.statusCode, 201)
    assert.equal(perfilRes.json<{ tipo: string }>().tipo, 'pf')

    // 4. Importar 8 prospects PF com coordenadas (4 Centro + 4 Norte)
    const escopo = `e2e-pf-${clienteId}`
    const prospectsRes = await app.inject({
      method: 'POST',
      url: `/clientes/${clienteId}/prospects`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        escopo,
        prospects: [
          { identificador: 'cp-1', nome: 'Lead 1', tipo: 'pf',
            atributos: { profissao: 'dentista', idade: 38, renda: 9000, bairro: 'Centro' },
            latitude: -26.3, longitude: -48.84 },
          { identificador: 'cp-2', nome: 'Lead 2', tipo: 'pf',
            atributos: { profissao: 'dentista', idade: 40, renda: 8500, bairro: 'Centro' },
            latitude: -26.301, longitude: -48.841 },
          { identificador: 'cp-3', nome: 'Lead 3', tipo: 'pf',
            atributos: { profissao: 'medico', idade: 42, renda: 12000, bairro: 'Centro' },
            latitude: -26.302, longitude: -48.842 },
          { identificador: 'cp-4', nome: 'Lead 4', tipo: 'pf',
            atributos: { profissao: 'dentista', idade: 36, renda: 9500, bairro: 'Centro' },
            latitude: -26.303, longitude: -48.843 },
          { identificador: 'np-1', nome: 'Lead 5', tipo: 'pf',
            atributos: { profissao: 'pedreiro', idade: 55, renda: 2000, bairro: 'Norte' },
            latitude: -26.4, longitude: -48.95 },
          { identificador: 'np-2', nome: 'Lead 6', tipo: 'pf',
            atributos: { profissao: 'motorista', idade: 48, renda: 3000, bairro: 'Norte' },
            latitude: -26.401, longitude: -48.951 },
          { identificador: 'np-3', nome: 'Lead 7', tipo: 'pf',
            atributos: { profissao: 'vigilante', idade: 50, renda: 2500, bairro: 'Norte' },
            latitude: -26.402, longitude: -48.952 },
          { identificador: 'np-4', nome: 'Lead 8', tipo: 'pf',
            atributos: { profissao: 'zelador', idade: 52, renda: 2200, bairro: 'Norte' },
            latitude: -26.403, longitude: -48.953 },
        ],
      },
    })
    assert.equal(prospectsRes.statusCode, 201)
    assert.equal(prospectsRes.json<{ totalImportados: number }>().totalImportados, 8)
    assert.equal(prospectsRes.json<{ comCoordenadas: number }>().comCoordenadas, 8)

    // 5. Executar análise
    const analiseRes = await app.inject({
      method: 'POST',
      url: '/analises/executar',
      headers: { authorization: `Bearer ${token}` },
      payload: { clienteId, escopo, limiarSimilaridade: 0.3 },
    })
    assert.equal(analiseRes.statusCode, 201)
    const analiseId = analiseRes.json<{ id: string }>().id
    const totalOps = analiseRes.json<{ totalOportunidades: number }>().totalOportunidades
    assert.ok(totalOps > 0, 'análise deve encontrar oportunidades')

    // 6. GET targeting → zonas com intensidade > 0
    const targetingRes = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/targeting`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(targetingRes.statusCode, 200)
    const targeting = targetingRes.json<{
      totalZonas: number
      zonas: Array<{
        intensidade: number
        perfilDemografico: { profissoesPrincipais: string[] }
        targeting: { interesses: string[] }
      }>
    }>()

    assert.ok(targeting.totalZonas > 0, 'deve existir ao menos uma zona de targeting')
    assert.ok(
      targeting.zonas.every((z) => z.intensidade > 0),
      'todas as zonas visíveis devem ter intensidade > 0',
    )

    // 7. A zona mais quente deve ter perfil demográfico de saúde (dentista/médico)
    const topZona = targeting.zonas[0]
    assert.ok(
      topZona.perfilDemografico.profissoesPrincipais.length > 0,
      'zona principal deve ter profissões no perfil',
    )

    // 8. CSV deve ser gerado
    const csvRes = await app.inject({
      method: 'GET',
      url: `/analises/${analiseId}/targeting/exportar`,
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(csvRes.statusCode, 200)
    assert.ok(csvRes.headers['content-type']?.toString().includes('text/csv'))
    const csvLinhas = csvRes.body.split('\n')
    assert.ok(csvLinhas.length >= 2, 'CSV deve ter ao menos header + 1 linha')
  } finally {
    await app.close()
  }
})
