export type BadgeId = "verified" | "early_bird" | "pro" | "legend" | "pioneer" | "rybolov" | "developer";

export type Badge = {
  id: BadgeId;
  emoji: string;
  labelRu: string;
  labelEn: string;
  color: string;
  bg: string;
};

export const BADGES: Record<BadgeId, Badge> = {
  verified:  { id: "verified",  emoji: "✓", labelRu: "Верифицирован", labelEn: "Verified",   color: "#fff", bg: "#0ea5e9" },
  early_bird:{ id: "early_bird",emoji: "🐦",labelRu: "Первопроходец", labelEn: "Early Bird", color: "#fff", bg: "#7c3aed" },
  pro:       { id: "pro",       emoji: "🏆",labelRu: "Про",            labelEn: "Pro",         color: "#fff", bg: "#d97706" },
  legend:    { id: "legend",    emoji: "⭐",labelRu: "Легенда",        labelEn: "Legend",      color: "#fff", bg: "#dc2626" },
  pioneer:   { id: "pioneer",   emoji: "🚀",labelRu: "Пионер",         labelEn: "Pioneer",     color: "#fff", bg: "#059669" },
  rybolov:   { id: "rybolov",   emoji: "🎣",labelRu: "Рыболов",        labelEn: "Angler",      color: "#fff", bg: "#0f766e" },
  developer: { id: "developer", emoji: "👾", labelRu: "Разработчик",   labelEn: "Developer",   color: "#fff", bg: "#4f46e5" },
};

export function parseBadges(raw: any): BadgeId[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((b): b is BadgeId => b in BADGES);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((b): b is BadgeId => b in BADGES);
    } catch {}
  }
  return [];
}
