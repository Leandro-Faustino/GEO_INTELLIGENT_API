import {
  type EntidadeAlvoDTO,
  type IEntidadeAlvoRepository,
} from '../repositories/interfaces/entidade-alvo.repository.js'

export class CatalogoService {
  constructor(private readonly entidades: IEntidadeAlvoRepository) {}

  async buscarEntidades(escopo: string): Promise<EntidadeAlvoDTO[]> {
    return this.entidades.buscarPorEscopo(escopo)
  }
}
