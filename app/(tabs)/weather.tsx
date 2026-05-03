import { FontAwesome6 as FontAwesome } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "@/lib/language";

type WeatherData = {
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
  };
};

type TideData = {
  extremes: {
    dt: number;
    date: string;
    height: number;
    type: "High" | "Low";
  }[];
} | null;

type MarineData = {
  current?: {
    wave_height: number | null;
    wave_direction: number | null;
    wave_period: number | null;
  };
  hourly?: {
    time: string[];
    wave_height: (number | null)[];
    wave_period: (number | null)[];
  };
} | null;

function wmoIcon(code: number): string {
  if (code === 0) return "sun";
  if (code <= 3) return "cloud-sun";
  if (code <= 48) return "smog";
  if (code <= 67) return "cloud-rain";
  if (code <= 77) return "snowflake";
  if (code <= 82) return "cloud-showers-heavy";
  if (code <= 86) return "snowflake";
  return "bolt";
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
  if (idx < 3) return { icon: "arrow-right", label: t("pressureSteady"), color: "#94a3b8" };
  const delta = hourly.pressure_msl[idx] - hourly.pressure_msl[idx - 3];
  if (delta >= 1.5) return { icon: "arrow-trend-up", label: t("pressureRising"), color: "#22c55e" };
  if (delta <= -1.5) return { icon: "arrow-trend-down", label: t("pressureFalling"), color: "#ef4444" };
  return { icon: "arrow-right", label: t("pressureSteady"), color: "#94a3b8" };
}

function pressureFishLabel(hpa: number, t: (k: any) => string): { label: string; color: string } {
  if (hpa < 1014) return { label: t("fishFeedingActive"), color: "#22c55e" };
  return { label: t("fishNormalActivity"), color: "#94a3b8" };
}

function fishingScore(wind: number, precip: number, code: number, pressure: number, t: (k: any) => string): { score: number; label: string; color: string } {
  let score = 10;
  if (wind > 20) score -= 4; else if (wind > 10) score -= 2;
  if (precip > 5) score -= 3; else if (precip > 1) score -= 1;
  if (code >= 95) score -= 4; else if (code >= 80) score -= 2;
  if (pressure < 1009) score -= 2; else if (pressure >= 1020) score += 1;
  score = Math.max(1, Math.min(10, score));
  if (score >= 8) return { score, label: t("fishingExcellent"), color: "#22c55e" };
  if (score >= 6) return { score, label: t("fishingGood"), color: "#84cc16" };
  if (score >= 4) return { score, label: t("fishingFair"), color: "#f59e0b" };
  return { score, label: t("fishingPoor"), color: "#ef4444" };
}

function waveLabel(h: number, t: (k: any) => string): string {
  if (h < 0.5) return t("waveCalm");
  if (h < 1.25) return t("waveSlight");
  if (h < 2.5) return t("waveModerate");
  if (h < 4) return t("waveRough");
  return t("waveVeryRough");
}

const COL_W = 52;
const CHART_H = 160;
const V_PAD = 22;

function HourlyChart({ hourly, t }: { hourly: WeatherData["hourly"]; t: (k: any) => string }) {
  const now = new Date();
  const data = hourly.time
    .map((time, i) => ({
      time,
      temp: hourly.temperature_2m[i],
      pop: hourly.precipitation_probability[i],
    }))
    .filter(h => new Date(h.time) >= now)
    .slice(0, 24);

  if (data.length < 2) return null;

  const temps = data.map(h => h.temp);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const range = maxT - minT || 1;
  const getY = (temp: number) => V_PAD + (1 - (temp - minT) / range) * (CHART_H - 2 * V_PAD);
  const totalW = data.length * COL_W;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 24 }}>
      <View style={{ backgroundColor: "#071023", borderRadius: 16, borderWidth: 1, borderColor: "#1e293b", paddingTop: 12 }}>
        {/* Legend */}
        <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 14, marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 20, height: 2.5, backgroundColor: "#f97316", borderRadius: 2 }} />
            <Text style={{ color: "#94a3b8", fontSize: 11 }}>°C</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 12, height: 10, backgroundColor: "rgba(96,165,250,0.3)", borderRadius: 2, borderWidth: 1, borderColor: "rgba(96,165,250,0.5)" }} />
            <Text style={{ color: "#94a3b8", fontSize: 11 }}>%</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
          <View style={{ width: totalW, height: CHART_H + 24, position: "relative" }}>
            {/* Precipitation bars */}
            {data.map((h, i) => {
              if (h.pop === 0) return null;
              const barH = Math.max(3, (h.pop / 100) * (CHART_H - V_PAD));
              return (
                <View
                  key={`bar-${i}`}
                  style={{
                    position: "absolute", bottom: 20,
                    left: i * COL_W + 8, width: COL_W - 16, height: barH,
                    backgroundColor: "rgba(96,165,250,0.18)",
                    borderRadius: 3, borderTopWidth: 1, borderTopColor: "rgba(96,165,250,0.45)",
                  }}
                />
              );
            })}

            {/* Temperature line segments */}
            {data.map((h, i) => {
              if (i >= data.length - 1) return null;
              const x1 = i * COL_W + COL_W / 2;
              const x2 = (i + 1) * COL_W + COL_W / 2;
              const y1 = getY(h.temp);
              const y2 = getY(data[i + 1].temp);
              const dx = x2 - x1, dy = y2 - y1;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx);
              return (
                <View
                  key={`seg-${i}`}
                  style={{
                    position: "absolute",
                    top: (y1 + y2) / 2 - 1,
                    left: (x1 + x2) / 2 - len / 2,
                    width: len, height: 2,
                    backgroundColor: "#f97316", borderRadius: 1,
                    transform: [{ rotate: `${angle}rad` }],
                  }}
                />
              );
            })}

            {/* Temperature dots */}
            {data.map((h, i) => {
              const cx = i * COL_W + COL_W / 2;
              const cy = getY(h.temp);
              return (
                <View
                  key={`dot-${i}`}
                  style={{
                    position: "absolute", top: cy - 3.5, left: cx - 3.5,
                    width: 7, height: 7, borderRadius: 4,
                    backgroundColor: "#f97316", borderWidth: 1.5, borderColor: "#071023",
                  }}
                />
              );
            })}

            {/* Temperature labels — every hour */}
            {data.map((h, i) => {
              const cx = i * COL_W + COL_W / 2;
              const cy = getY(h.temp);
              return (
                <Text
                  key={`tlabel-${i}`}
                  style={{
                    position: "absolute", top: cy - 18, left: cx - 14, width: 28,
                    textAlign: "center", color: "#e6eef8", fontSize: 11, fontWeight: "600",
                  }}
                >
                  {Math.round(h.temp)}°
                </Text>
              );
            })}

            {/* X-axis time labels — every hour */}
            {data.map((h, i) => {
              const d = new Date(h.time);
              return (
                <Text
                  key={`xlabel-${i}`}
                  style={{
                    position: "absolute", bottom: 2, left: i * COL_W, width: COL_W,
                    textAlign: "center", color: "#475569", fontSize: 10,
                  }}
                >
                  {i === 0 ? t("now") : `${d.getHours()}:00`}
                </Text>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export default function Weather() {
  const { t } = useLanguage();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [marine, setMarine] = useState<MarineData>(null);
  const [tides, setTides] = useState<TideData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWeather = async () => {
    try {
      setError(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setError(t("locationPermission")); return; }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;

      const tidesToken = process.env.EXPO_PUBLIC_WORLDTIDES_TOKEN;
      const [weatherRes, marineRes, geoRes, tidesRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,relative_humidity_2m,pressure_msl` +
          `&hourly=temperature_2m,precipitation_probability,weather_code,pressure_msl` +
          `&timezone=auto&forecast_days=2`
        ),
        fetch(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}` +
          `&current=wave_height,wave_direction,wave_period` +
          `&hourly=wave_height,wave_period&timezone=auto&forecast_days=3`
        ).catch(() => null),
        fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=place,locality&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`
        ).catch(() => null),
        tidesToken
          ? fetch(
              `https://www.worldtides.info/api/v3?extremes&lat=${latitude}&lon=${longitude}&key=${tidesToken}&days=3`
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      const data = await weatherRes.json();
      setWeather(data);

      if (marineRes?.ok) {
        const md = await marineRes.json();
        const hasWave = md?.current?.wave_height != null;
        setMarine(hasWave ? md : null);
      }

      if (geoRes) {
        const geo = await geoRes.json();
        const place = geo?.features?.[0]?.text;
        if (place) setLocationName(place);
      }

      if (tidesRes?.ok) {
        const td = await tidesRes.json();
        if (td?.extremes?.length) setTides(td);
      }
    } catch (e) {
      setError(t("error"));
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
        <ActivityIndicator color="#60a5fa" size="large" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (error || !weather) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>{error ?? t("error")}</Text>
      </SafeAreaView>
    );
  }

  const c = weather.current;
  const trend = pressureTrend(weather.hourly, t);
  const pressurefish = pressureFishLabel(c.pressure_msl, t);
  const fishing = fishingScore(c.wind_speed_10m, c.precipitation, c.weather_code, c.pressure_msl, t);

  const marineHourly = marine?.hourly
    ? marine.hourly.time
        .map((t, i) => ({ time: t, wh: marine.hourly!.wave_height[i], wp: marine.hourly!.wave_period[i] }))
        .filter(h => new Date(h.time) >= new Date() && h.wh != null)
        .slice(0, 24)
    : [];


  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <FontAwesome name="location-dot" size={14} color="#94a3b8" />
          <Text style={styles.locationText}>{locationName ?? t("currentLocation")}</Text>
        </View>

        {/* Current weather */}
        <View style={styles.currentCard}>
          <View style={styles.currentTop}>
            <View>
              <Text style={styles.currentTemp}>{Math.round(c.temperature_2m)}°</Text>
              <Text style={styles.currentDesc}>{wmoLabel(c.weather_code, t)}</Text>
            </View>
            <FontAwesome name={wmoIcon(c.weather_code) as any} size={64} color="#60a5fa" />
          </View>
          <View style={styles.currentStats}>
            <View style={styles.statItem}>
              <FontAwesome name="wind" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{Math.round(c.wind_speed_10m)} km/h {windDir(c.wind_direction_10m)}</Text>
            </View>
            <View style={styles.statItem}>
              <FontAwesome name="droplet" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{c.relative_humidity_2m}%</Text>
            </View>
            <View style={styles.statItem}>
              <FontAwesome name="cloud-rain" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{c.precipitation} mm</Text>
            </View>
          </View>
        </View>

        {/* Barometric pressure */}
        <View style={styles.infoRow}>
          <View style={[styles.infoCard, { flex: 1 }]}>
            <View style={styles.infoCardHeader}>
              <FontAwesome name="gauge-high" size={14} color="#94a3b8" />
              <Text style={styles.infoCardTitle}>{t("pressure")}</Text>
            </View>
            <View style={styles.pressureRow}>
              <Text style={styles.pressureValue}>{Math.round(c.pressure_msl)}</Text>
              <Text style={styles.pressureUnit}>hPa</Text>
              <FontAwesome name={trend.icon as any} size={16} color={trend.color} style={{ marginLeft: 6 }} />
            </View>
            <Text style={styles.pressureTrendLabel} numberOfLines={1}>
              <Text style={{ color: trend.color }}>{trend.label}</Text>
              {"  ·  "}
              <Text style={{ color: pressurefish.color }}>{pressurefish.label}</Text>
            </Text>
          </View>

          {/* Fishing conditions */}
          <View style={[styles.infoCard, { flex: 1 }]}>
            <View style={styles.infoCardHeader}>
              <FontAwesome name="fish" size={14} color={fishing.color} />
              <Text style={styles.infoCardTitle}>{t("fishingConditions")}</Text>
            </View>
            <View style={[styles.fishingBadge, { backgroundColor: fishing.color + "22", borderColor: fishing.color, alignSelf: "flex-start", marginTop: 4 }]}>
              <Text style={[styles.fishingBadgeText, { color: fishing.color }]}>{fishing.label}</Text>
            </View>
            <View style={styles.scoreBar}>
              {Array.from({ length: 10 }).map((_, i) => (
                <View key={i} style={[styles.scoreSegment, { backgroundColor: i < fishing.score ? fishing.color : "#1e293b" }]} />
              ))}
            </View>
          </View>
        </View>

        {/* Tides / Marine */}
        {marine && marine.current && (
          <>
            <Text style={styles.sectionTitle}>{t("seaConditions")}</Text>
            <View style={styles.marineCard}>
              <View style={styles.marineRow}>
                <View style={styles.marineStat}>
                  <FontAwesome name="water" size={18} color="#60a5fa" />
                  <Text style={styles.marineValue}>
                    {marine.current.wave_height != null ? marine.current.wave_height.toFixed(1) : "--"} m
                  </Text>
                  <Text style={styles.marineLabel}>{t("waveHeight")}</Text>
                  {marine.current.wave_height != null && (
                    <Text style={styles.marineSubLabel}>{waveLabel(marine.current.wave_height, t)}</Text>
                  )}
                </View>
                <View style={styles.marineDivider} />
                <View style={styles.marineStat}>
                  <FontAwesome name="clock" size={18} color="#60a5fa" />
                  <Text style={styles.marineValue}>
                    {marine.current.wave_period != null ? Math.round(marine.current.wave_period) : "--"} s
                  </Text>
                  <Text style={styles.marineLabel}>{t("wavePeriod")}</Text>
                </View>
                <View style={styles.marineDivider} />
                <View style={styles.marineStat}>
                  <FontAwesome name="compass" size={18} color="#60a5fa" />
                  <Text style={styles.marineValue}>
                    {marine.current.wave_direction != null ? windDir(marine.current.wave_direction) : "--"}
                  </Text>
                  <Text style={styles.marineLabel}>{t("waveDir")}</Text>
                </View>
              </View>

              {marineHourly.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
                  {marineHourly.map((h) => {
                    const d = new Date(h.time);
                    return (
                      <View key={h.time} style={styles.marineHourlyItem}>
                        <Text style={styles.hourlyTime}>{d.getHours()}:00</Text>
                        <FontAwesome name="water" size={14} color="#60a5fa" />
                        <Text style={styles.hourlyTemp}>{h.wh!.toFixed(1)}m</Text>
                        <Text style={styles.marineSubLabel}>{h.wp != null ? `${Math.round(h.wp)}s` : ""}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </>
        )}

        {/* Tides */}
        {tides && (
          <>
            <Text style={styles.sectionTitle}>{t("tides")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourlyScroll}>
              {tides.extremes
                .filter(e => new Date(e.date) >= new Date())
                .slice(0, 10)
                .map((e) => {
                  const d = new Date(e.date);
                  const isHigh = e.type === "High";
                  const color = isHigh ? "#60a5fa" : "#94a3b8";
                  return (
                    <View key={e.dt} style={styles.tideItem}>
                      <Text style={styles.hourlyTime}>{d.getHours().toString().padStart(2, "0")}:{d.getMinutes().toString().padStart(2, "0")}</Text>
                      <FontAwesome name={isHigh ? "arrow-trend-up" : "arrow-trend-down"} size={20} color={color} />
                      <Text style={[styles.tideHeight, { color }]}>{e.height.toFixed(1)}m</Text>
                      <Text style={[styles.tideType, { color }]}>{isHigh ? t("highTide") : t("lowTide")}</Text>
                    </View>
                  );
                })}
            </ScrollView>
          </>
        )}

        {/* Hourly chart: temperature + precipitation */}
        <Text style={styles.sectionTitle}>{t("hourlyForecast")}</Text>
        <HourlyChart hourly={weather.hourly} t={t} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  locationText: { color: "#94a3b8", fontSize: 14 },
  currentCard: {
    backgroundColor: "#071023", borderRadius: 16, padding: 20,
    marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: "#1e293b",
  },
  currentTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  currentTemp: { color: "#e6eef8", fontSize: 72, fontWeight: "200" },
  currentDesc: { color: "#94a3b8", fontSize: 16, marginTop: 4 },
  currentStats: { flexDirection: "row", gap: 20, flexWrap: "wrap" },
  statItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  statText: { color: "#94a3b8", fontSize: 13 },
  hourlyScroll: { marginHorizontal: 16 },

  infoRow: { flexDirection: "row", marginHorizontal: 16, gap: 10, marginBottom: 16 },
  infoCard: {
    backgroundColor: "#071023", borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#1e293b",
  },
  infoCardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  infoCardTitle: { color: "#94a3b8", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  pressureRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginBottom: 6 },
  pressureValue: { color: "#e6eef8", fontSize: 28, fontWeight: "300" },
  pressureUnit: { color: "#64748b", fontSize: 13 },
  pressureTrendLabel: { color: "#94a3b8", fontSize: 12 },

  fishingBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8 },
  fishingBadgeText: { fontSize: 13, fontWeight: "600" },
  scoreBar: { flexDirection: "row", gap: 3 },
  scoreSegment: { flex: 1, height: 5, borderRadius: 3 },

  sectionTitle: {
    color: "#94a3b8", fontSize: 13, fontWeight: "600", textTransform: "uppercase",
    letterSpacing: 0.5, marginHorizontal: 16, marginBottom: 10,
  },
  marineCard: {
    backgroundColor: "#071023", borderRadius: 16, padding: 16,
    marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: "#1e293b",
  },
  marineRow: { flexDirection: "row", justifyContent: "space-around" },
  marineStat: { alignItems: "center", gap: 4, flex: 1 },
  marineValue: { color: "#e6eef8", fontSize: 20, fontWeight: "300", marginTop: 4 },
  marineLabel: { color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 },
  marineSubLabel: { color: "#60a5fa", fontSize: 11 },
  marineDivider: { width: 1, backgroundColor: "#1e293b" },
  marineHourlyItem: { alignItems: "center", gap: 4, marginRight: 18, minWidth: 44 },

  tideItem: { alignItems: "center", gap: 4, marginRight: 24, minWidth: 52 },
  tideHeight: { fontSize: 16, fontWeight: "600" },
  tideType: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 },
  hourlyTime: { color: "#94a3b8", fontSize: 12 },
  hourlyTemp: { color: "#e6eef8", fontSize: 14, fontWeight: "600" },
  errorText: { color: "#ef4444", textAlign: "center", marginTop: 60, fontSize: 16 },
});
