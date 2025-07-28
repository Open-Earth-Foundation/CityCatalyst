"use client";

import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature } from "pigeon-maps";

export interface CityMapProps {
  locode: string | null;
  width: number;
  height: number;
}

export const CityMap: FC<CityMapProps> = ({ locode, width, height }) => {
  const { data, isLoading } = api.useGetCityBoundaryQuery(locode!, {
    skip: !locode,
  });

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

  useEffect(() => {
    if (data?.boundingBox) {
      const boundingBox = data.boundingBox;
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
  }, [locode, data, height, width]);

  return (
    <Box w={width} h={height} position="relative">
      {isLoading && (
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
            stroke: "#648bff",
          }}
        >
          {data?.data && (
            <GeoJsonFeature
              feature={{ type: "Feature", geometry: data.data }}
            />
          )}
        </GeoJson>
      </Map>
    </Box>
  );
};

export default CityMap;
