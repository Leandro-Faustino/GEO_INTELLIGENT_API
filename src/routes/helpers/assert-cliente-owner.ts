import type { FastifyInstance } from 'fastify'

export async function assertClienteDoUsuario(
  fastify: FastifyInstance,
  clienteId: string,
  ownerId: string,
) {
  const cliente = await fastify.clienteRepo.buscarPorIdDoOwner(clienteId, ownerId)
  if (cliente) return cliente

  const existe = await fastify.clienteRepo.buscarPorId(clienteId)
  if (existe) {
    throw Object.assign(new Error('Acesso negado a este recurso.'), { statusCode: 403 })
  }
  throw Object.assign(new Error(`Cliente '${clienteId}' não encontrado.`), { statusCode: 404 })
}
