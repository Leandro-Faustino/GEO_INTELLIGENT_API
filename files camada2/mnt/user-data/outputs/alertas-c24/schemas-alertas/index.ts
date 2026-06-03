export { ScanAlertasBody, AtualizarAlertaBody } from './body.js'
export { ScanAlertasResponse, ListaAlertasResponse, AlertaResponse } from './response.js'

import { ScanAlertasBody, AtualizarAlertaBody } from './body.js'
import { ScanAlertasResponse, ListaAlertasResponse } from './response.js'

export const alertaSchemas = [
  ScanAlertasBody,
  AtualizarAlertaBody,
  ScanAlertasResponse,
  ListaAlertasResponse,
]
