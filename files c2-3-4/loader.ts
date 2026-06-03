import fp from 'fastify-plugin'
import { sharedSchemas } from './shared/index.js'
import { clienteSchemas } from './clientes/index.js'
import { perfilSchemas } from './perfis/index.js'
import { analiseSchemas } from './analises/index.js'
import { entregaSchemas } from './entregas/index.js'
import { raioXSchemas } from './raio-x/index.js'
import { alertaSchemas } from './alertas/index.js'
import { enriquecimentoSchemas } from './enriquecimento/index.js'
import { territorioSchemas } from './territorio/index.js'
import { competitivaSchemas } from './competitiva/index.js'

const schemas = [
  ...sharedSchemas,
  ...clienteSchemas,
  ...perfilSchemas,
  ...analiseSchemas,
  ...entregaSchemas,
  ...raioXSchemas,
  ...alertaSchemas,
  ...enriquecimentoSchemas,
  ...territorioSchemas,
  ...competitivaSchemas,
]

export default fp(
  async function schemaLoader(fastify): Promise<void> {
    for (const schema of schemas) {
      fastify.addSchema(schema)
    }

    fastify.log.info(
      { total: schemas.length },
      'schemas do domínio GeoLead registrados',
    )
  },
  { name: 'schema-loader', dependencies: ['app-config'] },
)
