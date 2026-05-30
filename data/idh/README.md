# IDH municipal

Coloque aqui o dataset estático de IDH municipal em JSON.

Contrato esperado:

```json
[
  {
    "codigoIbge": 4209102,
    "municipio": "Joinville",
    "uf": "SC",
    "idh": 0.809,
    "ano": 2010,
    "fonte": "Atlas do Desenvolvimento Humano"
  }
]
```

Valide antes de usar:

```bash
npm run validate:idh -- data/idh/idh-municipal.json
```

Depois configure:

```bash
IDH_MUNICIPAL_DATASET_PATH=data/idh/idh-municipal.json
```

O IDH municipal não vem da API do IBGE. A fonte recomendada é um dataset
estático do Atlas do Desenvolvimento Humano, PNUD/IPEA/FJP, ou outra fonte
oficial acordada no projeto.
