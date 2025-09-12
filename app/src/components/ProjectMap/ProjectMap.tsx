import { api } from "@/services/api";
import {
  getBoundingBox,
  getBoundsZoomLevel,
  stretchBoundingBox,
} from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, Marker } from "pigeon-maps";
import { getBoundingBoxCenter } from "./geo_utils";
import { CityLocationResponse } from "@/util/types";

export interface CityMetadata {
  id: string;
  name: string;
  locode: string;
  latestInventoryId: string;
}

export interface ProjectMapProps {
  projectId?: string;
  organizationId?: string;
  width: number;
  height: number;
  setSelectedCity: (city: CityLocationResponse) => void;
  selectedCity?: CityLocationResponse;
}

const defaultColor = "#648bff";
const highlightColor = "#ffc363";

export const ProjectMap: FC<ProjectMapProps> = ({
  projectId,
  organizationId,
  width,
  height,
  setSelectedCity,
  selectedCity,
}) => {
  /*const {
    data: projectBoundaries,
    isLoading,
    error,
  } = api.useGetProjectBoundariesQuery(projectId!, {
    skip: !projectId,
  });*/

  const { data: cityLocations, isLoading } = api.useGetBulkCityLocationsQuery(
    { projectId, organizationId },
    {
      skip: !projectId && !organizationId,
    },
  );

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

  // automatically center and zoom map to frame all cities
  useEffect(() => {
    if (cityLocations && cityLocations.length > 0) {
      const cityCoords = cityLocations
        .filter(
          (location) => location.longitude != null && location.latitude != null,
        )
        .map((location) => ({
          latitude: location.latitude,
          longitude: location.longitude,
        }));
      const combinedBoundingBox = getBoundingBox(cityCoords);
      if (combinedBoundingBox && !combinedBoundingBox.some(isNaN)) {
        const boundingBox = stretchBoundingBox(combinedBoundingBox, 0.02);
        const newZoom = getBoundsZoomLevel(boundingBox, {
          width,
          height,
        });
        const newCenter = getBoundingBoxCenter(boundingBox);
        setCenter(newCenter);
        setZoom(newZoom);
      }
    }
  }, [cityLocations, height, width]);

  return (
    <Box w={width} h={height} position="relative">
      {isLoading && (
        <Box
          w={width}
          h={height}
          position="absolute"
          top={0}
          left={0}
          zIndex={1000}
          pointerEvents="none"
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
        {cityLocations?.map(
          (cityLocation: CityLocationResponse, index: number) =>
            cityLocation.latitude &&
            cityLocation.longitude && (
              <Marker
                key={cityLocation.locode + "-" + index}
                color={
                  selectedCity === cityLocation ? highlightColor : defaultColor
                }
                anchor={[cityLocation.latitude, cityLocation.longitude]}
                onClick={() => setSelectedCity(cityLocation)}
              />
            ),
        )}
      </Map>
    </Box>
  );
};

export default ProjectMap;
