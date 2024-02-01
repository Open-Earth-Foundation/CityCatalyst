type BoundingBox = [number, number, number, number];

// adapted from https://www.npmjs.com/package/geojson-bbox
// MIT license, rewritten to support TypeScript
export function geoJSONBoundingBox(
  geoJson: GeoJSON.GeoJSON,
): BoundingBox | undefined {
  if (!geoJson.hasOwnProperty("type")) {
    return;
  }

  const coords = getCoordinatesDump(geoJson);
  if (!coords) {
    return;
  }

  let bbox: BoundingBox = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  return coords.reduce((prev: BoundingBox, coord: number[]) => {
    return [
      Math.min(coord[0], prev[0]),
      Math.min(coord[1], prev[1]),
      Math.max(coord[0], prev[2]),
      Math.max(coord[1], prev[3]),
    ] as BoundingBox;
  }, bbox);
}

function getCoordinatesDump(
  geoJson: GeoJSON.GeoJSON,
): GeoJSON.Position[] | undefined {
  let coords;
  if (geoJson.type == "Point") {
    return [geoJson.coordinates];
  } else if (geoJson.type == "LineString" || geoJson.type == "MultiPoint") {
    return geoJson.coordinates;
  } else if (geoJson.type == "Polygon" || geoJson.type == "MultiLineString") {
    return geoJson.coordinates.reduce(function (dump, part) {
      return dump.concat(part);
    }, []);
  } else if (geoJson.type == "MultiPolygon") {
    return geoJson.coordinates
      .reduce(function (dump, poly) {
        return dump.concat(
          poly.reduce(function (points, part) {
            return points.concat(part);
          }, []),
        );
      }, [])
      .flat();
  } else if (geoJson.type == "Feature") {
    return getCoordinatesDump(geoJson.geometry);
  } else if (geoJson.type == "GeometryCollection") {
    return geoJson.geometries.reduce(function (dump, g) {
      const newCoords = getCoordinatesDump(g);
      if (newCoords) {
        return dump.concat(newCoords);
      }
      return dump;
    }, [] as GeoJSON.Position[]);
  } else if (geoJson.type == "FeatureCollection") {
    return geoJson.features.reduce(function (dump, f) {
      const newCoords = getCoordinatesDump(f);
      if (newCoords) {
        return dump.concat(newCoords);
      }
      return dump;
    }, [] as GeoJSON.Position[]);
  }
  return coords;
}

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
    (latitudeToRadians(neLat) - latitudeToRadians(swLat)) / Math.PI;

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
