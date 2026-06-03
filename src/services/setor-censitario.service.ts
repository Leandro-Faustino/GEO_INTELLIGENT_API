import { readFile } from 'node:fs/promises'

export interface SetorCensitarioResolverOptions {
  geojsonPath?: string
}

export interface ValidacaoSetoresCensitarios {
  valido: boolean
  path: string
  totalFeatures: number
  totalSetores: number
  codigosDuplicados: string[]
  erros: string[]
}

interface FeatureGeoJson {
  type?: string
  properties?: Record<string, unknown>
  geometry?: {
    type?: string
    coordinates?: unknown
  } | null
}

interface SetorIndexado {
  codigo: string
  bbox: BBox
  polygons: Polygon[]
}

interface BBox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

type Position = [number, number]
type Ring = Position[]
type Polygon = Ring[]

export class SetorCensitarioResolver {
  private setoresPromise?: Promise<SetorIndexado[]>

  constructor(private readonly options: SetorCensitarioResolverOptions = {}) {}

  get habilitado(): boolean {
    return Boolean(this.options.geojsonPath)
  }

  async resolver(latitude: number, longitude: number): Promise<string | null> {
    if (!this.habilitado) return null
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

    const setores = await this.carregarSetores()
    for (const setor of setores) {
      if (!bboxContem(setor.bbox, latitude, longitude)) continue
      if (setor.polygons.some((polygon) => pontoEmPolygon(latitude, longitude, polygon))) {
        return setor.codigo
      }
    }

    return null
  }

  private carregarSetores(): Promise<SetorIndexado[]> {
    this.setoresPromise ??= this.lerGeoJson()
    return this.setoresPromise
  }

  private async lerGeoJson(): Promise<SetorIndexado[]> {
    const path = this.options.geojsonPath
    if (!path) return []

    return carregarSetoresDoGeoJson(path)
  }
}

export async function validarSetoresCensitariosGeoJson(
  geojsonPath: string,
): Promise<ValidacaoSetoresCensitarios> {
  const erros: string[] = []
  const duplicados = new Set<string>()

  try {
    const { features, setores } = await carregarGeoJsonComSetores(geojsonPath)
    const codigos = new Set<string>()

    for (const setor of setores) {
      if (codigos.has(setor.codigo)) {
        duplicados.add(setor.codigo)
        continue
      }
      codigos.add(setor.codigo)
    }

    if (features.length === 0) {
      erros.push('GeoJSON não contém features.')
    }
    if (setores.length === 0) {
      erros.push(
        'Nenhuma feature válida com código de setor e geometria Polygon/MultiPolygon foi encontrada.',
      )
    }

    return {
      valido: erros.length === 0,
      path: geojsonPath,
      totalFeatures: features.length,
      totalSetores: setores.length,
      codigosDuplicados: [...duplicados].sort(),
      erros,
    }
  } catch (error) {
    return {
      valido: false,
      path: geojsonPath,
      totalFeatures: 0,
      totalSetores: 0,
      codigosDuplicados: [],
      erros: [error instanceof Error ? error.message : String(error)],
    }
  }
}

async function carregarSetoresDoGeoJson(path: string): Promise<SetorIndexado[]> {
  const { setores } = await carregarGeoJsonComSetores(path)
  return setores
}

async function carregarGeoJsonComSetores(
  path: string,
): Promise<{ features: unknown[]; setores: SetorIndexado[] }> {
  const bruto = await readFile(path, 'utf8')
  const geojson = JSON.parse(bruto) as { type?: string; features?: unknown[] }
  const features = Array.isArray(geojson.features) ? geojson.features : []
  const setores: SetorIndexado[] = []

  for (const feature of features) {
    const setor = normalizarFeature(feature)
    if (setor) setores.push(setor)
  }

  return { features, setores }
}

function normalizarFeature(feature: unknown): SetorIndexado | null {
  if (!feature || typeof feature !== 'object') return null

  const item = feature as FeatureGeoJson
  const codigo = codigoSetor(item.properties ?? {})
  if (!codigo || !item.geometry) return null

  const polygons = polygonsDaGeometria(item.geometry.type, item.geometry.coordinates)
  if (polygons.length === 0) return null

  return {
    codigo,
    polygons,
    bbox: bboxDosPolygons(polygons),
  }
}

function codigoSetor(properties: Record<string, unknown>): string {
  const candidatos = [
    'CD_SETOR',
    'CD_SETOR_2022',
    'CD_GEOCODI',
    'GEOCODIGO',
    'geocodigo',
    'cod_setor',
    'codigoSetor',
    'setorCensitario',
  ]

  for (const chave of candidatos) {
    const valor = properties[chave]
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
    if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  }

  return ''
}

function polygonsDaGeometria(tipo: unknown, coordinates: unknown): Polygon[] {
  if (tipo === 'Polygon') {
    const polygon = normalizarPolygon(coordinates)
    return polygon ? [polygon] : []
  }

  if (tipo === 'MultiPolygon' && Array.isArray(coordinates)) {
    return coordinates
      .map((item) => normalizarPolygon(item))
      .filter((item): item is Polygon => Boolean(item))
  }

  return []
}

function normalizarPolygon(coordinates: unknown): Polygon | null {
  if (!Array.isArray(coordinates)) return null

  const rings = coordinates
    .map((ring) => normalizarRing(ring))
    .filter((ring): ring is Ring => Boolean(ring))

  return rings.length > 0 ? rings : null
}

function normalizarRing(ring: unknown): Ring | null {
  if (!Array.isArray(ring)) return null

  const positions = ring
    .map((position) => normalizarPosition(position))
    .filter((position): position is Position => Boolean(position))

  return positions.length >= 4 ? positions : null
}

function normalizarPosition(position: unknown): Position | null {
  if (!Array.isArray(position) || position.length < 2) return null

  const lon = Number(position[0])
  const lat = Number(position[1])
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

  return [lon, lat]
}

function bboxDosPolygons(polygons: Polygon[]): BBox {
  const bbox: BBox = {
    minLon: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLon: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  }

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        bbox.minLon = Math.min(bbox.minLon, lon)
        bbox.minLat = Math.min(bbox.minLat, lat)
        bbox.maxLon = Math.max(bbox.maxLon, lon)
        bbox.maxLat = Math.max(bbox.maxLat, lat)
      }
    }
  }

  return bbox
}

function bboxContem(bbox: BBox, latitude: number, longitude: number): boolean {
  return (
    longitude >= bbox.minLon &&
    longitude <= bbox.maxLon &&
    latitude >= bbox.minLat &&
    latitude <= bbox.maxLat
  )
}

function pontoEmPolygon(latitude: number, longitude: number, polygon: Polygon): boolean {
  const [exterior, ...buracos] = polygon
  if (!exterior || !pontoEmRing(latitude, longitude, exterior)) return false

  return !buracos.some((ring) => pontoEmRing(latitude, longitude, ring))
}

function pontoEmRing(latitude: number, longitude: number, ring: Ring): boolean {
  let dentro = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    const cruza =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi

    if (cruza) dentro = !dentro
  }

  return dentro
}
