import type { Collection, Db } from 'mongodb'
import type { EntidadeAlvoDTO, IEntidadeAlvoRepository } from '../interfaces/index.js'

interface EntidadeAlvoDoc {
  _id: string
  nome: string
  tipo: string
  atributos: Record<string, unknown>
  endereco: string
  location: { type: 'Point'; coordinates: [number, number] }
  fonte: string
  escopo: string
}

export class MongoEntidadeAlvoRepository implements IEntidadeAlvoRepository {
  private readonly collection: Collection<EntidadeAlvoDoc>

  constructor(db: Db) {
    this.collection = db.collection<EntidadeAlvoDoc>('entidades_alvo')
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ location: '2dsphere' })
    await this.collection.createIndex({ tipo: 1 })
    await this.collection.createIndex({ escopo: 1 })
    await this.collection.createIndex({ endereco: 1 })
  }

  async salvarLote(entidades: EntidadeAlvoDTO[]): Promise<void> {
    if (entidades.length === 0) return

    await this.collection.bulkWrite(
      entidades.map((entidade) => ({
        updateOne: {
          filter: { _id: entidade.identificador },
          update: {
            $set: {
              nome: entidade.nome,
              tipo: entidade.tipo,
              atributos: entidade.atributos,
              endereco: entidade.endereco,
              location: {
                type: 'Point',
                coordinates: [entidade.longitude, entidade.latitude],
              },
              fonte: entidade.fonte,
              escopo: entidade.escopo,
            },
          },
          upsert: true,
        },
      })),
    )
  }

  async buscarPorEscopo(escopo: string, tipo?: string): Promise<EntidadeAlvoDTO[]> {
    const filtro: Record<string, unknown> = { escopo: String(escopo) }
    if (tipo !== undefined) filtro['tipo'] = tipo
    const docs = await this.collection.find(filtro).limit(1000).toArray()
    return docs.map(mapDoc)
  }

  async buscarProximas(
    longitude: number,
    latitude: number,
    raioMetros: number,
  ): Promise<EntidadeAlvoDTO[]> {
    const docs = await this.collection
      .find({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: raioMetros,
          },
        },
      })
      .limit(1000)
      .toArray()
    return docs.map(mapDoc)
  }
}

function mapDoc(doc: EntidadeAlvoDoc): EntidadeAlvoDTO {
  return {
    identificador: doc._id,
    nome: doc.nome,
    tipo: doc.tipo,
    atributos: doc.atributos,
    endereco: doc.endereco,
    latitude: doc.location.coordinates[1],
    longitude: doc.location.coordinates[0],
    fonte: doc.fonte,
    escopo: doc.escopo,
  }
}
