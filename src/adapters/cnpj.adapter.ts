import { BaseAdapter } from './base-adapter.js'

export class AdaptadorCNPJ extends BaseAdapter {
  readonly nome = 'cnpj-receita-federal'

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async () => {
      const cnaes = Array.isArray(parametros['cnaes'])
        ? parametros['cnaes'].map(String)
        : []
      const municipio = String(parametros['municipio'] ?? '')
      const limit = Number(parametros['limit'] ?? 100)

      return mockEmpresas
        .filter((empresa) => {
          const cnaeOk = cnaes.length === 0 || cnaes.includes(empresa.cnae)
          const municipioOk =
            !municipio ||
            empresa.municipio.toLocaleLowerCase('pt-BR').includes(
              municipio.toLocaleLowerCase('pt-BR'),
            )
          return cnaeOk && municipioOk
        })
        .slice(0, Number.isFinite(limit) ? limit : 100)
        .map((empresa) => ({
          identificador: empresa.identificador,
          nome: empresa.nome,
          tipo: 'pj',
          endereco: empresa.endereco,
          latitude: empresa.latitude,
          longitude: empresa.longitude,
          fonte: this.nome,
          atributos: {
            cnae: empresa.cnae,
            porte: empresa.porte,
            idadeAnos: empresa.idadeAnos,
            municipio: empresa.municipio,
          },
        }))
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async () => {
      const empresa = mockEmpresas.find((item) => item.identificador === identificador)

      return {
        identificador,
        razaoSocial: empresa?.nome ?? `Empresa ${identificador}`,
        situacao: 'ATIVA',
        dataAbertura: '2018-03-15',
        naturezaJuridica: '206-2 - Sociedade Limitada',
        capitalSocial: 150_000,
        porte: empresa?.porte ?? 'EPP',
        cnaePrincipal: empresa?.cnae ?? '5510801',
        fonte: this.nome,
        enriquecidoEm: new Date().toISOString(),
      }
    })
  }
}

export class CnpjAdapter extends AdaptadorCNPJ {}

const mockEmpresas = [
  {
    identificador: 'cnpj-001',
    nome: 'Hotel Panorama',
    cnae: '5510801',
    porte: 3,
    idadeAnos: 7,
    municipio: 'Joinville',
    endereco: 'Rua das Palmeiras, 120',
    latitude: -26.304,
    longitude: -48.846,
  },
  {
    identificador: 'cnpj-002',
    nome: 'Hotel Top Class',
    cnae: '5510801',
    porte: 2,
    idadeAnos: 4,
    municipio: 'Joinville',
    endereco: 'Av. Brasil, 890',
    latitude: -26.31,
    longitude: -48.85,
  },
  {
    identificador: 'cnpj-003',
    nome: 'Pousada Refugio',
    cnae: '5510801',
    porte: 1,
    idadeAnos: 2,
    municipio: 'Joinville',
    endereco: 'Rua Jaguaruna, 45',
    latitude: -26.29,
    longitude: -48.83,
  },
  {
    identificador: 'cnpj-004',
    nome: 'ILPI Lar Esperanca',
    cnae: '8711501',
    porte: 3,
    idadeAnos: 10,
    municipio: 'Joinville',
    endereco: 'Rua XV de Novembro, 300',
    latitude: -26.3,
    longitude: -48.84,
  },
  {
    identificador: 'cnpj-005',
    nome: 'Padaria Central',
    cnae: '4721102',
    porte: 1,
    idadeAnos: 20,
    municipio: 'Joinville',
    endereco: 'Rua do Comercio, 55',
    latitude: -26.305,
    longitude: -48.845,
  },
  {
    identificador: 'cnpj-006',
    nome: 'Hotel Marina Bay',
    cnae: '5510801',
    porte: 4,
    idadeAnos: 15,
    municipio: 'Florianopolis',
    endereco: 'Av. Beira Mar, 1500',
    latitude: -27.59,
    longitude: -48.55,
  },
]
