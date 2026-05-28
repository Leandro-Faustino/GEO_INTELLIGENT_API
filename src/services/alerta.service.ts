import type {
  AlertaDTO,
  CriterioDerivadoDTO,
  EntidadeAlvoDTO,
  IAlertaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
} from '../repositories/interfaces/index.js'
import { randomUUID } from 'node:crypto'

export class AlertaService {
  constructor(
    private readonly alertaRepo: IAlertaRepository,
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
  ) {}

  async escanear(
    clienteId: string,
    escopo: string,
    limiar = 0.5,
  ): Promise<{ alertasGerados: AlertaDTO[]; totalEscaneadas: number }> {
    const perfis = await this.perfilRepo.buscarPorCliente(clienteId)
    const perfil = perfis[0]

    if (!perfil) {
      throw Object.assign(
        new Error('Nenhum perfil encontrado. Derive o perfil antes de escanear.'),
        { statusCode: 404 },
      )
    }

    const entidades = await this.entidadeRepo.buscarPorEscopo(escopo)
    const alertasGerados: AlertaDTO[] = []

    for (const entidade of entidades) {
      const jaExiste = await this.alertaRepo.existeParaEntidade(
        clienteId,
        entidade.identificador,
      )
      if (jaExiste) continue

      const score = this.calcularSimilaridade(perfil.criterios, entidade)
      if (score < limiar) continue

      const alerta: AlertaDTO = {
        id: randomUUID(),
        clienteId,
        tipo: 'nova_entidade',
        entidadeAlvoId: entidade.identificador,
        entidadeNome: entidade.nome,
        entidadeCidade: entidade.endereco,
        score: arredondar(score),
        mensagem: `${entidade.nome} tem ${Math.round(
          score * 100,
        )}% de compatibilidade com o seu perfil ideal.`,
        status: 'novo',
        criadoEm: new Date().toISOString(),
      }

      await this.alertaRepo.salvar(alerta)
      alertasGerados.push(alerta)
    }

    return { alertasGerados, totalEscaneadas: entidades.length }
  }

  async listar(
    clienteId: string,
    status?: AlertaDTO['status'],
  ): Promise<AlertaDTO[]> {
    return this.alertaRepo.buscarPorCliente(clienteId, status)
  }

  async atualizarStatus(
    id: string,
    status: AlertaDTO['status'],
  ): Promise<AlertaDTO> {
    const alerta = await this.alertaRepo.atualizarStatus(id, status)
    if (!alerta) {
      throw Object.assign(new Error(`Alerta '${id}' não encontrado.`), {
        statusCode: 404,
      })
    }
    return alerta
  }

  private calcularSimilaridade(
    criterios: CriterioDerivadoDTO[],
    entidade: EntidadeAlvoDTO,
  ): number {
    if (criterios.length === 0) return 0

    let somaPonderada = 0
    let somaPesos = 0

    for (const criterio of criterios) {
      somaPesos += criterio.peso
      const valor = entidade.atributos[criterio.nome]
      if (valor === undefined) continue

      somaPonderada += this.avaliarCriterio(criterio, valor) * criterio.peso
    }

    return somaPesos > 0 ? somaPonderada / somaPesos : 0
  }

  private avaliarCriterio(criterio: CriterioDerivadoDTO, valor: unknown): number {
    switch (criterio.tipoComparacao) {
      case 'range': {
        const numero = Number(valor)
        const min = Number(criterio.valorMin)
        const max = Number(criterio.valorMax)
        if (!Number.isFinite(numero) || !Number.isFinite(min) || !Number.isFinite(max)) {
          return 0
        }
        if (numero >= min && numero <= max) return 1

        const distancia = Math.min(Math.abs(numero - min), Math.abs(numero - max))
        const amplitude = Math.max(max - min, 1)
        return Math.max(0, 1 - distancia / amplitude)
      }
      case 'enum': {
        const aceitos = Array.isArray(criterio.valorMin)
          ? criterio.valorMin
          : [criterio.valorMin]
        return aceitos.map(String).includes(String(valor)) ? 1 : 0
      }
      case 'booleano':
        return valor === criterio.valorMin ? 1 : 0
      case 'distancia':
      default:
        return 0
    }
  }
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}
