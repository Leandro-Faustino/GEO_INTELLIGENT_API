import { randomUUID } from 'node:crypto'
import type {
  AnaliseDTO,
  CentroMapaDTO,
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
  IAnaliseRepository,
  IBaseInternaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
  MapaResponseDTO,
  OportunidadeDTO,
} from '../repositories/interfaces/index.js'

const MAX_OPORTUNIDADES = 200
const VERSAO_MODELO_LOCAL = '0.1.0-local'

export class AnaliseService {
  constructor(
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
    private readonly baseInternaRepo: IBaseInternaRepository,
    private readonly analiseRepo: IAnaliseRepository,
  ) {}

  async executarLookalike(
    clienteId: string,
    escopo: string,
    limiar = 0.3,
    perfilId?: string,
    tipoAlvo?: string,
  ): Promise<AnaliseDTO> {
    const perfis = await this.perfilRepo.buscarPorCliente(clienteId)
    const perfil = perfilId
      ? perfis.find((p) => p.id === perfilId)
      : tipoAlvo
        ? (perfis.find((p) => p.tipo === tipoAlvo) ?? perfis[0])
        : perfis[0]

    if (!perfil && perfilId) {
      throw Object.assign(
        new Error(`Perfil '${perfilId}' não encontrado para este cliente.`),
        { statusCode: 404 },
      )
    }
    if (!perfil) {
      throw Object.assign(new Error('Nenhum perfil encontrado para este cliente.'), {
        statusCode: 404,
      })
    }

    const entidades = await this.entidadeRepo.buscarPorEscopo(escopo, perfil.tipo)
    const base = await this.baseInternaRepo.buscarPorCliente(clienteId)
    const jaClientes = new Set(
      base?.compradores.map((comprador) => comprador.identificador) ?? [],
    )
    const oportunidades: OportunidadeDTO[] = []

    for (const entidade of entidades) {
      if (jaClientes.has(entidade.identificador)) continue
      if (perfil.exclusoes.includes(entidade.identificador)) continue

      const resultado = this.calcularSimilaridade(perfil.criterios, entidade)
      if (resultado.total < limiar) continue

      oportunidades.push(montarOportunidade(entidade, resultado))

      if (oportunidades.length >= MAX_OPORTUNIDADES) break
    }

    oportunidades.sort((a, b) => b.score.valor - a.score.valor)

    const coordsValidas = oportunidades.filter((o) => o.lat != null && o.lon != null)
    const centroMapa: CentroMapaDTO | null =
      coordsValidas.length > 0
        ? {
            lat: coordsValidas.reduce((s, o) => s + o.lat!, 0) / coordsValidas.length,
            lon: coordsValidas.reduce((s, o) => s + o.lon!, 0) / coordsValidas.length,
            zoom: 12,
          }
        : null

    const now = new Date().toISOString()
    return this.analiseRepo.salvar({
      id: randomUUID(),
      clienteId,
      perfilId: perfil.id,
      tipo: perfil.tipo,
      escopo,
      versaoModelo: VERSAO_MODELO_LOCAL,
      origem: 'local',
      oportunidades,
      centroMapa,
      createdAt: now,
      updatedAt: now,
    })
  }

  async buscarDadosMapa(analiseId: string): Promise<MapaResponseDTO | null> {
    const analise = await this.analiseRepo.buscarPorId(analiseId)
    if (!analise) return null

    const entidades = await this.entidadeRepo.buscarPorEscopo(analise.escopo, analise.tipo)
    const base = await this.baseInternaRepo.buscarPorCliente(analise.clienteId)
    const jaClientes = new Set(base?.compradores.map((c) => c.identificador) ?? [])

    const scoreMap = new Map<string, { score: number; faixaScore: 'alta' | 'media' | 'baixa' }>()
    for (const op of analise.oportunidades) {
      const v = op.score.valor
      scoreMap.set(op.entidadeAlvoId, {
        score: v,
        faixaScore: v >= 0.8 ? 'alta' : v >= 0.5 ? 'media' : 'baixa',
      })
    }

    const mapaEntidades = entidades.map((e) => {
      const scored = scoreMap.get(e.identificador)
      return {
        identificador: e.identificador,
        nome: e.nome,
        endereco: e.endereco,
        lat: e.latitude ?? null,
        lon: e.longitude ?? null,
        score: scored?.score ?? null,
        faixaScore: scored?.faixaScore ?? null,
        jaCliente: jaClientes.has(e.identificador),
      }
    })

    const comCoords = mapaEntidades.filter((e) => e.lat != null && e.lon != null)
    const centroMapa: CentroMapaDTO | null =
      comCoords.length > 0
        ? {
            lat: comCoords.reduce((s, e) => s + e.lat!, 0) / comCoords.length,
            lon: comCoords.reduce((s, e) => s + e.lon!, 0) / comCoords.length,
            zoom: 12,
          }
        : null

    return {
      analiseId,
      centroMapa,
      totalEntidades: mapaEntidades.length,
      entidades: mapaEntidades,
    }
  }

  private calcularSimilaridade(
    criterios: CriterioDerivadoDTO[],
    entidade: EntidadeAlvoDTO,
  ): SimilaridadeResultado {
    if (criterios.length === 0) return { total: 0, criteriosMatching: [] }

    let somaPonderada = 0
    let somaPesos = 0
    const criteriosMatching: SimilaridadeResultado['criteriosMatching'] = []

    for (const criterio of criterios) {
      somaPesos += criterio.peso
      const valor = entidade.atributos[criterio.nome]
      if (valor === undefined) continue

      const scoreNorm = this.avaliarCriterio(criterio, valor)
      somaPonderada += scoreNorm * criterio.peso

      if (scoreNorm > 0) {
        criteriosMatching.push({ nome: criterio.nome, scoreNorm, peso: criterio.peso })
      }
    }

    const total = somaPesos > 0 ? somaPonderada / somaPesos : 0
    return { total, criteriosMatching }
  }

  private avaliarCriterio(criterio: CriterioDerivadoDTO, valor: unknown): number {
    switch (criterio.tipoComparacao) {
      case 'range': {
        const numero = Number(valor)
        const min = Number(criterio.valorMin)
        const max = Number(criterio.valorMax)
        if (!Number.isFinite(numero) || !Number.isFinite(min) || !Number.isFinite(max)) {
          return 0
        }
        if (numero >= min && numero <= max) return 1

        const distancia = Math.min(Math.abs(numero - min), Math.abs(numero - max))
        const amplitude = Math.max(max - min, 1)
        return Math.max(0, 1 - distancia / amplitude)
      }
      case 'enum': {
        const aceitos = Array.isArray(criterio.valorMin)
          ? criterio.valorMin
          : [criterio.valorMin]
        if (criterio.nome === 'cnae') {
          const norm = (v: unknown) => String(v ?? '').replace(/\D/g, '')
          return aceitos.map(norm).includes(norm(valor)) ? 1 : 0
        }
        return aceitos.map(String).includes(String(valor)) ? 1 : 0
      }
      case 'booleano':
        return valor === criterio.valorMin ? 1 : 0
      case 'distancia':
      default:
        return 0
    }
  }
}

// ─── tipos internos ───────────────────────────────────────────────────────────

interface SimilaridadeResultado {
  total: number
  criteriosMatching: Array<{ nome: string; scoreNorm: number; peso: number }>
}

// ─── helpers de montagem ──────────────────────────────────────────────────────

function montarOportunidade(
  entidade: EntidadeAlvoDTO,
  resultado: SimilaridadeResultado,
): OportunidadeDTO {
  const { total, criteriosMatching } = resultado
  const pct = Math.round(total * 100)
  const probConversao = arredondar(total * 0.8)
  const faixaScore: 'alta' | 'media' | 'baixa' =
    total >= 0.8 ? 'alta' : total >= 0.5 ? 'media' : 'baixa'

  return {
    id: randomUUID(),
    entidadeAlvoId: entidade.identificador,
    entidadeNome: entidade.nome,
    entidadeCidade: entidade.escopo,
    nome: entidade.nome,
    endereco: entidade.endereco,
    lat: entidade.latitude ?? null,
    lon: entidade.longitude ?? null,
    faixaScore,
    tipo: entidade.tipo,
    justificativa: montarJustificativa(pct, criteriosMatching),
    ganchoAbordagem: montarGancho(entidade.nome, criteriosMatching),
    prioridade: faixaScore,
    score: {
      valor: arredondar(total),
      similaridade: arredondar(total),
      probConversao,
    },
    latitude: entidade.latitude ?? null,
    longitude: entidade.longitude ?? null,
  }
}

function montarJustificativa(
  pct: number,
  criteriosMatching: SimilaridadeResultado['criteriosMatching'],
): string {
  if (criteriosMatching.length === 0) {
    return `${pct}% de similaridade com o perfil ideal.`
  }

  const top = criteriosMatching
    .sort((a, b) => b.peso * b.scoreNorm - a.peso * a.scoreNorm)
    .slice(0, 3)
    .map((c) => `${c.nome} (${Math.round(c.scoreNorm * 100)}%)`)
    .join(', ')

  return `${pct}% de similaridade com o perfil ideal. Destaques: ${top}.`
}

function montarGancho(
  nome: string,
  criteriosMatching: SimilaridadeResultado['criteriosMatching'],
): string {
  if (criteriosMatching.length === 0) {
    return `${nome} possui perfil compatível com seus melhores clientes.`
  }

  const topCriterio = criteriosMatching
    .sort((a, b) => b.peso * b.scoreNorm - a.peso * a.scoreNorm)[0]

  const atributo = topCriterio?.nome ?? ''
  const sufixo = atributo
    ? ` com ${atributo} alinhado ao perfil dos seus melhores clientes`
    : ''

  return `${nome} é um candidato de alta afinidade${sufixo} — oportunidade de abordagem direta.`
}

function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000
}
