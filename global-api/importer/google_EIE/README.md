# Google EIE
Emissions from transportation modes in Mendoza city, Argentina

1. Extract the activity data from the source

2. Transform raw data aligned with the global API schema:
```bash
python ./importer/google_EIE//transformation_transportation_Mendoza.py --filepath [path where the raw data is stored]
```

3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/argentinian_datasets/ENARGAS/load_ENARGAS.sql
```