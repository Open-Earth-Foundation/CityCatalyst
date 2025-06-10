"use client";

import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useState } from "react";
import { Map, GeoJson, GeoJsonFeature } from "pigeon-maps";

export interface CityBoundaryViewerProps {
  cityId: string;
  locode: string | null;
  cityName: string | null;
}

const CityBoundaryViewer: FC<CityBoundaryViewerProps> = ({ 
  cityId, 
  locode, 
  cityName 
}) => {
  const { data, isLoading, error } = api.useGetCityBoundaryQuery(locode!, {
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
        const newZoom = getBoundsZoomLevel(boundingBox, { width: 800, height: 500 });
        const newCenter: [number, number] = [
          (boundingBox[1] + boundingBox[3]) / 2,
          (boundingBox[0] + boundingBox[2]) / 2,
        ];
        setCenter(newCenter);
        setZoom(newZoom);
      }
    }
  }, [data]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          Error Loading Boundary
        </h3>
        <p className="text-red-800">
          Could not load boundary data for this city. The city may not have boundary data available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Box style={{ width: "100%", height: "500px" }} className="relative border rounded-lg overflow-hidden">
        {isLoading && (
          <Box
                style={{ width: "100%", height: "500px" }}
                className="absolute top-0 left-0 z-[1000] pointer-events-none bg-white bg-opacity-75"
              >
                <Center style={{ height: "100%" }}>
              <Spinner size="lg" />
            </Center>
          </Box>
        )}
        <Map
          height={500}
          center={center}
          zoom={zoom}
          onBoundsChanged={onBoundsChanged}
          attributionPrefix={false}
        >
          {data?.data && (
            <GeoJson
              svgAttributes={{
                fill: "#648bff99",
                strokeWidth: "3",
                stroke: "#648bff",
              }}
            >
              <GeoJsonFeature feature={{ type: "Feature", geometry: data.data }} />
            </GeoJson>
          )}
        </Map>
      </Box>

      {data && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Boundary Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Area:</span> {data.area?.toLocaleString()} sq km
            </div>
            <div>
              <span className="font-medium">Bounding Box:</span>
            </div>
            <div className="col-span-2 text-xs text-gray-600">
              West: {data.boundingBox[0]?.toFixed(4)}, 
              South: {data.boundingBox[1]?.toFixed(4)}, 
              East: {data.boundingBox[2]?.toFixed(4)}, 
              North: {data.boundingBox[3]?.toFixed(4)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CityBoundaryViewer;