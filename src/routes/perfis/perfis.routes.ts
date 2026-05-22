import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { DerivarPerfilBody, PerfilResponse } from '../../schemas/perfis/index.js'
import { ErrorResponse, IdParams } from '../../schemas/shared/index.js'

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
    async (request, reply) => {
      const perfil = await fastify.derivacaoService.derivarPerfil(
        request.body.clienteId,
        request.body.tipoAlvo,
        request.body.nome,
      )

      return reply.code(201).send(perfil)
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
    async (request, reply) => {
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
    async (request) => {
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
