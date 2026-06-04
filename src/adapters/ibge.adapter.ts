import { BaseAdapter } from './base-adapter.js'

const isRealApis = () => process.env['EXTERNAL_APIS_ENABLED'] === 'true'

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades'

interface IbgeMunicipio {
  id: number
  nome: string
  microrregiao: {
    id: number
    nome: string
    mesorregiao: {
      id: number
      nome: string
      UF: { id: number; sigla: string; nome: string; regiao: { id: number; sigla: string; nome: string } }
    }
  }
}

export class AdaptadorIBGE extends BaseAdapter {
  readonly nome = 'ibge-censo'

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async (signal) => {
      const municipio = String(parametros['municipio'] ?? '')
      const uf = String(parametros['uf'] ?? '')
      const limit = Number(parametros['limit'] ?? 20)
      const safeLimit = Number.isFinite(limit) ? Math.min(limit, 100) : 20

      if (!isRealApis()) return []

      // /estados/{uf}/municipios does not accept ?nome — always filter client-side
      const url = uf
        ? `${IBGE_BASE}/estados/${uf.toUpperCase()}/municipios`
        : municipio
          ? `${IBGE_BASE}/municipios?nome=${encodeURIComponent(municipio)}`
          : `${IBGE_BASE}/municipios`

      const res = await fetch(url, {
        headers: { 'User-Agent': 'GeoLeadApp/1.0' },
        signal,
      })
      if (!res.ok) throw Object.assign(new Error(`IBGE API: ${res.status}`), { statusCode: 502 })

      const municipios = await res.json() as IbgeMunicipio[]

      const filtered = municipio
        ? municipios.filter((m) =>
          m.nome.toLocaleLowerCase('pt-BR').includes(municipio.toLocaleLowerCase('pt-BR'))
        )
        : municipios

      return filtered.slice(0, safeLimit).map((m) => ({
        identificador: String(m.id),
        nome: m.nome,
        tipo: 'territorio',
        endereco: `${m.nome}, ${m.microrregiao.mesorregiao.UF.sigla}`,
        latitude: 0,
        longitude: 0,
        fonte: this.nome,
        atributos: {
          ibgeId: m.id,
          uf: m.microrregiao.mesorregiao.UF.sigla,
          estado: m.microrregiao.mesorregiao.UF.nome,
          microrregiao: m.microrregiao.nome,
          mesorregiao: m.microrregiao.mesorregiao.nome,
          regiao: m.microrregiao.mesorregiao.UF.regiao.nome,
        },
      }))
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async (signal) => {
      if (!isRealApis()) {
        return { identificador, fonte: this.nome, enriquecidoEm: new Date().toISOString() }
      }

      const ibgeId = identificador.replace(/\D/g, '')
      if (!ibgeId) {
        return { identificador, fonte: this.nome, enriquecidoEm: new Date().toISOString() }
      }

      const res = await fetch(`${IBGE_BASE}/municipios/${ibgeId}`, {
        headers: { 'User-Agent': 'GeoLeadApp/1.0' },
        signal,
      })
      if (!res.ok) throw Object.assign(new Error(`IBGE municipio ${res.status}`), { statusCode: res.status >= 500 ? 502 : res.status })

      const m = await res.json() as IbgeMunicipio
      const uf = m.microrregiao.mesorregiao.UF

      return {
        ibgeId: m.id,
        municipio: m.nome,
        uf: uf.sigla,
        estado: uf.nome,
        regiao: uf.regiao.nome,
        microrregiao: m.microrregiao.nome,
        mesorregiao: m.microrregiao.mesorregiao.nome,
        fonte: this.nome,
        enriquecidoEm: new Date().toISOString(),
      }
    })
  }
}

export class IbgeAdapter extends AdaptadorIBGE {}
