import type { FastifyReply } from 'fastify'

export function statusCodeFromError(error: unknown, fallback = 503): number {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = Number((error as { statusCode: unknown }).statusCode)
    if (Number.isFinite(statusCode)) {
      return statusCode
    }
  }

  return fallback
}

export function sendMotorIndisponivel(
  reply: FastifyReply,
  message = 'Motor de inteligência indisponível.',
) {
  return reply.code(503).send({
    statusCode: 503,
    error: 'Service Unavailable',
    message,
  })
}
