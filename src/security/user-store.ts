import { type UserClaims } from '../plugins/30-auth.js'

export interface SecretDocument {
  id: string
  ownerId: string
  content: string
}

export interface AppUser {
  id: string
  email: string
  password: string
  role: UserClaims['role']
}

const users: AppUser[] = [
  {
    id: 'u1',
    email: 'alice@example.com',
    password: 'alice-secret-123',
    role: 'user',
  },
]

const documents: SecretDocument[] = []

export function findUserByCredentials(
  email: string,
  password: string,
): AppUser | undefined {
  return users.find((user) => user.email === email && user.password === password)
}

export function findDocumentById(id: string): SecretDocument | undefined {
  return documents.find((document) => document.id === id)
}
