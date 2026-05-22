import { BaseAdapter } from './base-adapter.js'

export class AdaptadorIBGE extends BaseAdapter {
  readonly nome = 'ibge-censo'

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async () => {
      const municipio = String(parametros['municipio'] ?? '')

      return mockSetores
        .filter(
          (setor) =>
            !municipio ||
            setor.municipio
              .toLocaleLowerCase('pt-BR')
              .includes(municipio.toLocaleLowerCase('pt-BR')),
        )
        .map((setor) => ({
          identificador: setor.codigoSetor,
          nome: setor.bairro,
          tipo: 'territorio',
          endereco: `${setor.bairro}, ${setor.municipio}`,
          latitude: 0,
          longitude: 0,
          fonte: this.nome,
          atributos: {
            rendaMediaPc: setor.rendaMediaPc,
            populacao: setor.populacao,
            densidadeHabKm2: setor.densidadeHabKm2,
            faixaEtariaPredominante: setor.faixaEtariaPredominante,
          },
        }))
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async () => ({
      codigoSetor: identificador,
      rendaMediaPc: 3500,
      populacao: 14000,
      densidadeHabKm2: 3200,
      idh: 0.785,
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }))
  }
}

export class IbgeAdapter extends AdaptadorIBGE {}

const mockSetores = [
  {
    codigoSetor: '4209102-001',
    bairro: 'Centro',
    municipio: 'Joinville',
    rendaMediaPc: 4200,
    populacao: 12500,
    densidadeHabKm2: 3800,
    faixaEtariaPredominante: '30-45',
  },
  {
    codigoSetor: '4209102-002',
    bairro: 'America',
    municipio: 'Joinville',
    rendaMediaPc: 3100,
    populacao: 18200,
    densidadeHabKm2: 4500,
    faixaEtariaPredominante: '25-40',
  },
  {
    codigoSetor: '4209102-003',
    bairro: 'Gloria',
    municipio: 'Joinville',
    rendaMediaPc: 2800,
    populacao: 9800,
    densidadeHabKm2: 2200,
    faixaEtariaPredominante: '35-50',
  },
  {
    codigoSetor: '4209102-004',
    bairro: 'Bucarein',
    municipio: 'Joinville',
    rendaMediaPc: 5100,
    populacao: 6200,
    densidadeHabKm2: 1800,
    faixaEtariaPredominante: '30-50',
  },
  {
    codigoSetor: '4209102-005',
    bairro: 'Anita Garibaldi',
    municipio: 'Joinville',
    rendaMediaPc: 2400,
    populacao: 22000,
    densidadeHabKm2: 5200,
    faixaEtariaPredominante: '20-35',
  },
]
