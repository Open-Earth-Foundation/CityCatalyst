# cammesa - Argentina
Local data of energy generation by power plants in Argentina. This source is used to calculate GHG emissions for subsector of Energy industries in Stationary Energy sector (I.4.4).

1. Extract the activity data from the source [cammesa](https://cammesaweb.cammesa.com/download/factor-de-emision/)

2. Transform the activity into emission data align with the Global API schema:
```bash
python ./importer/argentinian_datasets/cammesa/transformation_cammesa.py --filepath [path where the transformed data will be saved]
```
3. Extract the activity row from the source:
```bash
psql -U ccglobal -d ccglobal -f ./importer/argentinian_datasets/cammesa/loading_cammesa.sql
```

### Directory tree
```sh
.
├── README.md                     # top level readme
├── transformation_cammesa.py     # transformation script
└── load_cammesa.sql              # loading script    
```