import { Type } from '@sinclair/typebox'

export const TargetingQuery = Type.Object({
  raioKm: Type.Optional(Type.Number({ minimum: 1, maximum: 80, default: 2 })),
  limiarScore: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.5 })),
})
