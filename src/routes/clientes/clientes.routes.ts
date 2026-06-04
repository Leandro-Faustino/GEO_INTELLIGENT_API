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
  ImportarProspectsBody,
  ImportarProspectsResponse,
} from '../../schemas/prospects/index.js'
import {
  ErrorResponse,
  IdParams,
  PaginationQuery,
} from '../../schemas/shared/index.js'
import type { EntidadeAlvoDTO } from '../../repositories/interfaces/index.js'

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
    async function listarClientes(request) {
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
    async function criarCliente(request, reply) {
      const now = new Date().toISOString()
      const cliente = await fastify.clienteRepo.salvar({
        id: randomUUID(),
        razaoSocial: request.body.razaoSocial,
        segmento: request.body.segmento,
        cidade: request.body.cidade,
        endereco: request.body.endereco ?? '',
        vertical: request.body.vertical,
        parametrosNegocio: request.body.parametrosNegocio ?? {},
        createdAt: now,
        updatedAt: now,
      })

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
    async function buscarCliente(request, reply) {
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
    async function atualizarCliente(request, reply) {
      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cliente não encontrado.',
        })
      }

      return fastify.clienteRepo.salvar({
        ...cliente,
        ...request.body,
        parametrosNegocio:
          request.body.parametrosNegocio ?? cliente.parametrosNegocio,
        updatedAt: new Date().toISOString(),
      })
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
            composicao: Type.Record(Type.String(), Type.Integer()),
            tiposDetectados: Type.Array(Type.String()),
          }),
          404: ErrorResponse,
        },
      },
    },
    async function importarBaseInterna(request, reply) {
      request.log.info(
        { clienteId: request.params.id, total: request.body.compradores.length },
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

      const compradores = request.body.compradores
      const composicao: Record<string, number> = {}
      for (const c of compradores) {
        composicao[c.tipo] = (composicao[c.tipo] ?? 0) + 1
      }

      await fastify.baseInternaRepo.salvar({
        clienteId: request.params.id,
        periodo: request.body.periodo,
        totalRegistros: compradores.length,
        compradores,
      })

      request.log.info(
        { clienteId: request.params.id, composicao },
        'base interna importada',
      )

      return reply.code(201).send({
        message: 'Base interna importada.',
        totalImportados: compradores.length,
        composicao,
        tiposDetectados: Object.keys(composicao),
      })
    },
  )

  fastify.get(
    '/clientes/:id/base-interna/composicao',
    {
      schema: {
        summary: 'Composição da base interna',
        description:
          'Retorna a contagem de compradores por tipo e quantos estão qualificados para derivação de perfil.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: Type.Object({
            clienteId: Type.String(),
            totalCompradores: Type.Integer(),
            composicao: Type.Record(Type.String(), Type.Integer()),
            tiposDetectados: Type.Array(Type.String()),
            qualificados: Type.Record(
              Type.String(),
              Type.Object({
                total: Type.Integer(),
                ativosComRecompra: Type.Integer(),
              }),
            ),
          }),
          404: ErrorResponse,
        },
      },
    },
    async function consultarComposicaoBase(request, reply) {
      request.log.info(
        { clienteId: request.params.id },
        'consultando composição da base interna',
      )

      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cliente não encontrado.',
        })
      }

      const base = await fastify.baseInternaRepo.buscarPorCliente(request.params.id)
      if (!base) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Base interna não encontrada para este cliente.',
        })
      }

      const composicao: Record<string, number> = {}
      const qualificados: Record<string, { total: number; ativosComRecompra: number }> = {}

      for (const c of base.compradores) {
        composicao[c.tipo] = (composicao[c.tipo] ?? 0) + 1
      }

      for (const tipo of Object.keys(composicao)) {
        const doTipo = base.compradores.filter((c) => c.tipo === tipo)
        qualificados[tipo] = {
          total: doTipo.length,
          ativosComRecompra: doTipo.filter((c) => c.ativo && c.frequencia >= 2).length,
        }
      }

      request.log.info(
        { clienteId: request.params.id, composicao },
        'composição da base interna consultada',
      )

      return {
        clienteId: request.params.id,
        totalCompradores: base.compradores.length,
        composicao,
        tiposDetectados: Object.keys(composicao),
        qualificados,
      }
    },
  )
  fastify.post(
    '/clientes/:id/prospects',
    {
      schema: {
        summary: 'Importar prospects',
        description:
          'Importa uma lista de prospects (entidades-alvo) para scorar em análises. ' +
          'Aceita PF e PJ. Prospects sem coordenadas são salvos com lat/lon=0 e não aparecem no mapa.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        body: ImportarProspectsBody,
        response: {
          201: ImportarProspectsResponse,
          404: ErrorResponse,
          422: ErrorResponse,
        },
      },
    },
    async function importarProspects(request, reply) {
      request.log.info(
        {
          clienteId: request.params.id,
          escopo: request.body.escopo,
          total: request.body.prospects.length,
        },
        'importando prospects',
      )

      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Cliente não encontrado.',
        })
      }

      const { escopo, prospects } = request.body

      // valida unicidade de identificadores dentro do lote
      const ids = prospects.map((p) => p.identificador)
      const unicos = new Set(ids)
      if (unicos.size !== ids.length) {
        return reply.code(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'Identificadores duplicados no lote.',
        })
      }

      let comCoordenadas = 0
      const entidades: EntidadeAlvoDTO[] = prospects.map((p) => {
        const lat = p.latitude ?? 0
        const lon = p.longitude ?? 0
        if (lat !== 0 || lon !== 0) comCoordenadas++
        return {
          identificador: p.identificador,
          nome: p.nome,
          tipo: p.tipo,
          atributos: p.atributos,
          endereco: p.endereco ?? '',
          latitude: lat,
          longitude: lon,
          fonte: 'upload',
          escopo,
        }
      })

      await fastify.entidadeAlvoRepo.salvarLote(entidades)

      request.log.info(
        { clienteId: request.params.id, escopo, comCoordenadas },
        'prospects importados',
      )

      return reply.code(201).send({
        escopo,
        totalImportados: prospects.length,
        comCoordenadas,
        semCoordenadas: prospects.length - comCoordenadas,
      })
    },
  )

  fastify.get(
    '/clientes/:id/compradores-enriquecidos',
    {
      schema: {
        summary: 'Listar compradores enriquecidos',
        description: 'Retorna os compradores da base interna com atributos consolidados.',
        tags: ['Clientes'],
        security: [{ bearerAuth: [] }],
        params: IdParams,
        response: {
          200: Type.Object({
            total: Type.Integer(),
            compradores: Type.Array(
              Type.Object({
                identificador: Type.String(),
                nome: Type.String(),
                tipo: Type.String(),
                atributosOriginais: Type.Record(Type.String(), Type.Unknown()),
                ticketMedio: Type.Number(),
                frequencia: Type.Number(),
                ativo: Type.Boolean(),
                atributosConsolidados: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
              }),
            ),
          }),
          404: ErrorResponse,
        },
      },
    },
    async function listarCompradoresEnriquecidos(request, reply) {
      const cliente = await fastify.clienteRepo.buscarPorId(request.params.id)
      if (!cliente) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cliente '${request.params.id}' não encontrado.`,
        })
      }

      const base = await fastify.baseInternaRepo.buscarPorCliente(request.params.id)
      if (!base) {
        return { total: 0, compradores: [] }
      }

      return {
        total: base.compradores.length,
        compradores: base.compradores.map((c) => ({
          ...c,
          atributosConsolidados: c.atributosOriginais,
        })),
      }
    },
  )
}

export default clientesRoutes
