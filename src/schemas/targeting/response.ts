import { Type } from '@sinclair/typebox'

const PerfilDemograficoSchema = Type.Object({
  idadeMedia: Type.Union([Type.Number(), Type.Null()]),
  rendaMedia: Type.Union([Type.Number(), Type.Null()]),
  profissoesPrincipais: Type.Array(Type.String()),
  generoPredominante: Type.Union([Type.String(), Type.Null()]),
})

const ZonaTargetingSchema = Type.Object({
  id: Type.String(),
  nome: Type.String(),
  centro: Type.Object({ lat: Type.Number(), lon: Type.Number() }),
  raioKm: Type.Number(),
  intensidade: Type.Number(),
  entidadesNaZona: Type.Integer(),
  totalEntidadesZona: Type.Integer(),
  perfilDemografico: PerfilDemograficoSchema,
  targeting: Type.Object({
    localizacao: Type.Object({
      lat: Type.Number(),
      lon: Type.Number(),
      raioKm: Type.Number(),
    }),
    idadeMin: Type.Union([Type.Integer(), Type.Null()]),
    idadeMax: Type.Union([Type.Integer(), Type.Null()]),
    rendaEstimada: Type.Union([Type.String(), Type.Null()]),
    interesses: Type.Array(Type.String()),
  }),
})

export const TargetingResultSchema = Type.Object(
  {
    clienteId: Type.String(),
    analiseId: Type.String(),
    totalZonas: Type.Integer(),
    centroMapa: Type.Object({
      lat: Type.Number(),
      lon: Type.Number(),
      zoom: Type.Integer(),
    }),
    zonas: Type.Array(ZonaTargetingSchema),
    resumoCampanha: Type.Object({
      alcanceEstimado: Type.Integer(),
      investimentoSugerido: Type.String(),
      melhorHorario: Type.Union([Type.String(), Type.Null()]),
    }),
  },
  { $id: 'schema:geolead:targeting:result' },
)
