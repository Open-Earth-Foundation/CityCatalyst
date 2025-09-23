type BoundingBox = [number, number, number, number];

// Constants for converting degrees to radians
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function getCombinedBoundingBox(
  boundingBoxes: BoundingBox[],
): BoundingBox {
  const result = [...boundingBoxes[0]] as BoundingBox;
  for (let i = 1; i < boundingBoxes.length; i++) {
    const box = boundingBoxes[i];
    result[0] = Math.min(result[0], box[0]);
    result[1] = Math.max(result[1], box[1]);
    result[2] = Math.max(result[2], box[2]);
    result[3] = Math.min(result[3], box[3]);
  }
  return result;
}

export function findGeoCenter(
  geolocations: [number, number][],
): [number, number] {
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

export function getBoundingBoxCenter(
  boundingBox: [number, number, number, number],
): [number, number] {
  const [west, south, east, north] = boundingBox;
  const center: [number, number] = [(south + north) / 2, (west + east) / 2];
  return center;
}

// TODO this should be more accurate but fails on edge cases
/* export function getBoundingBoxCenter(
  boundingBox: [number, number, number, number],
): [number, number] {
  const [west, south, east, north] = boundingBox;

  return findGeoCenter([
    [west, south] as [number, number],
    [east, north] as [number, number],
  ]);
} */
