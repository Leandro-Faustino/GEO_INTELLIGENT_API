import fp from 'fastify-plugin'
import {
  MemoryAlertaRepo,
  MemoryAnaliseRepo,
  MemoryBaseInternaRepo,
  MemoryClienteRepo,
  MemoryEntidadeAlvoRepo,
  MemoryEnriquecimentoCompradorRepo,
  MemoryEntregaRepo,
  MemoryFeedbackRepo,
  MemoryPerfilRepo,
  MemoryUsuarioRepo,
} from '../repositories/memory/index.js'
import { AlertaPgRepository } from '../repositories/pg/alerta.pg-repo.js'
import { AnalisePgRepository } from '../repositories/pg/analise.pg-repo.js'
import { BaseInternaPgRepository } from '../repositories/pg/base-interna.pg-repo.js'
import { ClientePgRepository } from '../repositories/pg/cliente.pg-repo.js'
import { EnriquecimentoCompradorPgRepository } from '../repositories/pg/enriquecimento-comprador.pg-repo.js'
import { EntregaPgRepository } from '../repositories/pg/entrega.pg-repo.js'
import { FeedbackPgRepository } from '../repositories/pg/feedback.pg-repo.js'
import { PerfilPgRepository } from '../repositories/pg/perfil.pg-repo.js'
import { UsuarioPgRepository } from '../repositories/pg/usuario.pg-repo.js'
import { MongoEntidadeAlvoRepository } from '../repositories/mongo/entidade-alvo.mongo-repo.js'
import type {
  IAlertaRepository,
  IAnaliseRepository,
  IBaseInternaRepository,
  IClienteRepository,
  IEntidadeAlvoRepository,
  IEnriquecimentoCompradorRepository,
  IEntregaRepository,
  IFeedbackRepository,
  IPerfilRepository,
  IUsuarioRepository,
} from '../repositories/interfaces/index.js'
import { AnaliseService } from '../services/analise.service.js'
import { AlertaService } from '../services/alerta.service.js'
import { CompetitivaService } from '../services/competitiva.service.js'
import { DerivacaoService } from '../services/derivacao.service.js'
import { EntregaService } from '../services/entrega.service.js'
import { TerritorioService } from '../services/territorio.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    readonly clienteRepo: IClienteRepository
    readonly baseInternaRepo: IBaseInternaRepository
    readonly perfilRepo: IPerfilRepository
    readonly entidadeAlvoRepo: IEntidadeAlvoRepository
    readonly analiseRepo: IAnaliseRepository
    readonly entregaRepo: IEntregaRepository
    readonly feedbackRepo: IFeedbackRepository
    readonly enriquecimentoCompradorRepo: IEnriquecimentoCompradorRepository
    readonly alertaRepo: IAlertaRepository
    readonly usuarioRepo: IUsuarioRepository
    readonly derivacaoService: DerivacaoService
    readonly analiseService: AnaliseService
    readonly entregaService: EntregaService
    readonly alertaService: AlertaService
    readonly territorioService: TerritorioService
    readonly competitivaService: CompetitivaService
  }
}

export default fp(
  async function servicesPlugin(fastify): Promise<void> {
    const datasource = fastify as unknown as {
      pg?: { pool: ConstructorParameters<typeof ClientePgRepository>[0] }
      mongo?: { db: ConstructorParameters<typeof MongoEntidadeAlvoRepository>[0] }
    }

    const usePostgres = Boolean(fastify.config.DB_ENABLED && datasource.pg?.pool)
    const useMongo = Boolean(fastify.config.DB_ENABLED && datasource.mongo?.db)

    if (fastify.config.DB_ENABLED && fastify.config.NODE_ENV === 'production') {
      if (!usePostgres) {
        throw new Error(
          'POSTGRES_URL/DATABASE_URL é obrigatório em produção com DB_ENABLED=true.',
        )
      }
      if (!useMongo) {
        throw new Error(
          'MONGO_URL é obrigatório em produção com DB_ENABLED=true.',
        )
      }
    }

    const clienteRepo: IClienteRepository = usePostgres
      ? new ClientePgRepository(datasource.pg!.pool)
      : new MemoryClienteRepo()
    const baseInternaRepo: IBaseInternaRepository = usePostgres
      ? new BaseInternaPgRepository(datasource.pg!.pool)
      : new MemoryBaseInternaRepo()
    const perfilRepo: IPerfilRepository = usePostgres
      ? new PerfilPgRepository(datasource.pg!.pool)
      : new MemoryPerfilRepo()
    const analiseRepo: IAnaliseRepository = usePostgres
      ? new AnalisePgRepository(datasource.pg!.pool)
      : new MemoryAnaliseRepo()
    const entregaRepo: IEntregaRepository = usePostgres
      ? new EntregaPgRepository(datasource.pg!.pool)
      : new MemoryEntregaRepo()
    const feedbackRepo: IFeedbackRepository = usePostgres
      ? new FeedbackPgRepository(datasource.pg!.pool)
      : new MemoryFeedbackRepo()
    const enriquecimentoCompradorRepo: IEnriquecimentoCompradorRepository = usePostgres
      ? new EnriquecimentoCompradorPgRepository(datasource.pg!.pool)
      : new MemoryEnriquecimentoCompradorRepo()
    const alertaRepo: IAlertaRepository = usePostgres
      ? new AlertaPgRepository(datasource.pg!.pool)
      : new MemoryAlertaRepo()
    const usuarioRepo: IUsuarioRepository = usePostgres
      ? new UsuarioPgRepository(datasource.pg!.pool)
      : new MemoryUsuarioRepo()
    const entidadeAlvoRepo: IEntidadeAlvoRepository = useMongo
      ? new MongoEntidadeAlvoRepository(datasource.mongo!.db)
      : new MemoryEntidadeAlvoRepo()

    if (entidadeAlvoRepo instanceof MongoEntidadeAlvoRepository) {
      await entidadeAlvoRepo.ensureIndexes()
    }

    fastify.decorate<IClienteRepository>('clienteRepo', clienteRepo)
    fastify.decorate<IBaseInternaRepository>('baseInternaRepo', baseInternaRepo)
    fastify.decorate<IPerfilRepository>('perfilRepo', perfilRepo)
    fastify.decorate<IEntidadeAlvoRepository>('entidadeAlvoRepo', entidadeAlvoRepo)
    fastify.decorate<IAnaliseRepository>('analiseRepo', analiseRepo)
    fastify.decorate<IEntregaRepository>('entregaRepo', entregaRepo)
    fastify.decorate<IFeedbackRepository>('feedbackRepo', feedbackRepo)
    fastify.decorate<IEnriquecimentoCompradorRepository>(
      'enriquecimentoCompradorRepo',
      enriquecimentoCompradorRepo,
    )
    fastify.decorate<IAlertaRepository>('alertaRepo', alertaRepo)
    fastify.decorate<IUsuarioRepository>('usuarioRepo', usuarioRepo)
    fastify.decorate('derivacaoService', new DerivacaoService(baseInternaRepo, perfilRepo))
    fastify.decorate(
      'analiseService',
      new AnaliseService(perfilRepo, entidadeAlvoRepo, baseInternaRepo, analiseRepo),
    )
    fastify.decorate(
      'entregaService',
      new EntregaService(entregaRepo, feedbackRepo, analiseRepo),
    )
    fastify.decorate(
      'alertaService',
      new AlertaService(alertaRepo, perfilRepo, entidadeAlvoRepo, baseInternaRepo),
    )
    fastify.decorate(
      'territorioService',
      new TerritorioService(perfilRepo, entidadeAlvoRepo, baseInternaRepo),
    )
    fastify.decorate(
      'competitivaService',
      new CompetitivaService(perfilRepo, entidadeAlvoRepo, baseInternaRepo),
    )

    fastify.log.info(
      {
        postgres: usePostgres ? 'pg' : 'memory',
        entidades: useMongo ? 'mongo' : 'memory',
      },
      'serviços e repositórios injetados',
    )
  },
  { name: 'app-services', dependencies: ['app-config', 'app-datasource'] },
)
