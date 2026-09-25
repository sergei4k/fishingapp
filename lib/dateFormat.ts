export function formatEuropeanDate(value: Date | string | number | null | undefined): string {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear(),
  ].join("/");
}

export function formatCatchDate(value: Date | string | number | null | undefined, language: string): string {
  if (!value) return "";

  const numericValue = typeof value === "string" ? Number(value) : value;
  const date = value instanceof Date
    ? value
    : typeof numericValue === "number" && Number.isFinite(numericValue) && numericValue > 0
      ? new Date(numericValue)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (language === "ru") {
    return date
      .toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
      .replace(/\s*г\.$/u, "");
  }

  const parts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  return month && day && year ? `${month}. ${day} ${year}` : "";
}
