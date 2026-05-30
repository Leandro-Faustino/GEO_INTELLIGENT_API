# Datasets Operacionais

Este documento descreve como obter, normalizar e validar os datasets necessários para os serviços de IDH e setor censitário.

---

## IDH Municipal

### Fonte oficial

**Atlas do Desenvolvimento Humano no Brasil** — PNUD Brasil / IPEA / FJP  
URL: https://www.atlasbrasil.org.br/ranking

### Formato esperado pelo sistema

```json
[
  {
    "codigoIbge": 4209102,
    "municipio": "Joinville",
    "uf": "SC",
    "idh": 0.809,
    "ano": 2010,
    "fonte": "PNUD Brasil"
  }
]
```

Caminho padrão: `data/idh/idh-municipal.json`  
Variável de ambiente: `IDH_MUNICIPAL_DATASET_PATH`

### Importar a partir do Atlas Brasil

1. Acesse https://www.atlasbrasil.org.br/ranking
2. Selecione o indicador **IDHM** (Índice de Desenvolvimento Humano Municipal)
3. Exporte o ranking como CSV
4. Execute o script de normalização:

```bash
npm run import:idh -- data/idh/atlas-brasil-export.csv
# Saída: data/idh/idh-municipal.json
```

5. Valide o resultado:

```bash
npm run validate:idh -- data/idh/idh-municipal.json
```

### Formato do CSV de entrada (Atlas Brasil)

O script `scripts/import-idh.ts` aceita o CSV padrão de exportação do Atlas Brasil com colunas:

```
Código IBGE;Município;UF;IDHM 2010
```

Separador: `;` (ponto e vírgula)  
Encoding: UTF-8 ou Latin-1 (detectado automaticamente)

---

## Malha de Setores Censitários (IBGE)

### Fonte oficial

**IBGE — Malha de Setores Censitários do Censo 2022**  
URL: https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/26565-malhas-de-setores-censitarios.html

### Formato esperado pelo sistema

GeoJSON `FeatureCollection` com geometrias `Polygon` ou `MultiPolygon`.  
Cada feature deve ter em `properties` pelo menos um dos campos:
- `CD_SETOR` (código do setor 2010)
- `CD_SETOR_2022` (código do setor 2022)
- `CD_GEOCODI`
- `GEOCODIGO`

Caminho padrão: `data/ibge/setores/<arquivo>.geojson`  
Variável de ambiente: `SETORES_CENSITARIOS_GEOJSON_PATH`

### Obter e converter para GeoJSON

O IBGE distribui a malha como Shapefile. Para converter:

```bash
# Instalar GDAL
sudo apt-get install gdal-bin   # Ubuntu/Debian
brew install gdal               # macOS

# Baixar o Shapefile do IBGE para SC (exemplo)
# Arquivo: SC_Setores_2022.zip → extrai SC_Setores_2022.shp

# Converter Shapefile → GeoJSON (todos os setores do estado)
ogr2ogr -f GeoJSON \
  data/ibge/setores/sc.geojson \
  SC_Setores_2022.shp \
  -t_srs EPSG:4326

# Para recortar apenas um município (Joinville = código 4209102):
ogr2ogr -f GeoJSON \
  data/ibge/setores/joinville.geojson \
  SC_Setores_2022.shp \
  -t_srs EPSG:4326 \
  -where "CD_MUN = '4209102'"
```

### Validar o GeoJSON

```bash
npm run validate:setores -- data/ibge/setores/sc.geojson
```

---

## Provider do Geocoder (Nominatim)

### Modos de operação

| `GEOCODER_PROVIDER_MODE` | Quando usar | Requisitos adicionais |
|--------------------------|-------------|----------------------|
| `nominatim-public` | Desenvolvimento / baixo volume | `NOMINATIM_USER_AGENT` com e-mail + `NOMINATIM_THROTTLE_MS >= 1000` |
| `nominatim-selfhosted` | Produção / instância própria | `NOMINATIM_BASE_URL` apontando para a instância |
| `commercial` | Produção / provider pago (ex: LocationIQ, Geocod.io) | Nenhum — configure via `NOMINATIM_BASE_URL` e `NOMINATIM_USER_AGENT` |

### Instância própria (recomendado para produção)

Siga o guia oficial: https://nominatim.org/release-docs/latest/admin/Installation/

Exemplo com Docker:
```bash
docker run -it --rm \
  -e PBF_URL=https://download.geofabrik.de/south-america/brazil/sul-latest.osm.pbf \
  -e REPLICATION_URL=https://download.geofabrik.de/south-america/brazil/sul-updates/ \
  -p 8080:8080 \
  mediagis/nominatim:4.3
```

Configure no `.env`:
```
GEOCODER_PROVIDER_MODE=nominatim-selfhosted
NOMINATIM_BASE_URL=http://localhost:8080
NOMINATIM_USER_AGENT=GeoLead/1.0
NOMINATIM_THROTTLE_MS=0
```

---

## Validação em CI

Para garantir que os datasets são válidos antes do deploy:

```bash
npm run validate:datasets
```

Este script valida `data/idh/idh-municipal.json` e `data/ibge/setores/*.geojson` se os arquivos existirem. O CI falhará se arquivos presentes forem inválidos, mas não falhará se os arquivos estiverem ausentes (datasets são opcionais para desenvolvimento).
