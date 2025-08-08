"use client";

import { api } from "@/services/api";
import { BoundingBox, getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, Marker } from "pigeon-maps";

export interface ProjectMapProps {
  projectId?: string;
  organizationId?: string;
  width: number;
  height: number;
}

function getBoundingBox(
  points: { latitude: number; longitude: number }[],
): BoundingBox {
  if (points.length === 0) {
    return [0, 0, 0, 0];
  }

  const { longitude, latitude } = points[0];
  const result = [longitude, latitude, longitude, latitude] as BoundingBox;
  for (let i = 1; i < points.length; i++) {
    let point = points[i];
    result[0] = Math.min(result[0], point.longitude);
    result[1] = Math.max(result[1], point.latitude);
    result[2] = Math.max(result[2], point.longitude);
    result[3] = Math.min(result[3], point.latitude);
  }
  return result;
}

export const ProjectMap: FC<ProjectMapProps> = ({
  projectId,
  organizationId,
  width,
  height,
}) => {
  const { data: cityLocations, isLoading } = api.useGetBulkCityLocationsQuery(
    { projectId, organizationId },
    {
      skip: !projectId && !organizationId,
    },
  );

  const [center, setCenter] = useState<[number, number]>([34.0, -37.0]);
  const [zoom, setZoom] = useState(11);
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

  // calculate compound bounding box from all lat/lngs
  useEffect(() => {
    if (cityLocations && cityLocations.length > 0) {
      const boundingBox = getBoundingBox(cityLocations);
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
  }, [cityLocations, height, width]);

  return (
    <Box w={width} h={height} position="relative">
      {isLoading ? (
        <Box
          w={width}
          h={height}
          style={{
            position: "relative",
            top: 0,
            left: 0,
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          <Center h="full">
            <Spinner size="lg" />
          </Center>
        </Box>
      ) : (
        <Map
          height={height}
          center={center}
          zoom={zoom}
          onBoundsChanged={onBoundsChanged}
          attributionPrefix={false}
        >
          {cityLocations?.map((location) => (
            <Marker
              key={location.locode}
              width={50}
              anchor={[location.latitude, location.longitude]}
              color="#009a2f"
            />
          ))}
        </Map>
      )}
    </Box>
  );
};

export default ProjectMap;
