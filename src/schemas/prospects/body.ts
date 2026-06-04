import { Type } from '@sinclair/typebox'

export const ProspectSchema = Type.Object({
  identificador: Type.String({ minLength: 1 }),
  nome: Type.String({ minLength: 1, maxLength: 200 }),
  tipo: Type.String({ minLength: 1 }),
  atributos: Type.Record(Type.String(), Type.Unknown(), { default: {} }),
  endereco: Type.Optional(Type.String({ maxLength: 300 })),
  latitude: Type.Optional(Type.Number()),
  longitude: Type.Optional(Type.Number()),
})

export const ImportarProspectsBody = Type.Object(
  {
    escopo: Type.String({ minLength: 1, maxLength: 200 }),
    prospects: Type.Array(ProspectSchema, { minItems: 1 }),
  },
  {
    $id: 'schema:geolead:prospects:importar-body',
    additionalProperties: false,
  },
)
