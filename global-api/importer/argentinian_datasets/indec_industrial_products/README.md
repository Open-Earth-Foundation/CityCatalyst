# Industrial Products Statistics - INDEC

This program allows obtaining local production series of selected industrial goods, in physical units.
The information originates from different sources: INDEC's own surveys, data from other government agencies and information from business institutions. In the case of some products (wine, beer, soft drinks, cigarettes, cement, boats), to make up for the lack of production statistics or to complement them, figures for registrations, sales or shipments of national products are recorded.

1. Extract the raw data from the source [INDEC](https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-6-18):
```bash
python ./extraction.py
```
2. Clean the raw data:
```bash
python ./clean_raw_data.py
```
3. Load the cleaned raw data into a new table:
[....]

### Directory tree
```sh
.
├── README.md                  # top level readme
├── extraction.py              # extraction script
├── clean_raw_data.py          # transformation script
└── loading_raw_data.py        # loading script    
```