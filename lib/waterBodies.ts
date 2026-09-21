import type { WaterBodyGeometry } from "@/lib/waterBodyMatch";

export type WaterBodyType = "lake" | "pond" | "reservoir" | "river" | "stream" | "canal" | "basin" | "lagoon" | "other";

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

export class OverpassError extends Error {
  constructor(public readonly status: number) {
    super(`Overpass API error: ${status}`);
    this.name = "OverpassError";
  }
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string }[];
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
  water: "other",
  riverbank: "river",
  dock: "other",
  mooring: "other",
  boatyard: "other",
  marina: "other",
};

const OVERPASS_URLS = [
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

function normalizeType(natural: string | undefined, waterway: string | undefined, waterBody: string | undefined): WaterBodyType {
  if (waterBody && WATER_TYPE_MAP[waterBody]) return WATER_TYPE_MAP[waterBody];
  if (natural && WATER_TYPE_MAP[natural]) return WATER_TYPE_MAP[natural];
  if (waterway && WATER_TYPE_MAP[waterway]) return WATER_TYPE_MAP[waterway];
  return "other";
}

export function buildOverpassQuery(bbox: [number, number, number, number]): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return `
[out:json][timeout:30];
(
   way["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
   way["water"~"^(lake|pond|reservoir|basin|lagoon)$"](${minLat},${minLon},${maxLat},${maxLon});
   way["landuse"~"^(reservoir|basin)$"](${minLat},${minLon},${maxLat},${maxLon});
   way["waterway"~"^(river|stream|canal)$"](${minLat},${minLon},${maxLat},${maxLon});
  relation["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
  relation["water"~"^(lake|pond|reservoir|basin|lagoon)$"](${minLat},${minLon},${maxLat},${maxLon});
  relation["landuse"~"^(reservoir|basin)$"](${minLat},${minLon},${maxLat},${maxLon});
  relation["waterway"~"^(river|stream|canal)$"](${minLat},${minLon},${maxLat},${maxLon});
);
 out geom;
`;
}

export async function fetchWaterBodies(
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<WaterBody[]> {
  const query = buildOverpassQuery(bbox);
  let data: { elements?: OverpassElement[] } | null = null;
  let lastError: Error | null = null;

  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) throw new OverpassError(res.status);
      data = await res.json();
      break;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error instanceof Error ? error : new Error("Overpass request failed");
    }
  }

  if (!data) throw lastError ?? new Error("Overpass request failed");
  const elements = (data.elements || []) as OverpassElement[];
  
  const ways = new Map(elements.filter((e) => e.type === "way").map((e) => [e.id, e]));
  const relations = elements.filter((e) => e.type === "relation");
  
  const waterBodies: WaterBody[] = [];
  
  for (const rel of relations) {
    const tags = rel.tags || {};
    const type = normalizeType(tags.natural, tags.waterway, tags.water || tags["water:body"] || tags.landuse);
    const name = tags.name || tags["name:en"] || null;
    
    const outerRings: [number, number][][] = [];
    
    for (const member of rel.members || []) {
      if (member.type === "way" && member.role === "outer") {
        const way = ways.get(member.ref);
        if (way?.geometry) {
          const coords = way.geometry.map((g) => [g.lon, g.lat] as [number, number]);
          if (coords.length >= 4) outerRings.push(coords);
        }
      }
    }
    
    if (outerRings.length > 0) {
      waterBodies.push({
        id: `rel_${rel.id}`,
        type,
        name,
        geometry: { type: "MultiPolygon", coordinates: [outerRings] },
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
  other: { en: "Water body", ru: "Водоём" },
};
