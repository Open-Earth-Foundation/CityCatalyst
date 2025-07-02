import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature, Marker } from "pigeon-maps";

type BoundingBox = [number, number, number, number];

function getCombinedBoundingBox(boundingBoxes: BoundingBox[]): BoundingBox {
  const result = [...boundingBoxes[0]] as BoundingBox;
  for (let i = 1; i < boundingBoxes.length; i++) {
    let box = boundingBoxes[i];
    result[0] = Math.min(result[0], box[0]);
    result[1] = Math.max(result[1], box[1]);
    result[2] = Math.max(result[2], box[2]);
    result[3] = Math.min(result[3], box[3]);
  }
  return result;
}
// Constants for converting degrees to radians
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function findGeoCenter(geolocations: [number, number][]): [number, number] {
  /**
   * Provide a relatively accurate center lat, lon returned as a tuple, given
   * a list of list pairs.
   * ex: in: geolocations = [[lat1, lon1], [lat2, lon2]]
   * out: [center_lat, center_lon]
   */
  let x = 0;
  let y = 0;
  let z = 0;

  for (const [lat, lon] of geolocations) {
    // Convert lat, lon from degrees to radians
    const latRad = lat * DEG_TO_RAD;
    const lonRad = lon * DEG_TO_RAD;

    x += Math.cos(latRad) * Math.cos(lonRad);
    y += Math.cos(latRad) * Math.sin(lonRad);
    z += Math.sin(latRad);
  }

  x = x / geolocations.length;
  y = y / geolocations.length;
  z = z / geolocations.length;

  const centerLat = Math.atan2(y, x);
  const centerLon = Math.atan2(z, Math.sqrt(x * x + y * y));

  // Convert the result from radians back to degrees
  const centerLatDeg = centerLat * RAD_TO_DEG;
  const centerLonDeg = centerLon * RAD_TO_DEG;

  return [centerLatDeg, centerLonDeg];
}

function getBoundingBoxCenter(
  boundingBox: [number, number, number, number],
): [number, number] {
  const [west, south, east, north] = boundingBox;
  return findGeoCenter([
    [west, south] as [number, number],
    [east, north] as [number, number],
  ]);
}

/*function PopupMarker({
  popupText,
  anchor,
  onClick,
}: {
  popupText: string;
  anchor: [number, number];
  onClick: any;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <Marker
        width={50}
        color="#648bff"
        anchor={anchor}
        onClick={onClick}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      />

      {hovered && (
        <Overlay anchor={anchor}>
          <div
            style={{
              position: "absolute",
              transform: "translate(-50%, -100%)",
              backgroundColor: "white",
              border: "1px solid black",
              padding: "5px",
              borderRadius: "5px",
              zIndex: 1000, // Ensures the popup is above other map elements
              pointerEvents: "none", // Prevents the popup from blocking interactions with the map
            }}
          >
            {popupText}
          </div>
        </Overlay>
      )}
    </>
  );
}*/

export interface CityMetadata {
  id: string;
  name: string;
  locode: string;
  latestInventoryId: string;
}

export interface ProjectMapProps {
  projectId: string | null;
  width: number;
  height: number;
  setSelectedCity: (city: CityMetadata) => void;
  selectedCity?: CityMetadata;
}

const defaultColor = "#648bff";
const highlightColor = "#ffc363";

export const ProjectMap: FC<ProjectMapProps> = ({
  projectId,
  width,
  height,
  setSelectedCity,
  selectedCity,
}) => {
  const {
    data: projectBoundaries,
    isLoading,
    error,
  } = api.useGetProjectBoundariesQuery(projectId!, {
    skip: !projectId,
  });

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
    if (projectBoundaries) {
      const boundingBoxes = projectBoundaries.map(
        (boundary: any) => boundary.boundingBox,
      );
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
    <Box w={width} h={height} className="relative">
      {isLoading && (
        <Box
          w={width}
          h={height}
          className="absolute top-0 left-0 z-1000 pointer-events-none"
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
