# Malhas de setores censitários

Coloque aqui GeoJSONs recortados da Malha de Setores Censitários do IBGE.

Contrato mínimo esperado:

- `FeatureCollection`
- `features[]` com `geometry.type` `Polygon` ou `MultiPolygon`
- coordenadas em `[longitude, latitude]`
- propriedade de código em uma destas chaves: `CD_SETOR`, `CD_SETOR_2022`,
  `CD_GEOCODI`, `GEOCODIGO`, `cod_setor`, `codigoSetor` ou `setorCensitario`

Valide antes de usar:

```bash
npm run validate:setores -- data/ibge/setores/seu-arquivo.geojson
```

Depois configure:

```bash
SETORES_CENSITARIOS_GEOJSON_PATH=data/ibge/setores/seu-arquivo.geojson
```

Não versionar malhas grandes neste repositório. Use arquivos recortados por
município/UF em ambiente de deploy ou armazene a malha em storage próprio.
