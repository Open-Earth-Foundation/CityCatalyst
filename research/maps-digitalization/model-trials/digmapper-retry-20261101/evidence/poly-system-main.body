import yaml
import json
from tqdm import tqdm
import subprocess
from argparse import ArgumentParser


parser = ArgumentParser()
parser.add_argument('--config',
                    default='./config.yaml',
                    help='config file (.yml) containing the parameters to run the system.')

class obj:
    def __init__(self, dict1):
        self.__dict__.update(dict1)
        
def dict2obj(dict1):
    return json.loads(json.dumps(dict1), object_hook=obj)

def run_command(command):
    print(command)
    with subprocess.Popen(command.split(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1) as proc:
         # Create a tqdm progress bar
        pbar = tqdm(desc="Processing", unit="line")
        # Read output line by line
        for line in proc.stdout:
            print(line, end='')
            pbar.update(1)

        # Wait for the subprocess to finish
        proc.wait()

        # Check if the process had an error
        if proc.returncode != 0:
            print("Error:", proc.stderr.read())

if __name__ == '__main__':
    args = parser.parse_args()
    with open(args.config) as f:
            config = yaml.load(f, Loader=yaml.FullLoader)
    config = dict2obj(config)
    
    # ===============================================================
    # map layout analysis

    # USC method to extract map area bounding box
    map_segment_command = f"python ../segmentation/map_area_segmentation/map_area_segmentation.py --input_path {config.MAP_SEGMENT.INPUT_PATH} --binary_output_path {config.MAP_SEGMENT.BINARY_OUTPUT_PATH} --json_output_path {config.MAP_SEGMENT.JSON_OUTPUT_PATH} --intermediate_dir {config.MAP_SEGMENT.INTERMEDIATE_DIR}"
    
    run_command(map_segment_command)

    # Uncharted method to extract polygon and line/point legend areas
    legend_segment_command = f"python3 -m pipelines.segmentation.run_pipeline --input {config.MAP_LEGEND_SEGMENT.INPUT_DIR} --output {config.MAP_LEGEND_SEGMENT.OUTPUT_DIR} --workdir {config.MAP_LEGEND_SEGMENT.INTERMEDIATE_DIR} --model {config.MAP_LEGEND_SEGMENT.MODEL_PATH}"
    
    run_command(legend_segment_command)
    
    # ===============================================================
    # map cropping
    
    map_crop_command = f"python image_crop/map2patch.py --input_dir {config.CROP_IMAGE_GENERATION.MAP_DIR} --map_name {config.MAP_NAME} --patch_sizes {config.CROP_IMAGE_GENERATION.PATCH_SIZES} --strides {config.CROP_IMAGE_GENERATION.STRIDES} --output_dir {config.CROP_IMAGE_GENERATION.OUTPUT_DIR}"
    
    run_command(map_crop_command)

#     # ===============================================================
#     # text spotting
    
    text_spotting_command = f"python mapkurator/run_text_spotting.py --map_kurator_system_dir {config.MAPKURATOR.MAP_MAPKURATOR_SYSTEM_DIR} --input_dir_path {config.CROP_IMAGE_GENERATION.OUTPUT_DIR}/{config.MAP_NAME}_g1000_s{config.CROP_IMAGE_GENERATION.STRIDES.split(' ')[0]}  --model_weight_path {config.MAPKURATOR.MODEL_WEIGHT_PATH} --expt_name mapKurator_test --module_text_spotting --text_spotting_model_dir {config.MAPKURATOR.TEXT_SPOTTING_MODEL_DIR} --spotter_model spotter_v2 --spotter_config {config.MAPKURATOR.SPOTTER_CONFIG} --spotter_expt_name test --module_img_geojson --output_folder {config.MAPKURATOR.OUTPUT_FOLDER}"
    
    run_command(text_spotting_command)

    # USC method to extract symbol bounding box in the map legend area
    legend_item_segment_command = f"python ../segmentation/legend_item_segmentation/map_legend_segmentation.py --input_image {config.LEGEND_ITEM_SEGMENT.INPUT_PATH} --output_dir {config.LEGEND_ITEM_SEGMENT.OUTPUT_DIR} --preprocessing_for_cropping {config.LEGEND_ITEM_SEGMENT.PREPROCESSING_FOR_CROPPING} --postprocessing_for_crs {config.LEGEND_ITEM_SEGMENT.POSTPROCESSING_FOR_CRS} --path_to_mapkurator_output {config.LEGEND_ITEM_SEGMENT.MAPKURATOR_PATH} --path_to_intermediate {config.LEGEND_ITEM_SEGMENT.INTERMEDIATE_DIR}"
    
    run_command(legend_item_segment_command)

    # GPT extracts pairs of symbols and descriptions in the map legend area
    legend_item_description_extract_command = f"python layout_segment_gpt4/gpt4_main.py --map_dir {config.LEGEND_ITEM_DESCRIPTION_EXTRACT.MAP_DIR} --legend_json_path {config.MAP_LEGEND_SEGMENT.OUTPUT_DIR} --symbol_json_dir {config.LEGEND_ITEM_SEGMENT.OUTPUT_DIR} --map_name {config.MAP_NAME} --gpt4_input_dir {config.LEGEND_ITEM_DESCRIPTION_EXTRACT.GPT_INPUT_DIR} --gpt4_output_dir {config.LEGEND_ITEM_DESCRIPTION_EXTRACT.GPT_OUTPUT_DIR} --gpt4_intermediate_dir {config.LEGEND_ITEM_DESCRIPTION_EXTRACT.INTERMEDIATE_DIR}"
    
    run_command(legend_item_description_extract_command)

    # ===============================================================
    # map line extraction
    if config.LINE_EXTRACTION.PREDICT_RASTER:
        line_extract_command = f"python -W ignore ../line/run_line_extraction.py --config {config.LINE_EXTRACTION.CONFIG} --trained_model_dir {config.LINE_EXTRACTION.TRAINED_MODEL_DIR} --map_name {config.MAP_NAME} --predict_raster --map_legend_json {config.LEGEND_ITEM_DESCRIPTION_EXTRACT.GPT_OUTPUT_DIR} --cropped_image_dir {config.CROP_IMAGE_GENERATION.OUTPUT_DIR}/{config.MAP_NAME}_g256_s256/ --prediction_dir {config.LINE_EXTRACTION.PREDICTION_DIR} --cuda_visible_device 3"
        
    if config.LINE_EXTRACTION.PREDICT_VECTOR:
        line_extract_command = f"python -W ignore ../line/run_line_extraction.py --config {config.LINE_EXTRACTION.CONFIG} --trained_model_dir {config.LINE_EXTRACTION.TRAINED_MODEL_DIR} --map_name {config.MAP_NAME} --predict_vector --map_legend_json {config.LEGEND_ITEM_DESCRIPTION_EXTRACT.GPT_OUTPUT_DIR} --cropped_image_dir {config.CROP_IMAGE_GENERATION.OUTPUT_DIR}/{config.MAP_NAME}_g256_s256/ --prediction_dir {config.LINE_EXTRACTION.PREDICTION_DIR} --cuda_visible_device 3"
    
    run_command(line_extract_command)

    # ===============================================================
    # polygon extraction
    
    polygon_extract_command = f"python ../polygon/loam_handler.py --path_to_tif {config.POLYGON_EXTRACTION.INPUT_MAP_PATH} --path_to_legend_solution {config.LEGEND_ITEM_SEGMENT.OUTPUT_DIR}/{config.MAP_NAME}+'_PolygonType.geojson' --path_to_bound {config.MAP_SEGMENT.JSON_OUTPUT_PATH} --dir_to_integrated_output {config.POLYGON_EXTRACTION.OUTPUT_DIR}"
    
    run_command(polygon_extract_command)
    
    # ===============================================================
    # text-based georeferencing
    
    georeferencing_command = f"python ../georeferencing/text-based/run_georenference.py --input_path {config.GEOREFERENCING.INPUT_MAP_PATH}, --output_path {config.GEOREFERENCING.OUTPUT_PATH}"
    
    run_command(georeferencing_command)
    
