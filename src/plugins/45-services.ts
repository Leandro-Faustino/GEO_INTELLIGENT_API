import fp from 'fastify-plugin'
import {
  MemoryAnaliseRepo,
  MemoryBaseInternaRepo,
  MemoryClienteRepo,
  MemoryEntidadeAlvoRepo,
  MemoryEntregaRepo,
  MemoryPerfilRepo,
} from '../repositories/memory/index.js'
import { AnalisePgRepository } from '../repositories/pg/analise.pg-repo.js'
import { BaseInternaPgRepository } from '../repositories/pg/base-interna.pg-repo.js'
import { ClientePgRepository } from '../repositories/pg/cliente.pg-repo.js'
import { EntregaPgRepository } from '../repositories/pg/entrega.pg-repo.js'
import { PerfilPgRepository } from '../repositories/pg/perfil.pg-repo.js'
import { MongoEntidadeAlvoRepository } from '../repositories/mongo/entidade-alvo.mongo-repo.js'
import type {
  IAnaliseRepository,
  IBaseInternaRepository,
  IClienteRepository,
  IEntidadeAlvoRepository,
  IEntregaRepository,
  IPerfilRepository,
} from '../repositories/interfaces/index.js'
import { AnaliseService } from '../services/analise.service.js'
import { DerivacaoService } from '../services/derivacao.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    readonly clienteRepo: IClienteRepository
    readonly baseInternaRepo: IBaseInternaRepository
    readonly perfilRepo: IPerfilRepository
    readonly entidadeAlvoRepo: IEntidadeAlvoRepository
    readonly analiseRepo: IAnaliseRepository
    readonly entregaRepo: IEntregaRepository
    readonly derivacaoService: DerivacaoService
    readonly analiseService: AnaliseService
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
    fastify.decorate('derivacaoService', new DerivacaoService(baseInternaRepo, perfilRepo))
    fastify.decorate(
      'analiseService',
      new AnaliseService(perfilRepo, entidadeAlvoRepo, baseInternaRepo, analiseRepo),
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
