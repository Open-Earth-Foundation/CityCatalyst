# SESCO - Argentina
Refining and Marketing of oil, gas and derivatives. Market Sales by sector and province reported by the Secretary of Energy, National Government. This source is used to calculate GHG emissions for subsector of Manufactoring industries and facilities in Stationary Energy sector (I.3.1)

1. Extract the activity data from the source [TD Ventas (Excluye ventas al sector) - SESCO](http://datos.energia.gob.ar/dataset/refinacion-y-comercializacion-de-petroleo-gas-y-derivados-tablas-dinamicas/archivo/f0e4e10a-e4b8-44e6-bd16-763a43742107):
```bash
python ./importer/argentinian_datasets/SESCO/extraction_SESCO_AR.py --filepath [path where the extracted data will be saved] 
```
2. Transform the activity into emission data align with the Global API schema:
```bash
python ./importer/argentinian_datasets/SESCO/transformation_SESCO_AR.py --filepath [path where the transformed data will be saved]
```
3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/argentinian_datasets/SESCO/loading_SESCO_AR.sql
```

### Directory tree
```sh
.
├── README.md                  # top level readme
├── extraction_SESCO_AR.py       # extraction script
├── loading_SESCO_AR.py   # transformation script
└── loading_SESCO_AR.py          # loading script    
```
