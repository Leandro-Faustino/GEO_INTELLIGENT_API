import { type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import { criarHashSenhaScrypt } from '../../security/user-store.js'

const adminRoutes: FastifyPluginAsyncTypebox = async (fastify): Promise<void> => {
  fastify.get(
    '/admin/stats',
    {
      onRequest: [fastify.authenticate, fastify.requireRole('admin')],
      schema: {
        summary: 'Consultar estatísticas administrativas',
        description: 'Retorna contadores operacionais e uptime para usuários administradores.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({
            totalClientes: Type.Integer(),
            totalAnalises: Type.Integer(),
            totalUsuarios: Type.Integer(),
            uptime: Type.Number(),
          }),
        },
      },
    },
    async function consultarEstatisticasAdminHandler() {
      const [{ total: totalClientes }, { total: totalUsuarios }] = await Promise.all([
        fastify.clienteRepo.listar(1, 0),
        fastify.usuarioRepo.listar(1, 0),
      ])
      return {
        totalClientes,
        totalAnalises: 0,
        totalUsuarios,
        uptime: Math.floor(process.uptime()),
      }
    },
  )

  // ── Listagem de usuários ────────────────────────────────────────────────────

  fastify.get(
    '/admin/usuarios',
    {
      onRequest: [fastify.authenticate, fastify.requireRole('admin')],
      schema: {
        summary: 'Listar usuários',
        description: 'Lista os usuários cadastrados no sistema.',
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
            total: Type.Integer(),
            items: Type.Array(
              Type.Object({
                id: Type.String(),
                email: Type.String(),
                role: Type.String(),
                ativo: Type.Boolean(),
                createdAt: Type.String(),
              }),
            ),
          }),
        },
      },
    },
    async function listarUsuariosHandler(request) {
      const limit = request.query.limit ?? 20
      const offset = request.query.offset ?? 0
      const { total, items } = await fastify.usuarioRepo.listar(limit, offset)
      return {
        total,
        items: items.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          ativo: u.ativo,
          createdAt: u.createdAt,
        })),
      }
    },
  )

  // ── Criação de usuário ──────────────────────────────────────────────────────

  fastify.post(
    '/admin/usuarios',
    {
      onRequest: [fastify.authenticate, fastify.requireRole('admin')],
      schema: {
        summary: 'Criar usuário',
        description: 'Cria um novo usuário no sistema.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        body: Type.Object(
          {
            email: Type.String({ format: 'email' }),
            senha: Type.String({ minLength: 8 }),
            role: Type.Optional(
              Type.Union([Type.Literal('user'), Type.Literal('admin')]),
            ),
          },
          { additionalProperties: false },
        ),
        response: {
          201: Type.Object({
            id: Type.String(),
            email: Type.String(),
            role: Type.String(),
            createdAt: Type.String(),
          }),
          409: Type.Object({
            statusCode: Type.Number(),
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async function criarUsuarioHandler(request, reply) {
      const { email, senha, role } = request.body

      const existente = await fastify.usuarioRepo.buscarPorEmail(email)
      if (existente) {
        return reply.code(409).send({
          statusCode: 409,
          error: 'Conflict',
          message: `Usuário com e-mail '${email}' já existe.`,
        })
      }

      const senhaHash = criarHashSenhaScrypt(senha)
      const usuario = await fastify.usuarioRepo.criar({
        email,
        senhaHash,
        ...(role !== undefined ? { role } : {}),
      })

      request.log.info({ usuarioId: usuario.id, email: usuario.email }, 'usuário criado')

      return reply.code(201).send({
        id: usuario.id,
        email: usuario.email,
        role: usuario.role,
        createdAt: usuario.createdAt,
      })
    },
  )

  // ── Desativar usuário ───────────────────────────────────────────────────────

  fastify.delete(
    '/admin/usuarios/:id',
    {
      onRequest: [fastify.authenticate, fastify.requireRole('admin')],
      schema: {
        summary: 'Desativar usuário',
        description: 'Desativa um usuário (soft delete). O usuário perde acesso imediatamente.',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: Type.Object(
          { id: Type.String() },
          { additionalProperties: false },
        ),
        response: {
          204: Type.Null(),
          404: Type.Object({
            statusCode: Type.Number(),
            error: Type.String(),
            message: Type.String(),
          }),
        },
      },
    },
    async function desativarUsuarioHandler(request, reply) {
      const usuario = await fastify.usuarioRepo.buscarPorId(request.params.id)
      if (!usuario) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Usuário '${request.params.id}' não encontrado.`,
        })
      }

      await fastify.usuarioRepo.desativar(request.params.id)
      request.log.info({ usuarioId: request.params.id }, 'usuário desativado')
      return reply.code(204).send(null)
    },
  )
}

export default adminRoutes
