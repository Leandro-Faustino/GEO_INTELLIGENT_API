import { Type } from '@sinclair/typebox'

export const ImportarProspectsResponse = Type.Object(
  {
    escopo: Type.String(),
    totalImportados: Type.Integer(),
    comCoordenadas: Type.Integer(),
    semCoordenadas: Type.Integer(),
  },
  { $id: 'schema:geolead:prospects:importar-response' },
)
