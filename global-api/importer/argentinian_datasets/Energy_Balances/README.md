# Energy Balances Argentina Importer

1. Extract the activity data from the source [Datos Energéticos](http://datos.energia.gob.ar/dataset/balances-energeticos):
```bash
python ./importer/argentinian_datasets/Energy_Balances/extraction_energy_balances.py --filepath [path where the extracted data will be saved] 
```
2. Transform the activity into emission data align with the Global API schema:
```bash
python ./importer/argentinian_datasets/Energy_Balances/transformation_energy_balances.py --filepath [path where the transformed data will be saved]
```
3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/argentinian_datasets/Energy_Balances/load_energy_balances.py -v file_path=[path where the transformed data was saved]
```

### Directory tree
```sh
.
├── README.md                           # top level readme
├── extraction_energy_balances.py       # extraction script
├── transformation_energy_balances.py   # transformation script
└── load__energy_balances.py            # loading script    
```
