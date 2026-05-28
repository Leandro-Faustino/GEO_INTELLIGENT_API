import { randomUUID } from 'node:crypto'
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import {
  ClienteResponse,
  CreateClienteBody,
  ImportarBaseInternaBody,
  UpdateClienteBody,
} from '../../schemas/clientes/index.js'
import {
  ErrorResponse,
  IdParams,
  PaginationQuery,
} from '../../schemas/shared/index.js'

const clientesRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/clientes',
    {
      schema: {
        summary: 'Listar clientes',
        description: 'Lista clientes cadastrados com paginação.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        querystring: PaginationQuery,
        response: {
          200: Type.Object({
            items: Type.Array(
              Type.Object({
                id: Type.String(),
                razaoSocial: Type.String(),
                segmento: Type.String(),
                cidade: Type.String(),
                vertical: Type.String(),
              }),
            ),
            total: Type.Integer(),
            limit: Type.Integer(),
            offset: Type.Integer(),
          }),
        },
      },
    },
    async function listarClientesHandler(request) {
      const { items, total } = await fastify.clienteRepo.listar(
        request.query.limit,
        request.query.offset,
      )

      return {
        items,
        total,
        limit: request.query.limit,
        offset: request.query.offset,
      }
    },
  )

  fastify.post(
    '/clientes',
    {
      schema: {
        summary: 'Criar cliente',
        description: 'Registra um cliente para análise geográfica e derivação de perfis.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        body: CreateClienteBody,
        response: { 201: ClienteResponse, 400: ErrorResponse },
      },
    },
    async function criarClienteHandler(request, reply) {
      request.log.info(
        {
          razaoSocial: request.body.razaoSocial,
          cidade: request.body.cidade,
          vertical: request.body.vertical,
        },
        'criando cliente',
      )
      const now = new Date().toISOString()
      const cliente = await fastify.clienteRepo.salvar({
        id: randomUUID(),
        ownerId: request.user.sub,
        razaoSocial: request.body.razaoSocial,
        segmento: request.body.segmento,
        cidade: request.body.cidade,
        endereco: request.body.endereco ?? '',
        vertical: request.body.vertical,
        parametrosNegocio: request.body.parametrosNegocio ?? {},
        createdAt: now,
        updatedAt: now,
      })

      request.log.info({ clienteId: cliente.id }, 'cliente criado')
      return reply.code(201).send(cliente)
    },
  )

  fastify.get(
    '/clientes/:id',
    {
      schema: {
        summary: 'Buscar cliente por ID',
        description: 'Consulta os dados cadastrais de um cliente específico.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: { 200: ClienteResponse, 404: ErrorResponse },
      },
    },
    async function buscarClientePorIdHandler(request, reply) {
      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${request.params.id}' não encontrado.`,
        })
      }

      return cliente
    },
  )

  fastify.patch(
    '/clientes/:id',
    {
      schema: {
        summary: 'Atualizar cliente',
        description: 'Atualiza parcialmente os dados cadastrais de um cliente.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: UpdateClienteBody,
        response: { 200: ClienteResponse, 404: ErrorResponse },
      },
    },
    async function atualizarClienteHandler(request, reply) {
      request.log.info({ clienteId: request.params.id }, 'atualizando cliente')
      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cliente não encontrado.',
        })
      }

      const atualizado = await fastify.clienteRepo.salvar({
        ...cliente,
        ...request.body,
        parametrosNegocio:
          request.body.parametrosNegocio ?? cliente.parametrosNegocio,
        updatedAt: new Date().toISOString(),
      })

      request.log.info({ clienteId: atualizado.id }, 'cliente atualizado')
      return atualizado
    },
  )

  fastify.post(
    '/clientes/:id/base-interna',
    {
      schema: {
        summary: 'Importar base interna',
        description: 'Importa compradores conhecidos para alimentar análises e perfis.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: ImportarBaseInternaBody,
        response: {
          201: Type.Object({
            message: Type.String(),
            totalImportados: Type.Integer(),
          }),
          404: ErrorResponse,
        },
      },
    },
    async function importarBaseInternaHandler(request, reply) {
      request.log.info(
        {
          clienteId: request.params.id,
          periodo: request.body.periodo,
          totalCompradores: request.body.compradores.length,
        },
        'importando base interna',
      )
      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cliente não encontrado.',
        })
      }

      await fastify.baseInternaRepo.salvar({
        clienteId: request.params.id,
        periodo: request.body.periodo,
        totalRegistros: request.body.compradores.length,
        compradores: request.body.compradores,
      })

      request.log.info(
        {
          clienteId: request.params.id,
          totalImportados: request.body.compradores.length,
        },
        'base interna importada',
      )
      return reply.code(201).send({
        message: 'Base interna importada.',
        totalImportados: request.body.compradores.length,
      })
    },
  )
}

export default clientesRoutes
