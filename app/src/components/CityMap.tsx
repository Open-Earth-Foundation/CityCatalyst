"use client";

import { api } from "@/services/api";
import { geoJSONBoundingBox } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import type { GeoJsonObject } from "geojson";
import { LatLngBoundsLiteral } from "leaflet";
import "leaflet/dist/leaflet.css";
import { FC, useEffect } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";

export interface CityMapProps {
  locode: string;
  width: number;
  height: number;
}

function BoundingBoxFocus({ boundingBox }: { boundingBox?: number[] }) {
  const map = useMap();
  useEffect(() => {
    if (!boundingBox || boundingBox.length < 4) {
      return;
    }
    // GeoJSON is [lng, lat] and Leaflet is [lat, lng]
    const bounds: LatLngBoundsLiteral = [
      [boundingBox[1], boundingBox[0]],
      [boundingBox[3], boundingBox[2]],
    ];
    map.fitBounds(bounds, { padding: [0.5, 0.5] });
  }, [boundingBox, map]);

  return null;
}

export const CityMap: FC<CityMapProps> = ({ locode, width, height }) => {
  const { data, isLoading } = api.useGetCityBoundaryQuery(locode);
  let boundingBox: number[] | undefined = [34, -37, 35, -38];
  if (data) {
    boundingBox = geoJSONBoundingBox(data);
  }
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
      <MapContainer
        center={[34.0, -37.0]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ width, height }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {data && (
          <GeoJSON
            data={data as GeoJsonObject}
            style={{ color: "#648bff", weight: 5, opacity: 0.65, fillOpacity: 0.3 }}
          />
        )}
        <BoundingBoxFocus boundingBox={boundingBox} />
      </MapContainer>
    </Box>
  );
};
