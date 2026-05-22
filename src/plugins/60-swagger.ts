import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

export default fp(
  async function swaggerPlugin(fastify): Promise<void> {
    if (!fastify.config.SWAGGER_ENABLED) {
      return
    }

    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'GeoLead API',
          description: 'API REST segura para inteligência geográfica de leads.',
          version: '0.1.0',
        },
        servers: [{ url: 'http://localhost:3000' }],
        tags: [
          { name: 'Status', description: 'Healthcheck e metadados da API.' },
          { name: 'Autenticação', description: 'Login e identidade do usuário.' },
          { name: 'Clientes', description: 'Cadastro de clientes e base interna.' },
          { name: 'Perfis', description: 'Perfis ideais derivados da base histórica.' },
          { name: 'Análises', description: 'Execução e consulta de análises lookalike.' },
          { name: 'Entregas', description: 'Montagem de entregas e coleta de feedback.' },
          { name: 'Fontes', description: 'Consulta e enriquecimento via fontes externas.' },
          { name: 'Admin', description: 'Operações administrativas protegidas.' },
          { name: 'Segurança', description: 'Rotas de exemplo para controles OWASP.' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Informe o JWT retornado por POST /auth/login.',
            },
          },
        },
      },
    })

    await fastify.register(swaggerUi, {
      routePrefix: '/documentation',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
      staticCSP: true,
    })
  },
  { name: 'app-swagger', dependencies: ['app-config'] },
)
