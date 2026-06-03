import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ColetaService, type CriterioPerfil } from '../../src/services/coleta.service.js'
import type { IAdaptadorFonte } from '../../src/adapters/base-adapter.js'

class FakeAdapter implements IAdaptadorFonte {
  readonly nome = 'fake'
  ultimaConsulta: Record<string, unknown> | null = null

  constructor(private readonly retorno: Record<string, unknown>[]) {}

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    this.ultimaConsulta = parametros
    return this.retorno
  }

  async enriquecer(): Promise<Record<string, unknown>> {
    return {}
  }
}

const criterios: CriterioPerfil[] = [
  {
    nome: 'cnae',
    valorMin: ['5510-8/01', '8711501'],
    valorMax: ['5510-8/01', '8711501'],
    peso: 0.6,
    tipoComparacao: 'enum',
  },
  {
    nome: 'porte',
    valorMin: 2,
    valorMax: 4,
    peso: 0.4,
    tipoComparacao: 'range',
  },
]

function entidade(id: string, nome: string): Record<string, unknown> {
  return {
    identificador: id,
    nome,
    tipo: 'pj',
    endereco: 'Rua X',
    latitude: -26.3,
    longitude: -48.8,
    fonte: 'cnpj',
    atributos: { cnae: '5510801', porte: 3 },
  }
}

describe('ColetaService', () => {
  test('extrai CNAEs do perfil, normaliza e passa ao adapter', async () => {
    const fake = new FakeAdapter([entidade('e1', 'Hotel A')])
    const service = new ColetaService(fake)

    await service.coletar(criterios, 'Joinville')

    assert.deepEqual(fake.ultimaConsulta?.['cnaes'], ['5510801', '8711501'])
    assert.equal(fake.ultimaConsulta?.['municipio'], 'Joinville')
  })

  test('normaliza as entidades coletadas', async () => {
    const fake = new FakeAdapter([entidade('e1', 'Hotel Panorama')])
    const service = new ColetaService(fake)

    const resultado = await service.coletar(criterios, 'Joinville')

    assert.equal(resultado.length, 1)
    assert.equal(resultado[0]?.identificador, 'e1')
    assert.equal(resultado[0]?.nome, 'Hotel Panorama')
    assert.equal(resultado[0]?.atributos['cnae'], '5510801')
    assert.equal(resultado[0]?.escopo, 'Joinville')
  })

  test('deduplica por identificador', async () => {
    const fake = new FakeAdapter([
      entidade('e1', 'Hotel A'),
      entidade('e1', 'Hotel A duplicado'),
      entidade('e2', 'Hotel B'),
    ])
    const service = new ColetaService(fake)

    const resultado = await service.coletar(criterios, 'Joinville')

    assert.equal(resultado.length, 2)
  })

  test('ignora entidades sem identificador', async () => {
    const fake = new FakeAdapter([
      entidade('e1', 'Hotel A'),
      { nome: 'Sem ID', tipo: 'pj', atributos: {} },
    ])
    const service = new ColetaService(fake)

    const resultado = await service.coletar(criterios, 'Joinville')

    assert.equal(resultado.length, 1)
  })

  test('respeita o limite', async () => {
    const muitas = Array.from({ length: 10 }, (_, index) =>
      entidade(`e${index}`, `Hotel ${index}`),
    )
    const service = new ColetaService(new FakeAdapter(muitas))

    const resultado = await service.coletar(criterios, 'Joinville', 3)

    assert.equal(resultado.length, 3)
  })

  test('perfil sem CNAE passa lista vazia de CNAEs', async () => {
    const fake = new FakeAdapter([])
    const service = new ColetaService(fake)

    await service.coletar(
      [
        {
          nome: 'porte',
          valorMin: 2,
          valorMax: 4,
          peso: 1,
          tipoComparacao: 'range',
        },
      ],
      'Joinville',
    )

    assert.deepEqual(fake.ultimaConsulta?.['cnaes'], [])
  })
})
