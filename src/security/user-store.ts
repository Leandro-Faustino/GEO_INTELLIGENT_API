import { type UserClaims } from '../plugins/30-auth.js'
import { scryptSync, timingSafeEqual } from 'node:crypto'
import type { AppConfig } from '../configs/env.schema.js'

export interface SecretDocument {
  id: string
  ownerId: string
  content: string
}

export interface AppUser {
  id: string
  email: string
  role: UserClaims['role']
  password?: string
}

const users: AppUser[] = [
  {
    id: 'u1',
    email: 'alice@example.com',
    password: 'alice-secret-123',
    role: 'user',
  },
  { id: 'u2', email: 'bob@example.com', password: 'bob-secret-456', role: 'user' },
  {
    id: 'admin1',
    email: 'root@example.com',
    password: 'admin-secret-789',
    role: 'admin',
  },
]

const documents: SecretDocument[] = [
  { id: 'd1', ownerId: 'u1', content: 'Diario privado da Alice' },
  { id: 'd2', ownerId: 'u2', content: 'Notas confidenciais do Bob' },
]

export function findUserByCredentials(
  email: string,
  password: string,
  config?: AppConfig,
): AppUser | undefined {
  if (config?.NODE_ENV === 'production') {
    if (
      !config.ADMIN_EMAIL ||
      !config.ADMIN_PASSWORD_HASH ||
      email !== config.ADMIN_EMAIL ||
      !verificarSenhaScrypt(password, config.ADMIN_PASSWORD_HASH)
    ) {
      return undefined
    }

    return {
      id: 'admin-env',
      email: config.ADMIN_EMAIL,
      role: 'admin',
    }
  }

  return users.find((user) => user.email === email && user.password === password)
}

export function findDocumentById(id: string): SecretDocument | undefined {
  return documents.find((document) => document.id === id)
}

export function criarHashSenhaScrypt(
  password: string,
  salt = 'change-this-salt',
): string {
  const n = 16_384
  const r = 8
  const p = 1
  const hash = scryptSync(password, salt, 64, { N: n, r, p }).toString('hex')
  return `scrypt$${n}$${r}$${p}$${Buffer.from(salt).toString('hex')}$${hash}`
}

export function verificarSenhaScrypt(password: string, encoded: string): boolean {
  const [alg, n, r, p, saltHex, hashHex] = encoded.split('$')
  if (alg !== 'scrypt' || !n || !r || !p || !saltHex || !hashHex) return false

  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
