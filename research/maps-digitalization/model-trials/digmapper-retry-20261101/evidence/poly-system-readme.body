# Project Title

This is a brief description of the system design for CriticalMAAS project TA1 (extracting information from maps).

## Introduction
The diagram below illustrates the overall system pipeline. The blue and green boxes represent the inputs and outputs of the system, respectively. For example, the inputs are the USGS maps, including maps in the National Geologic Map Database (NGMDB) catalog. The outputs are geo-referenced maps, extracted features, map metadata, and more following the output schema agreed upon by all performers in TA1 and TA4. The white boxes in the diagram include modules for the feature extraction task, georeferencing task, as well as the map layout and metadata extraction. 

<img src="figures/simplified_system_diagram_after_hackthon.png" alt="Figure 1: System Diagram." width="500"/>

By December 31, the system includes the text spotting module, feature exatrction modules for both line and polygon, and map layout analysis module. The diagram below provides a visual representation of the current system.  

<img src="figures/sample_simplified_system_diagram_after_hackthon_v4.png" alt="Figure 2: Current System Diagram." width="450"/>

## Directory Layout
```bash
system/
│
├── input_maps/            #  Maps to process
│  
├── outputs/                 # outputs for modules
│   ├── uncharted_map_laoyout_analysis/
│   ├── usc_map_layout_analysis/
|   |── gpt_map_layout_analysis/
|   ├── line_extraction/
|   ├── polygon_extraction/
│
├── config.yaml               # parameters to run modules
│ 
├── main.py                  # script to run the current system
|
└── README.md              # Project overview
```
## Installation
Please go to the modules' github to check the detailed installation instruction.

## Running Command
```bash
python main.py --config 'config.yaml'


