"use client";

import { api } from "@/services/api";
import { getBoundsZoomLevel } from "@/util/geojson";
import { Box, Center, Spinner } from "@chakra-ui/react";
import { FC, useEffect, useRef, useState } from "react";
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

  // `width`/`height` describe the design's target size (and aspect ratio).
  // The container is fluid up to that size, so the actual rendered pixels
  // are re-measured on resize to stay in sync with pigeon-maps' tile sizing.
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderSize, setRenderSize] = useState({ width, height });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const aspectRatio = width / height;
    const observer = new ResizeObserver((entries) => {
      const measuredWidth = entries[0]?.contentRect.width;
      if (measuredWidth) {
        setRenderSize({
          width: Math.round(measuredWidth),
          height: Math.round(measuredWidth / aspectRatio),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [width, height]);

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
        const newZoom = getBoundsZoomLevel(boundingBox, renderSize);
        const newCenter: [number, number] = [
          (boundingBox[1] + boundingBox[3]) / 2,
          (boundingBox[0] + boundingBox[2]) / 2,
        ];
        setCenter(newCenter);
        setZoom(newZoom);
      }
    }
  }, [locode, data, renderSize]);

  return (
    <Box
      ref={containerRef}
      w="full"
      maxW={`${width}px`}
      aspectRatio={width / height}
      position="relative"
    >
      {isLoading ? (
        <Box
          position="absolute"
          inset={0}
          style={{
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
          width={renderSize.width}
          height={renderSize.height}
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
      )}
    </Box>
  );
};

export default CityMap;
