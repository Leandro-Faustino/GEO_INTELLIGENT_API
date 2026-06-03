export interface UsuarioDTO {
  id: string
  email: string
  senhaHash: string
  role: 'user' | 'admin'
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export interface CriarUsuarioInput {
  email: string
  senhaHash: string
  role?: 'user' | 'admin'
}

export interface IUsuarioRepository {
  buscarPorEmail(email: string): Promise<UsuarioDTO | null>
  buscarPorId(id: string): Promise<UsuarioDTO | null>
  listar(limit: number, offset: number): Promise<{ total: number; items: UsuarioDTO[] }>
  criar(input: CriarUsuarioInput): Promise<UsuarioDTO>
  desativar(id: string): Promise<void>
}
