import {
  AtualizarAlertaBody,
  ScanAlertasBody,
} from './body.js'
import {
  AlertaResponse,
  AtualizarAlertaResponse,
  ListaAlertasResponse,
  ScanAlertasResponse,
} from './response.js'

export {
  AlertaResponse,
  AtualizarAlertaBody,
  AtualizarAlertaResponse,
  ListaAlertasResponse,
  ScanAlertasBody,
  ScanAlertasResponse,
}

export const alertaSchemas = [
  ScanAlertasBody,
  AtualizarAlertaBody,
  AlertaResponse,
  ScanAlertasResponse,
  ListaAlertasResponse,
  AtualizarAlertaResponse,
]
