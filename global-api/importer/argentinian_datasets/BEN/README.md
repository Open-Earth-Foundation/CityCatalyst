# Energy Balances Argentina Importer
The BEN summarizes the information related to the production, import, export, transformation and consumption of energy in Argentina, being the main statistical instrument for national energy planning. This source is used to calculate emissions for stationary energy sector.

1. Extract the activity data from the source [Datos Energéticos](http://datos.energia.gob.ar/dataset/balances-energeticos):
```bash
python ./importer/argentinian_datasets/Energy_Balances/extraction_BEN_AR.py --filepath [path where the extracted data will be saved] 
```
2. Transform the activity into emission data align with the Global API schema:
```bash
python ./importer/argentinian_datasets/Energy_Balances/transformation_BEN_AR.py --filepath [path where the transformed data will be saved]
```
3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/argentinian_datasets/Energy_Balances/loading_BEN_AR.sql
```

### Directory tree
```sh
.
├── README.md                  # top level readme
├── extraction_BEN_AR.py       # extraction script
├── transformation_BEN_AR.py   # transformation script
└── loading_BEN_AR.py          # loading script    
```
