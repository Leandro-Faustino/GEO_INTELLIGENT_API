import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { randomUUID } from 'node:crypto'
import { AnaliseResponse, ExecutarLookalikeBody } from '../../schemas/analises/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'
import { MotorIndisponivelError } from '../../adapters/motor.client.js'
import type {
  AnaliseDTO,
  EntidadeAlvoDTO,
  OportunidadeDTO,
} from '../../repositories/interfaces/index.js'

const analisesRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/analises/executar',
    {
      schema: {
        summary: 'Executar análise lookalike',
        description:
          'Executa uma análise lookalike. Quando o motor Python está habilitado, o gateway coleta entidades reais nas fontes externas a partir dos critérios do perfil e envia os candidatos ao motor.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        body: ExecutarLookalikeBody,
        response: { 201: AnaliseResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    async function executarAnaliseHandler(request, reply) {
      request.log.info(
        {
          clienteId: request.body.clienteId,
          escopo: request.body.escopo,
          limiarSimilaridade: request.body.limiarSimilaridade ?? 0.3,
          motorHabilitado: Boolean(fastify.motor),
        },
        'executando analise lookalike',
      )
      if (fastify.motor) {
        try {
          const analise = await executarNoMotor(fastify, request.body, request.id)
          request.log.info(
            {
              analiseId: analise.id,
              totalOportunidades: analise.oportunidades.length,
              origem: 'motor',
            },
            'analise concluida',
          )
          return reply.code(201).send({
            ...analise,
            totalOportunidades: analise.oportunidades.length,
          })
        } catch (error) {
          if (error instanceof MotorIndisponivelError) {
            request.log.warn(
              { err: error.message },
              'motor indisponível, usando fallback local',
            )
          } else {
            throw error
          }
        }
      }

      const analise = await fastify.analiseService.executarLookalike(
        request.body.clienteId,
        request.body.escopo,
        request.body.limiarSimilaridade,
      )

      request.log.info(
        {
          analiseId: analise.id,
          totalOportunidades: analise.oportunidades.length,
          origem: 'local',
        },
        'analise concluida',
      )
      return reply.code(201).send({
        ...analise,
        totalOportunidades: analise.oportunidades.length,
      })
    },
  )

  fastify.get(
    '/analises/:id',
    {
      schema: {
        summary: 'Buscar análise por ID',
        description: 'Consulta o resultado de uma análise executada.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: { 200: AnaliseResponse, 404: ErrorResponse },
      },
    },
    async function buscarAnalisePorIdHandler(request, reply) {
      const analise = await fastify.analiseRepo.buscarPorId(request.params.id)
      if (!analise) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Análise '${request.params.id}' não encontrada.`,
        })
      }

      return {
        ...analise,
        totalOportunidades: analise.oportunidades.length,
      }
    },
  )
}

export default analisesRoutes

async function executarNoMotor(
  fastify: Parameters<FastifyPluginAsyncTypebox>[0],
  body: { clienteId: string; escopo: string; limiarSimilaridade?: number },
  requestId: string,
): Promise<AnaliseDTO> {
  if (!fastify.motor) {
    throw new MotorIndisponivelError('/analisar', 'motor não configurado')
  }

  const perfis = await fastify.perfilRepo.buscarPorCliente(body.clienteId)
  const perfil = perfis[0]
  if (!perfil) {
    throw Object.assign(new Error('Nenhum perfil encontrado para este cliente.'), {
      statusCode: 404,
    })
  }

  const entidades = await fastify.entidadeAlvoRepo.buscarPorEscopo(body.escopo)
  const coletadas = await fastify.coletaService.coletar(
    perfil.criterios,
    body.escopo,
  )
  if (coletadas.length > 0) {
    await fastify.entidadeAlvoRepo.salvarLote(coletadas)
  }
  const base = await fastify.baseInternaRepo.buscarPorCliente(body.clienteId)
  const jaClientes =
    base?.compradores.map((comprador) => comprador.identificador) ?? []

  const resultado = await fastify.motor.analisar(
    {
      clienteId: body.clienteId,
      criterios: perfil.criterios.map(mapCriterioParaMotor),
      entidades: (coletadas.length > 0 ? coletadas : entidades).map(mapEntidadeParaMotor),
      jaClientes,
      exclusoes: perfil.exclusoes,
      limiarSimilaridade: body.limiarSimilaridade ?? 0.3,
    },
    requestId,
  )

  const now = new Date().toISOString()
  const analise: AnaliseDTO = {
    id: randomUUID(),
    clienteId: body.clienteId,
    tipo: perfil.tipo,
    escopo: body.escopo,
    versaoModelo: stringCampo(resultado, 'versaoModelo', 'versao_modelo') || '0.1.0',
    oportunidades: oportunidadesDoMotor(resultado),
    createdAt: now,
    updatedAt: now,
  }

  return fastify.analiseRepo.salvar(analise)
}

function mapCriterioParaMotor(criterio: {
  nome: string
  valorMin: unknown
  valorMax: unknown
  peso: number
  tipoComparacao: string
}): Record<string, unknown> {
  const valorMin =
    criterio.nome.toLocaleLowerCase('pt-BR') === 'cnae'
      ? normalizarValoresCnae(criterio.valorMin)
      : criterio.valorMin
  const valorMax =
    criterio.nome.toLocaleLowerCase('pt-BR') === 'cnae'
      ? normalizarValoresCnae(criterio.valorMax)
      : criterio.valorMax

  return {
    nome: criterio.nome,
    valor_min: valorMin,
    valor_max: valorMax,
    peso: criterio.peso,
    tipo_comparacao: criterio.tipoComparacao,
  }
}

function normalizarValoresCnae(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(normalizarCnae).filter((item) => item.length > 0)
  }
  return normalizarCnae(valor)
}

function normalizarCnae(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '')
}

function mapEntidadeParaMotor(entidade: EntidadeAlvoDTO): Record<string, unknown> {
  return {
    identificador: entidade.identificador,
    nome: entidade.nome,
    tipo: entidade.tipo,
    atributos: entidade.atributos,
    endereco: entidade.endereco,
    latitude: entidade.latitude,
    longitude: entidade.longitude,
    fonte: entidade.fonte,
    escopo: entidade.escopo,
  }
}

function oportunidadesDoMotor(resultado: Record<string, unknown>): OportunidadeDTO[] {
  const oportunidades =
    arrayCampo(resultado, 'oportunidades') as Record<string, unknown>[]

  return oportunidades.map((oportunidade) => {
    const score = objetoCampo(oportunidade, 'score')
    return {
      id: randomUUID(),
      entidadeAlvoId: stringCampo(
        oportunidade,
        'entidadeAlvoId',
        'entidade_alvo_id',
      ),
      tipo: stringCampo(oportunidade, 'tipo'),
      justificativa: stringCampo(oportunidade, 'justificativa'),
      ganchoAbordagem: stringCampo(
        oportunidade,
        'ganchoAbordagem',
        'gancho_abordagem',
      ),
      prioridade: prioridadeCampo(oportunidade),
      score: {
        valor: numeroCampo(score, 'valor'),
        similaridade: numeroCampo(score, 'similaridade'),
        probConversao: numeroCampo(score, 'probConversao', 'prob_conversao'),
      },
    }
  })
}

function objetoCampo(
  origem: Record<string, unknown>,
  nome: string,
): Record<string, unknown> {
  const valor = origem[nome]
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function arrayCampo(origem: Record<string, unknown>, nome: string): unknown[] {
  const valor = origem[nome]
  return Array.isArray(valor) ? valor : []
}

function stringCampo(
  origem: Record<string, unknown>,
  ...nomes: string[]
): string {
  for (const nome of nomes) {
    const valor = origem[nome]
    if (valor !== undefined && valor !== null) return String(valor)
  }
  return ''
}

function numeroCampo(
  origem: Record<string, unknown>,
  ...nomes: string[]
): number {
  for (const nome of nomes) {
    const valor = Number(origem[nome])
    if (Number.isFinite(valor)) return valor
  }
  return 0
}

function prioridadeCampo(origem: Record<string, unknown>): 'alta' | 'media' | 'baixa' {
  const valor = stringCampo(origem, 'prioridade')
  return valor === 'alta' || valor === 'media' || valor === 'baixa'
    ? valor
    : 'baixa'
}
