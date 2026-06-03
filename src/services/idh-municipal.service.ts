import { readFile } from 'node:fs/promises'

export interface IdhMunicipalServiceOptions {
  datasetPath?: string
}

export interface RegistroIdhMunicipal {
  codigoIbge: number
  municipio: string
  uf: string
  idh: number
  ano?: number
  fonte?: string
}

export interface ValidacaoIdhMunicipal {
  valido: boolean
  path: string
  totalRegistros: number
  codigosDuplicados: number[]
  erros: string[]
}

export class IdhMunicipalService {
  private registrosPromise?: Promise<Map<number, RegistroIdhMunicipal>>

  constructor(private readonly options: IdhMunicipalServiceOptions = {}) {}

  get habilitado(): boolean {
    return Boolean(this.options.datasetPath)
  }

  async buscarPorCodigoIbge(codigoIbge: number): Promise<RegistroIdhMunicipal | null> {
    if (!this.habilitado) return null
    if (!Number.isInteger(codigoIbge) || codigoIbge <= 0) return null

    const registros = await this.carregarRegistros()
    return registros.get(codigoIbge) ?? null
  }

  private carregarRegistros(): Promise<Map<number, RegistroIdhMunicipal>> {
    this.registrosPromise ??= carregarDatasetIdh(this.options.datasetPath ?? '')
    return this.registrosPromise
  }
}

export async function validarIdhMunicipalDataset(
  datasetPath: string,
): Promise<ValidacaoIdhMunicipal> {
  const erros: string[] = []

  try {
    const registros = await lerRegistrosIdh(datasetPath)
    const codigos = new Set<number>()
    const duplicados = new Set<number>()

    registros.forEach((registro, index) => {
      const prefixo = `registro ${index + 1}`

      if (!Number.isInteger(registro.codigoIbge) || registro.codigoIbge <= 0) {
        erros.push(`${prefixo}: codigoIbge inválido.`)
      }
      if (!registro.municipio.trim()) {
        erros.push(`${prefixo}: municipio é obrigatório.`)
      }
      if (!/^[A-Z]{2}$/.test(registro.uf)) {
        erros.push(`${prefixo}: uf deve ter 2 letras maiúsculas.`)
      }
      if (!Number.isFinite(registro.idh) || registro.idh < 0 || registro.idh > 1) {
        erros.push(`${prefixo}: idh deve estar entre 0 e 1.`)
      }
      if (registro.ano !== undefined && !Number.isInteger(registro.ano)) {
        erros.push(`${prefixo}: ano deve ser inteiro quando informado.`)
      }
      if (codigos.has(registro.codigoIbge)) {
        duplicados.add(registro.codigoIbge)
      }
      codigos.add(registro.codigoIbge)
    })

    if (registros.length === 0) {
      erros.push('Dataset não contém registros.')
    }

    return {
      valido: erros.length === 0,
      path: datasetPath,
      totalRegistros: registros.length,
      codigosDuplicados: [...duplicados].sort((a, b) => a - b),
      erros,
    }
  } catch (error) {
    return {
      valido: false,
      path: datasetPath,
      totalRegistros: 0,
      codigosDuplicados: [],
      erros: [error instanceof Error ? error.message : String(error)],
    }
  }
}

async function carregarDatasetIdh(
  datasetPath: string,
): Promise<Map<number, RegistroIdhMunicipal>> {
  const registros = await lerRegistrosIdh(datasetPath)
  return new Map(registros.map((registro) => [registro.codigoIbge, registro]))
}

async function lerRegistrosIdh(datasetPath: string): Promise<RegistroIdhMunicipal[]> {
  const bruto = await readFile(datasetPath, 'utf8')
  const payload = JSON.parse(bruto) as unknown
  const registros = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { registros?: unknown }).registros)
      ? (payload as { registros: unknown[] }).registros
      : []

  return registros.map(normalizarRegistro).filter(isRegistroIdhMunicipal)
}

function isRegistroIdhMunicipal(
  valor: RegistroIdhMunicipal | null,
): valor is RegistroIdhMunicipal {
  return valor !== null
}

function normalizarRegistro(valor: unknown): RegistroIdhMunicipal | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null

  const item = valor as Record<string, unknown>
  const codigoIbge = Number(item['codigoIbge'] ?? item['codigo_ibge'])
  const municipio = texto(item['municipio'])
  const uf = texto(item['uf']).toUpperCase()
  const idh = Number(item['idh'])
  const ano = item['ano'] === undefined ? undefined : Number(item['ano'])
  const fonte = texto(item['fonte'])

  return {
    codigoIbge,
    municipio,
    uf,
    idh,
    ...(ano === undefined ? {} : { ano }),
    ...(fonte ? { fonte } : {}),
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}
