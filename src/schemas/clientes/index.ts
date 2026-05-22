/**
 * Schemas do bounded context: Cliente + BaseInterna + CompradorConhecido.
 */
import { Type } from '@sinclair/typebox'
import { Timestamps } from '../shared/index.js'

export const CompradorConhecidoSchema = Type.Object({
  identificador: Type.String(),
  nome: Type.String({ maxLength: 200 }),
  tipo: Type.String({ enum: ['pj', 'pf', 'territorio'] }),
  atributosOriginais: Type.Record(Type.String(), Type.Unknown(), {
    default: {},
  }),
  ticketMedio: Type.Number({ minimum: 0, default: 0 }),
  frequencia: Type.Integer({ minimum: 0, default: 0 }),
  ativo: Type.Boolean({ default: true }),
})

export const ImportarBaseInternaBody = Type.Object(
  {
    periodo: Type.String({ maxLength: 50 }),
    compradores: Type.Array(CompradorConhecidoSchema, { minItems: 1 }),
  },
  {
    $id: 'schema:geolead:clientes:importar-base',
    additionalProperties: false,
  },
)

export const CreateClienteBody = Type.Object(
  {
    razaoSocial: Type.String({ minLength: 1, maxLength: 200 }),
    segmento: Type.String({ minLength: 1, maxLength: 100 }),
    cidade: Type.String({ minLength: 1, maxLength: 100 }),
    endereco: Type.Optional(Type.String({ maxLength: 300 })),
    vertical: Type.String({ minLength: 1, maxLength: 50 }),
    parametrosNegocio: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  {
    $id: 'schema:geolead:clientes:create-body',
    additionalProperties: false,
  },
)

export const UpdateClienteBody = Type.Object(
  {
    razaoSocial: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    segmento: Type.Optional(Type.String({ maxLength: 100 })),
    cidade: Type.Optional(Type.String({ maxLength: 100 })),
    endereco: Type.Optional(Type.String({ maxLength: 300 })),
    parametrosNegocio: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  {
    $id: 'schema:geolead:clientes:update-body',
    additionalProperties: false,
  },
)

export const ClienteResponse = Type.Object(
  {
    id: Type.String(),
    razaoSocial: Type.String(),
    segmento: Type.String(),
    cidade: Type.String(),
    endereco: Type.String(),
    vertical: Type.String(),
    ...Timestamps,
  },
  { $id: 'schema:geolead:clientes:response' },
)

export const clienteSchemas = [
  ImportarBaseInternaBody,
  CreateClienteBody,
  UpdateClienteBody,
  ClienteResponse,
]
