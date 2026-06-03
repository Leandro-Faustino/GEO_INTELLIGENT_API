import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AdaptadorCNPJ } from '../../src/adapters/cnpj.adapter.js'

const CNPJ_14 = '12345678000190'

// ─── payloads de fixture ─────────────────────────────────────────────────────

// Fixture espelha a estrutura real da BrasilAPI (validada contra a API pública)
const brasilApiFixture = {
  cnpj: CNPJ_14,
  razao_social: 'HOTEL EXEMPLO LTDA',
  nome_fantasia: 'Hotel Exemplo',
  descricao_situacao_cadastral: 'ATIVA',
  data_inicio_atividade: '2015-06-01',
  natureza_juridica: 'Sociedade Empresária Limitada', // string, não só código
  codigo_natureza_juridica: 2062,                     // código numérico como fallback
  cnae_fiscal: 5510801,                               // int sem leading zero
  cnae_fiscal_descricao: 'Hotéis',
  cnaes_secundarios: [{ codigo: 5590601, descricao: 'Albergues' }],
  descricao_tipo_de_logradouro: 'Rua',               // "de" no nome do campo (campo real)
  logradouro: 'DAS FLORES',
  numero: '100',
  complemento: 'Sala 1',
  bairro: 'CENTRO',
  municipio: 'JOINVILLE',
  uf: 'SC',
  cep: '89200000',
  capital_social: 150000,                             // número (não string)
  porte: 'DEMAIS',                                    // string descritiva
  opcao_pelo_simples: false,
  opcao_pelo_mei: false,
  qsa: [{ nome_socio: 'JOAO DA SILVA', qualificacao_socio: 'Sócio-Administrador' }],
  ddd_telefone_1: '4733334444',                       // DDD+número concatenados (campo real)
}

// Fixture espelha a estrutura real da ReceitaWS (validada contra a API pública)
const receitaWsFixture = {
  cnpj: '12.345.678/0001-90',                        // ReceitaWS devolve CNPJ formatado com máscara
  nome: 'HOTEL EXEMPLO LTDA',
  fantasia: 'Hotel Exemplo',
  situacao: 'ATIVA',
  abertura: '01/06/2015',                             // formato dd/mm/yyyy (RF)
  natureza_juridica: '206-2 - Sociedade Empresária Limitada', // string completa com código
  atividade_principal: [{ code: '55.10-8-01', text: 'Hotéis' }],
  atividades_secundarias: [{ code: '55.90-6-01', text: 'Albergues' }],
  logradouro: 'RUA DAS FLORES',                       // já inclui tipo de logradouro
  numero: '100',
  complemento: 'SALA 1',
  bairro: 'CENTRO',
  municipio: 'JOINVILLE',
  uf: 'SC',
  cep: '89.200-000',                                  // CEP formatado (pontuação será removida)
  capital_social: '150.000,00',                       // formato BRL com vírgula decimal
  porte: 'DEMAIS',
  email: 'contato@hotelexemplo.com.br',
  telefone: '(47) 3333-4444',                         // formato pronto
  qsa: [{ nome: 'JOAO DA SILVA', qual: 'Sócio-Administrador' }],
  simples: { optante: false },                        // NÃO é opcao_pelo_simples booleano
  simei: { optante: false },                          // NÃO é opcao_pelo_mei booleano
  status: 'OK',
}

// ─── helpers de mock de fetch ────────────────────────────────────────────────

const fetchOriginal = globalThis.fetch

afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function mockFetch(
  handlers: Record<string, object | null>,
  status = 200,
): void {
  globalThis.fetch = async (input) => {
    const url = String(input)
    for (const [key, body] of Object.entries(handlers)) {
      if (url.includes(key)) {
        if (body === null) {
          return new Response(null, { status: 500 })
        }
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    return new Response('not found', { status: 404 })
  }
}

// ─── testes de consultar (busca em massa) ────────────────────────────────────

describe('AdaptadorCNPJ - consultar (mock)', () => {
  test('modo mock retorna entidades do piloto sem URL', async () => {
    const adapter = new AdaptadorCNPJ()
    assert.equal(adapter.modo, 'mock')

    const entidades = await adapter.consultar({ cnaes: ['5510801'], municipio: 'Joinville' })

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
      joinville.map((e) => e['identificador']),
      floripa.map((e) => e['identificador']),
    )
  })

  test('CNAE inexistente retorna vazio no mock', async () => {
    const adapter = new AdaptadorCNPJ()
    const entidades = await adapter.consultar({ cnaes: ['0000000'], municipio: 'Joinville' })
    assert.equal(entidades.length, 0)
  })

  test('entidades mock têm formato EntidadeAlvo esperado', async () => {
    const adapter = new AdaptadorCNPJ()
    const [entidade] = await adapter.consultar({ cnaes: ['5510801'], municipio: 'Joinville' })

    assert.ok(entidade?.['identificador'])
    assert.ok(entidade?.['nome'])
    assert.equal(entidade?.['fonte'], 'cnpj-receita-federal')
    assert.ok('latitude' in entidade!)
    assert.ok('longitude' in entidade!)
    assert.ok('atributos' in entidade!)
  })
})

describe('AdaptadorCNPJ - consultar (API custom)', () => {
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
              cnpj: CNPJ_14,
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
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    const adapter = new AdaptadorCNPJ({
      apiUrl: 'https://cnpj.example.test',
      apiKey: 'test-api-key',
    })

    assert.equal(adapter.modo, 'hibrido')

    const entidades = await adapter.consultar({
      cnaes: ['5510801'],
      municipio: 'Joinville',
      limit: 10,
    })

    assert.equal(chamadaUrl, 'https://cnpj.example.test/empresas')
    assert.deepEqual(ultimoPayload, { cnaes: ['5510801'], municipio: 'Joinville', limit: 10 })
    assert.equal(authorization, 'Bearer test-api-key')
    assert.equal(entidades.length, 1)
    assert.equal(entidades[0]?.['identificador'], CNPJ_14)
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

// ─── testes de enriquecer ────────────────────────────────────────────────────

describe('AdaptadorCNPJ - enriquecer (mock)', () => {
  test('identificador não CNPJ cai em mock sem chamar API', async () => {
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })

    const result = await adapter.enriquecer('cnpj-001')

    assert.equal(chamadas, 0)
    assert.equal(result['identificador'], 'cnpj-001')
    assert.deepEqual(result['fontes'], [])
    assert.equal(result['fonte'], 'cnpj-receita-federal')
  })
})

describe('AdaptadorCNPJ - enriquecer (ReceitaWS + BrasilAPI combinados)', () => {
  test('combina RF + BrasilAPI em um único registro mesclado', async () => {
    mockFetch({
      'receitaws': receitaWsFixture,
      'brasilapi': brasilApiFixture,
    })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })

    assert.equal(adapter.modo, 'hibrido')

    const result = await adapter.enriquecer(CNPJ_14)

    assert.equal(result['identificador'], CNPJ_14)
    assert.equal(result['razaoSocial'], 'HOTEL EXEMPLO LTDA')
    assert.equal(result['situacao'], 'ATIVA')
    // data de abertura convertida do formato RF dd/mm/yyyy → ISO
    assert.equal(result['dataAbertura'], '2015-06-01')
    // natureza jurídica vem da RF (string completa)
    assert.equal(result['naturezaJuridica'], '206-2 - Sociedade Empresária Limitada')
    // capital social convertido do BRL
    assert.equal(result['capitalSocial'], 150_000)
    // email e telefone só existem na RF
    assert.equal(result['email'], 'contato@hotelexemplo.com.br')
    assert.equal(result['telefone'], '(47) 3333-4444')
    // CNAE principal: código limpo (sem pontuação)
    assert.equal(result['cnaePrincipal'], '5510801')
    // sócios presentes
    const socios = result['socios'] as Array<{ nome: string }>
    assert.ok(socios.length > 0)
    assert.ok(socios.some((s) => s.nome === 'JOAO DA SILVA'))
    // fontes listam as duas
    const fontes = result['fontes'] as string[]
    assert.ok(fontes.includes('receitaws'))
    assert.ok(fontes.includes('brasilapi'))
    assert.equal(result['fonte'], 'cnpj-receita-federal')
  })

  test('modo real quando apiUrl + brasilApiUrl + receitaWsUrl configurados', () => {
    const adapter = new AdaptadorCNPJ({
      apiUrl: 'https://bulk.example.test',
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    assert.equal(adapter.modo, 'real')
  })

  test('modo hibrido quando apenas fontes de enriquecimento configuradas', () => {
    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    assert.equal(adapter.modo, 'hibrido')
  })
})

describe('AdaptadorCNPJ - enriquecer (fallbacks)', () => {
  test('usa apenas BrasilAPI quando ReceitaWS falha', async () => {
    mockFetch({
      'receitaws': null,        // falha
      'brasilapi': brasilApiFixture,
    })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })

    const result = await adapter.enriquecer(CNPJ_14)

    assert.equal(result['razaoSocial'], 'HOTEL EXEMPLO LTDA')
    const fontes = result['fontes'] as string[]
    assert.ok(fontes.includes('brasilapi'))
    assert.ok(!fontes.includes('receitaws'))
    // sem RF, email fica vazio
    assert.equal(result['email'], '')
  })

  test('usa apenas ReceitaWS quando BrasilAPI falha', async () => {
    mockFetch({
      'receitaws': receitaWsFixture,
      'brasilapi': null,        // falha
    })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })

    const result = await adapter.enriquecer(CNPJ_14)

    assert.equal(result['razaoSocial'], 'HOTEL EXEMPLO LTDA')
    assert.equal(result['email'], 'contato@hotelexemplo.com.br')
    const fontes = result['fontes'] as string[]
    assert.ok(fontes.includes('receitaws'))
    assert.ok(!fontes.includes('brasilapi'))
    // sem BrasilAPI, simples/MEI ficam falsos
    assert.equal(result['opcaoSimples'], false)
    assert.equal(result['opcaoMei'], false)
  })

  test('cai em mock quando ambas as APIs falham', async () => {
    mockFetch({
      'receitaws': null,
      'brasilapi': null,
    })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })

    const result = await adapter.enriquecer(CNPJ_14)

    assert.deepEqual(result['fontes'], [])
    assert.equal(result['fonte'], 'cnpj-receita-federal')
  })

  test('sem URLs configuradas retorna mock sem chamadas externas', async () => {
    let chamadas = 0
    globalThis.fetch = async () => {
      chamadas++
      return new Response('{}', { status: 200 })
    }

    const adapter = new AdaptadorCNPJ()
    const result = await adapter.enriquecer('cnpj-001')

    assert.equal(chamadas, 0)
    assert.equal(result['fonte'], 'cnpj-receita-federal')
    assert.deepEqual(result['fontes'], [])
  })
})

describe('AdaptadorCNPJ - campos mesclados em detalhe', () => {
  test('data de abertura RF (dd/mm/yyyy) convertida para ISO', async () => {
    mockFetch({ 'receitaws': receitaWsFixture, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.equal(result['dataAbertura'], '2015-06-01')
  })

  test('capital social BRL "150.000,00" convertido para 150000', async () => {
    mockFetch({ 'receitaws': receitaWsFixture, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.equal(result['capitalSocial'], 150_000)
  })

  test('capital social em decimal inglês "205431960490.52" não corrompe (bug parseBRL)', async () => {
    const rfComDecimalIngles = {
      ...receitaWsFixture,
      capital_social: '205431960490.52',
    }
    mockFetch({ 'receitaws': rfComDecimalIngles, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    // deve ser ~205 bilhões, não ~20 trilhões (bug anterior: removia o ponto decimal)
    assert.ok(
      (result['capitalSocial'] as number) > 200_000_000_000,
      `capitalSocial deve ser ~205bi, mas foi ${result['capitalSocial']}`,
    )
    assert.ok(
      (result['capitalSocial'] as number) < 300_000_000_000,
      `capitalSocial não pode ultrapassar 300bi: ${result['capitalSocial']}`,
    )
  })

  test('cnaes secundários mesclados sem duplicidade', async () => {
    mockFetch({ 'receitaws': receitaWsFixture, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    const cnaes = result['cnaesSecundarios'] as Array<{ codigo: string }>
    const codigos = cnaes.map((c) => c.codigo)
    assert.equal(codigos.length, new Set(codigos).size, 'cnae duplicado encontrado')
    assert.ok(codigos.includes('5590601'))
  })

  test('cnae_fiscal int da BrasilAPI recebe zero à esquerda para 7 dígitos', async () => {
    // cnae_fiscal: 600001 (int) deve virar "0600001" (7 dígitos com leading zero)
    const baComCnaeCurto = { ...brasilApiFixture, cnae_fiscal: 600001 }
    // Usar só BrasilAPI (sem RF) para isolar o campo
    mockFetch({ 'receitaws': null, 'brasilapi': baComCnaeCurto })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.equal(result['cnaePrincipal'], '0600001')
  })

  test('CEP da ReceitaWS normalizado (só dígitos)', async () => {
    mockFetch({ 'receitaws': receitaWsFixture, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.equal(result['cep'], '89200000')
  })

  test('descricao_tipo_de_logradouro da BrasilAPI usada quando RF não disponível', async () => {
    // RF falha → BrasilAPI usa descricao_tipo_de_logradouro (com "de") e não descricao_tipo_logradouro
    mockFetch({ 'receitaws': null, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.ok(
      (result['logradouro'] as string).includes('Rua'),
      `logradouro deve conter "Rua" (tipo do logradouro), mas foi: ${result['logradouro']}`,
    )
  })

  test('simples/MEI lidos de simples.optante e simei.optante da ReceitaWS', async () => {
    const rfComSimples = {
      ...receitaWsFixture,
      simples: { optante: true },
      simei: { optante: false },
    }
    mockFetch({ 'receitaws': rfComSimples, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.equal(result['opcaoSimples'], true)
    assert.equal(result['opcaoMei'], false)
  })

  test('telefone da BrasilAPI formatado corretamente quando RF falha', async () => {
    // ddd_telefone_1: "4733334444" → "(47) 3333-4444"
    mockFetch({ 'receitaws': null, 'brasilapi': brasilApiFixture })

    const adapter = new AdaptadorCNPJ({
      brasilApiUrl: 'https://brasilapi.example.test',
      receitaWsUrl: 'https://receitaws.example.test',
    })
    const result = await adapter.enriquecer(CNPJ_14)
    assert.equal(result['telefone'], '(47) 3333-4444')
  })
})
