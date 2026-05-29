import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import {
  EnriquecerPerfilBody,
  EnriquecimentoResponse,
} from '../../schemas/enriquecimento/index.js'
import { DerivarPerfilBody, PerfilResponse } from '../../schemas/perfis/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'
import { EnriquecimentoService } from '../../services/enriquecimento.service.js'

const perfisRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.post(
    '/perfis/derivar',
    {
      schema: {
        summary: 'Derivar perfil ideal',
        description: 'Gera um perfil ideal a partir dos compradores conhecidos de um cliente.',
        tags: ['Perfis'],
        security: [{ bearerAuth: [] }],
        body: DerivarPerfilBody,
        response: { 201: PerfilResponse, 404: ErrorResponse, 422: ErrorResponse },
      },
    },
    async function derivarPerfilHandler(request, reply) {
      request.log.info(
        { clienteId: request.body.clienteId, tipoAlvo: request.body.tipoAlvo },
        'derivando perfil ideal',
      )
      const perfil = await fastify.derivacaoService.derivarPerfil(
        request.body.clienteId,
        request.body.tipoAlvo,
        request.body.nome,
      )

      request.log.info(
        { perfilId: perfil.id, criterios: perfil.criterios.length },
        'perfil derivado',
      )
      return reply.code(201).send(perfil)
    },
  )

  fastify.post(
    '/perfis/enriquecer',
    {
      schema: {
        summary: 'Enriquecer perfil com fontes externas',
        description:
          'Amplia os atributos dos compradores com dados de fontes externas e destaca novos fatores do perfil.',
        tags: ['Perfis'],
        security: [{ bearerAuth: [] }],
        body: EnriquecerPerfilBody,
        response: {
          200: EnriquecimentoResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          422: ErrorResponse,
        },
      },
    },
    async function enriquecerPerfilHandler(request, reply) {
      const cliente = await fastify.clienteRepo.buscarPorId(request.body.clienteId)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${request.body.clienteId}' não encontrado.`,
        })
      }
      if (cliente.ownerId !== request.user.sub) {
        return reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Acesso negado a este recurso.',
        })
      }

      request.log.info(
        { clienteId: request.body.clienteId, fontes: request.body.fontes },
        'enriquecendo perfil com fontes externas',
      )

      const service = new EnriquecimentoService(
        fastify.baseInternaRepo,
        fastify.perfilRepo,
        fastify.adapters.todas.map((adapter) => ({ nome: adapter.nome, adapter })),
      )
      const resultado = await service.enriquecer(
        request.body.clienteId,
        request.body.fontes,
      )

      request.log.info(
        {
          clienteId: request.body.clienteId,
          fatoresOriginais: resultado.perfilOriginal.totalFatores,
          fatoresEnriquecidos: resultado.perfilEnriquecido.totalFatores,
          novosFatores: resultado.novosFatores.length,
        },
        'enriquecimento concluído',
      )

      return reply.code(200).send(resultado)
    },
  )

  fastify.get(
    '/perfis/:id',
    {
      schema: {
        summary: 'Buscar perfil por ID',
        description: 'Consulta um perfil ideal derivado.',
        tags: ['Perfis'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: { 200: PerfilResponse, 404: ErrorResponse },
      },
    },
    async function buscarPerfilPorIdHandler(request, reply) {
      const perfil = await fastify.perfilRepo.buscarPorId(request.params.id)
      if (!perfil) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Perfil '${request.params.id}' não encontrado.`,
        })
      }

      return perfil
    },
  )

  fastify.get(
    '/perfis',
    {
      schema: {
        summary: 'Listar perfis por cliente',
        description: 'Lista os perfis ideais associados a um cliente.',
        tags: ['Perfis'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          { clienteId: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Array(
            Type.Object({
              id: Type.String(),
              nome: Type.String(),
              tipo: Type.String(),
              totalCriterios: Type.Integer(),
            }),
          ),
        },
      },
    },
    async function listarPerfisPorClienteHandler(request) {
      const perfis = await fastify.perfilRepo.buscarPorCliente(request.query.clienteId)
      return perfis.map((perfil) => ({
        id: perfil.id,
        nome: perfil.nome,
        tipo: perfil.tipo,
        totalCriterios: perfil.criterios.length,
      }))
    },
  )
}

export default perfisRoutes
