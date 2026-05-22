export interface CacheService {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  remember<T>(key: string, loader: () => Promise<T>, ttlSeconds?: number): Promise<T>
}

export class RedisCacheService implements CacheService {
  constructor(
    private readonly redis: {
      get(key: string): Promise<string | null>
      set(
        key: string,
        value: string,
        mode?: string,
        duration?: number,
      ): Promise<unknown>
      del(key: string): Promise<number>
    },
    private readonly defaultTtlSeconds: number,
  ) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds ?? this.defaultTtlSeconds)
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key)
  }

  async remember<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get(key)
    if (cached !== null) return JSON.parse(cached) as T

    const fresh = await loader()
    await this.set(key, JSON.stringify(fresh), ttlSeconds)
    return fresh
  }
}

export class MemoryCacheService implements CacheService {
  private readonly store = new Map<string, { value: string; expiresAt: number }>()

  constructor(private readonly defaultTtlSeconds: number) {}

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds ?? this.defaultTtlSeconds) * 1000,
    })
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  async remember<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get(key)
    if (cached !== null) return JSON.parse(cached) as T

    const fresh = await loader()
    await this.set(key, JSON.stringify(fresh), ttlSeconds)
    return fresh
  }
}
