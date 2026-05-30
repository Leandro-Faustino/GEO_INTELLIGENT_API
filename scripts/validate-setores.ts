import { resolve } from 'node:path'
import { validarSetoresCensitariosGeoJson } from '../src/services/setor-censitario.service.js'

const pathArg = process.argv[2] ?? process.env['SETORES_CENSITARIOS_GEOJSON_PATH']

if (!pathArg) {
  console.error(
    'Informe o caminho do GeoJSON: npm run validate:setores -- data/ibge/setores/arquivo.geojson',
  )
  process.exitCode = 2
} else {
  const path = resolve(pathArg)
  const resultado = await validarSetoresCensitariosGeoJson(path)

  console.log(
    JSON.stringify(
      {
        valido: resultado.valido,
        path: resultado.path,
        totalFeatures: resultado.totalFeatures,
        totalSetores: resultado.totalSetores,
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
