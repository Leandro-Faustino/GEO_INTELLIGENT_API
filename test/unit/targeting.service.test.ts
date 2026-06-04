import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TargetingService } from '../../src/services/targeting.service.js'
import type {
  AnaliseDTO,
  EntidadeAlvoDTO,
  IAnaliseRepository,
  IEntidadeAlvoRepository,
} from '../../src/repositories/interfaces/index.js'

// --- Fakes ---

class AnaliseFake implements IAnaliseRepository {
  constructor(private readonly dado: AnaliseDTO | null) {}
  async salvar(a: AnaliseDTO): Promise<AnaliseDTO> {
    return a
  }
  async buscarPorId(): Promise<AnaliseDTO | null> {
    return this.dado
  }
}

class EntidadeRepoFake implements IEntidadeAlvoRepository {
  constructor(private readonly entidades: EntidadeAlvoDTO[]) {}
  async salvarLote(): Promise<void> {}
  async buscarPorEscopo(): Promise<EntidadeAlvoDTO[]> {
    return this.entidades
  }
}

// --- Fixtures ---

function makeAnalise(ops: Array<{ id: string; score: number }>): AnaliseDTO {
  return {
    id: 'analise-1',
    clienteId: 'cliente-1',
    tipo: 'pf',
    escopo: 'joinville-2026',
    versaoModelo: '0.1.0',
    oportunidades: ops.map((op) => ({
      id: op.id,
      entidadeAlvoId: op.id,
      tipo: 'pf',
      justificativa: 'teste',
      ganchoAbordagem: 'teste',
      prioridade: op.score >= 0.8 ? 'alta' : op.score >= 0.5 ? 'media' : 'baixa',
      score: {
        valor: op.score,
        similaridade: op.score,
        probConversao: op.score * 0.8,
      },
    })),
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

// Dois clusters geograficamente distintos (>10km de distância)
const LAT_CENTRO = -26.3
const LON_CENTRO = -48.84
const LAT_NORTE = -26.4
const LON_NORTE = -48.95

function entidadeCentro(id: string): EntidadeAlvoDTO {
  return {
    identificador: id,
    nome: `Dentista ${id}`,
    tipo: 'pf',
    atributos: { profissao: 'dentista', idade: 38, renda: 9000, bairro: 'Centro', genero: 'F' },
    endereco: 'Rua A, Centro',
    latitude: LAT_CENTRO,
    longitude: LON_CENTRO,
    fonte: 'upload',
    escopo: 'joinville-2026',
  }
}

function entidadeNorte(id: string): EntidadeAlvoDTO {
  return {
    identificador: id,
    nome: `Outro ${id}`,
    tipo: 'pf',
    atributos: { profissao: 'outro', idade: 60, renda: 2000 },
    endereco: 'Rua B, Norte',
    latitude: LAT_NORTE,
    longitude: LON_NORTE,
    fonte: 'upload',
    escopo: 'joinville-2026',
  }
}

function service(analise: AnaliseDTO | null, entidades: EntidadeAlvoDTO[]): TargetingService {
  return new TargetingService(new AnaliseFake(analise), new EntidadeRepoFake(entidades))
}

// --- Testes ---

test('gerarZonasTargeting agrupa entidades em zonas por proximidade', async () => {
  const entidades = [
    entidadeCentro('pf-1'),
    entidadeCentro('pf-2'),
    entidadeCentro('pf-3'),
    entidadeNorte('pf-4'),
    entidadeNorte('pf-5'),
  ]
  // scores: pf-1,2,3 acima do limiar; pf-4,5 abaixo
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.9 },
    { id: 'pf-2', score: 0.8 },
    { id: 'pf-3', score: 0.7 },
    { id: 'pf-4', score: 0.2 },
    { id: 'pf-5', score: 0.1 },
  ])

  const result = await service(analise, entidades).gerarZonasTargeting('analise-1', 2, 0.5)

  assert.equal(result.totalZonas, 1, 'só a zona Centro deve aparecer')
  assert.equal(result.zonas[0].entidadesNaZona, 3)
  assert.equal(result.zonas[0].totalEntidadesZona, 3)
})

test('gerarZonasTargeting calcula intensidade corretamente (altoScore / total da célula)', async () => {
  const entidades = [
    entidadeCentro('pf-1'),
    entidadeCentro('pf-2'),
    entidadeCentro('pf-3'), // 3 na célula
  ]
  // apenas 2 dos 3 acima do limiar → intensidade = 2/3 ≈ 0.667
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.9 },
    { id: 'pf-2', score: 0.8 },
    { id: 'pf-3', score: 0.3 }, // abaixo do limiar
  ])

  const result = await service(analise, entidades).gerarZonasTargeting('analise-1', 2, 0.5)

  assert.equal(result.totalZonas, 1)
  const zona = result.zonas[0]
  assert.equal(zona.entidadesNaZona, 2)
  assert.equal(zona.totalEntidadesZona, 3)
  assert.ok(
    Math.abs(zona.intensidade - 0.667) < 0.001,
    `intensidade esperada ~0.667, recebida ${zona.intensidade}`,
  )
})

test('gerarZonasTargeting extrai perfil demográfico médio por zona', async () => {
  const entidades = [
    entidadeCentro('pf-1'),
    entidadeCentro('pf-2'),
    entidadeCentro('pf-3'),
  ]
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.9 },
    { id: 'pf-2', score: 0.8 },
    { id: 'pf-3', score: 0.7 },
  ])

  const result = await service(analise, entidades).gerarZonasTargeting('analise-1', 2, 0.5)
  const perfil = result.zonas[0].perfilDemografico

  assert.equal(perfil.idadeMedia, 38)
  assert.equal(perfil.rendaMedia, 9000)
  assert.deepEqual(perfil.profissoesPrincipais, ['dentista'])
  assert.equal(perfil.generoPredominante, 'F')
})

test('gerarZonasTargeting filtra zonas sem entidades de alto score', async () => {
  const entidades = [
    entidadeCentro('pf-1'),
    entidadeCentro('pf-2'),
    entidadeNorte('pf-3'),
    entidadeNorte('pf-4'),
  ]
  // nenhuma entidade acima do limiar
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.2 },
    { id: 'pf-2', score: 0.3 },
    { id: 'pf-3', score: 0.1 },
    { id: 'pf-4', score: 0.4 },
  ])

  const result = await service(analise, entidades).gerarZonasTargeting('analise-1', 2, 0.5)

  assert.equal(result.totalZonas, 0)
  assert.deepEqual(result.zonas, [])
})

test('gerarZonasTargeting gera targeting com lat/lon/raio pronto para ads', async () => {
  const entidades = [
    entidadeCentro('pf-1'),
    entidadeCentro('pf-2'),
    entidadeCentro('pf-3'),
  ]
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.9 },
    { id: 'pf-2', score: 0.8 },
    { id: 'pf-3', score: 0.7 },
  ])

  const result = await service(analise, entidades).gerarZonasTargeting('analise-1', 2, 0.5)
  const t = result.zonas[0].targeting

  assert.ok(typeof t.localizacao.lat === 'number')
  assert.ok(typeof t.localizacao.lon === 'number')
  assert.equal(t.localizacao.raioKm, 2)
  assert.equal(t.idadeMin, Math.floor(38 * 0.8))   // 30
  assert.equal(t.idadeMax, Math.ceil(38 * 1.25))    // 48
  assert.equal(t.rendaEstimada, `${Math.floor(9000 * 0.8)}-${Math.ceil(9000 * 1.25)}`) // "7200-11250"
  assert.deepEqual(t.interesses, ['odontologia'])
})

test('gerarZonasTargeting com análise inexistente lança 404', async () => {
  const svc = service(null, [])

  await assert.rejects(
    () => svc.gerarZonasTargeting('inexistente'),
    (err: NodeJS.ErrnoException & { statusCode?: number }) => {
      assert.equal(err.statusCode, 404)
      return true
    },
  )
})

test('exportarCSV retorna string CSV com headers corretos', async () => {
  const entidades = [
    entidadeCentro('pf-1'),
    entidadeCentro('pf-2'),
    entidadeCentro('pf-3'),
  ]
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.9 },
    { id: 'pf-2', score: 0.8 },
    { id: 'pf-3', score: 0.7 },
  ])
  const svc = service(analise, entidades)
  const result = await svc.gerarZonasTargeting('analise-1', 2, 0.5)
  const csv = svc.exportarCSV(result)

  const linhas = csv.split('\n')
  assert.equal(
    linhas[0],
    '"zona","latitude","longitude","raio_km","intensidade","idade_min","idade_max","renda","interesses"',
    'primeira linha deve ser o header',
  )
  assert.equal(linhas.length, 2, 'header + 1 zona = 2 linhas')
  assert.ok(linhas[1].includes('odontologia'), 'linha de dados deve incluir interesse')
  assert.ok(linhas[1].includes('2'), 'linha de dados deve incluir raio_km')
})

test('gerarZonasTargeting com entidades sem coordenadas retorna resultado vazio', async () => {
  const semCoordenadas: EntidadeAlvoDTO[] = [
    { ...entidadeCentro('pf-1'), latitude: 0, longitude: 0 },
    { ...entidadeCentro('pf-2'), latitude: 0, longitude: 0 },
  ]
  const analise = makeAnalise([
    { id: 'pf-1', score: 0.9 },
    { id: 'pf-2', score: 0.8 },
  ])

  const result = await service(analise, semCoordenadas).gerarZonasTargeting('analise-1')

  assert.equal(result.totalZonas, 0)
  assert.equal(result.zonas.length, 0)
})

test('gerarZonasTargeting ordena zonas pela intensidade (mais quente primeiro)', async () => {
  // Duas zonas: Centro com 3/3 (intensidade 1.0) e Norte com 1/2 (intensidade 0.5)
  const entidades = [
    entidadeCentro('c-1'),
    entidadeCentro('c-2'),
    entidadeCentro('c-3'),
    entidadeNorte('n-1'),
    entidadeNorte('n-2'),
  ]
  const analise = makeAnalise([
    { id: 'c-1', score: 0.9 },
    { id: 'c-2', score: 0.8 },
    { id: 'c-3', score: 0.7 },
    { id: 'n-1', score: 0.6 }, // acima do limiar
    { id: 'n-2', score: 0.2 }, // abaixo do limiar
  ])

  const result = await service(analise, entidades).gerarZonasTargeting('analise-1', 2, 0.5)

  assert.equal(result.totalZonas, 2)
  assert.ok(
    result.zonas[0].intensidade >= result.zonas[1].intensidade,
    'zonas devem estar ordenadas por intensidade decrescente',
  )
})
