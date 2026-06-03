import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { randomUUID } from 'node:crypto'
import {
  AnaliseListResponse,
  AnaliseResponse,
  ExecutarLookalikeBody,
  MapaResponseSchema,
} from '../../schemas/analises/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'
import { MotorIndisponivelError } from '../../adapters/motor.client.js'
import { assertClienteDoUsuario } from '../helpers/assert-cliente-owner.js'
import type { AnaliseDTO } from '../../repositories/interfaces/index.js'

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
      const cliente = await assertClienteDoUsuario(
        fastify,
        request.body.clienteId,
        request.user.sub,
      )
      request.log.info(
        {
          clienteId: request.body.clienteId,
          escopo: request.body.escopo,
          perfilId: request.body.perfilId,
          limiarSimilaridade: request.body.limiarSimilaridade ?? 0.3,
          motorHabilitado: Boolean(fastify.motor),
        },
        'executando analise lookalike',
      )
      if (fastify.motor) {
        try {
          const analise = await executarNoMotor(
            fastify,
            { ...request.body, clienteId: cliente.id, ...(request.body.tipoAlvo ? { tipoAlvo: request.body.tipoAlvo } : {}) },
            request.id,
          )
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

      // Populate entity candidates via coleta before local analysis
      const perfisLocal = await fastify.perfilRepo.buscarPorCliente(cliente.id)
      const perfilLocal = request.body.perfilId
        ? perfisLocal.find((p) => p.id === request.body.perfilId)
        : request.body.tipoAlvo
          ? (perfisLocal.find((p) => p.tipo === request.body.tipoAlvo) ?? perfisLocal[0])
          : perfisLocal[0]
      if (perfilLocal) {
        const coletadas = await fastify.coletaService.coletar(
          perfilLocal.criterios,
          request.body.escopo,
          200,
          perfilLocal.tipo,
        )
        if (coletadas.length > 0) {
          await fastify.entidadeAlvoRepo.salvarLote(coletadas)
        }
      }

      const analise = await fastify.analiseService.executarLookalike(
        cliente.id,
        request.body.escopo,
        request.body.limiarSimilaridade,
        request.body.perfilId,
        request.body.tipoAlvo,
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
    '/analises',
    {
      schema: {
        summary: 'Listar análises do cliente',
        description: 'Retorna o histórico paginado de análises de um cliente.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            clienteId: Type.String({ minLength: 1 }),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
            offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
            escopo: Type.Optional(Type.String({ minLength: 1 })),
            origem: Type.Optional(
              Type.Union([Type.Literal('local'), Type.Literal('motor')]),
            ),
          },
          { additionalProperties: false },
        ),
        response: { 200: AnaliseListResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async function listarAnalisesHandler(request) {
      const { clienteId, limit = 20, offset = 0, escopo, origem } = request.query
      await assertClienteDoUsuario(fastify, clienteId, request.user.sub)

      const filtros: { escopo?: string; origem?: string } = {}
      if (escopo) filtros.escopo = escopo
      if (origem) filtros.origem = origem

      const { items, total } = await fastify.analiseRepo.listarPorCliente(
        clienteId,
        limit,
        offset,
        filtros,
      )
      return { total, items }
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

      await assertClienteDoUsuario(fastify, analise.clienteId, request.user.sub)
      return {
        ...analise,
        totalOportunidades: analise.oportunidades.length,
      }
    },
  )
  fastify.get(
    '/analises/:id/mapa',
    {
      schema: {
        summary: 'Dados de mapa para uma análise',
        description:
          'Retorna todas as entidades do escopo com coordenadas, scores e flag jaCliente para renderização no mapa.',
        tags: ['Análises'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: { 200: MapaResponseSchema, 404: ErrorResponse },
      },
    },
    async function buscarMapaHandler(request, reply) {
      const analise = await fastify.analiseRepo.buscarPorId(request.params.id)
      if (!analise) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Análise '${request.params.id}' não encontrada.`,
        })
      }

      await assertClienteDoUsuario(fastify, analise.clienteId, request.user.sub)

      request.log.info(
        { analiseId: request.params.id, escopo: analise.escopo },
        'buscando dados de mapa',
      )

      const mapa = await fastify.analiseService.buscarDadosMapa(request.params.id)
      if (!mapa) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Dados de mapa para análise '${request.params.id}' não encontrados.`,
        })
      }

      request.log.info(
        { analiseId: request.params.id, totalEntidades: mapa.totalEntidades },
        'dados de mapa retornados',
      )

      return mapa
    },
  )
}

export default analisesRoutes

async function executarNoMotor(
  fastify: Parameters<FastifyPluginAsyncTypebox>[0],
  body: { clienteId: string; escopo: string; perfilId?: string; tipoAlvo?: string; limiarSimilaridade?: number },
  requestId: string,
): Promise<AnaliseDTO> {
  if (!fastify.motor) {
    throw new MotorIndisponivelError('/analisar', 'motor não configurado')
  }

  const perfis = await fastify.perfilRepo.buscarPorCliente(body.clienteId)
  const perfil = body.perfilId
    ? perfis.find((p) => p.id === body.perfilId)
    : body.tipoAlvo
      ? (perfis.find((p) => p.tipo === body.tipoAlvo) ?? perfis[0])
      : perfis[0]

  if (!perfil && body.perfilId) {
    throw Object.assign(
      new Error(`Perfil '${body.perfilId}' não encontrado para este cliente.`),
      { statusCode: 404 },
    )
  }
  if (!perfil) {
    throw Object.assign(new Error('Nenhum perfil encontrado para este cliente.'), {
      statusCode: 404,
    })
  }

  const entidades = await fastify.entidadeAlvoRepo.buscarPorEscopo(body.escopo, perfil.tipo)
  const coletadas = await fastify.coletaService.coletar(
    perfil.criterios,
    body.escopo,
    200,
    perfil.tipo,
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
      criterios: perfil.criterios,
      entidades: coletadas.length > 0 ? coletadas : entidades,
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
    perfilId: perfil.id,
    tipo: perfil.tipo,
    escopo: body.escopo,
    versaoModelo: resultado.versaoModelo,
    origem: 'motor',
    oportunidades: resultado.oportunidades,
    createdAt: now,
    updatedAt: now,
  }

  return fastify.analiseRepo.salvar(analise)
}
