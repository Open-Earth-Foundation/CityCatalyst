// adapter from https://www.npmjs.com/package/geojson-bbox
// MIT license, rewritten to support TypeScript
export function geoJSONBoundingBox(
  geoJson: GeoJSON.GeoJSON,
): number[] | undefined {
  if (!geoJson.hasOwnProperty("type")) {
    return;
  }

  const coords = getCoordinatesDump(geoJson);
  if (!coords) {
    return;
  }

  let bbox = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  return coords.reduce((prev: number[], coord: number[]) => {
    return [
      Math.min(coord[0], prev[0]),
      Math.min(coord[1], prev[1]),
      Math.max(coord[0], prev[2]),
      Math.max(coord[1], prev[3]),
    ];
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
