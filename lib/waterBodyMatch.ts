export const DEFAULT_SHORELINE_RADIUS_METERS = 100;
export const DEFAULT_WATERWAY_RADIUS_METERS = 75;

type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];
type LineCoordinates = Position[];
type MultiLineCoordinates = LineCoordinates[];

export type WaterBodyGeometry =
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates }
  | { type: "LineString"; coordinates: LineCoordinates }
  | { type: "MultiLineString"; coordinates: MultiLineCoordinates };

export type WaterBodyMatchCandidate = {
  id: string;
  name: string;
  geometry?: WaterBodyGeometry | string | null;
};

export type WaterBodyMatch = {
  id?: string;
  name: string;
  isShorelineMatch: boolean;
};

function parseGeometry(geometry: WaterBodyMatchCandidate["geometry"]): WaterBodyGeometry | null {
  if (!geometry) return null;
  try {
    const parsed = typeof geometry === "string" ? JSON.parse(geometry) : geometry;
    return ["Polygon", "MultiPolygon", "LineString", "MultiLineString"].includes(parsed?.type) ? parsed : null;
  } catch {
    return null;
  }
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if ((y > point[1]) !== (previousY > point[1]) && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: Position, polygon: PolygonCoordinates): boolean {
  return pointInRing(point, polygon[0]) && !polygon.slice(1).some((ring) => pointInRing(point, ring));
}

function distanceToSegmentMeters(point: Position, start: Position, end: Position): number {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos((point[1] * Math.PI) / 180);
  const px = point[0] * metersPerDegreeLon;
  const py = point[1] * metersPerDegreeLat;
  const startX = start[0] * metersPerDegreeLon;
  const startY = start[1] * metersPerDegreeLat;
  const endX = end[0] * metersPerDegreeLon;
  const endY = end[1] * metersPerDegreeLat;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - startX) * deltaX + (py - startY) * deltaY) / lengthSquared));
  return Math.hypot(px - (startX + ratio * deltaX), py - (startY + ratio * deltaY));
}

function distanceToPolygonMeters(point: Position, polygon: PolygonCoordinates): number {
  return Math.min(...polygon.flatMap((ring) => ring.slice(1).map((coordinate, index) => distanceToSegmentMeters(point, ring[index], coordinate))));
}

function distanceToLineMeters(point: Position, line: LineCoordinates): number {
  if (line.length < 2) return Infinity;
  return Math.min(...line.slice(1).map((coordinate, index) => distanceToSegmentMeters(point, line[index], coordinate)));
}

function geometryPolygons(geometry: WaterBodyGeometry): PolygonCoordinates[] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates as MultiPolygonCoordinates;
}

function geometryLines(geometry: WaterBodyGeometry): LineCoordinates[] {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates as MultiLineCoordinates;
}

export function matchWaterBody(
  candidates: WaterBodyMatchCandidate[],
  lat: number,
  lon: number,
  shorelineRadiusMeters = DEFAULT_SHORELINE_RADIUS_METERS,
  waterwayRadiusMeters = DEFAULT_WATERWAY_RADIUS_METERS,
): WaterBodyMatch | null {
  const point: Position = [lon, lat];
  const matches = candidates.flatMap((candidate) => {
    const geometry = parseGeometry(candidate.geometry);
    if (!geometry) return [];
    if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
      const distance = Math.min(...geometryLines(geometry).map((line) => distanceToLineMeters(point, line)));
      return distance <= waterwayRadiusMeters ? [{ candidate, containsPoint: false, distance }] : [];
    }
    const polygons = geometryPolygons(geometry);
    const containsPoint = polygons.some((polygon) => pointInPolygon(point, polygon));
    const distance = Math.min(...polygons.map((polygon) => distanceToPolygonMeters(point, polygon)));
    if (!containsPoint && distance > shorelineRadiusMeters) return [];
    return [{ candidate, containsPoint, distance }];
  });
  if (!matches.length) return null;
  matches.sort((a, b) => Number(b.containsPoint) - Number(a.containsPoint) || a.distance - b.distance);
  const match = matches[0];
  return { id: match.candidate.id, name: match.candidate.name, isShorelineMatch: !match.containsPoint };
}
