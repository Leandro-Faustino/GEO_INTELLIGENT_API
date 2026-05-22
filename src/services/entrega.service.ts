import { randomUUID } from 'node:crypto'
import {
  type EntregaDTO,
  type IEntregaRepository,
} from '../repositories/interfaces/entrega.repository.js'

export class EntregaService {
  constructor(private readonly entregas: IEntregaRepository) {}

  async montarEntrega(
    clienteId: string,
    periodo: string,
    formato: string,
    totalOportunidades: number,
  ): Promise<EntregaDTO> {
    const now = new Date().toISOString()
    return this.entregas.salvar({
      id: randomUUID(),
      clienteId,
      tipo: 'lookalike',
      periodo,
      formato,
      totalOportunidades,
      createdAt: now,
      updatedAt: now,
    })
  }
}
