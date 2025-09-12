export type BoundingBox = [number, number, number, number];

// Calculate correct zoom level for a given bounding box
// Adapted from: https://stackoverflow.com/a/13274361
const WORLD_DIM = { height: 256, width: 256 };
const ZOOM_MAX = 21;

export function getBoundsZoomLevel(
  bounds: BoundingBox,
  mapDimensions: { height: number; width: number },
): number {
  // GeoJSON has longitude first, then latitude
  const [swLng, swLat, neLng, neLat] = bounds;

  const latFraction =
    Math.abs(latitudeToRadians(neLat) - latitudeToRadians(swLat)) / Math.PI;

  const lngDiff = neLng - swLng;
  const lngFraction = (lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360;

  const latZoom = zoom(mapDimensions.height, WORLD_DIM.height, latFraction);
  const lngZoom = zoom(mapDimensions.width, WORLD_DIM.width, lngFraction);

  return Math.min(latZoom, lngZoom, ZOOM_MAX);
}

function latitudeToRadians(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
  return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
}

function zoom(mapPx: number, worldPx: number, fraction: number): number {
  return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
}

export function getBoundingBox(
  points: { latitude: number; longitude: number }[],
): BoundingBox {
  if (points.length === 0) {
    return [0, 0, 0, 0];
  }

  const { longitude, latitude } = points[0];
  const result = [longitude, latitude, longitude, latitude] as BoundingBox;
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    result[0] = Math.min(result[0], point.longitude);
    result[1] = Math.max(result[1], point.latitude);
    result[2] = Math.max(result[2], point.longitude);
    result[3] = Math.min(result[3], point.latitude);
  }
  return result;
}

export function stretchBoundingBox(
  boundingBox: BoundingBox,
  factor = 0.1,
): BoundingBox {
  const [west, south, east, north] = boundingBox;
  const latStretch = (north - south) * factor;
  const lngStretch = (east - west) * factor;
  return [
    west - lngStretch,
    south - latStretch,
    east + lngStretch,
    north + latStretch,
  ];
}
