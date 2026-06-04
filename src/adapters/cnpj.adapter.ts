import { BaseAdapter, type AdapterOptions } from './base-adapter.js'

const isRealApis = () => process.env['EXTERNAL_APIS_ENABLED'] === 'true'

// Maps CNAE 4-digit prefix to Overpass OSM tags
const CNAE_OSM: Record<string, Array<{ tag: string; value: string }>> = {
  '5510': [{ tag: 'tourism', value: 'hotel' }],
  '5590': [{ tag: 'tourism', value: 'guest_house' }, { tag: 'tourism', value: 'hostel' }],
  '8630': [{ tag: 'amenity', value: 'clinic' }, { tag: 'amenity', value: 'doctors' }],
  '8640': [{ tag: 'healthcare', value: 'laboratory' }],
  '4721': [{ tag: 'shop', value: 'bakery' }],
  '5611': [{ tag: 'amenity', value: 'restaurant' }],
  '5612': [{ tag: 'amenity', value: 'fast_food' }],
}

function cnaeToOsmFilters(cnaes: string[]): Array<{ tag: string; value: string }> {
  const seen = new Set<string>()
  const filters: Array<{ tag: string; value: string }> = []
  for (const cnae of cnaes) {
    const prefix = cnae.replace(/\D/g, '').slice(0, 4)
    const mapped = CNAE_OSM[prefix]
    if (mapped) {
      for (const f of mapped) {
        const key = `${f.tag}=${f.value}`
        if (!seen.has(key)) { seen.add(key); filters.push(f) }
      }
    }
  }
  return filters.length > 0 ? filters : [{ tag: 'tourism', value: 'hotel' }]
}

function buildOverpassQuery(filters: Array<{ tag: string; value: string }>, city: string, limit: number): string {
  const cityArea = city
    ? `area["name"="${city}"]["boundary"="administrative"]->.a;`
    : ''
  const areaRef = city ? '(area.a)' : ''
  const nodeLines = filters
    .flatMap(f => [`node["${f.tag}"="${f.value}"]${areaRef};`, `way["${f.tag}"="${f.value}"]${areaRef};`])
    .join('\n')
  return `[out:json][timeout:15];${cityArea}(${nodeLines});out center ${limit};`
}

export class AdaptadorCNPJ extends BaseAdapter {
  readonly nome = 'cnpj-receita-federal'

  constructor(options?: AdapterOptions) {
    super({ timeoutMs: 30_000, ...options })
  }

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async (signal) => {
      const cnaes = Array.isArray(parametros['cnaes'])
        ? parametros['cnaes'].map(String)
        : parametros['cnae'] ? [String(parametros['cnae'])] : []
      const municipio = String(parametros['municipio'] ?? '')
      const limit = Number(parametros['limit'] ?? 20)
      const safeLimit = Number.isFinite(limit) ? Math.min(limit, 50) : 20

      if (!isRealApis()) return []

      const filters = cnaeToOsmFilters(cnaes)
      const query = buildOverpassQuery(filters, municipio, safeLimit)

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'GeoLeadApp/1.0 (leandrofaustino88@gmail.com)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      })

      if (!res.ok) throw Object.assign(new Error(`Overpass API: ${res.status}`), { statusCode: 502 })

      const data = await res.json() as {
        elements: Array<{
          id: number; type: string; tags?: Record<string, string>
          lat?: number; lon?: number; center?: { lat: number; lon: number }
        }>
      }

      const cnaeCode = cnaes[0] ?? filters[0] ? `${filters[0]!.tag}:${filters[0]!.value}` : 'generico'

      return data.elements.map((e) => {
        const tags = e.tags ?? {}
        const lat = e.lat ?? e.center?.lat ?? 0
        const lon = e.lon ?? e.center?.lon ?? 0
        const nome = tags['name'] ?? tags['brand'] ?? 'Empresa sem nome'
        const cidade = tags['addr:city'] ?? municipio
        const rua = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ')
        return {
          identificador: `osm-${e.type}-${e.id}`,
          nome,
          tipo: 'pj',
          endereco: rua ? `${rua}, ${cidade}` : cidade,
          latitude: lat,
          longitude: lon,
          fonte: this.nome,
          atributos: {
            cnae: cnaeCode,
            porte: 'nao-informado',
            municipio: cidade,
            osmId: e.id,
          },
        }
      })
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async (signal) => {
      const cnpjClean = identificador.replace(/\D/g, '')

      if (!isRealApis() || cnpjClean.length !== 14) {
        return { identificador, fonte: this.nome, enriquecidoEm: new Date().toISOString() }
      }

      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`, {
        headers: { 'User-Agent': 'GeoLeadApp/1.0' },
        signal,
      })
      if (!res.ok) throw Object.assign(new Error(`BrasilAPI CNPJ: ${res.status}`), { statusCode: res.status >= 500 ? 502 : res.status })

      const d = await res.json() as Record<string, unknown>
      return {
        identificador,
        cnpj: d['cnpj'],
        razaoSocial: d['razao_social'],
        nomeFantasia: d['nome_fantasia'] || null,
        situacao: d['descricao_situacao_cadastral'],
        dataAbertura: d['data_inicio_atividade'],
        naturezaJuridica: d['natureza_juridica'],
        capitalSocial: d['capital_social'],
        porte: d['porte'],
        cnaePrincipal: d['cnae_fiscal'],
        cnaeDescricao: d['cnae_fiscal_descricao'],
        municipio: d['municipio'],
        uf: d['uf'],
        logradouro: `${d['logradouro'] ?? ''} ${d['numero'] ?? ''}`.trim(),
        fonte: this.nome,
        enriquecidoEm: new Date().toISOString(),
      }
    })
  }
}

export class CnpjAdapter extends AdaptadorCNPJ {}
