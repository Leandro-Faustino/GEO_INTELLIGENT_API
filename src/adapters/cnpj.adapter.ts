import { BaseAdapter, type AdapterOptions } from './base-adapter.js'

export interface CnpjAdapterOptions extends AdapterOptions {
  /** Endpoint de busca em massa por CNAE+município (custom backend). */
  apiUrl?: string
  apiKey?: string
  /** Base URL da BrasilAPI — enriquecimento e complemento de dados. */
  brasilApiUrl?: string
  /** Base URL da ReceitaWS — fonte primária de dados cadastrais RF. */
  receitaWsUrl?: string
}

// ─── DTOs internos de cada fonte ────────────────────────────────────────────

interface BrasilApiEmpresa {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  descricao_situacao_cadastral?: string
  data_inicio_atividade?: string
  natureza_juridica?: string          // string descritiva (ex: "Sociedade de Economia Mista")
  codigo_natureza_juridica?: number   // código numérico (fallback)
  cnae_fiscal?: number                // int sem leading zero (ex: 600001 = CNAE 0600001)
  cnae_fiscal_descricao?: string
  cnaes_secundarios?: Array<{ codigo: number; descricao: string }>
  descricao_tipo_de_logradouro?: string  // campo real: "de" no meio
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
  capital_social?: number
  porte?: string                // "DEMAIS", "EPP", etc. — string, não código
  descricao_porte?: string      // mantido para compatibilidade
  opcao_pelo_simples?: boolean | null
  opcao_pelo_mei?: boolean | null
  qsa?: Array<{ nome_socio?: string; qualificacao_socio?: string }>
  ddd_telefone_1?: string       // DDD+número concatenados (ex: "2121660000" = 21+21660000)
}

interface ReceitaWsEmpresa {
  cnpj?: string
  nome?: string
  fantasia?: string
  situacao?: string
  abertura?: string
  natureza_juridica?: string
  atividade_principal?: Array<{ code?: string; text?: string }>
  atividades_secundarias?: Array<{ code?: string; text?: string }>
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
  capital_social?: string  // "205431960490.52" (decimal inglês) OU "50.000,00" (BRL)
  porte?: string
  email?: string
  telefone?: string        // formato pronto: "(21) 2166-0000"
  qsa?: Array<{ nome?: string; qual?: string }>
  simples?: { optante?: boolean }  // opcao_pelo_simples NÃO existe no nível raiz
  simei?: { optante?: boolean }    // opcao_pelo_mei NÃO existe no nível raiz
  status?: string
}

// ────────────────────────────────────────────────────────────────────────────

export class AdaptadorCNPJ extends BaseAdapter {
  readonly nome = 'cnpj-receita-federal'

  private readonly apiUrl: string
  private readonly apiKey: string
  private readonly brasilApiUrl: string
  private readonly receitaWsUrl: string

  constructor(options: CnpjAdapterOptions = {}) {
    super(options)
    this.apiUrl = (options.apiUrl ?? '').replace(/\/$/, '')
    this.apiKey = options.apiKey ?? ''
    this.brasilApiUrl = (options.brasilApiUrl ?? '').replace(/\/$/, '')
    this.receitaWsUrl = (options.receitaWsUrl ?? '').replace(/\/$/, '')
  }

  override get modo(): 'real' | 'mock' | 'hibrido' {
    const temBulk = Boolean(this.apiUrl)
    const temEnriquecimento = Boolean(this.brasilApiUrl || this.receitaWsUrl)
    if (temBulk && temEnriquecimento) return 'real'
    if (temBulk || temEnriquecimento) return 'hibrido'
    return 'mock'
  }

  // ── consultar: busca em massa por CNAE + município ───────────────────────

  async consultar(
    parametros: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    return this.executarProtegido('consultar', async (signal) => {
      const cnaes = Array.isArray(parametros['cnaes'])
        ? parametros['cnaes'].map(String)
        : []
      const municipio = String(parametros['municipio'] ?? '')
      const limit = Number(parametros['limit'] ?? 100)
      const limiteFinal = Number.isFinite(limit) ? limit : 100

      if (this.apiUrl) {
        const response = await fetch(`${this.apiUrl}/empresas`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({ cnaes, municipio, limit: limiteFinal }),
        })

        if (!response.ok) {
          throw Object.assign(
            new Error(`API CNPJ respondeu ${response.status}`),
            { statusCode: response.status },
          )
        }

        const payload = (await response.json()) as { empresas?: unknown[] }
        return (payload.empresas ?? []).map((empresa) =>
          this.normalizarApiCustom(empresa as Record<string, unknown>),
        )
      }

      return mockEmpresas
        .filter((empresa) => {
          const cnaeOk = cnaes.length === 0 || cnaes.includes(empresa.cnae)
          const municipioOk =
            !municipio ||
            empresa.municipio
              .toLocaleLowerCase('pt-BR')
              .includes(municipio.toLocaleLowerCase('pt-BR'))
          return cnaeOk && municipioOk
        })
        .slice(0, limiteFinal)
        .map((empresa) => ({
          identificador: empresa.identificador,
          nome: empresa.nome,
          tipo: 'pj',
          endereco: empresa.endereco,
          latitude: empresa.latitude,
          longitude: empresa.longitude,
          fonte: this.nome,
          atributos: {
            cnae: empresa.cnae,
            porte: empresa.porte,
            idadeAnos: empresa.idadeAnos,
            municipio: empresa.municipio,
          },
        }))
    })
  }

  // ── enriquecer: combina Receita Federal + BrasilAPI ─────────────────────

  async enriquecer(identificador: string): Promise<Record<string, unknown>> {
    return this.executarProtegido('enriquecer', async (signal) => {
      const cnpj = extrairCNPJ(identificador)
      if (!cnpj) {
        throw Object.assign(
          new Error(`Identificador '${identificador}' não é um CNPJ válido — enriquecimento CNPJ não se aplica`),
          { statusCode: 422, code: 'IDENTIFICADOR_NAO_CNPJ' },
        )
      }

      const [receitaResult, brasilResult] = await Promise.allSettled([
        this.receitaWsUrl
          ? this.fetchReceitaWs(cnpj, signal)
          : Promise.reject(new Error('receitaws nao configurado')),
        this.brasilApiUrl
          ? this.fetchBrasilApi(cnpj, signal)
          : Promise.reject(new Error('brasilapi nao configurado')),
      ])

      const rf = receitaResult.status === 'fulfilled' ? receitaResult.value : null
      const ba = brasilResult.status === 'fulfilled' ? brasilResult.value : null

      if (!rf && !ba) return mockEnriquecimento(identificador, this.nome)

      return this.mesclar(cnpj, rf, ba)
    })
  }

  // ── fetch individual por fonte ───────────────────────────────────────────

  private async fetchReceitaWs(
    cnpj: string,
    signal: AbortSignal,
  ): Promise<ReceitaWsEmpresa> {
    const res = await fetch(`${this.receitaWsUrl}/v1/cnpj/${cnpj}`, { signal })
    if (!res.ok) {
      throw Object.assign(new Error(`ReceitaWS respondeu ${res.status}`), {
        statusCode: res.status,
      })
    }
    const data = (await res.json()) as ReceitaWsEmpresa
    if (data.status && data.status !== 'OK') {
      throw Object.assign(new Error(`ReceitaWS: ${data.status}`), { statusCode: 422 })
    }
    return data
  }

  private async fetchBrasilApi(
    cnpj: string,
    signal: AbortSignal,
  ): Promise<BrasilApiEmpresa> {
    const res = await fetch(`${this.brasilApiUrl}/api/cnpj/v1/${cnpj}`, { signal })
    if (!res.ok) {
      throw Object.assign(new Error(`BrasilAPI respondeu ${res.status}`), {
        statusCode: res.status,
      })
    }
    return (await res.json()) as BrasilApiEmpresa
  }

  // ── mesclagem: RF tem precedência nos campos cadastrais ──────────────────

  private mesclar(
    cnpj: string,
    rf: ReceitaWsEmpresa | null,
    ba: BrasilApiEmpresa | null,
  ): Record<string, unknown> {
    const fontes: string[] = []
    if (rf) fontes.push('receitaws')
    if (ba) fontes.push('brasilapi')

    // Razão social: RF é a fonte de verdade do Cadastro Nacional
    const razaoSocial = nonEmpty(rf?.nome) ?? nonEmpty(ba?.razao_social) ?? ''
    const nomeFantasia = nonEmpty(rf?.fantasia) ?? nonEmpty(ba?.nome_fantasia) ?? ''

    // Situação: RF tem o texto oficial
    const situacao =
      nonEmpty(rf?.situacao) ?? nonEmpty(ba?.descricao_situacao_cadastral) ?? ''

    // Data de abertura: RF no formato dd/mm/yyyy → ISO; BrasilAPI já em ISO
    const dataAbertura =
      parseDateRF(rf?.abertura) ?? nonEmpty(ba?.data_inicio_atividade) ?? ''

    // Natureza jurídica:
    //   RF tem string completa ("203-8 - Sociedade de Economia Mista")
    //   BrasilAPI tem natureza_juridica string OU codigo_natureza_juridica numérico
    const naturezaJuridica =
      nonEmpty(rf?.natureza_juridica) ??
      nonEmpty(ba?.natureza_juridica) ??
      (ba?.codigo_natureza_juridica ? String(ba.codigo_natureza_juridica) : '') ??
      ''

    // Capital social:
    //   RF (ReceitaWS) retorna string — pode ser BRL "50.000,00" OU decimal inglês "205431960490.52"
    //   BrasilAPI retorna número diretamente
    const capitalSocial = parseBRL(rf?.capital_social) ?? ba?.capital_social ?? 0

    // Porte: RF e BrasilAPI têm o mesmo campo (string "DEMAIS", "EPP", etc.)
    const porte = nonEmpty(rf?.porte) ?? nonEmpty(ba?.porte) ?? nonEmpty(ba?.descricao_porte) ?? ''

    // CNAE principal:
    //   RF: "06.00-0-01" → após strip: "0600001" (7 dígitos corretos com leading zero)
    //   BrasilAPI: integer 600001 → padStart 7 → "0600001"
    const rfCnae = rf?.atividade_principal?.[0]?.code?.replace(/\D/g, '') ?? ''
    const baCnae = ba?.cnae_fiscal ? String(ba.cnae_fiscal).padStart(7, '0') : ''
    const cnaePrincipal = nonEmpty(rfCnae) ?? nonEmpty(baCnae) ?? ''
    const cnaePrincipalDescricao =
      nonEmpty(rf?.atividade_principal?.[0]?.text) ??
      nonEmpty(ba?.cnae_fiscal_descricao) ??
      ''

    // CNAEs secundários: mesclados de ambas, deduplicados por código
    const cnaesSecundarios = mesclarCnaes(
      ba?.cnaes_secundarios ?? [],
      rf?.atividades_secundarias ?? [],
    )

    // Endereço:
    //   RF (ReceitaWS) já traz logradouro com tipo prefixado ("AV REPUBLICA DO CHILE")
    //   BrasilAPI tem tipo em campo separado: descricao_tipo_de_logradouro (com "de" no nome)
    const baTipoLogradouro = ba?.descricao_tipo_de_logradouro ?? ''
    const rfLogradouro = [rf?.logradouro, rf?.numero, rf?.complemento]
      .filter(Boolean)
      .join(', ')
    const baLogradouro = [baTipoLogradouro, ba?.logradouro, ba?.numero, ba?.complemento]
      .filter(Boolean)
      .join(' ')
    const logradouro = nonEmpty(rfLogradouro) ?? nonEmpty(baLogradouro) ?? ''
    const bairro = nonEmpty(rf?.bairro) ?? nonEmpty(ba?.bairro) ?? ''
    const municipio = nonEmpty(rf?.municipio) ?? nonEmpty(ba?.municipio) ?? ''
    const uf = nonEmpty(rf?.uf) ?? nonEmpty(ba?.uf) ?? ''
    const cep = (rf?.cep ?? ba?.cep ?? '').replace(/\D/g, '')

    // Contato:
    //   RF (ReceitaWS) tem email e telefone formatados prontos: "(21) 2166-0000"
    //   BrasilAPI tem ddd_telefone_1 como DDD+número concatenados ("2121660000") — formatar se RF falhar
    const email = nonEmpty(rf?.email) ?? ''
    const telefone = nonEmpty(rf?.telefone) ?? formatarTelefoneBA(ba?.ddd_telefone_1) ?? ''

    // Sócios: mesclados de ambas, deduplicados por nome
    const socios = mesclarSocios(ba?.qsa ?? [], rf?.qsa ?? [])

    // Flags Simples/MEI:
    //   ReceitaWS: campos aninhados em simples.optante e simei.optante (NÃO no nível raiz)
    //   BrasilAPI: opcao_pelo_simples e opcao_pelo_mei no nível raiz (podem ser null)
    const opcaoSimples =
      rf?.simples?.optante ?? ba?.opcao_pelo_simples ?? false
    const opcaoMei =
      rf?.simei?.optante ?? ba?.opcao_pelo_mei ?? false

    return {
      identificador: cnpj,
      razaoSocial,
      nomeFantasia,
      situacao,
      dataAbertura,
      naturezaJuridica,
      capitalSocial,
      porte,
      cnaePrincipal,
      cnaePrincipalDescricao,
      cnaesSecundarios,
      logradouro,
      bairro,
      municipio,
      uf,
      cep,
      email,
      telefone,
      socios,
      opcaoSimples,
      opcaoMei,
      fontes,
      fonte: this.nome,
      enriquecidoEm: new Date().toISOString(),
    }
  }

  // ── normalização do endpoint de bulk custom ──────────────────────────────

  private normalizarApiCustom(empresa: Record<string, unknown>): Record<string, unknown> {
    return {
      identificador: String(empresa['cnpj'] ?? empresa['identificador'] ?? ''),
      nome: String(
        empresa['razao_social'] ?? empresa['razaoSocial'] ?? empresa['nome'] ?? '',
      ),
      tipo: 'pj',
      endereco: String(empresa['endereco'] ?? empresa['logradouro'] ?? ''),
      latitude: numeroCampo(empresa, 'latitude'),
      longitude: numeroCampo(empresa, 'longitude'),
      fonte: this.nome,
      atributos: {
        cnae: String(
          empresa['cnae_principal'] ??
            empresa['cnaePrincipal'] ??
            empresa['cnae'] ??
            '',
        ),
        porte: numeroCampo(empresa, 'porte'),
        idadeAnos: numeroCampo(empresa, 'idade_anos', 'idadeAnos'),
        municipio: String(empresa['municipio'] ?? ''),
      },
    }
  }
}

export class CnpjAdapter extends AdaptadorCNPJ {}

// ─── helpers ─────────────────────────────────────────────────────────────────

function extrairCNPJ(identificador: string): string | null {
  const digits = identificador.replace(/\D/g, '')
  return digits.length === 14 ? digits : null
}

function nonEmpty(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const s = v.trim()
  return s.length > 0 ? s : null
}

/** Converte "01/01/2019" (formato RF) para "2019-01-01". */
function parseDateRF(v: string | null | undefined): string | null {
  if (!v) return null
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim())
  if (!match) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

/**
 * Converte capital social da ReceitaWS para número.
 * Dois formatos possíveis na API real:
 *   - BRL: "50.000,00" (ponto = separador de milhar, vírgula = decimal)
 *   - Decimal inglês: "205431960490.52" (ponto = decimal, sem separador de milhar)
 */
function parseBRL(v: string | null | undefined): number | null {
  if (!v) return null
  const s = v.trim()
  if (!s) return null
  if (s.includes(',')) {
    // formato BRL: remove separadores de milhar, converte vírgula decimal
    const n = Number(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  // formato decimal inglês ou número puro: parse direto
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Formata ddd_telefone_1 da BrasilAPI, que vem como DDD+número concatenados.
 * Ex: "2121660000" → "(21) 21660000" ou "(21) 2166-0000"
 */
function formatarTelefoneBA(dddTelefone: string | undefined): string | null {
  if (!dddTelefone) return null
  const digits = dddTelefone.replace(/\D/g, '')
  if (digits.length < 10) return null
  const ddd = digits.slice(0, 2)
  const numero = digits.slice(2)
  // 8 dígitos: XXXX-XXXX; 9 dígitos (celular): XXXXX-XXXX
  const formatado =
    numero.length === 9
      ? `${numero.slice(0, 5)}-${numero.slice(5)}`
      : `${numero.slice(0, 4)}-${numero.slice(4)}`
  return `(${ddd}) ${formatado}`
}

function numeroCampo(origem: Record<string, unknown>, ...nomes: string[]): number {
  for (const nome of nomes) {
    const valor = Number(origem[nome])
    if (Number.isFinite(valor)) return valor
  }
  return 0
}

function mesclarCnaes(
  ba: Array<{ codigo: number; descricao: string }>,
  rf: Array<{ code?: string; text?: string }>,
): Array<{ codigo: string; descricao: string }> {
  const mapa = new Map<string, string>()

  for (const item of ba) {
    const codigo = String(item.codigo)
    mapa.set(codigo, item.descricao)
  }

  for (const item of rf) {
    const codigo = (item.code ?? '').replace(/\D/g, '')
    if (codigo && !mapa.has(codigo)) {
      mapa.set(codigo, item.text ?? '')
    }
  }

  return Array.from(mapa.entries()).map(([codigo, descricao]) => ({
    codigo,
    descricao,
  }))
}

function mesclarSocios(
  ba: Array<{ nome_socio?: string; qualificacao_socio?: string }>,
  rf: Array<{ nome?: string; qual?: string }>,
): Array<{ nome: string; qualificacao: string }> {
  const nomes = new Set<string>()
  const socios: Array<{ nome: string; qualificacao: string }> = []

  for (const s of ba) {
    const nome = s.nome_socio ?? ''
    if (nome && !nomes.has(nome)) {
      nomes.add(nome)
      socios.push({ nome, qualificacao: s.qualificacao_socio ?? '' })
    }
  }

  for (const s of rf) {
    const nome = s.nome ?? ''
    if (nome && !nomes.has(nome)) {
      nomes.add(nome)
      socios.push({ nome, qualificacao: s.qual ?? '' })
    }
  }

  return socios
}

function mockEnriquecimento(identificador: string, fonte: string): Record<string, unknown> {
  const empresa = mockEmpresas.find((item) => item.identificador === identificador)
  return {
    identificador,
    razaoSocial: empresa?.nome ?? `Empresa ${identificador}`,
    nomeFantasia: '',
    situacao: 'ATIVA',
    dataAbertura: '2018-03-15',
    naturezaJuridica: '206-2 - Sociedade Limitada',
    capitalSocial: 150_000,
    porte: 'EPP',
    cnaePrincipal: empresa?.cnae ?? '5510801',
    cnaePrincipalDescricao: '',
    cnaesSecundarios: [],
    logradouro: empresa?.endereco ?? '',
    bairro: '',
    municipio: empresa?.municipio ?? '',
    uf: 'SC',
    cep: '',
    email: '',
    telefone: '',
    socios: [],
    opcaoSimples: false,
    opcaoMei: false,
    fontes: [],
    fonte,
    enriquecidoEm: new Date().toISOString(),
  }
}

// ─── dados mock para desenvolvimento sem credenciais ────────────────────────

const mockEmpresas = [
  {
    identificador: 'cnpj-001',
    nome: 'Hotel Panorama',
    cnae: '5510801',
    porte: 3,
    idadeAnos: 7,
    municipio: 'Joinville',
    endereco: 'Rua das Palmeiras, 120',
    latitude: -26.304,
    longitude: -48.846,
  },
  {
    identificador: 'cnpj-002',
    nome: 'Hotel Top Class',
    cnae: '5510801',
    porte: 2,
    idadeAnos: 4,
    municipio: 'Joinville',
    endereco: 'Av. Brasil, 890',
    latitude: -26.31,
    longitude: -48.85,
  },
  {
    identificador: 'cnpj-003',
    nome: 'Pousada Refugio',
    cnae: '5510801',
    porte: 1,
    idadeAnos: 2,
    municipio: 'Joinville',
    endereco: 'Rua Jaguaruna, 45',
    latitude: -26.29,
    longitude: -48.83,
  },
  {
    identificador: 'cnpj-004',
    nome: 'ILPI Lar Esperanca',
    cnae: '8711501',
    porte: 3,
    idadeAnos: 10,
    municipio: 'Joinville',
    endereco: 'Rua XV de Novembro, 300',
    latitude: -26.3,
    longitude: -48.84,
  },
  {
    identificador: 'cnpj-005',
    nome: 'Padaria Central',
    cnae: '4721102',
    porte: 1,
    idadeAnos: 20,
    municipio: 'Joinville',
    endereco: 'Rua do Comercio, 55',
    latitude: -26.305,
    longitude: -48.845,
  },
  {
    identificador: 'cnpj-006',
    nome: 'Hotel Marina Bay',
    cnae: '5510801',
    porte: 4,
    idadeAnos: 15,
    municipio: 'Florianopolis',
    endereco: 'Av. Beira Mar, 1500',
    latitude: -27.59,
    longitude: -48.55,
  },
]
