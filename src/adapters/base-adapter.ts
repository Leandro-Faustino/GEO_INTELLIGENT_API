export interface IAdaptadorFonte {
  readonly nome: string
  consultar(parametros: Record<string, unknown>): Promise<Record<string, unknown>[]>
  enriquecer(identificador: string): Promise<Record<string, unknown>>
}

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  state: 'closed' | 'open' | 'half-open'
}

export interface AdapterOptions {
  timeoutMs?: number
  maxRetries?: number
  retryDelayMs?: number
  cbMaxFailures?: number
  cbResetMs?: number
}

const DEFAULTS: Required<AdapterOptions> = {
  timeoutMs: 5_000,
  maxRetries: 2,
  retryDelayMs: 500,
  cbMaxFailures: 5,
  cbResetMs: 30_000,
}

export abstract class BaseAdapter implements IAdaptadorFonte {
  abstract readonly nome: string

  protected readonly opts: Required<AdapterOptions>
  private cb: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
  }

  constructor(options?: AdapterOptions) {
    this.opts = { ...DEFAULTS, ...options }
  }

  abstract consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>

  abstract enriquecer(identificador: string): Promise<Record<string, unknown>>

  get circuitState(): string {
    return this.cb.state
  }

  protected async executarProtegido<T>(
    operacao: string,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.verificarCircuito()

    let ultimoErro: Error | null = null

    for (let tentativa = 0; tentativa <= this.opts.maxRetries; tentativa++) {
      try {
        const resultado = await this.executarComTimeout(fn)
        this.registrarSucesso()
        return resultado
      } catch (error) {
        ultimoErro = error instanceof Error ? error : new Error(String(error))

        if (isClientError(ultimoErro)) {
          throw ultimoErro
        }

        this.registrarFalha()

        if (tentativa < this.opts.maxRetries) {
          await sleep(this.opts.retryDelayMs * 2 ** tentativa)
        }
      }
    }

    throw Object.assign(
      new Error(
        `[${this.nome}] ${operacao} falhou após ${this.opts.maxRetries + 1} tentativas: ${ultimoErro?.message}`,
      ),
      { statusCode: 502 },
    )
  }

  private async executarComTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs)

    try {
      return await fn(controller.signal)
    } finally {
      clearTimeout(timer)
    }
  }

  private verificarCircuito(): void {
    if (this.cb.state !== 'open') return

    const agora = Date.now()
    if (agora - this.cb.lastFailure >= this.opts.cbResetMs) {
      this.cb.state = 'half-open'
      return
    }

    throw Object.assign(
      new Error(`[${this.nome}] Circuit breaker aberto. Fonte temporariamente indisponível.`),
      { statusCode: 503 },
    )
  }

  private registrarSucesso(): void {
    this.cb.failures = 0
    this.cb.state = 'closed'
  }

  private registrarFalha(): void {
    this.cb.failures++
    this.cb.lastFailure = Date.now()

    if (this.cb.failures >= this.opts.cbMaxFailures) {
      this.cb.state = 'open'
    }
  }
}

function isClientError(error: Error): boolean {
  const statusCode = (error as { statusCode?: number }).statusCode
  if (typeof statusCode !== 'number') return false
  if (statusCode === 408 || statusCode === 429) return false
  return statusCode >= 400 && statusCode < 500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface FonteConsulta {
  chave: string
  valor: string
}

export interface FonteResultado {
  origem: string
  dados: Record<string, unknown>
}
