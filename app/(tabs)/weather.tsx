import { Ionicons } from "@expo/vector-icons";
import { theme } from '../../lib/theme';
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Line } from "react-native-svg";
import { useLanguage } from "@/lib/language";
import { useNetwork } from "@/lib/network";
import { useRequireAuth } from "@/lib/auth";
import { usePurchases } from "@/lib/purchases";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { getUpgradeCopy } from "@/lib/upgradeCopy";

type WeatherData = {
  utc_offset_seconds: number;
  current: {
    temperature_2m: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    weather_code: number;
    precipitation: number;
    relative_humidity_2m: number;
    pressure_msl: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
    pressure_msl: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
  };
};

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}


function wmoIcon(code: number): string {
  if (code === 0) return "sunny";
  if (code <= 3) return "partly-sunny";
  if (code <= 48) return "cloudy";
  if (code <= 67) return "rainy";
  if (code <= 77) return "snow";
  if (code <= 82) return "thunderstorm";
  if (code <= 86) return "snow";
  return "thunderstorm";
}

function wmoLabel(code: number, t: (k: any) => string): string {
  if (code === 0) return t("weatherClear");
  if (code <= 3) return t("weatherCloudy");
  if (code <= 48) return t("weatherFog");
  if (code <= 55) return t("weatherDrizzle");
  if (code <= 67) return t("weatherRain");
  if (code <= 77) return t("weatherSnow");
  if (code <= 82) return t("weatherShowers");
  if (code <= 86) return t("weatherSnowShowers");
  return t("weatherStorm");
}

function windDir(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function pressureTrend(hourly: WeatherData["hourly"], t: (k: any) => string): { icon: string; label: string; color: string } {
  const now = new Date();
  const idx = hourly.time.findIndex(t => new Date(t) >= now);
  if (idx < 3) return { icon: "arrow-forward-outline", label: t("pressureSteady"), color: "#94a3b8" };
  const delta = hourly.pressure_msl[idx] - hourly.pressure_msl[idx - 3];
  if (delta >= 1.5) return { icon: "trending-up-outline", label: t("pressureRising"), color: "#5cab6e" };
  if (delta <= -1.5) return { icon: "trending-down-outline", label: t("pressureFalling"), color: "#ef4444" };
  return { icon: "arrow-forward-outline", label: t("pressureSteady"), color: "#94a3b8" };
}

function pressureFishLabel(hpa: number, t: (k: any) => string): { label: string; color: string } {
  if (hpa < 1014) return { label: t("fishFeedingActive"), color: "#5cab6e" };
  return { label: t("fishNormalActivity"), color: "#94a3b8" };
}

function fishingScore(wind: number, precip: number, code: number, pressure: number, t: (k: any) => string): { score: number; label: string; color: string } {
  let score = 10;
  if (wind > 20) score -= 4; else if (wind > 10) score -= 2;
  if (precip > 5) score -= 3; else if (precip > 1) score -= 1;
  if (code >= 95) score -= 4; else if (code >= 80) score -= 2;
  if (pressure < 1009) score -= 2; else if (pressure >= 1020) score += 1;
  score = Math.max(1, Math.min(10, score));
  if (score >= 8) return { score, label: t("fishingExcellent"), color: "#5cab6e" };
  if (score >= 6) return { score, label: t("fishingGood"), color: "#9cbf5e" };
  if (score >= 4) return { score, label: t("fishingFair"), color: "#f59e0b" };
  return { score, label: t("fishingPoor"), color: "#ef4444" };
}

// Per-hour version of the score, using the hourly fields the API returns
// (precipitation probability instead of amount).
function hourlyBiteScore(wind: number, pop: number, code: number, pressure: number): number {
  let s = 10;
  if (wind > 20) s -= 4; else if (wind > 10) s -= 2;
  if (pop > 60) s -= 3; else if (pop > 30) s -= 1;
  if (code >= 95) s -= 4; else if (code >= 80) s -= 2;
  if (pressure < 1009) s -= 2; else if (pressure >= 1020) s += 1;
  return Math.max(1, Math.min(10, s));
}

// The best contiguous stretch of hours to fish over the next ~18h, scored on
// the API's local hourly times. Returns local start/end hours, or null if the
// forecast is too short to say anything useful.
function bestBiteWindow(hourly: WeatherData["hourly"], utcOffsetSeconds: number): { start: number; end: number } | null {
  const localNow = new Date(Date.now() + utcOffsetSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowStr = `${localNow.getUTCFullYear()}-${pad(localNow.getUTCMonth() + 1)}-${pad(localNow.getUTCDate())}T${pad(localNow.getUTCHours())}:00`;
  const rows = hourly.time
    .map((time, i) => ({
      hour: Number(time.slice(11, 13)),
      time,
      score: hourlyBiteScore(hourly.wind_speed_10m[i], hourly.precipitation_probability[i], hourly.weather_code[i], hourly.pressure_msl[i]),
    }))
    .filter((r) => r.time >= nowStr)
    .slice(0, 18);
  if (rows.length < 3) return null;
  const max = Math.max(...rows.map((r) => r.score));
  const peak = rows.findIndex((r) => r.score === max);
  let lo = peak, hi = peak;
  while (lo - 1 >= 0 && rows[lo - 1].score >= max - 1) lo--;
  while (hi + 1 < rows.length && rows[hi + 1].score >= max - 1) hi++;
  return { start: rows[lo].hour, end: (rows[hi].hour + 1) % 24 };
}


const COL_W = 36;
const CHART_H = 180;
const V_PAD = 26;
const YAXIS_W = 36;
const TIME_H = 28;

// Render a polyline as a smooth Catmull-Rom curve by sampling many short
// sub-segments through the points (avoids the jagged corners of straight lines).
// Returns segment descriptors to draw as small rotated Views (no SVG needed).
// Short "new day" label from an API time string ("YYYY-MM-DDTHH:00").
// Parsed at UTC noon so the calendar date is stable regardless of device tz.
function formatDayLabel(timeStr: string, language: string): string {
  const [y, m, d] = timeStr.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return date.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { weekday: "short", day: "numeric" });
}

// Build a smooth SVG path (Catmull-Rom converted to cubic Béziers) through the
// points. Rendered as a single anti-aliased <Path> — crisp, no pixelation.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function HourlyChart({ hourly, utcOffsetSeconds, t, language }: { hourly: WeatherData["hourly"]; utcOffsetSeconds: number; t: (k: any) => string; language: string }) {
  // Compute the current local time AT THE LOCATION using the API-supplied UTC offset.
  // This is correct regardless of what timezone the device is set to.
  const localNow = new Date(Date.now() + utcOffsetSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowStr = `${localNow.getUTCFullYear()}-${pad(localNow.getUTCMonth() + 1)}-${pad(localNow.getUTCDate())}T${pad(localNow.getUTCHours())}:00`;

  const data = hourly.time
    .map((time, i) => ({
      time,
      temp: hourly.temperature_2m[i],
      pop: hourly.precipitation_probability[i],
    }))
    .filter(h => h.time >= nowStr)
    .slice(0, 24);

  if (data.length < 2) return null;

  const temps = data.map(h => h.temp);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const range = maxT - minT || 1;
  const getY = (temp: number) => V_PAD + (1 - (temp - minT) / range) * (CHART_H - 2 * V_PAD);
  const totalW = data.length * COL_W;

  const gridLevels = [
    { temp: maxT,               y: getY(maxT) },
    { temp: (maxT + minT) / 2,  y: getY((maxT + minT) / 2) },
    { temp: minT,               y: getY(minT) },
  ];

  const canvasH = CHART_H + TIME_H;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 24 }}>
      <View style={{ paddingTop: 12, overflow: "hidden" }}>
        {/* Legend */}
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 14, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 22, height: 3, backgroundColor: "#e6915a", borderRadius: 2 }} />
            <Text style={{ color: "#94a3b8", fontSize: 11 }}>°C</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 14, height: 11, backgroundColor: "rgba(96,165,250,0.28)", borderRadius: 2, borderWidth: 1, borderColor: "rgba(96,165,250,0.55)" }} />
            <Text style={{ color: "#94a3b8", fontSize: 11 }}>%</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row" }}>
          {/* Fixed Y-axis */}
          <View style={{ width: YAXIS_W, height: canvasH, position: "relative" }}>
            {gridLevels.map(({ temp, y }) => (
              <Text
                key={`ylabel-${temp}`}
                style={{
                  position: "absolute",
                  top: y - 7,
                  right: 6,
                  color: "#4a6080",
                  fontSize: 10,
                  fontWeight: "600",
                  textAlign: "right",
                }}
              >
                {Math.round(temp)}°
              </Text>
            ))}
          </View>

          {/* Scrollable chart area */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} style={{ flex: 1 }}>
            <View style={{ width: totalW, height: canvasH, position: "relative" }}>

              {/* Horizontal grid lines */}
              {gridLevels.map(({ y }) => (
                <View
                  key={`grid-${y}`}
                  style={{
                    position: "absolute",
                    top: y, left: 0, width: totalW, height: 1,
                    backgroundColor: "#162035",
                  }}
                />
              ))}

              {/* "Now" column highlight */}
              <View style={{
                position: "absolute",
                top: 0, left: 0, width: COL_W, height: CHART_H,
                backgroundColor: "rgba(96,165,250,0.04)",
              }} />

              {/* New-day dividers */}
              {data.map((h, i) => {
                if (i === 0 || h.time.slice(0, 10) === data[i - 1].time.slice(0, 10)) return null;
                const x = i * COL_W;
                return (
                  <React.Fragment key={`day-${i}`}>
                    <View style={{ position: "absolute", top: 0, left: x, width: 1, height: CHART_H, backgroundColor: "rgba(148,163,184,0.35)" }} />
                    <Text style={{ position: "absolute", top: 3, left: x + 4, color: "#94a3b8", fontSize: 10, fontWeight: "700" }}>
                      {formatDayLabel(h.time, language)}
                    </Text>
                  </React.Fragment>
                );
              })}

              {/* Precipitation bars */}
              {data.map((h, i) => {
                if (h.pop === 0) return null;
                const barH = Math.max(4, (h.pop / 100) * (CHART_H - V_PAD));
                const barTop = CHART_H - barH;
                return (
                  <React.Fragment key={`bar-${i}`}>
                    <View style={{
                      position: "absolute",
                      top: barTop,
                      left: i * COL_W + 12, width: COL_W - 24, height: barH,
                      backgroundColor: "rgba(96,165,250,0.45)",
                      borderRadius: 4,
                      borderTopWidth: 2, borderTopColor: "rgba(147,197,253,0.95)",
                    }} />
                    {h.pop >= 30 && (
                      <Text style={{
                        position: "absolute",
                        top: barTop - 15,
                        left: i * COL_W, width: COL_W,
                        textAlign: "center",
                        color: "#ffffff", fontSize: 10, fontWeight: "700",
                      }}>
                        {h.pop}%
                      </Text>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Temperature line — smooth anti-aliased SVG curve */}
              <Svg width={totalW} height={CHART_H} style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
                <Path
                  d={smoothPath(data.map((h, i) => ({ x: i * COL_W + COL_W / 2, y: getY(h.temp) })))}
                  stroke="#e6915a"
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>

              {/* Temperature dots */}
              {data.map((h, i) => {
                const cx = i * COL_W + COL_W / 2;
                const cy = getY(h.temp);
                return (
                  <View
                    key={`dot-${i}`}
                    style={{
                      position: "absolute",
                      top: cy - 4, left: cx - 4,
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: "#e6915a",
                      borderWidth: 2, borderColor: theme.colors.border,
                    }}
                  />
                );
              })}

              {/* Temperature labels — every 2 hrs */}
              {data.map((h, i) => {
                if (i % 2 !== 0) return null;
                const cx = i * COL_W + COL_W / 2;
                const cy = getY(h.temp);
                return (
                  <Text
                    key={`tlabel-${i}`}
                    style={{
                      position: "absolute",
                      top: cy - 22, left: cx - 20, width: 40,
                      textAlign: "center",
                      color: "#e6eef8", fontSize: 12, fontWeight: "700",
                    }}
                  >
                    {Math.round(h.temp)}°
                  </Text>
                );
              })}

              {/* X-axis time labels — every 2 hrs */}
              {data.map((h, i) => {
                if (i % 2 !== 0) return null;
                // Slice "HH" directly from the API string to avoid UTC-parsing bugs
                const hourLabel = h.time.slice(11, 13) + ":00";
                return (
                  <Text
                    key={`xlabel-${i}`}
                    style={{
                      position: "absolute",
                      top: CHART_H + 7,
                      left: i * COL_W, width: COL_W,
                      textAlign: "center",
                      color: i === 0 ? "#ffffff" : "#64748b",
                      fontSize: 11,
                      fontWeight: i === 0 ? "700" : "500",
                    }}
                  >
                    {hourLabel}
                  </Text>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const WIND_COL_W = 36;
const WIND_CHART_H = 140;
const WIND_V_PAD = 24;
const WIND_YAXIS_W = 36;
const WIND_DIR_H = 34;
const WIND_TIME_H = 28;

function WindChart({ hourly, utcOffsetSeconds, language }: { hourly: WeatherData["hourly"]; utcOffsetSeconds: number; language: string }) {
  const localNow = new Date(Date.now() + utcOffsetSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const nowStr = `${localNow.getUTCFullYear()}-${pad(localNow.getUTCMonth() + 1)}-${pad(localNow.getUTCDate())}T${pad(localNow.getUTCHours())}:00`;

  const data = hourly.time
    .map((time, i) => ({
      time,
      wind: hourly.wind_speed_10m[i],
      dir: hourly.wind_direction_10m[i],
    }))
    .filter(h => h.time >= nowStr)
    .slice(0, 24);

  if (data.length < 2) return null;

  const speeds = data.map(h => h.wind);
  const minW = Math.min(...speeds);
  const maxW = Math.max(...speeds);
  const range = maxW - minW || 1;
  const getY = (wind: number) => WIND_V_PAD + (1 - (wind - minW) / range) * (WIND_CHART_H - 2 * WIND_V_PAD);
  const totalW = data.length * WIND_COL_W;

  const gridLevels = [
    { wind: maxW, y: getY(maxW) },
    { wind: (maxW + minW) / 2, y: getY((maxW + minW) / 2) },
    { wind: minW, y: getY(minW) },
  ];

  const canvasH = WIND_CHART_H + WIND_DIR_H + WIND_TIME_H;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 24 }}>
      <View style={{ paddingTop: 12, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 14, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 22, height: 3, backgroundColor: "#22d3ee", borderRadius: 2 }} />
            <Text style={{ color: "#94a3b8", fontSize: 11 }}>km/h</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row" }}>
          <View style={{ width: WIND_YAXIS_W, height: canvasH, position: "relative" }}>
            {gridLevels.map(({ wind, y }) => (
              <Text
                key={`wy-${wind}`}
                style={{
                  position: "absolute",
                  top: y - 7,
                  right: 6,
                  color: "#4a6080",
                  fontSize: 10,
                  fontWeight: "600",
                  textAlign: "right",
                }}
              >
                {Math.round(wind)}
              </Text>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} style={{ flex: 1 }}>
            <View style={{ width: totalW, height: canvasH, position: "relative" }}>
              {gridLevels.map(({ y }) => (
                <View
                  key={`wgrid-${y}`}
                  style={{
                    position: "absolute",
                    top: y, left: 0, width: totalW, height: 1,
                    backgroundColor: "#162035",
                  }}
                />
              ))}

              <View style={{
                position: "absolute",
                top: 0, left: 0, width: WIND_COL_W, height: WIND_CHART_H,
                backgroundColor: "rgba(96,165,250,0.04)",
              }} />

              {/* New-day dividers */}
              {data.map((h, i) => {
                if (i === 0 || h.time.slice(0, 10) === data[i - 1].time.slice(0, 10)) return null;
                const x = i * WIND_COL_W;
                return (
                  <React.Fragment key={`wday-${i}`}>
                    <View style={{ position: "absolute", top: 0, left: x, width: 1, height: WIND_CHART_H, backgroundColor: "rgba(148,163,184,0.35)" }} />
                    <Text style={{ position: "absolute", top: 3, left: x + 4, color: "#94a3b8", fontSize: 10, fontWeight: "700" }}>
                      {formatDayLabel(h.time, language)}
                    </Text>
                  </React.Fragment>
                );
              })}

              {/* Wind line — smooth anti-aliased SVG curve */}
              <Svg width={totalW} height={WIND_CHART_H} style={{ position: "absolute", top: 0, left: 0 }} pointerEvents="none">
                <Path
                  d={smoothPath(data.map((h, i) => ({ x: i * WIND_COL_W + WIND_COL_W / 2, y: getY(h.wind) })))}
                  stroke="#22d3ee"
                  strokeWidth={5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>

              {data.map((h, i) => {
                const cx = i * WIND_COL_W + WIND_COL_W / 2;
                const cy = getY(h.wind);
                return (
                  <View
                    key={`wdot-${i}`}
                    style={{
                      position: "absolute",
                      top: cy - 4, left: cx - 4,
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: "#22d3ee",
                      borderWidth: 2, borderColor: theme.colors.border,
                    }}
                  />
                );
              })}

              {data.map((h, i) => {
                if (i % 2 !== 0) return null;
                const cx = i * WIND_COL_W + WIND_COL_W / 2;
                const cy = getY(h.wind);
                return (
                  <Text
                    key={`wlabel-${i}`}
                    style={{
                      position: "absolute",
                      top: cy - 22, left: cx - 20, width: 40,
                      textAlign: "center",
                      color: "#e6eef8", fontSize: 12, fontWeight: "700",
                    }}
                  >
                    {Math.round(h.wind)}
                  </Text>
                );
              })}

              {/* Wind direction arrows + text */}
              {data.map((h, i) => {
                if (i % 2 !== 0) return null;
                const cx = i * WIND_COL_W + WIND_COL_W / 2;
                return (
                  <React.Fragment key={`wdir-${i}`}>
                    <View
                      style={{
                        position: "absolute",
                        top: WIND_CHART_H + 3,
                        left: cx - 6,
                        transform: [{ rotate: `${h.dir}deg` }],
                      }}
                    >
                      <Ionicons name="arrow-up-outline" size={12} color="#22d3ee" />
                    </View>
                    <Text
                      style={{
                        position: "absolute",
                        top: WIND_CHART_H + 18,
                        left: i * WIND_COL_W, width: WIND_COL_W,
                        textAlign: "center",
                        color: "#22d3ee", fontSize: 10, fontWeight: "600",
                      }}
                    >
                      {windDir(h.dir)}
                    </Text>
                  </React.Fragment>
                );
              })}

              {/* Time labels */}
              {data.map((h, i) => {
                if (i % 2 !== 0) return null;
                const hourLabel = h.time.slice(11, 13) + ":00";
                return (
                  <Text
                    key={`wxlabel-${i}`}
                    style={{
                      position: "absolute",
                      top: WIND_CHART_H + WIND_DIR_H + 7,
                      left: i * WIND_COL_W, width: WIND_COL_W,
                      textAlign: "center",
                      color: i === 0 ? "#ffffff" : "#64748b",
                      fontSize: 11,
                      fontWeight: i === 0 ? "700" : "500",
                    }}
                  >
                    {hourLabel}
                  </Text>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

function FactorRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.factorRow}>
      <Text style={styles.factorLabel}>{label}</Text>
      <Text style={[styles.factorValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// The bite score as a fishfinder-style dial: ten ticks around a 270° arc, lit up
// to the score, with the number seated in the middle.
function SonarDial({ score, color }: { score: number; color: string }) {
  const SIZE = 128, c = SIZE / 2;
  const rOuter = c - 3, rInner = rOuter - 13;
  const START = 135, SWEEP = 270, N = 10, step = SWEEP / N;
  const ticks = Array.from({ length: N }, (_, i) => {
    const rad = ((START + i * step + step / 2) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return {
      x1: c + rInner * cos, y1: c + rInner * sin,
      x2: c + rOuter * cos, y2: c + rOuter * sin,
      on: i < score,
    };
  });
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute", top: 0, left: 0 }}>
        {ticks.map((tk, i) => (
          <Line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2}
            stroke={tk.on ? color : theme.colors.surfaceRaised} strokeWidth={5} strokeLinecap="round" />
        ))}
      </Svg>
      <View style={{ alignItems: "center" }}>
        <Text style={[styles.biteScore, { color }]}>{score}</Text>
        <Text style={styles.biteDialMax}>/ 10</Text>
      </View>
    </View>
  );
}

// A 1-10 fishing-conditions score derived from wind, pressure trend, and precipitation.
function BiteForecast({
  current, hourly, utcOffsetSeconds, unlocked, onUnlock, t, language, upgradeCopy,
}: {
  current: WeatherData["current"];
  hourly: WeatherData["hourly"];
  utcOffsetSeconds: number;
  unlocked: boolean;
  onUnlock: () => void;
  t: (k: any) => string;
  language: string;
  upgradeCopy: ReturnType<typeof getUpgradeCopy>;
}) {
  const fish = fishingScore(current.wind_speed_10m, current.precipitation, current.weather_code, current.pressure_msl, t);
  const trend = pressureTrend(hourly, t);
  const win = bestBiteWindow(hourly, utcOffsetSeconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const windowLabel = win
    ? `${language === "ru" ? "Лучшее окно" : "Best window"} ${pad(win.start)}:00-${pad(win.end)}:00`
    : null;

  return (
    <>
      <Text style={styles.sectionTitle}>{language === "ru" ? "Прогноз клёва" : "Bite Forecast"}</Text>
      <View style={styles.biteCard}>
        {unlocked ? (
          <View style={styles.biteRow}>
            <SonarDial score={fish.score} color={fish.color} />
            <View style={styles.biteInfo}>
              <Text style={[styles.biteVerdict, { color: fish.color }]}>{fish.label}</Text>
              {windowLabel ? <Text style={styles.biteWindow}>{windowLabel}</Text> : null}
              <View style={styles.factorList}>
                <FactorRow label={language === "ru" ? "Ветер" : "Wind"} value={`${Math.round(current.wind_speed_10m)} km/h`} />
                <FactorRow label={language === "ru" ? "Давление" : "Pressure"} value={trend.label} valueColor={trend.color} />
                <FactorRow label={language === "ru" ? "Осадки" : "Precip"} value={`${current.precipitation} mm`} />
              </View>
            </View>
          </View>
        ) : (
          <TouchableOpacity activeOpacity={0.85} onPress={onUnlock} style={styles.biteLocked}>
            <View style={styles.biteLockIcon}>
              <Ionicons name="lock-closed" size={22} color="#f59e0b" />
            </View>
            <Text style={styles.biteLockedTitle}>
              {upgradeCopy.biteTitle}
            </Text>
            <Text style={styles.biteLockedSub}>
              {upgradeCopy.biteSub}
            </Text>
            <View style={styles.biteUnlockBtn}>
              <Ionicons name="star" size={14} color="#0f172a" />
              <Text style={styles.biteUnlockText}>{upgradeCopy.biteButton}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

export default function Weather() {
  const { t, language } = useLanguage();
  const { isOnline } = useNetwork();
  const requireAuth = useRequireAuth();
  const { isPro, enabled: purchasesEnabled, presentPaywall } = usePurchases();
  const showPurchases = Platform.OS !== "ios" && purchasesEnabled;
  const upgradeCopy = getUpgradeCopy(language);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWeather = async () => {
    try {
      setError(null);
      const { status } = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        10000,
        t("locationPermission")
      );
      if (status !== "granted") { setError(t("locationPermission")); return; }

      // Use last known position if fresh enough (avoids hanging on GPS cold-start)
      let loc = await withTimeout(
        Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }),
        5000,
        t("locationPermission")
      );
      if (!loc) {
        loc = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          15000,
          t("locationPermission")
        );
      }
      const { latitude, longitude } = loc.coords;

      const weatherRes = await withTimeout(
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,relative_humidity_2m,pressure_msl` +
          `&hourly=temperature_2m,precipitation_probability,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m` +
          `&timezone=auto&forecast_days=2`
        ),
        12000,
        t("error")
      );

      if (!weatherRes.ok) throw new Error(`${weatherRes.status}`);
      const data = await weatherRes.json();
      if (!data?.current) throw new Error(t("error"));
      setWeather(data);

      try {
        const geoRes = await withTimeout(
          fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=place,locality&access_token=${MAPBOX_ACCESS_TOKEN}`
          ),
          5000,
          t("error")
        );
        const geo = geoRes.ok ? await geoRes.json() : null;
        const place = geo?.features?.[0]?.text;
        if (place) setLocationName(place);
      } catch {}

    } catch (e: any) {
      setError(e?.message ?? t("error"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchWeather(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchWeather(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#ffffff" size="large" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (error || !weather) {
    // Show the offline state either from NetInfo, or by recognising a network
    // fetch failure (so it still works before a build that includes NetInfo).
    const netFail = typeof error === "string" && /network request failed|failed to fetch|network error/i.test(error);
    const offline = !isOnline || netFail;
    return (
      <SafeAreaView style={styles.container}>
        {offline && (
          <Ionicons name="cloud-offline-outline" size={40} color="#64748b" style={{ alignSelf: "center", marginBottom: 12 }} />
        )}
        <Text style={styles.errorText}>
          {offline
            ? (language === "ru" ? "Нет подключения к интернету" : "You're offline")
            : (error ?? t("error"))}
        </Text>
        {offline && (
          <Text style={{ color: "#64748b", fontSize: 14, textAlign: "center", marginTop: 6 }}>
            {language === "ru" ? "Погода недоступна без сети" : "Weather needs an internet connection"}
          </Text>
        )}
        <TouchableOpacity onPress={() => { setLoading(true); fetchWeather(); }} style={{ marginTop: 16, alignSelf: "center" }}>
          <Text style={{ color: "#ffffff", fontSize: 15 }}>{language === "ru" ? "Повторить" : "Retry"}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const c = weather.current;
  const trend = pressureTrend(weather.hourly, t);
  const pressurefish = pressureFishLabel(c.pressure_msl, t);



  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="location-sharp" size={14} color="#94a3b8" />
          <Text style={styles.locationText}>{locationName ?? t("currentLocation")}</Text>
        </View>

        {/* Current weather */}
        <View style={styles.currentCard}>
          <View style={styles.currentTop}>
            <View>
              <Text style={styles.currentTemp}>{Math.round(c.temperature_2m)}°</Text>
              <Text style={styles.currentDesc}>{wmoLabel(c.weather_code, t)}</Text>
            </View>
            <Ionicons name={wmoIcon(c.weather_code) as any} size={64} color="#ffffff" />
          </View>
          <View style={styles.currentStats}>
            <View style={styles.statItem}>
              <Ionicons name="navigate-outline" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{Math.round(c.wind_speed_10m)} km/h {windDir(c.wind_direction_10m)}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="water-outline" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{c.relative_humidity_2m}%</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="rainy-outline" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{c.precipitation} mm</Text>
            </View>
          </View>
        </View>

        {/* Barometric pressure */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCard, { flex: 1 }]}>
            <View style={styles.infoCardHeader}>
              <Ionicons name="speedometer-outline" size={14} color="#94a3b8" />
              <Text style={styles.infoCardTitle}>{t("pressure")}</Text>
            </View>
            <View style={styles.pressureRow}>
              <Text style={styles.pressureValue}>{Math.round(c.pressure_msl)}</Text>
              <Text style={styles.pressureUnit}>hPa</Text>
              <Ionicons name={trend.icon as any} size={16} color={trend.color} style={{ marginLeft: 6 }} />
            </View>
            <Text style={styles.pressureTrendLabel} numberOfLines={1}>
              <Text style={{ color: trend.color }}>{trend.label}</Text>
              {"  ·  "}
              <Text style={{ color: pressurefish.color }}>{pressurefish.label}</Text>
            </Text>
          </View>
        </View>

        {/* Bite forecast */}
        <BiteForecast
          current={c}
          hourly={weather.hourly}
          utcOffsetSeconds={weather.utc_offset_seconds}
          unlocked={isPro || !showPurchases}
          onUnlock={() => { if (showPurchases && requireAuth()) presentPaywall(); }}
          t={t}
          language={language}
          upgradeCopy={upgradeCopy}
        />

        {/* Hourly chart: temperature + precipitation */}
        <Text style={styles.sectionTitle}>{t("hourlyForecast")}</Text>
        <HourlyChart hourly={weather.hourly} utcOffsetSeconds={weather.utc_offset_seconds} t={t} language={language} />

        {/* Hourly wind chart */}
        <Text style={styles.sectionTitle}>{t("windForecast")}</Text>
        <WindChart hourly={weather.hourly} utcOffsetSeconds={weather.utc_offset_seconds} language={language} />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  locationText: { color: "#94a3b8", fontSize: 14 },
  currentCard: {
    paddingVertical: 12,
    marginHorizontal: 16, marginBottom: 12,
  },
  currentTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  currentTemp: { color: "#e6eef8", fontSize: 72, fontFamily: theme.fonts.display },
  currentDesc: { color: "#94a3b8", fontSize: 16, marginTop: 4 },
  currentStats: { flexDirection: "row", gap: 20, flexWrap: "wrap" },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { color: "#94a3b8", fontSize: 13 },
  hourlyScroll: { marginHorizontal: 16 },

  infoRow: { flexDirection: "row", marginHorizontal: 16, gap: 10, marginBottom: 16 },
  infoCard: {
    paddingVertical: 6,
  },
  infoCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  infoCardTitle: { color: "#94a3b8", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  pressureRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginBottom: 6 },
  pressureValue: { color: "#e6eef8", fontSize: 28, fontFamily: theme.fonts.display },
  pressureUnit: { color: "#94a3b8", fontSize: 13 },
  pressureTrendLabel: { color: "#94a3b8", fontSize: 12 },

  fishingBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  fishingBadgeText: { fontSize: 13, fontWeight: "600" },
  biteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginHorizontal: 16, marginBottom: 24,
  },
  biteRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  biteInfo: { flex: 1 },
  biteScore: { fontSize: 46, fontFamily: theme.fonts.displayBold },
  biteDialMax: { color: "#94a3b8", fontSize: 12, fontWeight: "600", marginTop: -4 },
  biteVerdict: { fontSize: 21, fontFamily: theme.fonts.displaySemibold, marginBottom: 2 },
  biteWindow: { color: "#94a3b8", fontSize: 13, marginBottom: 12 },
  factorList: {},
  factorRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 7, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  factorLabel: { color: "#94a3b8", fontSize: 13 },
  factorValue: { color: "#e6eef8", fontSize: 13, fontWeight: "600" },

  biteLocked: { alignItems: "center", paddingVertical: 8 },
  biteLockIcon: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.12)", marginBottom: 12,
  },
  biteLockedTitle: { color: "#e6eef8", fontSize: 16, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  biteLockedSub: { color: "#94a3b8", fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 16, paddingHorizontal: 8 },
  biteUnlockBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#f59e0b", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
  },
  biteUnlockText: { color: "#0f172a", fontSize: 14, fontWeight: "700" },

  sectionTitle: {
    color: "#94a3b8", fontSize: 13, fontWeight: "600", textTransform: "uppercase",
    letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 10,
  },
  hourlyTime: { color: "#94a3b8", fontSize: 12 },
  hourlyTemp: { color: "#e6eef8", fontSize: 14, fontWeight: "600" },
  errorText: { color: "#ef4444", textAlign: "center", marginTop: 60, fontSize: 16 },
});
