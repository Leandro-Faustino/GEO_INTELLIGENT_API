import {
  BaseAdapter,
  type AdapterOptions,
  type EnriquecimentoContexto,
} from './base-adapter.js'
import type { IdhMunicipalService } from '../services/idh-municipal.service.js'

export interface IbgeAdapterOptions extends AdapterOptions {
  baseUrl?: string
  defaultUf?: string
  idhService?: IdhMunicipalService
}

interface MunicipioIbge {
  id: number
  nome: string
  microrregiao?: {
    nome?: string
    mesorregiao?: {
      UF?: {
        sigla?: string
      }
    }
  }
  'regiao-imediata'?: {
    nome?: string
  }
}

// Agregados IBGE usados para enriquecimento municipal
// https://servicodados.ibge.gov.br/api/docs/agregados
const AGREGADO_POPULACAO = '6579'   // Censo Demográfico 2022 — população residente
const VARIAVEL_POPULACAO = '9324'   // variável: pessoas residentes
const AGREGADO_PIB = '5938'         // PIB dos Municípios — série anual
const VARIAVEL_PIB_MIL_REAIS = '37' // variável: PIB a preços correntes (mil reais)

export class AdaptadorIBGE extends BaseAdapter {
  readonly nome = 'ibge-censo'
  private readonly baseUrl: string
  private readonly defaultUf: string
  private readonly idhService: IdhMunicipalService | undefined
  private readonly cacheMunicipiosPorUf = new Map<string, MunicipioIbge[]>()

  constructor(options: IbgeAdapterOptions = {}) {
    super(options)
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
    this.defaultUf = (options.defaultUf ?? 'SC').toUpperCase()
    this.idhService = options.idhService
  }

  override get modo(): 'real' | 'mock' | 'hibrido' {
    return this.baseUrl ? 'hibrido' : 'mock'
  }

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async (signal) => {
      if (this.baseUrl) {
        const uf = String(parametros['uf'] ?? this.defaultUf).toUpperCase()
        const municipio = String(parametros['municipio'] ?? '')
        const municipios = await this.buscarMunicipiosPorUf(uf, signal)
        const filtro = normalizarTexto(municipio)

        return municipios
          .filter((item) => !filtro || normalizarTexto(item.nome).includes(filtro))
          .map((item) => this.normalizarMunicipio(item))
      }

      const municipio = String(parametros['municipio'] ?? '')
      return this.consultarMock(municipio)
    })
  }

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async (signal) => {
      if (this.baseUrl) {
        const municipio = await this.resolverMunicipio({ identificador }, signal)
        if (!municipio) {
          return {
            identificador,
            encontrado: false,
            fonte: this.nome,
            enriquecidoEm: new Date().toISOString(),
          }
        }

        return this.enriquecerMunicipio(municipio, signal)
      }

      return this.enriquecerMock(identificador)
    })
  }

  async enriquecerComContexto(
    contexto: EnriquecimentoContexto,
  ): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer-contexto', async (signal) => {
      if (!this.baseUrl) {
        return this.enriquecerMock(contexto.identificador)
      }

      const municipio = await this.resolverMunicipio(contexto, signal)
      if (!municipio) {
        return {
          identificador: contexto.identificador,
          encontrado: false,
          fonte: this.nome,
          enriquecidoEm: new Date().toISOString(),
        }
      }

      return this.enriquecerMunicipio(municipio, signal)
    })
  }

  private async buscarMunicipiosPorUf(
    uf: string,
    signal: AbortSignal,
  ): Promise<MunicipioIbge[]> {
    const cached = this.cacheMunicipiosPorUf.get(uf)
    if (cached) return cached

    const municipios = await this.fetchJson<MunicipioIbge[]>(
      `/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`,
      signal,
    )
    this.cacheMunicipiosPorUf.set(uf, municipios)
    return municipios
  }

  private async buscarMunicipioPorCodigo(
    codigoIbge: number,
    signal: AbortSignal,
  ): Promise<MunicipioIbge | null> {
    try {
      // A API pública do IBGE retorna 200 com [] para códigos municipais inválidos
      const resposta = await this.fetchJson<MunicipioIbge | MunicipioIbge[]>(
        `/v1/localidades/municipios/${codigoIbge}`,
        signal,
      )
      if (Array.isArray(resposta) || typeof (resposta as MunicipioIbge).id !== 'number') {
        return null
      }
      return resposta as MunicipioIbge
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 500) return null
      throw error
    }
  }

  private async resolverMunicipio(
    contexto: Partial<EnriquecimentoContexto> & { identificador: string },
    signal: AbortSignal,
  ): Promise<MunicipioIbge | null> {
    const candidatosCodigo = [
      contexto.atributos?.['codigoIbge'],
      contexto.atributos?.['codigo_ibge'],
      contexto.identificador,
    ]

    for (const candidato of candidatosCodigo) {
      const codigo = codigoMunicipio(String(candidato ?? ''))
      if (codigo) {
        return this.buscarMunicipioPorCodigo(codigo, signal)
      }
    }

    const municipioNome = primeiroTexto(
      contexto.atributos?.['municipio'],
      contexto.atributos?.['cidade'],
      contexto.atributos?.['localidade'],
      contexto.identificador,
    )
    const uf = primeiroTexto(contexto.atributos?.['uf'], this.defaultUf).toUpperCase()

    if (!municipioNome) return null

    const municipios = await this.buscarMunicipiosPorUf(uf, signal)
    const alvo = normalizarTexto(municipioNome)
    return municipios.find((item) => normalizarTexto(item.nome) === alvo) ?? null
  }

  private async enriquecerMunicipio(
    municipio: MunicipioIbge,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const [dadosPopulacao, dadosPib] = await Promise.all([
      this.buscarAgregadoMunicipal(AGREGADO_POPULACAO, VARIAVEL_POPULACAO, municipio.id, signal),
      this.buscarAgregadoMunicipal(AGREGADO_PIB, VARIAVEL_PIB_MIL_REAIS, municipio.id, signal),
    ])
    const idhRegistro = await this.idhService?.buscarPorCodigoIbge(municipio.id)
    const pibPerCapitaEstimado =
      dadosPopulacao.valor > 0 && dadosPib.valor > 0
        ? (dadosPib.valor * 1000) / dadosPopulacao.valor
        : 0

    return {
      codigoIbge: municipio.id,
      municipio: municipio.nome,
      microrregiao: municipio.microrregiao?.nome ?? '',
      regiaoImediata: municipio['regiao-imediata']?.nome ?? '',
      uf: municipio.microrregiao?.mesorregiao?.UF?.sigla ?? this.defaultUf,
      populacao: dadosPopulacao.valor,
      populacaoAno: dadosPopulacao.ano,
      pibMilReais: dadosPib.valor,
      pibAno: dadosPib.ano,
      pibPerCapitaEstimado,
      ...(idhRegistro ? { idh: idhRegistro.idh, idhAno: idhRegistro.ano ?? null } : {}),
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }
  }

  private async buscarAgregadoMunicipal(
    agregado: string,
    variavel: string,
    codigoIbge: number,
    signal: AbortSignal,
  ): Promise<{ valor: number; ano: string | null }> {
    const payload = await this.fetchJson<unknown[]>(
      `/v3/agregados/${agregado}/periodos/-1/variaveis/${variavel}?localidades=N6[${codigoIbge}]`,
      signal,
    )

    const raiz = registroCampo(payload[0])
    const resultados = arrayCampo(raiz, 'resultados')
    const primeiroResultado = registroCampo(resultados[0])
    const series = arrayCampo(primeiroResultado, 'series')
    const primeiraSerie = registroCampo(series[0])
    const serie = registroCampo(primeiraSerie['serie'])
    const ano = Object.keys(serie)[0] ?? null
    const valor = Object.values(serie)[0]

    return { valor: numeroCampo(valor), ano }
  }

  private async fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      signal,
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      throw Object.assign(new Error(`IBGE respondeu ${response.status}`), {
        statusCode: response.status,
      })
    }

    return (await response.json()) as T
  }

  private normalizarMunicipio(municipio: MunicipioIbge): Record<string, unknown> {
    const uf = municipio.microrregiao?.mesorregiao?.UF?.sigla ?? this.defaultUf
    const microrregiao = municipio.microrregiao?.nome ?? ''
    return {
      identificador: String(municipio.id),
      nome: municipio.nome,
      tipo: 'territorio',
      endereco: `${municipio.nome}, ${uf}`,
      latitude: null,
      longitude: null,
      fonte: this.nome,
      atributos: {
        codigoIbge: municipio.id,
        municipio: municipio.nome,
        microrregiao,
        regiaoImediata: municipio['regiao-imediata']?.nome ?? '',
        uf,
      },
    }
  }

  private consultarMock(municipio: string): Record<string, unknown>[] {
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
        latitude: null,
        longitude: null,
        fonte: this.nome,
        atributos: {
          rendaMediaPc: setor.rendaMediaPc,
          populacao: setor.populacao,
          densidadeHabKm2: setor.densidadeHabKm2,
          faixaEtariaPredominante: setor.faixaEtariaPredominante,
        },
      }))
  }

  private enriquecerMock(identificador: string): Record<string, unknown> {
    return {
      codigoSetor: identificador,
      rendaMediaPc: 3500,
      populacao: 14000,
      densidadeHabKm2: 3200,
      idh: 0.785,
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }
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

function codigoMunicipio(valor: string): number | null {
  const match = valor.trim().match(/^(\d{7})(?:\D|$)/)
  if (!match) return null

  const codigo = Number(match[1])
  return Number.isFinite(codigo) ? codigo : null
}

function primeiroTexto(...valores: unknown[]): string {
  for (const valor of valores) {
    if (typeof valor === 'string' && valor.trim().length > 0) {
      return valor.trim()
    }
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      return String(valor)
    }
  }

  return ''
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
}

function registroCampo(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function arrayCampo(origem: Record<string, unknown>, nome: string): unknown[] {
  const valor = origem[nome]
  return Array.isArray(valor) ? valor : []
}

function numeroCampo(valor: unknown): number {
  const normalizado =
    typeof valor === 'string' ? valor.replace(',', '.') : valor
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}
