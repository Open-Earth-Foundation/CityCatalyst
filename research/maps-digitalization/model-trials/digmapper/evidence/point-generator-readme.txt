# criticalmaas-TA1-synthmap-points
Repo for creating synthetic map images for point symbols

Currently, we support 11 point symbols:
1. drill_hole <br>
2. gravel_pit <br>
3. inclined_bedding <br>
4. inclined_flow_banding <br>
5. inclined_metamorphic <br>
6. lineation <br>
7. mine_shaft <br>
8. overturned_bedding <br>
9. prospect <br>
10. quarry <br>
11. mine_tunnel <br>

### Running Command
```
python create_synthetic_maps_main.py
--root1 [path to the map tifs]
--root2 [path to the symbol images]
--target_symbol [target symbol name]
--max_rotate [maximum rotation angle]
--use_target_symbol_tifs [default: True]
--max_num_synthetic_images [maximum number of images need to be created]
--max_count_per_image [maximum number of symbols being placed on the patch]
--allow_collision [default: True]

```

### Running Example 
```
python create_synthetic_maps_main.py --target_symbol inclined_flow_banding --max_rotate 45
```
