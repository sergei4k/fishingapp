export type BadgeId = "verified" | "early_bird" | "pro" | "legend" | "pioneer" | "rybolov" | "developer";
export type BadgeIconName = "checkmark-circle" | "sunny" | "trophy" | "star" | "rocket" | "fish" | "code-slash";

export type Badge = {
  id: BadgeId;
  icon: BadgeIconName;
  labelRu: string;
  labelEn: string;
  descriptionRu: string;
  descriptionEn: string;
  color: string;
  bg: string;
};

export const BADGES: Record<BadgeId, Badge> = {
  verified:  { id: "verified",  icon: "checkmark-circle", labelRu: "Strikefeed Pro", labelEn: "Strikefeed Pro", descriptionRu: "Выдаётся пользователям с активной подпиской Strikefeed Pro.", descriptionEn: "Awarded to anglers with an active Strikefeed Pro membership.", color: "#fff", bg: "#0ea5e9" },
  early_bird:{ id: "early_bird",icon: "sunny",            labelRu: "Первопроходец", labelEn: "Early Bird", descriptionRu: "Для тех, кто присоединился к Strikefeed одним из первых.", descriptionEn: "Awarded to anglers who joined Strikefeed early.", color: "#fff", bg: "#7c3aed" },
  pro:       { id: "pro",       icon: "trophy",           labelRu: "Про",            labelEn: "Pro",         descriptionRu: "Выдаётся за заметный вклад в сообщество Strikefeed.", descriptionEn: "Awarded for making an outstanding contribution to the Strikefeed community.", color: "#fff", bg: "#d97706" },
  legend:    { id: "legend",    icon: "star",             labelRu: "Легенда",        labelEn: "Legend",      descriptionRu: "Награда за выдающиеся уловы и вклад в сообщество.", descriptionEn: "Awarded for exceptional catches and lasting community contribution.", color: "#fff", bg: "#dc2626" },
  pioneer:   { id: "pioneer",   icon: "rocket",           labelRu: "Пионер",         labelEn: "Pioneer",     descriptionRu: "Для тех, кто помогает развивать Strikefeed на раннем этапе.", descriptionEn: "Awarded to anglers who helped shape Strikefeed early on.", color: "#fff", bg: "#059669" },
  rybolov:   { id: "rybolov",   icon: "fish",             labelRu: "Рыболов",        labelEn: "Angler",      descriptionRu: "Выдаётся за регистрацию первого улова.", descriptionEn: "Log your first catch to earn this badge.", color: "#fff", bg: "#0f766e" },
  developer: { id: "developer", icon: "code-slash",       labelRu: "Разработчик",   labelEn: "Developer",   descriptionRu: "Выдаётся участникам команды разработки Strikefeed.", descriptionEn: "Awarded to members of the Strikefeed development team.", color: "#fff", bg: "#4f46e5" },
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
