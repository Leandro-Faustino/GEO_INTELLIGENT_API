import { resolve } from 'node:path'
import { validarIdhMunicipalDataset } from '../src/services/idh-municipal.service.js'

const pathArg = process.argv[2] ?? process.env['IDH_MUNICIPAL_DATASET_PATH']

if (!pathArg) {
  console.error('Informe o caminho do dataset: npm run validate:idh -- data/idh/idh-municipal.json')
  process.exitCode = 2
} else {
  const resultado = await validarIdhMunicipalDataset(resolve(pathArg))

  console.log(
    JSON.stringify(
      {
        valido: resultado.valido,
        path: resultado.path,
        totalRegistros: resultado.totalRegistros,
        codigosDuplicados: resultado.codigosDuplicados,
        erros: resultado.erros,
      },
      null,
      2,
    ),
  )

  if (!resultado.valido) {
    process.exitCode = 1
  }
}
