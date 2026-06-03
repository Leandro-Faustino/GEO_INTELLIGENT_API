import type { CompradorConhecidoDTO } from '../repositories/interfaces/index.js'

export interface RaioXLocalResult {
  retrato: { frase: string; complemento: string | null }
  fatores: Array<{ atributo: string; pesoPercentual: number; descricao: string }>
  estatisticas: {
    totalClientes: number
    ativos: number
    comRecompra: number
    percentualFieis: number
    ticketMedio?: number
    ticketMin?: number
    ticketMax?: number
  }
  segmentos: Array<{ segmento: string; quantidade: number; percentual: number }>
  potencial: { mensagem: string; cta: string }
}

const MIN_COMPRADORES = 3

export function calcularRaioXLocal(
  compradores: CompradorConhecidoDTO[],
): RaioXLocalResult {
  if (compradores.length < MIN_COMPRADORES) {
    throw Object.assign(
      new Error(
        `Mínimo de ${MIN_COMPRADORES} compradores necessários para gerar o Raio-X.`,
      ),
      { statusCode: 422 },
    )
  }

  const total = compradores.length
  const ativos = compradores.filter((c) => c.ativo).length
  const comRecompra = compradores.filter((c) => c.frequencia >= 2).length
  const percentualFieis = Math.round((comRecompra / total) * 100)

  const tickets = compradores
    .filter((c) => c.ticketMedio > 0)
    .map((c) => c.ticketMedio)
  const ticketMedio = tickets.length
    ? Math.round(tickets.reduce((a, b) => a + b, 0) / tickets.length)
    : undefined
  const ticketMin = tickets.length ? Math.min(...tickets) : undefined
  const ticketMax = tickets.length ? Math.max(...tickets) : undefined

  // Frequência de cada atributo presente em atributosOriginais
  const atributoFreq = new Map<string, number>()
  for (const c of compradores) {
    for (const [k, v] of Object.entries(c.atributosOriginais)) {
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        atributoFreq.set(k, (atributoFreq.get(k) ?? 0) + 1)
      }
    }
  }

  const topAtributos = [...atributoFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const totalPeso = topAtributos.reduce((sum, [, freq]) => sum + freq, 0) || 1
  const fatores = topAtributos.map(([atributo, freq]) => ({
    atributo,
    pesoPercentual: Math.round((freq / totalPeso) * 100),
    descricao: `Presente em ${Math.round((freq / total) * 100)}% dos bons clientes`,
  }))

  // Melhor atributo para segmentação: presença alta, cardinalidade moderada (2–8 valores únicos)
  const melhorAtributo = escolherAtributoDeSegmentacao(compradores, topAtributos)
  const segmentos = segmentarPor(compradores, melhorAtributo, total)

  return {
    retrato: {
      frase: composeRetrato(ativos, total, ticketMedio, percentualFieis),
      complemento: melhorAtributo
        ? `O atributo predominante é "${melhorAtributo}", presente na maioria dos bons clientes.`
        : null,
    },
    fatores,
    estatisticas: {
      totalClientes: total,
      ativos,
      comRecompra,
      percentualFieis,
      ...(ticketMedio !== undefined ? { ticketMedio } : {}),
      ...(ticketMin !== undefined ? { ticketMin } : {}),
      ...(ticketMax !== undefined ? { ticketMax } : {}),
    },
    segmentos,
    potencial: calcularPotencial(percentualFieis, ativos, total),
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function escolherAtributoDeSegmentacao(
  compradores: CompradorConhecidoDTO[],
  topAtributos: Array<[string, number]>,
): string | null {
  for (const [atributo] of topAtributos) {
    const valores = new Set(
      compradores
        .map((c) => c.atributosOriginais[atributo])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== ''),
    )
    if (valores.size >= 2 && valores.size <= 8) return atributo
  }
  return topAtributos[0]?.[0] ?? null
}

function segmentarPor(
  compradores: CompradorConhecidoDTO[],
  atributo: string | null,
  total: number,
): Array<{ segmento: string; quantidade: number; percentual: number }> {
  if (!atributo) return []

  const contagem = new Map<string, number>()
  for (const c of compradores) {
    const valor = String(c.atributosOriginais[atributo] ?? 'Não informado').trim()
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1)
  }

  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([segmento, quantidade]) => ({
      segmento,
      quantidade,
      percentual: Math.round((quantidade / total) * 100),
    }))
}

function composeRetrato(
  ativos: number,
  total: number,
  ticketMedio: number | undefined,
  percentualFieis: number,
): string {
  const partes: string[] = []

  const pctAtivos = Math.round((ativos / total) * 100)
  partes.push(
    `${total} cliente${total !== 1 ? 's' : ''} analisado${total !== 1 ? 's' : ''}, ${pctAtivos}% ativo${pctAtivos !== 1 ? 's' : ''}.`,
  )

  if (ticketMedio !== undefined) {
    partes.push(
      `Ticket médio de R$ ${ticketMedio.toLocaleString('pt-BR')}.`,
    )
  }

  if (percentualFieis >= 60) {
    partes.push(`Alta fidelização: ${percentualFieis}% com recompra.`)
  } else if (percentualFieis >= 30) {
    partes.push(`Fidelização moderada: ${percentualFieis}% com recompra.`)
  } else {
    partes.push(`Fidelização baixa: ${percentualFieis}% com recompra.`)
  }

  return partes.join(' ')
}

function calcularPotencial(
  percentualFieis: number,
  ativos: number,
  total: number,
): { mensagem: string; cta: string } {
  const pctAtivos = Math.round((ativos / total) * 100)

  if (percentualFieis >= 60 && pctAtivos >= 70) {
    return {
      mensagem: 'Base saudável com alta fidelização. Momento ideal para expansão por lookalike.',
      cta: 'Execute uma análise de mercado para encontrar clientes com perfil similar.',
    }
  }

  if (percentualFieis >= 30) {
    return {
      mensagem: 'Fidelização moderada. Há espaço para melhorar retenção antes de expandir.',
      cta: 'Identifique os ativos com recompra e priorize perfis similares a eles.',
    }
  }

  return {
    mensagem: 'Fidelização abaixo do esperado. Revisar critérios de qualificação pode aumentar a conversão.',
    cta: 'Analise os atributos dos clientes que mais repetiram compra e refine o perfil ideal.',
  }
}
