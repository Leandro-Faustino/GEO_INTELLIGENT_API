import { BaseAdapter } from './base-adapter.js'

export class AdaptadorGeocoder extends BaseAdapter {
  readonly nome = 'geocoder'

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async () => {
      const enderecos = Array.isArray(parametros['enderecos'])
        ? parametros['enderecos'].map(String)
        : []

      return enderecos.map((endereco, index) => ({
        endereco,
        latitude: -26.304 + index * 0.005,
        longitude: -48.846 + index * 0.003,
        confianca: 0.95,
        fonte: this.nome,
      }))
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async () => ({
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
    }))
  }
}

export class GeocoderAdapter extends AdaptadorGeocoder {}
