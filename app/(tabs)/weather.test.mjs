import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./weather.tsx", import.meta.url), "utf8");

test("weather request includes fishing safety and daylight fields", () => {
  assert.match(source, /wind_gusts_10m/);
  assert.match(source, /sunrise,sunset,uv_index_max/);
  assert.match(source, /daily=weather_code,temperature_2m_max,temperature_2m_min/);
});

test("weather fetches fresh data on focus and periodically without restoring cached forecasts", () => {
  assert.match(source, /useFocusEffect/);
  assert.match(source, /setInterval\(.*fetchWeather.*15 \* 60 \* 1000/s);
  assert.doesNotMatch(source, /AsyncStorage\.getItem\(WEATHER_CACHE_KEY\)/);
});

test("bite forecast explains score factors and flags unsafe conditions", () => {
  assert.match(source, /biteReasons/);
  assert.match(source, /SafetyAlert/);
  assert.match(source, /wind_gusts_10m/);
});

test("hourly forecast graph appears before the seven-day plan", () => {
  const chart = source.indexOf('<HourlyChart hourly={weather.hourly}');
  const weekly = source.indexOf('<WeeklyForecast daily={weather.daily}');
  assert.ok(chart !== -1 && weekly !== -1 && chart < weekly);
});

test("forecast errors do not fall back to expired weather", () => {
  assert.doesNotMatch(source, /cachedForecast|chartStartTime/);
  assert.match(source, /setError\(e\?\.message/);
});
