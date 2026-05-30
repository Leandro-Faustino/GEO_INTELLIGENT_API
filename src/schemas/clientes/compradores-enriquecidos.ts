import { Type } from '@sinclair/typebox'

export const CompradorEnriquecidoResponse = Type.Object({
  identificador: Type.String(),
  nome: Type.String(),
  tipo: Type.String(),
  ticketMedio: Type.Number(),
  frequencia: Type.Integer(),
  atributosConsolidados: Type.Record(Type.String(), Type.Unknown()),
  fontesAplicadas: Type.Array(Type.String()),
})

export const ListaCompradoresEnriquecidosResponse = Type.Object(
  {
    total: Type.Integer(),
    compradores: Type.Array(CompradorEnriquecidoResponse),
  },
  { $id: 'schema:geolead:clientes:compradores-enriquecidos' },
)
