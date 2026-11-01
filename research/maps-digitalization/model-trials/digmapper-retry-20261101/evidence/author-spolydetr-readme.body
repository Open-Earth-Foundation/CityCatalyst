# S-PolyDETR

## S-PolyDETR's goal is to detect single polylines' location in area-of-interest in the topographic maps

## Docker imagery to train/testing PolyDETR
**Here is the command to run the docker imagery**

<code>sudo nvidia-docker run -t -i -v {local_dir}:{docker_dir} -p 8888:8888 pytorch/pytorch:1.2-cuda10.0-cudnn7-devel</code>

## Inputs for training S-PolyDETR
Geo-referenced tif map image, Geo-referenced shapefile for desired polylines' locations, txt file including nodes of desired polylines, png map image, raster png polylines' locations.

## Train S-PolyDETR
The training a S-PolyDETR by running
<code> python train.py </code>

To update the parameters for data processing, model architecture, and training process, please update './util/args.py'


## Use S-PolyDETR to detect desired polylines
Update './util/args_test.py' to set the map name and trained model path for PolyDETR

**Here is the command to test PolyDETR
<code> python test.py </code>
