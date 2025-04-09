"use client";

import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature, Marker } from "pigeon-maps";

export interface ProjectMapProps {
  projectId: string | null;
  width: number;
  height: number;
}

function getBoundingBoxCenter(boundingBox: {
  bbox_west: number;
  bbox_south: number;
  bbox_east: number;
  bbox_north: number;
}): [number, number] {
  return [
    (boundingBox.bbox_west + boundingBox.bbox_east) / 2,
    (boundingBox.bbox_south + boundingBox.bbox_north) / 2,
  ];
}

export const ProjectMap: FC<ProjectMapProps> = ({
  projectId,
  width,
  height,
}) => {
  const { data: projectBoundaries, isLoading } =
    api.useGetProjectBoundariesQuery(projectId!, {
      skip: !projectId,
    });

  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

  const [center, setCenter] = useState<[number, number]>([34.0, -37.0]);
  const [zoom, setZoom] = useState(9);
  const onBoundsChanged = ({
    center: newCenter,
    zoom: newZoom,
  }: {
    center: [number, number];
    zoom: number;
  }) => {
    setCenter(newCenter);
    setZoom(newZoom);
  };

  useEffect(() => {
    if (projectBoundaries?.boundingBox) {
      const boundingBox = projectBoundaries.boundingBox;
      if (boundingBox && !boundingBox.some(isNaN)) {
        const newZoom = getBoundsZoomLevel(boundingBox, { width, height });
        const newCenter: [number, number] = [
          (boundingBox[1] + boundingBox[3]) / 2,
          (boundingBox[0] + boundingBox[2]) / 2,
        ];
        setCenter(newCenter);
        setZoom(newZoom);
      }
    }
  }, [projectBoundaries, height, width]);

  return (
    <Box w={width} h={height} className="relative">
      {isLoading && (
        <Box
          w={width}
          h={height}
          className="absolute top-0 left-0 z-[1000] pointer-events-none"
        >
          <Center h="full">
            <Spinner size="lg" />
          </Center>
        </Box>
      )}
      <Map
        height={height}
        center={center}
        zoom={zoom}
        onBoundsChanged={onBoundsChanged}
        attributionPrefix={false}
      >
        {projectBoundaries?.map((boundary: any) => (
          <>
            <GeoJson
              svgAttributes={{
                fill: "#648bff99",
                strokeWidth: "3",
                stroke: "#648bff",
              }}
            >
              {boundary.data && (
                <GeoJsonFeature
                  feature={{
                    type: "Feature",
                    geometry: projectBoundaries.data,
                  }}
                />
              )}
            </GeoJson>
            <Marker
              width={50}
              anchor={getBoundingBoxCenter(boundary.boundingBox)}
              color="#648bff"
              onClick={() => setSelectedCityId(boundary.cityId)}
            />
          </>
        ))}
      </Map>
    </Box>
  );
};

export default ProjectMap;
