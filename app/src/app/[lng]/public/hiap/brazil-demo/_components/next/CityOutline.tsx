"use client";
import React, { useEffect, useState } from "react";
import { Box, chakra } from "@chakra-ui/react";
import { BodySmall } from "@/components/package/Texts/Body";

type Ring = [number, number][];

/** GeoJSON Polygon or MultiPolygon → outer rings (lon, lat). */
function ringsOf(geometry: { type: string; coordinates: unknown }): Ring[] {
  if (geometry.type === "Polygon") {
    return [(geometry.coordinates as number[][][])[0] as Ring];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).map((p) => p[0] as Ring);
  }
  return [];
}

/** The boundary fitted into a square, as one SVG path. */
function toPath(
  geometry: { type: string; coordinates: unknown },
  bbox: number[],
  size: number,
): string {
  const [west, south, east, north] = bbox;
  // Equirectangular with latitude correction, fitted into the square.
  const kx = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const w = (east - west) * kx;
  const h = north - south;
  const scale = (size - 8) / Math.max(w, h);
  const ox = (size - w * scale) / 2;
  const oy = (size - h * scale) / 2;
  return ringsOf(geometry)
    .map((ring) => {
      const step = Math.max(1, Math.floor(ring.length / 400));
      const pts = ring.filter((_, i) => i % step === 0);
      return (
        pts
          .map(([lon, lat], i) => {
            const x = ox + (lon - west) * kx * scale;
            const y = oy + (north - lat) * scale;
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join("") + "Z"
      );
    })
    .join("");
}

/**
 * The city's boundary as a plain outline, drawn from the app's own boundary
 * route (Global API behind it). One SVG, no map library: enough to show the
 * shape and extent next to the context indicators. Renders a blank square
 * while loading and a one-line note when the service has no boundary.
 */
export function CityOutline({
  locode,
  label,
  emptyLabel,
  size = 160,
}: {
  locode: string;
  /** Accessible name, e.g. the city name. */
  label: string;
  emptyLabel: string;
  size?: number;
}) {
  // Keyed by locode, so a city switch reads as "loading" without a reset
  // inside the effect.
  const [result, setResult] = useState<{
    locode: string;
    path: string | null;
  } | null>(null);
  const path = result?.locode === locode ? result.path : undefined;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/city/${encodeURIComponent(locode)}/boundary/`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(
        (body: {
          data?: { type: string; coordinates: unknown };
          boundingBox?: number[];
        }) => {
          if (cancelled) return;
          if (!body.data || !body.boundingBox) throw new Error("no boundary");
          setResult({
            locode,
            path: toPath(body.data, body.boundingBox, size),
          });
        },
      )
      .catch(() => {
        if (!cancelled) setResult({ locode, path: null });
      });
    return () => {
      cancelled = true;
    };
  }, [locode, size]);

  if (path === null)
    return <BodySmall color="content.tertiary">{emptyLabel}</BodySmall>;
  if (path === undefined) return <Box boxSize={`${size}px`} />;
  return (
    <chakra.svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      width={`${size}px`}
      height={`${size}px`}
      flexShrink={0}
    >
      <chakra.path
        d={path}
        fill="background.neutral"
        stroke="content.link"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </chakra.svg>
  );
}
