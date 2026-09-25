import { DEFAULT_SHORELINE_RADIUS_METERS, matchWaterBody, type WaterBodyGeometry } from "./waterBodyMatch.ts";

export type WaterBodyType = "lake" | "pond" | "reservoir" | "river" | "stream" | "canal" | "basin" | "lagoon" | "sea" | "ocean" | "bay" | "sound" | "gulf" | "strait" | "other";

export interface WaterBody {
  id: string;
  type: WaterBodyType;
  name: string | null;
  geometry: WaterBodyGeometry;
  properties: {
    waterway?: string;
    natural?: string;
    "water:body"?: string;
    area?: number;
  };
}

export type MapboxWaterBody = {
  featureId: string;
  name: string;
  type: WaterBodyType;
  isMarine: boolean;
};

export type WaterBodyBoundary = {
  osmId: string;
  type: WaterBodyType;
  geometry: WaterBodyGeometry;
};

export class OverpassError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Overpass API error: ${status}`);
    this.name = "OverpassError";
    this.status = status;
  }
}

type WaterBodyQueryKind = "areas" | "boundaries" | "waterways" | "relations";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: string;
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
}

const WATER_TYPE_MAP: Record<string, WaterBodyType> = {
  lake: "lake",
  pond: "pond",
  reservoir: "reservoir",
  river: "river",
  stream: "stream",
  canal: "canal",
  basin: "basin",
  lagoon: "lagoon",
  sea: "sea",
  ocean: "ocean",
  bay: "bay",
  sound: "sound",
  gulf: "gulf",
  strait: "strait",
  water: "other",
  riverbank: "river",
  dock: "other",
  mooring: "other",
  boatyard: "other",
  marina: "other",
};

const OVERPASS_URLS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
const OVERPASS_REQUEST_TIMEOUT_MS = 8000;

function createAbortError(): Error {
  const error = new Error("Overpass request aborted");
  error.name = "AbortError";
  return error;
}

function normalizeType(natural: string | undefined, waterway: string | undefined, waterBody: string | undefined): WaterBodyType {
  if (waterBody && WATER_TYPE_MAP[waterBody]) return WATER_TYPE_MAP[waterBody];
  if (natural && WATER_TYPE_MAP[natural]) return WATER_TYPE_MAP[natural];
  if (waterway && WATER_TYPE_MAP[waterway]) return WATER_TYPE_MAP[waterway];
  return "other";
}

function canonicalMarineRegion(lat: number, lon: number): { id: string; name: string; type: WaterBodyType } | null {
  if (lat >= 40.9 && lat <= 41.4 && lon >= -74.1 && lon <= -71.7) return { id: "long-island-sound", name: "Long Island Sound", type: "sound" };
  if (lat >= 66) return { id: "arctic-ocean", name: "Arctic Ocean", type: "ocean" };
  if (lat <= -60) return { id: "southern-ocean", name: "Southern Ocean", type: "ocean" };
  if (lat >= -60 && lat <= 30 && lon >= 20 && lon <= 147) return { id: "indian-ocean", name: "Indian Ocean", type: "ocean" };
  if (lat >= -60 && lat <= 66 && lon >= -70 && lon <= 25) return { id: "atlantic-ocean", name: "Atlantic Ocean", type: "ocean" };
  if (lat >= -60 && lat <= 66 && (lon <= -100 || lon >= 100)) return { id: "pacific-ocean", name: "Pacific Ocean", type: "ocean" };
  return null;
}

function samePosition(left: [number, number], right: [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function stitchRings(segments: [number, number][][]): [number, number][][] {
  const remaining = segments.map((segment) => [...segment]);
  const rings: [number, number][][] = [];

  while (remaining.length > 0) {
    const ring = remaining.shift()!;
    while (!samePosition(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const nextIndex = remaining.findIndex((segment) => samePosition(segment[0], end) || samePosition(segment[segment.length - 1], end));
      if (nextIndex < 0) break;
      const next = remaining.splice(nextIndex, 1)[0];
      if (!samePosition(next[0], end)) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length >= 4 && samePosition(ring[0], ring[ring.length - 1])) rings.push(ring);
  }

  return rings;
}

function positionInRing(position: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if ((y > position[1]) !== (previousY > position[1])
      && position[0] < ((previousX - x) * (position[1] - y)) / (previousY - y) + x) {
      inside = !inside;
    }
  }
  return inside;
}

export function buildOverpassQuery(
  bbox: [number, number, number, number],
  kind: WaterBodyQueryKind = "areas",
): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const areaFilters = `way["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
   way["water"~"^(lake|pond|reservoir|basin|lagoon)$"](${minLat},${minLon},${maxLat},${maxLon});
   way["landuse"~"^(reservoir|basin)$"](${minLat},${minLon},${maxLat},${maxLon});`;
  const relationFilters = `relation["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
   relation["water"~"^(lake|pond|reservoir|basin|lagoon)$"](${minLat},${minLon},${maxLat},${maxLon});
   relation["landuse"~"^(reservoir|basin)$"](${minLat},${minLon},${maxLat},${maxLon});`;
  const filters = kind === "waterways"
    ? `way["waterway"~"^(river|stream|canal)$"](${minLat},${minLon},${maxLat},${maxLon});`
    : kind === "relations"
      ? relationFilters
      : kind === "boundaries"
        ? `${areaFilters}\n   ${relationFilters}`
        : areaFilters;
  return `
[out:json][timeout:30];
(
   ${filters}
);
 out geom;
`;
}

export function buildNamedWaterwayQuery(name: string): string {
  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[out:json][timeout:25];(way["waterway"]["name"="${escapedName}"];relation["waterway"]["name"="${escapedName}"];relation["type"="waterway"]["name"="${escapedName}"];);out geom;`;
}

export async function fetchNamedWaterway(
  name: string,
  signal?: AbortSignal,
): Promise<Pick<WaterBody, "type" | "name" | "geometry"> | null> {
  const query = buildNamedWaterwayQuery(name);
  let data: { elements?: OverpassElement[] } | null = null;
  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), OVERPASS_REQUEST_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) throw new OverpassError(response.status);
      data = await response.json();
      break;
    } catch (error) {
      if (signal?.aborted) throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  const lines = (data?.elements ?? []).flatMap((element) => {
    const type = normalizeType(undefined, element.tags?.waterway, undefined);
    const elementName = element.tags?.name || element.tags?.["name:en"] || name;
    if (element.type === "way" && element.geometry && element.geometry.length >= 2) {
      return [{ type, name: elementName, coordinates: element.geometry.map((point) => [point.lon, point.lat] as [number, number]) }];
    }
    if (element.type === "relation") {
      return (element.members ?? [])
        .filter((member) => member.type === "way" && member.geometry && member.geometry.length >= 2)
        .map((member) => ({
          type,
          name: elementName,
          coordinates: member.geometry!.map((point) => [point.lon, point.lat] as [number, number]),
        }));
    }
    return [];
  });
  if (!lines.length) return null;

  const type = lines.find((line) => line.type === "river")?.type ?? lines[0].type;
  return {
    type,
    name: lines[0].name,
    geometry: lines.length === 1
      ? { type: "LineString", coordinates: lines[0].coordinates }
      : { type: "MultiLineString", coordinates: lines.map((line) => line.coordinates) },
  };
}

export async function fetchMapboxWaterBody(
  lat: number,
  lon: number,
  accessToken: string,
  signal?: AbortSignal,
): Promise<MapboxWaterBody | null> {
  const url = new URL(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lon},${lat}.json`);
  url.searchParams.set("layers", "water,natural_label");
  url.searchParams.set("radius", "1000");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`Mapbox water query failed: ${res.status}`);
  const data = await res.json() as {
    features?: {
      id?: string | number;
      properties?: {
        name?: string;
        class?: string;
        type?: string;
        tilequery?: { distance?: number; geometry?: string; layer?: string };
      };
    }[];
  };
  const features = data.features ?? [];
  const water = features.find((feature) =>
    feature.properties?.tilequery?.layer === "water"
    && feature.properties.tilequery.geometry === "polygon"
    && (feature.properties.tilequery.distance ?? Infinity) <= DEFAULT_SHORELINE_RADIUS_METERS
  );
  if (!water) return null;

  const waterType = normalizeType(undefined, water.properties?.class, water.properties?.type);
  const label = features
    .filter((feature) => feature.id != null
      && feature.properties?.tilequery?.layer === "natural_label"
      && ["water", "river", "stream", "canal", "sea", "ocean", "bay", "sound", "gulf", "strait"].includes(feature.properties?.class ?? ""))
    .sort((left, right) => (left.properties?.tilequery?.distance ?? Infinity) - (right.properties?.tilequery?.distance ?? Infinity))[0];
  const featureId = label?.id != null
    ? `natural_label:${label.id}`
    : `point:${lat.toFixed(5)}:${lon.toFixed(5)}`;
  const region = !label?.properties?.name ? canonicalMarineRegion(lat, lon) : null;
  if (region) return { featureId: `marine:${region.id}`, name: region.name, type: region.type, isMarine: true };

  const type = normalizeType(undefined, label?.properties?.class, label?.properties?.type) === "other"
    ? waterType
    : normalizeType(undefined, label?.properties?.class, label?.properties?.type);
  const isMarine = ["sea", "ocean", "bay", "sound", "gulf", "strait"].includes(type);
  return { featureId, name: label?.properties?.name || "Water body", type, isMarine };
}

export async function fetchWaterBodies(
  bbox: [number, number, number, number],
  signal?: AbortSignal,
  timeoutMs = OVERPASS_REQUEST_TIMEOUT_MS,
  kind: WaterBodyQueryKind = "areas",
): Promise<WaterBody[]> {
  const query = buildOverpassQuery(bbox, kind);
  if (signal?.aborted) throw createAbortError();

  const requests = OVERPASS_URLS.map(async (url): Promise<{ elements?: OverpassElement[] }> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "StrikeFeed/1.0 water-body-resolver",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) throw new OverpassError(res.status);
      return await res.json();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  });

  const results = await Promise.allSettled(requests);
  if (signal?.aborted) throw createAbortError();
  const successful = results
    .filter((result): result is PromiseFulfilledResult<{ elements?: OverpassElement[] }> => result.status === "fulfilled")
    .map((result) => result.value);
  const data = successful.find((result) => (result.elements?.length ?? 0) > 0) ?? successful[0];
  if (!data) {
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw rejected?.reason instanceof Error ? rejected.reason : new Error("Overpass request failed");
  }
  const elements = (data.elements || []) as OverpassElement[];
  
  const ways = new Map(elements.filter((e) => e.type === "way").map((e) => [e.id, e]));
  const relations = elements.filter((e) => e.type === "relation");
  
  const waterBodies: WaterBody[] = [];
  
  for (const rel of relations) {
    const tags = rel.tags || {};
    const type = normalizeType(tags.natural, tags.waterway, tags.water || tags["water:body"] || tags.landuse);
    const name = tags.name || tags["name:en"] || null;
    
    const outerSegments: [number, number][][] = [];
    const innerSegments: [number, number][][] = [];
    
    for (const member of rel.members || []) {
      if (member.type === "way" && (member.role === "outer" || member.role === "inner")) {
        const way = ways.get(member.ref);
        const geometry = way?.geometry ?? member.geometry;
        if (geometry) {
          const coords = geometry.map((g) => [g.lon, g.lat] as [number, number]);
          if (coords.length >= 2) {
            (member.role === "outer" ? outerSegments : innerSegments).push(coords);
          }
        }
      }
    }

    const outerRings = stitchRings(outerSegments);
    const innerRings = stitchRings(innerSegments);
    if (outerRings.length > 0) {
      waterBodies.push({
        id: `rel_${rel.id}`,
        type,
        name,
        geometry: {
          type: "MultiPolygon",
          coordinates: outerRings.map((outer) => [
            outer,
            ...innerRings.filter((inner) => positionInRing(inner[0], outer)),
          ]),
        },
        properties: tags,
      });
    }
  }
  
  for (const way of ways.values()) {
    if (way.geometry && way.geometry.length >= 2) {
      const tags = way.tags || {};
      const type = normalizeType(tags.natural, tags.waterway, tags.water || tags["water:body"] || tags.landuse);
      const name = tags.name || tags["name:en"] || null;
      
      const coords = way.geometry.map((g) => [g.lon, g.lat] as [number, number]);
      
      const isClosed = coords.length >= 4
        && coords[0][0] === coords[coords.length - 1][0]
        && coords[0][1] === coords[coords.length - 1][1];
      waterBodies.push({
        id: `way_${way.id}`,
        type,
        name,
        geometry: isClosed
          ? { type: "Polygon", coordinates: [coords] }
          : { type: "LineString", coordinates: coords },
        properties: tags,
      });
    }
  }
  
  return waterBodies;
}

export async function fetchWaterBodyBoundaryAtPoint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<WaterBodyBoundary | null> {
  const delta = 0.015;
  const bbox: [number, number, number, number] = [lon - delta, lat - delta, lon + delta, lat + delta];
  const queryKinds: WaterBodyQueryKind[] = ["boundaries", "waterways"];

  for (const kind of queryKinds) {
    const bodies = await fetchWaterBodies(bbox, signal, OVERPASS_REQUEST_TIMEOUT_MS, kind);
    const match = matchWaterBody(
      bodies.map((body) => ({
        name: body.name ?? "Water body",
        osmId: body.id.replace("way_", "way/").replace("rel_", "relation/"),
        waterType: body.type,
        geometry: body.geometry,
      })),
      lat,
      lon,
    );
    if (match?.osmId && match.waterType && match.geometry && typeof match.geometry !== "string") {
      return { osmId: match.osmId, type: match.waterType as WaterBodyType, geometry: match.geometry };
    }
  }

  return null;
}

export function waterBodiesToGeoJSON(bodies: WaterBody[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: bodies.map((body) => {
      return {
        type: "Feature" as const,
        geometry: body.geometry,
        properties: {
          id: body.id,
          name: body.name,
          water_type: body.type,
          ...body.properties,
        },
      };
    }),
  };
}

export const WATER_TYPE_COLORS: Record<WaterBodyType, string> = {
  lake: "#0284c7",
  pond: "#0369a1",
  reservoir: "#075985",
  river: "#0ea5e9",
  stream: "#38bdf8",
  canal: "#7dd3fc",
  basin: "#1e40af",
  lagoon: "#0c4a6e",
  sea: "#0f766e",
  ocean: "#155e75",
  bay: "#0e7490",
  sound: "#0369a1",
  gulf: "#1d4ed8",
  strait: "#075985",
  other: "#1e3a5f",
};

export const WATER_TYPE_LABELS: Record<WaterBodyType, { en: string; ru: string }> = {
  lake: { en: "Lake", ru: "Озеро" },
  pond: { en: "Pond", ru: "Пруд" },
  reservoir: { en: "Reservoir", ru: "Водохранилище" },
  river: { en: "River", ru: "Река" },
  stream: { en: "Stream", ru: "Ручой" },
  canal: { en: "Canal", ru: "Канал" },
  basin: { en: "Basin", ru: "Бассейн" },
  lagoon: { en: "Lagoon", ru: "Лагуна" },
  sea: { en: "Sea", ru: "Море" },
  ocean: { en: "Ocean", ru: "Океан" },
  bay: { en: "Bay", ru: "Залив" },
  sound: { en: "Sound", ru: "Пролив" },
  gulf: { en: "Gulf", ru: "Залив" },
  strait: { en: "Strait", ru: "Пролив" },
  other: { en: "Water body", ru: "Водоём" },
};
