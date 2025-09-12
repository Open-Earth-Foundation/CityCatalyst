import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature, Marker } from "pigeon-maps";
import { getBoundingBoxCenter, getCombinedBoundingBox } from "./geo_utils";

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
  setSelectedCity: (city: CityMetadata) => void;
  selectedCity?: CityMetadata;
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

  useEffect(() => {
    if (cityLocations && cityLocations.length > 0) {
      const combinedBoundingBox = getCombinedBoundingBox(boundingBoxes);
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
      }
    }
  }, [projectBoundaries, height, width]);

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
        <GeoJson
          svgAttributes={{
            fill: "#648bff99",
            strokeWidth: "3",
            stroke: defaultColor,
          }}
        >
          {projectBoundaries?.map(
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
        </GeoJson>

        {projectBoundaries?.map(
          (boundary: any) =>
            boundary.boundingBox && (
              <Marker
                key={boundary.city.id}
                color={
                  selectedCity?.id === boundary.city.id
                    ? highlightColor
                    : defaultColor
                }
                anchor={getBoundingBoxCenter(boundary.boundingBox)}
                onClick={() => setSelectedCity(boundary.city)}
              />
            ),
        )}
      </Map>
    </Box>
  );
};

export default ProjectMap;
