# LOAM

LOAM: Polygon Extraction from Raster Map


## Environment

This module was tested on a machine equipped with a GeForce RTX 3090, AMD Ryzen 9 5900X 12-core processor at 3.7 GHz, 128 GB DDR4 RAM (32 GB x 4) at 3200 MHz, with 4 TB SSD. This module does not require an additional database; however, it heavily relies on multi-processing to achieve better efficiency. This module will adjust its own multi-processing setting based on the tested machine. To ensure a good user experience, please make sure the tested machine has at least 128 GB RAM and a processor with more than 12 cores available.

If there are still concerns regarding the efficiency, please set the input argument '--trade_off' to 6 to achieve the best efficiency with the lowest accuracy of this module.

### Create from Conda Config

```
conda env create -f environment.yml
conda activate loam
```

### Create from Separate Steps

This module has been tested with the latest version of pytorch-related libraries.

```
conda create -n loam python=3.9.16
conda activate loam

conda install pytorch torchvision==1.13.1 torchaudio==0.13.1 cudatoolkit=11.7 -c pytorch

or

pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

pip install -r requirements.txt
```


## Usage

### Extracting with a Pre-trained Model

Run the following to exploit the pre-trained polygon-recognition model for extracting polygonal features from raster maps.

```
python loam_handler.py --path_to_tif xxx.tif --path_to_json xxx.json --path_to_legend_solution xxx.geojson --path_to_legend_description xxx.json --dir_to_integrated_output xxx --dir_to_intermediate xxx
```

If one already has the outputs of legend-item segmentation (for 'path_to_json' and 'path_to_legend_solution') and legend-description extraction (for 'path_to_legend_description'), and intends to use the geojson file that conforms with the current schema to identify the legend items. Note that one needs the outputs of legend-item segmentation (for 'path_to_json' and 'path_to_legend_solution') that follow `image coordinate`.

To get the output in image coordinate, one can set 'postprocessing_for_crs' to 'False' to get the output at '(output_dir)/(map_name)/(map_name)_PolygonType_internal.json' and '(output_dir)/(map_name)/(map_name)_PolygonType.geojson' when executing 'usc-umn-inferlink-ta1/segmentation/legend_item_segmentation/'.

Or one can use it in its simplest way:

```
python loam_handler.py --path_to_tif xxx.tif --path_to_json xxx.json --path_to_legend_solution xxx.geojson
```

In this case, the outputs will be stored in 'Vectorization_Output/' folder.


Descriptions of the inputs are as follows.

```
--path_to_tif: (str, mandatory) path to the source map tif.
--path_to_json: (str, mandatory) (Legend-item segmentation output) path to the source map json. Please refer to 'usc-umn-inferlink-ta1/segmentation/legend_item_segmentation/' to run and get the output json ([xxx]_PolygonType_internal.json). This conforms with the competition json format.
--path_to_legend_solution: (str, mandatory) (Legend-item segmentation output) path to the legend-item segmentation output geojson. Please refer to 'usc-umn-inferlink-ta1/segmentation/legend_item_segmentation/' to run and get the output geojson ([xxx]_PolygonType.geojson). If no valid file for this argument is provided, one will only get raster outputs tif in 'LOAM_Intermediate/Metadata_Preprocessing/intermediate7(2)/Output'.
--path_to_legend_description: (str, optional but recommended) (Legend-description segmentation output) path to the legend-description extraction output json. Please refer to 'usc-umn-inferlink-ta1/segmentation/legend_item_description_segment/' to run and get the output json ([xxx]_Polygon.json).
--path_to_bound: (str, optional) path to the map-area segmentation output geojson. This can adapt to several different json formats. (e.g., [xxx]_map_segmentation.json or ch2_validation_evaluation_labels_coco.json)
--dir_to_integrated_output: (str, optional) directory to the vectorization outputs geojson. (Default to 'Vectorization_Output/')
--dir_to_intermediate: (str, optional) directory to the intermediate output files. (Default to 'Example_Output/')
--log: (str, optional) path to the logging txt. (Default to 'log_file.txt')

--dir_to_groundtruth: (str, optional) directory to the groundtruth data tif.
--set_json: (bool, optional) whether to use the json file that conforms with the competition schema to identify the legend items. (Default to 'True', will automatically adjust depending on the other input arguments)
--map_area_segmentation: (bool, optional) whether map-area segmentation is needed to proceed with. (Default to 'False')
--performance_evaluation: (bool, optional) whether performance evaluation is needed to proceed with. Please provide 'dir_to_groundtruth' if set to True. (Default to 'False')
--version: (str, optional) a value indicating the version.

--testing: (bool, optional) set to TRUE if you only want to test particular sub-module(s). Please see the following input argument regarding the tested sub-module(s) (Default to 'False')
--testing_section: (int, optional) set a series of integers based on the sub-module(s) you want to test. e.g., 3, 23, or 123. (0 for metadata_preprocessing, 1 for metadata_postprocessing, 2 for loam_inference, and 3 for polygon_output_handler)
--trade_off: (int, optional) set a value that indicates your trade-off between efficiency and accuracy. (Default to '3') (0 for highest accuracy with lowest efficiency, and 6 for highest efficiency with lowest accuracy)
```

