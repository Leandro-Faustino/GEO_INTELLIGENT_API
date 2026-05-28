import { BaseAdapter, type AdapterOptions } from './base-adapter.js'

export interface MotorClientConfig extends AdapterOptions {
  baseUrl: string
  internalApiKey: string
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
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.postProtegido('/analisar', payload, requestId)
  }

  async raioX(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.postProtegido('/raio-x', payload, requestId)
  }

  async feedback(
    payload: Record<string, unknown>,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.postProtegido('/feedback', payload, requestId)
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
