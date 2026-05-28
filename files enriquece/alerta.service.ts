/**
 * Serviço de Alertas de Oportunidade (C2.4).
 *
 * Detecta entidades NOVAS no escopo do perfil ideal que o sistema
 * ainda não conhece, calcula seu score de similaridade, e persiste
 * como alerta para o cliente.
 *
 * Padrão: DI por construtor (repos como interface), erros com
 * statusCode (Fastify Cap. 3), sem dependência de framework.
 *
 * Reusa o AnaliseService.calcularSimilaridade() para scoring —
 * não reimplementa inteligência, reutiliza a existente.
 */
import { randomUUID } from 'node:crypto'
import type {
  AlertaDTO,
  IAlertaRepository,
  IEntidadeAlvoRepository,
  IPerfilRepository,
  EntidadeAlvoDTO,
  CriterioDerivadoDTO,
} from '../repositories/interfaces/index.js'

export class AlertaService {
  constructor(
    private readonly alertaRepo: IAlertaRepository,
    private readonly perfilRepo: IPerfilRepository,
    private readonly entidadeRepo: IEntidadeAlvoRepository,
  ) {}

  /**
   * Escaneia o escopo em busca de entidades novas que batem com o perfil.
   *
   * 1. Busca o perfil ativo do cliente
   * 2. Busca entidades no escopo (via repo)
   * 3. Filtra as que ainda não geraram alerta (idempotente)
   * 4. Calcula score de cada nova entidade
   * 5. Persiste as que passam o limiar como alerta
   *
   * Retorna apenas os alertas NOVOS desta execução (não duplica).
   */
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
      // Idempotência: não duplica alertas para a mesma entidade
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
        entidadeCidade:
          typeof entidade.endereco === 'string'
            ? entidade.endereco
            : '',
        score: Math.round(score * 100) / 100,
        mensagem: this.gerarMensagem(entidade, score),
        status: 'novo',
        criadoEm: new Date().toISOString(),
      }

      await this.alertaRepo.salvar(alerta)
      alertasGerados.push(alerta)
    }

    return { alertasGerados, totalEscaneadas: entidades.length }
  }

  /** Lista alertas de um cliente, opcionalmente filtrados por status. */
  async listar(
    clienteId: string,
    status?: AlertaDTO['status'],
  ): Promise<AlertaDTO[]> {
    return this.alertaRepo.buscarPorCliente(clienteId, status)
  }

  /** Atualiza o status de um alerta (visto, descartado, convertido). */
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

  /**
   * Cálculo de similaridade — mesma lógica do AnaliseService.
   * Replicada aqui para não criar dependência circular. Em refactor
   * futuro, extrair para um módulo shared de scoring.
   */
  private calcularSimilaridade(
    criterios: CriterioDerivadoDTO[],
    entidade: EntidadeAlvoDTO,
  ): number {
    if (criterios.length === 0) return 0

    let somaScore = 0
    let somaPeso = 0

    for (const criterio of criterios) {
      const valor = entidade.atributos[criterio.nome]
      if (valor === undefined) continue

      let matchScore = 0
      if (criterio.tipoComparacao === 'enum') {
        const aceitos = Array.isArray(criterio.valorMin)
          ? criterio.valorMin.map(String)
          : [String(criterio.valorMin)]
        matchScore = aceitos.includes(String(valor)) ? 1 : 0
      } else {
        const num = Number(valor)
        const min = Number(criterio.valorMin)
        const max = Number(criterio.valorMax)
        if (!Number.isNaN(num) && !Number.isNaN(min) && !Number.isNaN(max)) {
          if (num >= min && num <= max) {
            matchScore = 1
          } else {
            const range = max - min || 1
            const distancia = num < min ? min - num : num - max
            matchScore = Math.max(0, 1 - distancia / range)
          }
        }
      }

      somaScore += matchScore * criterio.peso
      somaPeso += criterio.peso
    }

    return somaPeso > 0 ? somaScore / somaPeso : 0
  }

  private gerarMensagem(entidade: EntidadeAlvoDTO, score: number): string {
    const pct = Math.round(score * 100)
    return `${entidade.nome} tem ${pct}% de compatibilidade com o seu perfil ideal.`
  }
}
