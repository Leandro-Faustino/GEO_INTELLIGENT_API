/**
 * Schemas do bounded context: Raio-X do Cliente Ideal.
 *
 * Padrão do repo: cada contexto exporta um array `*Schemas` que o
 * loader.ts registra via addSchema(). Isso garante que os schemas
 * fiquem acessíveis cross-context (Fastify Cap. 6: "schemas added
 * in the plugin's parent scope are inherited in the child one").
 */
export { RaioXBody } from './body.js'
export { RaioXResponse } from './response.js'

import { RaioXBody } from './body.js'
import { RaioXResponse } from './response.js'

export const raioXSchemas = [RaioXBody, RaioXResponse]
