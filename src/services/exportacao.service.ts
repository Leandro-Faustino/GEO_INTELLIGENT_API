import type { EntregaDTO, OportunidadeDTO } from '../repositories/interfaces/index.js'

const CABECALHO_CSV = [
  'id',
  'entidadeAlvoId',
  'tipo',
  'prioridade',
  'score',
  'similaridade',
  'probConversao',
  'justificativa',
  'ganchoAbordagem',
].join(',')

export function oportunidadesParaCsv(oportunidades: OportunidadeDTO[]): string {
  const linhas = oportunidades.map((o) =>
    [
      escapeCsv(o.id),
      escapeCsv(o.entidadeAlvoId),
      escapeCsv(o.tipo),
      escapeCsv(o.prioridade),
      String(o.score.valor ?? ''),
      String(o.score.similaridade ?? ''),
      String(o.score.probConversao ?? ''),
      escapeCsv(o.justificativa),
      escapeCsv(o.ganchoAbordagem),
    ].join(','),
  )

  return [CABECALHO_CSV, ...linhas].join('\r\n')
}

export function oportunidadesParaJson(
  entrega: EntregaDTO,
  oportunidades: OportunidadeDTO[],
): object {
  return {
    entrega: {
      id: entrega.id,
      clienteId: entrega.clienteId,
      analiseId: entrega.analiseId,
      periodo: entrega.periodo,
      formato: entrega.formato,
      totalOportunidades: entrega.totalOportunidades,
      geradoEm: entrega.createdAt,
    },
    oportunidades: oportunidades.map((o) => ({
      id: o.id,
      entidadeAlvoId: o.entidadeAlvoId,
      tipo: o.tipo,
      prioridade: o.prioridade,
      score: o.score,
      justificativa: o.justificativa,
      ganchoAbordagem: o.ganchoAbordagem,
    })),
  }
}

// Escapa campo CSV: envolve em aspas se contiver vírgula, aspas ou quebra de linha
function escapeCsv(valor: string | undefined | null): string {
  const s = String(valor ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
