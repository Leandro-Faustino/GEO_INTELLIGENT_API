import { randomUUID } from 'node:crypto'
import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { ErrorResponse } from '../../schemas/shared/index.js'

interface UsuarioAdmin {
  id: string
  email: string
  role: 'user' | 'admin'
  ativo: boolean
  createdAt: string
}

const usuariosStore = new Map<string, UsuarioAdmin>([
  ['u1', { id: 'u1', email: 'alice@example.com', role: 'user', ativo: true, createdAt: '2026-01-01T00:00:00.000Z' }],
  ['u2', { id: 'u2', email: 'bob@example.com', role: 'user', ativo: true, createdAt: '2026-01-01T00:00:00.000Z' }],
  ['admin1', { id: 'admin1', email: 'root@example.com', role: 'admin', ativo: true, createdAt: '2026-01-01T00:00:00.000Z' }],
])

const UsuarioSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  role: Type.String(),
  ativo: Type.Boolean(),
  createdAt: Type.String(),
})

const adminRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/admin/stats',
    {
      schema: {
        summary: 'Consultar estatísticas administrativas',
        description: 'Retorna contadores operacionais e uptime para usuários administradores.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            totalClientes: Type.Integer(),
            totalAnalises: Type.Integer(),
            uptime: Type.Number(),
          }),
        },
      },
    },
    async (request) => {
      const [totalClientes, totalAnalises] = await Promise.all([
        request.server.clienteRepo.contarTodos(),
        request.server.analiseRepo.contarTodos(),
      ])
      return { totalClientes, totalAnalises, uptime: Math.floor(process.uptime()) }
    },
  )

  fastify.get(
    '/admin/usuarios',
    {
      schema: {
        summary: 'Listar usuários',
        description: 'Lista todos os usuários do sistema.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        querystring: Type.Object(
          {
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
            offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            items: Type.Array(UsuarioSchema),
            total: Type.Integer(),
            limit: Type.Integer(),
            offset: Type.Integer(),
          }),
        },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? 20
      const offset = request.query.offset ?? 0
      const all = [...usuariosStore.values()]
      return {
        items: all.slice(offset, offset + limit),
        total: all.length,
        limit,
        offset,
      }
    },
  )

  fastify.post(
    '/admin/usuarios',
    {
      schema: {
        summary: 'Criar usuário',
        description: 'Cria um novo usuário no sistema.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          {
            email: Type.String({ format: 'email' }),
            senha: Type.String({ minLength: 6 }),
            role: Type.Optional(Type.String({ enum: ['user', 'admin'], default: 'user' })),
          },
          { additionalProperties: false },
        ),
        response: {
          201: UsuarioSchema,
          409: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { email, role = 'user' } = request.body
      const exists = [...usuariosStore.values()].some((u) => u.email === email)
      if (exists) {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: `Usuário com e-mail '${email}' já existe.`,
        })
      }
      const usuario: UsuarioAdmin = {
        id: randomUUID(),
        email,
        role: role as 'user' | 'admin',
        ativo: true,
        createdAt: new Date().toISOString(),
      }
      usuariosStore.set(usuario.id, usuario)
      return reply.code(201).send(usuario)
    },
  )

  fastify.delete(
    '/admin/usuarios/:id',
    {
      schema: {
        summary: 'Remover usuário',
        description: 'Remove um usuário do sistema.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: Type.Object(
          { id: Type.String() },
          { additionalProperties: false },
        ),
        response: {
          204: Type.Null(),
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!usuariosStore.has(request.params.id)) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Usuário '${request.params.id}' não encontrado.`,
        })
      }
      usuariosStore.delete(request.params.id)
      return reply.code(204).send(null)
    },
  )
}

export default adminRoutes
