import type { IAdaptadorFonte } from '../adapters/base-adapter.js'
import type {
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
} from '../repositories/interfaces/index.js'

export type CriterioPerfil = CriterioDerivadoDTO

export class ColetaService {
  constructor(private readonly adapterCnpj: IAdaptadorFonte) {}

  async coletar(
    criterios: CriterioDerivadoDTO[],
    escopo: string,
    limite = 200,
    tipo = 'pj',
  ): Promise<EntidadeAlvoDTO[]> {
    // Coleta via CNPJ só faz sentido para perfis PJ (base PF não tem CNAE)
    if (tipo !== 'pj') return []

    const municipio = this.extrairMunicipio(criterios) || escopo
    const resultados = await this.adapterCnpj.consultar({
      cnaes: this.extrairCnaes(criterios),
      municipio,
      limit: limite,
    })

    const vistos = new Set<string>()
    const entidades: EntidadeAlvoDTO[] = []

    for (const resultado of resultados) {
      const entidade = this.normalizar(resultado, escopo)
      if (!entidade.identificador || vistos.has(entidade.identificador)) continue

      vistos.add(entidade.identificador)
      entidades.push(entidade)
    }

    return entidades.slice(0, limite)
  }

  private extrairCnaes(criterios: CriterioDerivadoDTO[]): string[] {
    const criterio = criterios.find(
      (item) => item.nome.toLocaleLowerCase('pt-BR') === 'cnae',
    )
    if (!criterio) return []

    const valores = Array.isArray(criterio.valorMin)
      ? criterio.valorMin
      : [criterio.valorMin]

    return valores
      .map((valor) => normalizarCnae(valor))
      .filter((valor): valor is string => valor.length > 0)
  }

  private extrairMunicipio(criterios: CriterioDerivadoDTO[]): string {
    const criterio = criterios.find((item) =>
      ['municipio', 'cidade'].includes(item.nome.toLocaleLowerCase('pt-BR')),
    )
    if (!criterio) return ''

    const valor = Array.isArray(criterio.valorMin)
      ? criterio.valorMin[0]
      : criterio.valorMin
    return typeof valor === 'string' ? valor : ''
  }

  private normalizar(
    resultado: Record<string, unknown>,
    escopo: string,
  ): EntidadeAlvoDTO {
    const atributos =
      resultado['atributos'] &&
      typeof resultado['atributos'] === 'object' &&
      !Array.isArray(resultado['atributos'])
        ? (resultado['atributos'] as Record<string, unknown>)
        : {}

    return {
      identificador: stringCampo(resultado, 'identificador'),
      nome: stringCampo(resultado, 'nome'),
      tipo: stringCampo(resultado, 'tipo') || 'pj',
      atributos,
      endereco: stringCampo(resultado, 'endereco'),
      latitude: numeroCampo(resultado, 'latitude'),
      longitude: numeroCampo(resultado, 'longitude'),
      fonte: stringCampo(resultado, 'fonte') || this.adapterCnpj.nome,
      escopo,
    }
  }
}

function normalizarCnae(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '')
}

function stringCampo(origem: Record<string, unknown>, nome: string): string {
  const valor = origem[nome]
  return valor === undefined || valor === null ? '' : String(valor)
}

function numeroCampo(origem: Record<string, unknown>, nome: string): number {
  const valor = Number(origem[nome])
  return Number.isFinite(valor) ? valor : 0
}
