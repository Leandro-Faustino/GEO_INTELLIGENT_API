import { createHash } from 'node:crypto'
import type { CacheService } from '../services/cache.service.js'
import type { EnriquecimentoContexto, IAdaptadorFonte } from './base-adapter.js'

export class CachedFonteAdapter implements IAdaptadorFonte {
  readonly nome: string

  constructor(
    private readonly delegate: IAdaptadorFonte,
    private readonly cache: CacheService,
    private readonly ttlSeconds: number,
  ) {
    this.nome = delegate.nome
  }

  get modo(): IAdaptadorFonte['modo'] {
    return this.delegate.modo
  }

  get circuitState(): string {
    return this.delegate.circuitState
  }

  get consecutiveFailures(): number {
    return this.delegate.consecutiveFailures
  }

  get isOptional(): boolean {
    return this.delegate.isOptional ?? false
  }

  get observacao(): string {
    return this.delegate.observacao ?? ''
  }

  get providerMode(): string {
    return this.delegate.providerMode ?? ''
  }

  async consultar(parametros: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    return this.cache.remember(
      this.cacheKey('consultar', parametros),
      () => this.delegate.consultar(parametros),
      this.ttlSeconds,
    )
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.cache.remember(
      this.cacheKey('enriquecer', { identificador }),
      () => this.delegate.enriquecer(identificador),
      this.ttlSeconds,
    )
  }

  async enriquecerComContexto(
    contexto: EnriquecimentoContexto,
  ): Promise<Record<string, unknown>> {
    return this.cache.remember(
      this.cacheKey('enriquecer-contexto', contexto),
      () =>
        this.delegate.enriquecerComContexto
          ? this.delegate.enriquecerComContexto(contexto)
          : this.delegate.enriquecer(contexto.identificador),
      this.ttlSeconds,
    )
  }

  private cacheKey(operacao: string, payload: unknown): string {
    const digest = createHash('sha256')
      .update(stableStringify(payload))
      .digest('hex')

    return `fonte:${this.nome}:${operacao}:${digest}`
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)

    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}
