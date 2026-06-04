import { randomUUID } from 'node:crypto'
import type {
  AnaliseDTO,
  EntidadeAlvoDTO,
  IAnaliseRepository,
  IEntidadeAlvoRepository,
} from '../repositories/interfaces/index.js'

// --- DTOs de saída (layer de serviço, não persistidos) ---

export interface PerfilDemografico {
  idadeMedia: number | null
  rendaMedia: number | null
  profissoesPrincipais: string[]
  generoPredominante: string | null
}

export interface ZonaTargeting {
  id: string
  nome: string
  centro: { lat: number; lon: number }
  raioKm: number
  intensidade: number
  entidadesNaZona: number
  totalEntidadesZona: number
  perfilDemografico: PerfilDemografico
  targeting: {
    localizacao: { lat: number; lon: number; raioKm: number }
    idadeMin: number | null
    idadeMax: number | null
    rendaEstimada: string | null
    interesses: string[]
  }
}

export interface TargetingResult {
  clienteId: string
  analiseId: string
  totalZonas: number
  centroMapa: { lat: number; lon: number; zoom: number }
  zonas: ZonaTargeting[]
  resumoCampanha: {
    alcanceEstimado: number
    investimentoSugerido: string
    melhorHorario: string | null
  }
}

// --- Constantes geográficas ---

const KM_PER_DEG_LAT = 111.32

// --- Service ---

export class TargetingService {
  constructor(
    private readonly analiseRepo: IAnaliseRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
  ) {}

  async gerarZonasTargeting(
    analiseId: string,
    raioZonaKm = 2,
    limiarScore = 0.5,
  ): Promise<TargetingResult> {
    const analise = await this.analiseRepo.buscarPorId(analiseId)
    if (!analise) {
      throw Object.assign(new Error(`Análise '${analiseId}' não encontrada.`), {
        statusCode: 404,
      })
    }

    const entidades = await this.entidadeRepo.buscarPorEscopo(analise.escopo)

    // monta mapa de scores a partir das oportunidades da análise
    const scoreMap = new Map<string, number>()
    for (const op of analise.oportunidades) {
      scoreMap.set(op.entidadeAlvoId, op.score.valor)
    }

    // só entidades com coordenadas reais (0/0 = sem coordenada)
    const comCoordenadas = entidades.filter(
      (e) => e.latitude !== 0 || e.longitude !== 0,
    )

    if (comCoordenadas.length === 0) {
      return resultVazio(analise)
    }

    // tamanho da célula do grid em graus
    const refLat = mean(comCoordenadas.map((e) => e.latitude))
    const cellSizeLat = (raioZonaKm * 2) / KM_PER_DEG_LAT
    const cellSizeLon =
      (raioZonaKm * 2) / (KM_PER_DEG_LAT * Math.cos((refLat * Math.PI) / 180))

    // agrupa entidades por célula do grid
    const cells = new Map<
      string,
      { entidades: EntidadeAlvoDTO[]; altoScore: EntidadeAlvoDTO[] }
    >()

    for (const entidade of comCoordenadas) {
      const key = gridKey(entidade.latitude, entidade.longitude, cellSizeLat, cellSizeLon)
      const score = scoreMap.get(entidade.identificador) ?? 0
      const cell = cells.get(key) ?? { entidades: [], altoScore: [] }
      cell.entidades.push(entidade)
      if (score >= limiarScore) {
        cell.altoScore.push(entidade)
      }
      cells.set(key, cell)
    }

    // gera uma zona por célula com pelo menos uma entidade de alto score
    const zonas: ZonaTargeting[] = []

    for (const [, cell] of cells) {
      if (cell.altoScore.length === 0) continue

      const centroLat = mean(cell.altoScore.map((e) => e.latitude))
      const centroLon = mean(cell.altoScore.map((e) => e.longitude))
      const perfil = extrairPerfilDemografico(cell.altoScore)
      const intensidade = arredondar(cell.altoScore.length / cell.entidades.length)

      zonas.push({
        id: randomUUID(),
        nome: nomearZona(cell.altoScore, centroLat, centroLon),
        centro: { lat: arredondar(centroLat), lon: arredondar(centroLon) },
        raioKm: raioZonaKm,
        intensidade,
        entidadesNaZona: cell.altoScore.length,
        totalEntidadesZona: cell.entidades.length,
        perfilDemografico: perfil,
        targeting: gerarTargeting(perfil, centroLat, centroLon, raioZonaKm),
      })
    }

    zonas.sort((a, b) => b.intensidade - a.intensidade)

    const centroMapa = calcularCentroMapa(zonas, comCoordenadas)
    const alcanceEstimado = zonas.reduce((sum, z) => sum + z.entidadesNaZona, 0)

    return {
      clienteId: analise.clienteId,
      analiseId,
      totalZonas: zonas.length,
      centroMapa,
      zonas,
      resumoCampanha: {
        alcanceEstimado,
        investimentoSugerido: sugerirInvestimento(alcanceEstimado),
        melhorHorario: null,
      },
    }
  }

  exportarCSV(result: TargetingResult): string {
    const header =
      '"zona","latitude","longitude","raio_km","intensidade","idade_min","idade_max","renda","interesses"'
    const rows = result.zonas.map((z) =>
      [
        `"${z.nome}"`,
        z.centro.lat,
        z.centro.lon,
        z.raioKm,
        z.intensidade,
        z.targeting.idadeMin ?? '',
        z.targeting.idadeMax ?? '',
        `"${z.targeting.rendaEstimada ?? ''}"`,
        `"${z.targeting.interesses.join('; ')}"`,
      ].join(','),
    )
    return [header, ...rows].join('\n')
  }
}

// --- Funções auxiliares (puras, testáveis) ---

function gridKey(
  lat: number,
  lon: number,
  cellSizeLat: number,
  cellSizeLon: number,
): string {
  return `${Math.floor(lat / cellSizeLat)}_${Math.floor(lon / cellSizeLon)}`
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function topN(items: string[], n: number): string[] {
  const freq = new Map<string, number>()
  for (const item of items) {
    freq.set(item, (freq.get(item) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item)
}

function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000
}

function nomearZona(entidades: EntidadeAlvoDTO[], lat: number, lon: number): string {
  const bairros = entidades
    .map((e) => e.atributos['bairro'])
    .filter((b): b is string => typeof b === 'string' && b.length > 0)
  return topN(bairros, 1)[0] ?? `Zona Grid ${lat.toFixed(2)}/${lon.toFixed(2)}`
}

function extrairPerfilDemografico(entidades: EntidadeAlvoDTO[]): PerfilDemografico {
  const idades = entidades
    .map((e) => Number(e.atributos['idade']))
    .filter(Number.isFinite)
  const rendas = entidades
    .map((e) => Number(e.atributos['renda']))
    .filter(Number.isFinite)
  const profissoes = entidades
    .map((e) => e.atributos['profissao'])
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  const generos = entidades
    .map((e) => e.atributos['genero'])
    .filter((g): g is string => typeof g === 'string' && g.length > 0)

  return {
    idadeMedia: idades.length > 0 ? arredondar(mean(idades)) : null,
    rendaMedia: rendas.length > 0 ? arredondar(mean(rendas)) : null,
    profissoesPrincipais: topN(profissoes, 3),
    generoPredominante: topN(generos, 1)[0] ?? null,
  }
}

function gerarTargeting(
  perfil: PerfilDemografico,
  lat: number,
  lon: number,
  raioKm: number,
) {
  const idadeMin =
    perfil.idadeMedia !== null ? Math.floor(perfil.idadeMedia * 0.8) : null
  const idadeMax =
    perfil.idadeMedia !== null ? Math.ceil(perfil.idadeMedia * 1.25) : null
  const rendaEstimada =
    perfil.rendaMedia !== null
      ? `${Math.floor(perfil.rendaMedia * 0.8)}-${Math.ceil(perfil.rendaMedia * 1.25)}`
      : null

  return {
    localizacao: { lat: arredondar(lat), lon: arredondar(lon), raioKm },
    idadeMin,
    idadeMax,
    rendaEstimada,
    interesses: profissoesParaInteresses(perfil.profissoesPrincipais),
  }
}

function calcularCentroMapa(
  zonas: ZonaTargeting[],
  entidades: EntidadeAlvoDTO[],
): { lat: number; lon: number; zoom: number } {
  const source = zonas.length > 0 ? zonas.map((z) => z.centro) : entidades
  const lats =
    zonas.length > 0
      ? zonas.map((z) => z.centro.lat)
      : entidades.map((e) => e.latitude)
  const lons =
    zonas.length > 0
      ? zonas.map((z) => z.centro.lon)
      : entidades.map((e) => e.longitude)
  void source
  return {
    lat: arredondar(mean(lats)),
    lon: arredondar(mean(lons)),
    zoom: 13,
  }
}

function sugerirInvestimento(alcance: number): string {
  if (alcance === 0) return 'Nenhuma zona de targeting identificada.'
  const min = alcance * 10
  const max = alcance * 30
  return `Para atingir ~${alcance} leads qualificados, sugerimos R$ ${min}-${max} em ads segmentados.`
}

const INTERESSE_MAP: Record<string, string> = {
  dentista: 'odontologia',
  médico: 'saúde',
  medico: 'saúde',
  advogado: 'direito',
  advogada: 'direito',
  engenheiro: 'engenharia',
  engenheira: 'engenharia',
  professor: 'educação',
  professora: 'educação',
  nutricionista: 'nutrição',
  psicólogo: 'saúde mental',
  psicologo: 'saúde mental',
  fisioterapeuta: 'saúde',
}

function profissoesParaInteresses(profissoes: string[]): string[] {
  const interesses = profissoes.map((p) => INTERESSE_MAP[p.toLowerCase()] ?? p)
  return [...new Set(interesses)]
}

function resultVazio(analise: AnaliseDTO): TargetingResult {
  return {
    clienteId: analise.clienteId,
    analiseId: analise.id,
    totalZonas: 0,
    centroMapa: { lat: 0, lon: 0, zoom: 13 },
    zonas: [],
    resumoCampanha: {
      alcanceEstimado: 0,
      investimentoSugerido: 'Nenhuma zona de targeting identificada.',
      melhorHorario: null,
    },
  }
}
