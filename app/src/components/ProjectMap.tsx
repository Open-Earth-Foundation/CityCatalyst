"use client";

import { api } from "@/services/api";
import { getBoundingBox, getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useMemo, useState } from "react";
import { Map, Marker } from "pigeon-maps";

/**
 * Props for the ProjectMap component.
 * Note: Either projectId OR organizationId should be provided, but not both.
 */
export interface ProjectMapProps {
  projectId?: string;
  organizationId?: string;
  width: number;
  height: number;
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
  const { boundingBox, newCenter, newZoom } = useMemo(() => {
    if (!cityLocations?.length) return {};
    const boundingBox = getBoundingBox(cityLocations);
    if (!boundingBox || boundingBox.some(isNaN)) return {};

    return {
      boundingBox,
      newCenter: [
        (boundingBox[1] + boundingBox[3]) / 2,
        (boundingBox[0] + boundingBox[2]) / 2,
      ] as [number, number],
      newZoom: getBoundsZoomLevel(boundingBox, { width, height }),
    };
  }, [cityLocations, width, height]);

  useEffect(() => {
    if (newCenter && newZoom) {
      setCenter(newCenter);
      setZoom(newZoom);
    }
  }, [newCenter, newZoom]);

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
