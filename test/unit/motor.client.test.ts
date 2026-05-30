import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MotorClient,
  MotorIndisponivelError,
  type MotorAnaliseInput,
  type MotorFeedbackInput,
} from '../../src/adapters/motor.client.js'

test('motor client traduz análise para contrato do engine e normaliza a resposta', async () => {
  const chamadas: Array<{ url: string; init?: RequestInit }> = []
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init })
    return new Response(JSON.stringify({
      versao_modelo: '1.2.3',
      oportunidades: [
        {
          entidade_alvo_id: 'hotel-1',
          tipo: 'pj',
          justificativa: 'Alta aderencia ao perfil',
          gancho_abordagem: 'Rede hoteleira com perfil parecido',
          prioridade: 'alta',
          score: {
            valor: 0.91,
            similaridade: 0.89,
            prob_conversao: 0.93,
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = new MotorClient({
      baseUrl: 'http://motor.local',
      internalApiKey: 'test-internal-key-with-at-least-32-chars',
      timeoutMs: 50,
      maxRetries: 0,
    })

    const payload: MotorAnaliseInput = {
      clienteId: 'cliente-1',
      criterios: [
        {
          nome: 'cnae',
          valorMin: ['5510-8/01'],
          valorMax: ['5510-8/01'],
          peso: 0.7,
          tipoComparacao: 'enum',
        },
      ],
      entidades: [
        {
          identificador: 'hotel-1',
          nome: 'Hotel Panorama',
          tipo: 'pj',
          atributos: { cnae: '5510801', porte: 'medio' },
          endereco: 'Rua X',
          latitude: 1,
          longitude: 2,
          fonte: 'cnpj',
          escopo: 'zona-sul',
        },
      ],
      exclusoes: [],
      jaClientes: ['hotel-existente'],
      limiarSimilaridade: 0.3,
    }

    const resultado = await client.analisar(payload, 'trace-analise-1')
    const body = JSON.parse(String(chamadas[0]?.init?.body))

    assert.deepEqual(body, {
      cliente_id: 'cliente-1',
      criterios: [
        {
          nome: 'cnae',
          valor_min: ['5510801'],
          valor_max: ['5510801'],
          peso: 0.7,
          tipo_comparacao: 'enum',
        },
      ],
      entidades: [
        {
          identificador: 'hotel-1',
          nome: 'Hotel Panorama',
          tipo: 'pj',
          atributos: { cnae: '5510801', porte: 'medio' },
          endereco: 'Rua X',
          latitude: 1,
          longitude: 2,
          fonte: 'cnpj',
          escopo: 'zona-sul',
        },
      ],
      exclusoes: [],
      ja_clientes: ['hotel-existente'],
      limiar_similaridade: 0.3,
    })
    assert.equal(resultado.versaoModelo, '1.2.3')
    assert.equal(resultado.oportunidades.length, 1)
    assert.equal(resultado.oportunidades[0]?.entidadeAlvoId, 'hotel-1')
    assert.equal(resultado.oportunidades[0]?.score.probConversao, 0.93)
  } finally {
    globalThis.fetch = fetchOriginal
  }
})

test('motor client traduz feedback para contrato do engine', async () => {
  const chamadas: Array<{ url: string; init?: RequestInit }> = []
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init })
    return new Response(JSON.stringify({ recebido: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = new MotorClient({
      baseUrl: 'http://motor.local',
      internalApiKey: 'test-internal-key-with-at-least-32-chars',
      timeoutMs: 50,
      maxRetries: 0,
    })

    const payload: MotorFeedbackInput = {
      feedbackId: 'feedback-1',
      clienteId: 'cliente-1',
      resultados: [
        {
          entidadeAlvoId: 'entidade-1',
          converteu: true,
          atributos: { prioridade: 'alta' },
          ticketReal: 1200,
        },
      ],
    }

    await client.feedback(payload, 'trace-123')

    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0]?.url, 'http://motor.local/feedback')
    const body = JSON.parse(String(chamadas[0]?.init?.body))
    assert.deepEqual(body, {
      feedback_id: 'feedback-1',
      cliente_id: 'cliente-1',
      resultados: [
        {
          entidade_alvo_id: 'entidade-1',
          converteu: true,
          atributos: { prioridade: 'alta' },
          ticket_real: 1200,
        },
      ],
    })
  } finally {
    globalThis.fetch = fetchOriginal
  }
})

test('motor client traduz raio-x para contrato do engine e normaliza a resposta', async () => {
  const chamadas: Array<{ url: string; init?: RequestInit }> = []
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init })
    return new Response(JSON.stringify({
      retrato: {
        frase: 'Perfil dominante em Sao Paulo',
        complemento: 'Base com recompra acima da media',
      },
      fatores: [
        {
          atributo: 'Cidade',
          peso_percentual: 67,
          descricao: 'Cidade dominante na base',
        },
      ],
      estatisticas: {
        total_clientes: 4,
        ativos: 3,
        com_recompra: 2,
        percentual_fieis: 67,
        ticket_medio: 1200,
      },
      segmentos: [
        {
          segmento: 'Cidade: Sao Paulo',
          quantidade: 2,
          percentual: 67,
        },
      ],
      potencial: {
        mensagem: 'Alta concentracao no segmento principal',
        cta: 'Priorize prospeccao nos polos dominantes',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const client = new MotorClient({
      baseUrl: 'http://motor.local',
      internalApiKey: 'test-internal-key-with-at-least-32-chars',
      timeoutMs: 50,
      maxRetries: 0,
    })

    const resultado = await client.raioX(
      {
        compradores: [
          {
            identificador: 'c1',
            nome: 'Hotel A',
            tipo: 'pj',
            atributosOriginais: { cidade: 'Sao Paulo' },
            ticketMedio: 1200,
            frequencia: 3,
            ativo: true,
          },
        ],
      },
      'trace-raiox-1',
    )

    const body = JSON.parse(String(chamadas[0]?.init?.body))
    assert.deepEqual(body, {
      compradores: [
        {
          identificador: 'c1',
          nome: 'Hotel A',
          tipo: 'pj',
          atributos_originais: { cidade: 'Sao Paulo' },
          ticket_medio: 1200,
          frequencia: 3,
          ativo: true,
        },
      ],
    })
    assert.equal(resultado.fatores[0]?.pesoPercentual, 67)
    assert.equal(resultado.estatisticas.totalClientes, 4)
    assert.equal(resultado.estatisticas.comRecompra, 2)
    assert.equal(resultado.potencial.cta, 'Priorize prospeccao nos polos dominantes')
  } finally {
    globalThis.fetch = fetchOriginal
  }
})

test('motor client converte erro de infraestrutura em indisponibilidade', async () => {
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new Error('timeout')
  }) as typeof fetch

  try {
    const client = new MotorClient({
      baseUrl: 'http://motor.local',
      internalApiKey: 'test-internal-key-with-at-least-32-chars',
      timeoutMs: 10,
      maxRetries: 0,
    })

    await assert.rejects(
      () => client.feedback({ feedbackId: 'f1', clienteId: 'c1', resultados: [] }, 'trace-1'),
      (error: unknown) =>
        error instanceof MotorIndisponivelError &&
        error.message.includes('/feedback'),
    )
  } finally {
    globalThis.fetch = fetchOriginal
  }
})
