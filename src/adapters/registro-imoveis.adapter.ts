import { BaseAdapter } from './base-adapter.js'

export class AdaptadorRegistroImoveis extends BaseAdapter {
  readonly nome = 'registro-imoveis'

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async () => {
      const municipio = String(parametros['municipio'] ?? '')

      return mockTransferencias
        .filter(
          (transferencia) =>
            !municipio ||
            transferencia.municipio
              .toLocaleLowerCase('pt-BR')
              .includes(municipio.toLocaleLowerCase('pt-BR')),
        )
        .map((transferencia) => ({
          identificador: transferencia.id,
          tipo: transferencia.tipo,
          periodo: transferencia.data,
          intensidade:
            transferencia.valorVenal > 500_000
              ? 0.9
              : transferencia.valorVenal > 300_000
                ? 0.7
                : 0.5,
          fonte: this.nome,
          atributos: {
            bairro: transferencia.bairro,
            municipio: transferencia.municipio,
            tipoImovel: transferencia.tipoImovel,
            valorVenal: transferencia.valorVenal,
          },
        }))
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async () => ({
      matricula: identificador,
      tipoImovel: 'apartamento',
      area: 85,
      valorVenal: 320_000,
      dataTransferencia: '2024-01-10',
      compradorCpf: '***.***.***-**',
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }))
  }
}

export class RegistroImoveisAdapter extends AdaptadorRegistroImoveis {}

const mockTransferencias = [
  {
    id: 'tr-001',
    tipo: 'transferencia_imovel',
    bairro: 'Centro',
    municipio: 'Joinville',
    data: '2024-01-10',
    tipoImovel: 'apartamento',
    valorVenal: 320_000,
  },
  {
    id: 'tr-002',
    tipo: 'transferencia_imovel',
    bairro: 'America',
    municipio: 'Joinville',
    data: '2024-01-15',
    tipoImovel: 'casa',
    valorVenal: 480_000,
  },
  {
    id: 'tr-003',
    tipo: 'transferencia_imovel',
    bairro: 'Gloria',
    municipio: 'Joinville',
    data: '2024-01-22',
    tipoImovel: 'apartamento',
    valorVenal: 250_000,
  },
  {
    id: 'tr-004',
    tipo: 'transferencia_imovel',
    bairro: 'Bucarein',
    municipio: 'Joinville',
    data: '2024-02-01',
    tipoImovel: 'cobertura',
    valorVenal: 780_000,
  },
]
