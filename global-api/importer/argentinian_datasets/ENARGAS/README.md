# ENARGAS
Gas consumption data for argentinian provinces

1. Extract the activity data from the source (ENARGAS)[https://dod.enargas.gob.ar/] (manually):
  - variable: consumo de gas
  - aspectos: tipo de usuario
  - distribuidora: todos
  - desagregación espacial: provincia
  - desagregación temporal: anual
  - año: 2018 al 2022 (para tener años completos)

    **data accesed: March, 12th 2023**

2. Transform activity data into emissions data aligned with the global API schema:
```bash
python ./importer/argentinian_datasets/ENARGAS/transformation_ENARGAS.py --path [path where the transformed data will be saved]
```

3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/argentinian_datasets/ENARGAS/load_ENARGAS.py -v file_path=[path where the transformed data was saved]
```
