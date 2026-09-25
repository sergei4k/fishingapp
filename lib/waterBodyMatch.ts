export const DEFAULT_SHORELINE_RADIUS_METERS = 100;
export const DEFAULT_WATERWAY_RADIUS_METERS = 100;

type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];
type LineCoordinates = Position[];
type MultiLineCoordinates = LineCoordinates[];

export type WaterBodyGeometry =
  | { type: "Point"; coordinates: Position }
  | { type: "Polygon"; coordinates: PolygonCoordinates }
  | { type: "MultiPolygon"; coordinates: MultiPolygonCoordinates }
  | { type: "LineString"; coordinates: LineCoordinates }
  | { type: "MultiLineString"; coordinates: MultiLineCoordinates };

export type WaterBodyMatchCandidate = {
  id?: string;
  name: string;
  osmId?: string;
  waterType?: string;
  geometry?: WaterBodyGeometry | string | null;
};

export type WaterBodyMatch = {
  id?: string;
  name: string;
  isShorelineMatch: boolean;
  osmId?: string;
  waterType?: string;
  geometry?: WaterBodyGeometry | string | null;
};

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function isLine(value: unknown): value is LineCoordinates {
  return Array.isArray(value) && value.length >= 2 && value.every(isPosition);
}

function isPolygon(value: unknown): value is PolygonCoordinates {
  return Array.isArray(value)
    && value.length > 0
    && value.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isPosition));
}

function parseGeometry(geometry: WaterBodyMatchCandidate["geometry"]): WaterBodyGeometry | null {
  if (!geometry) return null;
  try {
    const parsed = typeof geometry === "string" ? JSON.parse(geometry) : geometry;
    if (parsed?.type === "Point" && isPosition(parsed.coordinates)) return parsed;
    if (parsed?.type === "LineString" && isLine(parsed.coordinates)) return parsed;
    if (parsed?.type === "MultiLineString" && Array.isArray(parsed.coordinates) && parsed.coordinates.length > 0 && parsed.coordinates.every(isLine)) return parsed;
    if (parsed?.type === "Polygon" && isPolygon(parsed.coordinates)) return parsed;
    if (parsed?.type === "MultiPolygon" && Array.isArray(parsed.coordinates) && parsed.coordinates.length > 0 && parsed.coordinates.every(isPolygon)) return parsed;
    return null;
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
    if (geometry.type === "Point") {
      const distance = distanceToSegmentMeters(point, geometry.coordinates, geometry.coordinates);
      return distance <= shorelineRadiusMeters ? [{ candidate, containsPoint: false, distance }] : [];
    }
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
  return {
    ...(match.candidate.id ? { id: match.candidate.id } : {}),
    ...(match.candidate.osmId ? { osmId: match.candidate.osmId } : {}),
    ...(match.candidate.waterType ? { waterType: match.candidate.waterType } : {}),
    ...(match.candidate.osmId && match.candidate.geometry ? { geometry: match.candidate.geometry } : {}),
    name: match.candidate.name,
    isShorelineMatch: !match.containsPoint,
  };
}
