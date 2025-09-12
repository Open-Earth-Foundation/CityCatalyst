import { api } from "@/services/api";
import { getBoundingBox, getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature, Marker } from "pigeon-maps";
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
      console.dir(cityCoords);
      const combinedBoundingBox = getBoundingBox(cityCoords);
      console.dir(combinedBoundingBox);
      if (combinedBoundingBox && !combinedBoundingBox.some(isNaN)) {
        const newZoom = getBoundsZoomLevel(combinedBoundingBox, {
          width,
          height,
        });
        const newCenter: [number, number] = [
          (combinedBoundingBox[1] + combinedBoundingBox[3]) / 2,
          (combinedBoundingBox[0] + combinedBoundingBox[2]) / 2,
        ];
        setCenter(newCenter);
        setZoom(newZoom);
        console.log("center/zoom", newCenter, newZoom);
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
        {/*
        <GeoJson
          svgAttributes={{
            fill: "#648bff99",
            strokeWidth: "3",
            stroke: defaultColor,
          }}
        >
          {cityLocations?.map(
            (boundary: any) =>
              boundary.data && (
                <GeoJsonFeature
                  key={boundary.city.id}
                  feature={{
                    type: "Feature",
                    geometry: boundary.data,
                  }}
                  onClick={() => setSelectedCity(boundary.city)}
                />
              ),
          )}
        </GeoJson
        */}

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
