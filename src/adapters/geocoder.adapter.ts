import { BaseAdapter, type AdapterOptions } from './base-adapter.js'

const isRealApis = () => process.env['EXTERNAL_APIS_ENABLED'] === 'true'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const NOMINATIM_HEADERS = {
  'User-Agent': 'GeoLeadApp/1.0 (leandrofaustino88@gmail.com)',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer': 'http://localhost:3001',
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address?: {
    road?: string
    house_number?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    state?: string
    postcode?: string
    country_code?: string
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AdaptadorGeocoder extends BaseAdapter {
  readonly nome = 'geocoder'

  constructor(options?: AdapterOptions) {
    // Higher timeout for Nominatim batch (1 req/sec rate limit)
    super({ timeoutMs: 30_000, ...options })
  }

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async (signal) => {
      const enderecos = Array.isArray(parametros['enderecos'])
        ? parametros['enderecos'].map(String).slice(0, 10)
        : []

      if (!isRealApis() || enderecos.length === 0) return []

      const results: Record<string, unknown>[] = []

      for (let i = 0; i < enderecos.length; i++) {
        if (signal.aborted) break
        if (i > 0) await sleep(1100) // Nominatim: max 1 req/sec

        const q = encodeURIComponent(`${enderecos[i]}, Brasil`)
        const url = `${NOMINATIM_BASE}/search?q=${q}&format=json&limit=1&countrycodes=br&addressdetails=1`

        try {
          const res = await fetch(url, { headers: NOMINATIM_HEADERS, signal })
          if (!res.ok) { results.push({ endereco: enderecos[i], erro: `HTTP ${res.status}`, fonte: this.nome }); continue }

          const data = await res.json() as NominatimResult[]
          if (!data.length) { results.push({ endereco: enderecos[i], latitude: 0, longitude: 0, confianca: 0, fonte: this.nome }); continue }

          const r = data[0]!
          const addr = r.address ?? {}
          results.push({
            endereco: enderecos[i]!,
            latitude: parseFloat(r.lat),
            longitude: parseFloat(r.lon),
            displayName: r.display_name,
            bairro: addr.suburb ?? '',
            municipio: addr.city ?? addr.town ?? addr.village ?? '',
            uf: addr.state ?? '',
            cep: addr.postcode ?? '',
            confianca: 0.9,
            fonte: this.nome,
          })
        } catch {
          results.push({ endereco: enderecos[i], erro: 'timeout', fonte: this.nome })
        }
      }

      return results
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async (signal) => {
      if (!isRealApis()) {
        return { endereco: identificador, fonte: this.nome, enriquecidoEm: new Date().toISOString() }
      }

      const q = encodeURIComponent(`${identificador}, Brasil`)
      const url = `${NOMINATIM_BASE}/search?q=${q}&format=json&limit=1&countrycodes=br&addressdetails=1`

      const res = await fetch(url, { headers: NOMINATIM_HEADERS, signal })
      if (!res.ok) throw Object.assign(new Error(`Nominatim: ${res.status}`), { statusCode: 502 })

      const data = await res.json() as NominatimResult[]
      if (!data.length) {
        return { endereco: identificador, latitude: 0, longitude: 0, confianca: 0, fonte: this.nome, enriquecidoEm: new Date().toISOString() }
      }

      const r = data[0]!
      const addr = r.address ?? {}
      return {
        endereco: identificador,
        latitude: parseFloat(r.lat),
        longitude: parseFloat(r.lon),
        displayName: r.display_name,
        bairro: addr.suburb ?? addr.road ?? '',
        municipio: addr.city ?? addr.town ?? addr.village ?? '',
        uf: addr.state ?? '',
        cep: addr.postcode ?? '',
        confianca: 0.9,
        fonte: this.nome,
        enriquecidoEm: new Date().toISOString(),
      }
    })
  }
}

export class GeocoderAdapter extends AdaptadorGeocoder {}
