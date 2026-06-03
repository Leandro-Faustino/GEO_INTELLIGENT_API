import { BaseAdapter, type AdapterOptions } from './base-adapter.js'
import { randomUUID } from 'node:crypto'
import type {
  CompradorConhecidoDTO,
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
  OportunidadeDTO,
} from '../repositories/interfaces/index.js'

export interface MotorClientConfig extends AdapterOptions {
  baseUrl: string
  internalApiKey: string
}

export interface MotorFeedbackResultadoInput {
  entidadeAlvoId: string
  converteu: boolean
  atributos?: Record<string, unknown>
  ticketReal?: number
}

export interface MotorFeedbackInput {
  feedbackId: string
  clienteId: string
  resultados: MotorFeedbackResultadoInput[]
}

export interface MotorAnaliseInput {
  clienteId: string
  criterios: CriterioDerivadoDTO[]
  entidades: EntidadeAlvoDTO[]
  exclusoes: string[]
  jaClientes: string[]
  limiarSimilaridade: number
}

export interface MotorAnaliseOutput {
  versaoModelo: string
  oportunidades: OportunidadeDTO[]
}

export interface MotorRaioXInput {
  compradores: CompradorConhecidoDTO[]
}

export interface MotorRaioXOutput {
  retrato: {
    frase: string
    complemento: string | null
  }
  fatores: Array<{
    atributo: string
    pesoPercentual: number
    descricao: string
  }>
  estatisticas: {
    totalClientes: number
    ativos: number
    comRecompra: number
    percentualFieis: number
    ticketMedio?: number
    ticketMin?: number
    ticketMax?: number
  }
  segmentos: Array<{
    segmento: string
    quantidade: number
    percentual: number
  }>
  potencial: {
    mensagem: string
    cta: string
  }
}

export class MotorIndisponivelError extends Error {
  readonly statusCode = 503

  constructor(operacao: string, causa: string) {
    super(`Motor de inteligência indisponível em '${operacao}': ${causa}`)
    this.name = 'MotorIndisponivelError'
  }
}

export class MotorClient extends BaseAdapter {
  readonly nome = 'motor-inteligencia'

  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(config: MotorClientConfig) {
    super(config)
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.internalApiKey
  }

  async consultar(): Promise<Record<string, unknown>[]> {
    throw new Error('Use os métodos específicos do motor.')
  }

  async enriquecer(): Promise<Record<string, unknown>> {
    throw new Error('Use os métodos específicos do motor.')
  }

  async derivar(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.postProtegido('/derivar', payload, requestId)
  }

  async analisar(
    payload: MotorAnaliseInput,
    requestId: string,
  ): Promise<MotorAnaliseOutput> {
    const resultado = await this.postProtegido('/analisar', {
      cliente_id: payload.clienteId,
      criterios: payload.criterios.map((criterio) => ({
        nome: criterio.nome,
        valor_min: criterio.nome.toLocaleLowerCase('pt-BR') === 'cnae'
          ? normalizarValoresCnae(criterio.valorMin)
          : criterio.valorMin,
        valor_max: criterio.nome.toLocaleLowerCase('pt-BR') === 'cnae'
          ? normalizarValoresCnae(criterio.valorMax)
          : criterio.valorMax,
        peso: criterio.peso,
        tipo_comparacao: criterio.tipoComparacao,
      })),
      entidades: payload.entidades.map((entidade) => ({
        identificador: entidade.identificador,
        nome: entidade.nome,
        tipo: entidade.tipo,
        atributos: entidade.atributos,
        endereco: entidade.endereco,
        latitude: entidade.latitude,
        longitude: entidade.longitude,
        fonte: entidade.fonte,
        escopo: entidade.escopo,
      })),
      exclusoes: payload.exclusoes,
      ja_clientes: payload.jaClientes,
      limiar_similaridade: payload.limiarSimilaridade,
    }, requestId)

    return {
      versaoModelo: stringCampo(resultado, 'versaoModelo', 'versao_modelo') || '0.1.0',
      oportunidades: oportunidadesDoMotor(resultado),
    }
  }

  async raioX(
    payload: MotorRaioXInput,
    requestId: string,
  ): Promise<MotorRaioXOutput> {
    const resposta = await this.postProtegido('/raio-x', {
      compradores: payload.compradores.map((comprador) => ({
        identificador: comprador.identificador,
        nome: comprador.nome,
        tipo: comprador.tipo,
        atributos_originais: comprador.atributosOriginais,
        ticket_medio: comprador.ticketMedio,
        frequencia: comprador.frequencia,
        ativo: comprador.ativo,
      })),
    }, requestId)

    return {
      retrato: {
        frase: stringCampo(objetoCampo(resposta, 'retrato'), 'frase'),
        complemento: nullableStringCampo(
          objetoCampo(resposta, 'retrato'),
          'complemento',
        ),
      },
      fatores: arrayCampo(resposta, 'fatores').map((fator) => {
        const registro = registroCampo(fator)
        return {
          atributo: stringCampo(registro, 'atributo'),
          pesoPercentual: numeroInteiroCampo(
            registro,
            'pesoPercentual',
            'peso_percentual',
          ),
          descricao: stringCampo(registro, 'descricao'),
        }
      }),
      estatisticas: {
        totalClientes: numeroInteiroCampo(
          objetoCampo(resposta, 'estatisticas'),
          'totalClientes',
          'total_clientes',
        ),
        ativos: numeroInteiroCampo(
          objetoCampo(resposta, 'estatisticas'),
          'ativos',
        ),
        comRecompra: numeroInteiroCampo(
          objetoCampo(resposta, 'estatisticas'),
          'comRecompra',
          'com_recompra',
        ),
        percentualFieis: numeroInteiroCampo(
          objetoCampo(resposta, 'estatisticas'),
          'percentualFieis',
          'percentual_fieis',
        ),
        ...numeroOpcional(
          objetoCampo(resposta, 'estatisticas'),
          'ticketMedio',
          'ticket_medio',
        ),
        ...numeroOpcional(
          objetoCampo(resposta, 'estatisticas'),
          'ticketMin',
          'ticket_min',
        ),
        ...numeroOpcional(
          objetoCampo(resposta, 'estatisticas'),
          'ticketMax',
          'ticket_max',
        ),
      },
      segmentos: arrayCampo(resposta, 'segmentos').map((segmento) => {
        const registro = registroCampo(segmento)
        return {
          segmento: stringCampo(registro, 'segmento'),
          quantidade: numeroInteiroCampo(registro, 'quantidade'),
          percentual: numeroInteiroCampo(registro, 'percentual'),
        }
      }),
      potencial: {
        mensagem: stringCampo(objetoCampo(resposta, 'potencial'), 'mensagem'),
        cta: stringCampo(objetoCampo(resposta, 'potencial'), 'cta'),
      },
    }
  }

  async feedback(
    payload: MotorFeedbackInput,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.postProtegido('/feedback', {
      feedback_id: payload.feedbackId,
      cliente_id: payload.clienteId,
      resultados: payload.resultados.map((resultado) => ({
        entidade_alvo_id: resultado.entidadeAlvoId,
        converteu: resultado.converteu,
        atributos: resultado.atributos ?? {},
        ...(resultado.ticketReal !== undefined
          ? { ticket_real: resultado.ticketReal }
          : {}),
      })),
    }, requestId)
  }

  private async postProtegido(
    rota: string,
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.executarProtegido(rota, async (signal) => {
        const response = await fetch(`${this.baseUrl}${rota}`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            'x-internal-key': this.apiKey,
            'x-request-id': requestId,
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const body = await response.text()
          throw Object.assign(
            new Error(`Motor respondeu ${response.status}: ${body.slice(0, 200)}`),
            { statusCode: response.status },
          )
        }

        return (await response.json()) as Record<string, unknown>
      })
    } catch (error) {
      const statusCode =
        error && typeof error === 'object' && 'statusCode' in error
          ? Number((error as { statusCode: unknown }).statusCode)
          : 0

      if (statusCode >= 400 && statusCode < 500) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new MotorIndisponivelError(rota, message)
    }
  }
}

function normalizarValoresCnae(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(normalizarCnae).filter((item) => item.length > 0)
  }
  return normalizarCnae(valor)
}

function normalizarCnae(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '')
}

function oportunidadesDoMotor(resultado: Record<string, unknown>): OportunidadeDTO[] {
  const oportunidades =
    arrayCampo(resultado, 'oportunidades') as Record<string, unknown>[]

  return oportunidades.map((oportunidade) => {
    const score = objetoCampo(oportunidade, 'score')
    const scoreValor = numeroCampo(score, 'valor')
    const lat = Number.isFinite(Number(oportunidade['lat'])) ? Number(oportunidade['lat'])
      : Number.isFinite(Number(oportunidade['latitude'])) ? Number(oportunidade['latitude']) : null
    const lon = Number.isFinite(Number(oportunidade['lon'])) ? Number(oportunidade['lon'])
      : Number.isFinite(Number(oportunidade['longitude'])) ? Number(oportunidade['longitude']) : null
    return {
      id: randomUUID(),
      entidadeAlvoId: stringCampo(oportunidade, 'entidadeAlvoId', 'entidade_alvo_id'),
      entidadeNome: stringCampo(oportunidade, 'entidadeNome', 'entidade_nome'),
      entidadeCidade: stringCampo(oportunidade, 'entidadeCidade', 'entidade_cidade'),
      nome: stringCampo(oportunidade, 'nome', 'entidade_nome'),
      endereco: stringCampo(oportunidade, 'endereco', 'entidade_endereco'),
      lat,
      lon,
      faixaScore: scoreValor >= 0.8 ? 'alta' : scoreValor >= 0.5 ? 'media' : 'baixa',
      tipo: stringCampo(oportunidade, 'tipo'),
      justificativa: stringCampo(oportunidade, 'justificativa'),
      ganchoAbordagem: stringCampo(oportunidade, 'ganchoAbordagem', 'gancho_abordagem'),
      prioridade: prioridadeCampo(oportunidade),
      score: {
        valor: scoreValor,
        similaridade: numeroCampo(score, 'similaridade'),
        probConversao: numeroCampo(score, 'probConversao', 'prob_conversao'),
      },
      latitude: lat,
      longitude: lon,
    }
  })
}

function objetoCampo(
  origem: Record<string, unknown>,
  nome: string,
): Record<string, unknown> {
  const valor = origem[nome]
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function arrayCampo(origem: Record<string, unknown>, nome: string): unknown[] {
  const valor = origem[nome]
  return Array.isArray(valor) ? valor : []
}

function registroCampo(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function stringCampo(
  origem: Record<string, unknown>,
  ...nomes: string[]
): string {
  for (const nome of nomes) {
    const valor = origem[nome]
    if (valor !== undefined && valor !== null) return String(valor)
  }
  return ''
}

function numeroCampo(
  origem: Record<string, unknown>,
  ...nomes: string[]
): number {
  for (const nome of nomes) {
    const valor = Number(origem[nome])
    if (Number.isFinite(valor)) return valor
  }
  return 0
}

function numeroInteiroCampo(
  origem: Record<string, unknown>,
  ...nomes: string[]
): number {
  return Math.trunc(numeroCampo(origem, ...nomes))
}

function nullableStringCampo(
  origem: Record<string, unknown>,
  ...nomes: string[]
): string | null {
  for (const nome of nomes) {
    const valor = origem[nome]
    if (valor === null) return null
    if (valor !== undefined) return String(valor)
  }
  return null
}

function numeroOpcional(
  origem: Record<string, unknown>,
  camelName: string,
  snakeName: string,
): Record<string, number> {
  const valor = origem[camelName] ?? origem[snakeName]
  const numero = Number(valor)
  return Number.isFinite(numero) ? { [camelName]: numero } : {}
}

function prioridadeCampo(origem: Record<string, unknown>): 'alta' | 'media' | 'baixa' {
  const valor = stringCampo(origem, 'prioridade')
  return valor === 'alta' || valor === 'media' || valor === 'baixa'
    ? valor
    : 'baixa'
}
