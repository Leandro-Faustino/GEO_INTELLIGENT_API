import {
  BaseAdapter,
  type AdapterOptions,
  type EnriquecimentoContexto,
} from './base-adapter.js'
import type { SetorCensitarioResolver } from '../services/setor-censitario.service.js'

export interface GeocoderAdapterOptions extends AdapterOptions {
  baseUrl?: string
  userAgent?: string
  throttleMs?: number
  countryCodes?: string
  setorResolver?: SetorCensitarioResolver
  providerMode?: 'nominatim-public' | 'nominatim-selfhosted' | 'commercial'
}

interface NominatimResultado {
  lat?: string
  lon?: string
  importance?: number
  display_name?: string
  address?: {
    road?: string
    suburb?: string
    neighbourhood?: string
    city_district?: string
    quarter?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    county?: string
    state?: string
    state_code?: string
    postcode?: string
    country_code?: string
  }
}

export class AdaptadorGeocoder extends BaseAdapter {
  readonly nome = 'geocoder'
  readonly providerMode: string
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly throttleMs: number
  private readonly countryCodes: string
  private readonly setorResolver: SetorCensitarioResolver | undefined

  constructor(options: GeocoderAdapterOptions = {}) {
    super(options)
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
    this.userAgent = (options.userAgent ?? '').trim()
    this.throttleMs = Math.max(0, options.throttleMs ?? 1000)
    this.countryCodes = (options.countryCodes ?? 'br').trim().toLowerCase()
    this.setorResolver = options.setorResolver
    this.providerMode = options.providerMode ?? 'nominatim-public'

    if (this.baseUrl) {
      if (this.providerMode === 'nominatim-public') {
        if (!/.+@.+/.test(this.userAgent)) {
          throw new Error(
            '[geocoder] GEOCODER_PROVIDER_MODE=nominatim-public exige NOMINATIM_USER_AGENT com e-mail válido (ex: "MeuApp/1.0 (contato@empresa.com)"). Política de uso: https://nominatim.org/release-docs/latest/api/Overview/#usage-policy',
          )
        }
        if (this.throttleMs < 1000) {
          throw new Error(
            `[geocoder] GEOCODER_PROVIDER_MODE=nominatim-public exige NOMINATIM_THROTTLE_MS >= 1000 ms. Valor atual: ${this.throttleMs}.`,
          )
        }
      } else if (this.providerMode === 'nominatim-selfhosted') {
        if (!this.baseUrl) {
          throw new Error(
            '[geocoder] GEOCODER_PROVIDER_MODE=nominatim-selfhosted exige NOMINATIM_BASE_URL apontando para a instância própria.',
          )
        }
      }
    }
  }

  override get modo(): 'real' | 'mock' | 'hibrido' {
    return this.baseUrl && this.userAgent ? 'hibrido' : 'mock'
  }

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async (signal) => {
      const enderecos = this.extrairEnderecos(parametros)

      if (this.modo === 'hibrido') {
        const resultados: Record<string, unknown>[] = []
        for (const endereco of enderecos) {
          resultados.push(await this.geocodificar(endereco, signal))
        }
        return resultados
      }

      return this.consultarMock(enderecos)
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async (signal) => {
      if (this.modo === 'hibrido') {
        return this.geocodificar(identificador, signal)
      }

      return this.enriquecerMock(identificador)
    })
  }

  async enriquecerComContexto(
    contexto: EnriquecimentoContexto,
  ): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer-contexto', async (signal) => {
      const endereco = this.enderecoDoContexto(contexto)

      if (this.modo === 'hibrido') {
        return this.geocodificar(endereco, signal)
      }

      return this.enriquecerMock(endereco)
    })
  }

  private extrairEnderecos(parametros: Record<string, unknown>): string[] {
    if (Array.isArray(parametros['enderecos'])) {
      return parametros['enderecos']
        .map(String)
        .map((endereco) => endereco.trim())
        .filter(Boolean)
    }

    const endereco = String(parametros['endereco'] ?? '').trim()
    return endereco ? [endereco] : []
  }

  private enderecoDoContexto(contexto: EnriquecimentoContexto): string {
    const atributos = contexto.atributos
    const endereco = primeiroTexto(atributos['endereco'], atributos['address'])
    if (endereco) return endereco

    const partes = [
      primeiroTexto(atributos['logradouro'], atributos['rua']),
      primeiroTexto(atributos['numero'], atributos['número']),
      primeiroTexto(atributos['bairro']),
      primeiroTexto(atributos['municipio'], atributos['cidade'], atributos['localidade']),
      primeiroTexto(atributos['uf'], atributos['estado']),
      primeiroTexto(atributos['cep']),
    ].filter(Boolean)

    if (partes.length > 0) {
      return partes.join(', ')
    }

    return contexto.identificador
  }

  private async geocodificar(
    endereco: string,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const enderecoNormalizado = endereco.trim()
    if (!enderecoNormalizado) {
      return this.naoEncontrado(endereco)
    }

    await throttleNominatim(this.throttleMs)

    const params = new URLSearchParams({
      q: enderecoNormalizado,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
    })
    if (this.countryCodes) {
      params.set('countrycodes', this.countryCodes)
    }

    const response = await fetch(`${this.baseUrl}/search?${params.toString()}`, {
      signal,
      headers: {
        accept: 'application/json',
        'user-agent': this.userAgent,
      },
    })

    if (response.status === 403) {
      throw Object.assign(new Error('Nominatim bloqueou a requisição'), {
        statusCode: 403,
      })
    }
    if (response.status === 429) {
      throw Object.assign(new Error('Nominatim rate limit'), { statusCode: 429 })
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Nominatim respondeu ${response.status}`), {
        statusCode: response.status,
      })
    }

    const payload = (await response.json()) as NominatimResultado[]
    const primeiro = Array.isArray(payload) ? payload[0] : undefined
    if (!primeiro) {
      return this.naoEncontrado(enderecoNormalizado)
    }

    return this.normalizar(enderecoNormalizado, primeiro)
  }

  private async normalizar(
    endereco: string,
    resultado: NominatimResultado,
  ): Promise<Record<string, unknown>> {
    const latitude = numeroCampo(resultado.lat)
    const longitude = numeroCampo(resultado.lon)
    if (latitude === null || longitude === null) {
      return this.naoEncontrado(endereco)
    }

    const address = resultado.address ?? {}
    const uf = ufDoEstado(address.state_code ?? address.state)
    const setorCensitario =
      (await this.setorResolver?.resolver(latitude, longitude)) ?? null

    return {
      endereco,
      latitude,
      longitude,
      setorCensitario,
      bairro: primeiroTexto(
        address.suburb,
        address.neighbourhood,
        address.city_district,
        address.quarter,
      ) || null,
      municipio:
        primeiroTexto(
          address.city,
          address.town,
          address.village,
          address.municipality,
          address.county,
        ) || null,
      uf,
      cep: address.postcode ?? null,
      pais: address.country_code?.toUpperCase() ?? null,
      displayName: resultado.display_name ?? null,
      confianca:
        typeof resultado.importance === 'number' && Number.isFinite(resultado.importance)
          ? resultado.importance
          : null,
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }
  }

  private naoEncontrado(endereco: string): Record<string, unknown> {
    return {
      endereco,
      encontrado: false,
      latitude: null,
      longitude: null,
      setorCensitario: null,
      bairro: null,
      municipio: null,
      uf: null,
      confianca: null,
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }
  }

  private consultarMock(enderecos: string[]): Record<string, unknown>[] {
    return enderecos.map((endereco, index) => ({
      endereco,
      latitude: -26.304 + index * 0.005,
      longitude: -48.846 + index * 0.003,
      confianca: 0.95,
      fonte: this.nome,
    }))
  }

  private enriquecerMock(identificador: string): Record<string, unknown> {
    return {
      endereco: identificador,
      latitude: -26.304,
      longitude: -48.846,
      setorCensitario: '4209102-001',
      bairro: 'Centro',
      municipio: 'Joinville',
      uf: 'SC',
      confianca: 0.92,
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }
  }
}

export class GeocoderAdapter extends AdaptadorGeocoder {}

let proximaChamadaNominatim = 0
let filaNominatim = Promise.resolve()

function throttleNominatim(throttleMs: number): Promise<void> {
  if (throttleMs <= 0) return Promise.resolve()

  const aguardarVez = filaNominatim.then(async () => {
    const agora = Date.now()
    const espera = Math.max(0, proximaChamadaNominatim - agora)
    if (espera > 0) {
      await sleep(espera)
    }
    proximaChamadaNominatim = Date.now() + throttleMs
  })

  filaNominatim = aguardarVez.catch(() => undefined)
  return aguardarVez
}

function numeroCampo(valor: unknown): number | null {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function primeiroTexto(...valores: unknown[]): string {
  for (const valor of valores) {
    if (typeof valor === 'string' && valor.trim().length > 0) {
      return valor.trim()
    }
  }

  return ''
}

function ufDoEstado(valor: unknown): string | null {
  const estado = primeiroTexto(valor)
  if (!estado) return null

  const upper = estado.toUpperCase()
  if (/^[A-Z]{2}$/.test(upper)) return upper

  return ESTADOS_BR[normalizarTexto(estado)] ?? null
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const ESTADOS_BR: Record<string, string> = {
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
}
