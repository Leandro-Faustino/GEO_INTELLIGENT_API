import type { FastifyInstance } from 'fastify'

export async function assertClienteDoUsuario(
  fastify: FastifyInstance,
  clienteId: string,
  ownerId: string,
) {
  const cliente = await fastify.clienteRepo.buscarPorId(clienteId)
  if (!cliente) {
    throw Object.assign(new Error(`Cliente '${clienteId}' não encontrado.`), {
      statusCode: 404,
    })
  }
  if (cliente.ownerId !== ownerId) {
    throw Object.assign(new Error('Acesso negado a este recurso.'), {
      statusCode: 403,
    })
  }
  return cliente
}
