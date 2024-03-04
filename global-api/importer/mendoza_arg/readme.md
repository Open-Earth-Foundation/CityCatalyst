# Stationary Energy Mendoza Argentina Importer

1. Extract the activity row from the source:
```bash
python ./importer/mendoza_arg/extraction_mendoza_stationary_energy.py --filepath [path where the extracted data will be saved] 
```
2. Transform the activity into emission data align with the Global API schema:
```bash
python ./importer/mendoza_arg/transformation_mendoza_stationary_energy.py --filepath [path where the transformed data will be saved]
```
3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/mendoza_arg/load_mendoza_stationary_energy.py -v file_path=[path where the transformed data was saved]
```

### Directory tree
.
├── README.md                                     # top level readme
├── extraction_mendoza_stationary_energy.py       # extraction script
├── transformation_mendoza_stationary_energy.py   # transformation script
└── load_mendoza_stationary_energy.py             # loading script                 
