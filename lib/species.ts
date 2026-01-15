export type SpeciesOption = { id: string; labelRu: string; labelEn: string };

const speciesOptions: SpeciesOption[] = [
  { id: "pike", labelRu: "Щука", labelEn: "Pike" },
  { id: "perch", labelRu: "Окунь", labelEn: "Perch" },
  { id: "carp", labelRu: "Карп", labelEn: "Carp" },
  { id: "pikeperch", labelRu: "Берш", labelEn: "Pikeperch" },
  { id: "sudak", labelRu: "Судак", labelEn: "Zander" },
  { id: "leshch", labelRu: "Лещ", labelEn: "Bream" },
  { id: "nalim", labelRu: "Налим", labelEn: "Burbot" },
  { id: "som", labelRu: "Сом", labelEn: "Catfish" },
  { id: "forel", labelRu: "Форель", labelEn: "Trout" },
  { id: "sig", labelRu: "Сиг", labelEn: "Whitefish" },
  { id: "kharius", labelRu: "Хариус", labelEn: "Grayling" },
  { id: "gustera", labelRu: "Густера", labelEn: "Silver Bream" },
  { id: "karas", labelRu: "Карась", labelEn: "Crucian Carp" },
  { id: "lin", labelRu: "Линь", labelEn: "Tench" },
  { id: "golavl", labelRu: "Голавль", labelEn: "Chub" },
  { id: "yaz", labelRu: "Язь", labelEn: "Ide" },
  { id: "plotva", labelRu: "Плотва", labelEn: "Roach" },
  { id: "sazan", labelRu: "Сазан", labelEn: "Common Carp" },
  { id: "rotan", labelRu: "Ротан", labelEn: "Amur Sleeper" },
  { id: "peskar", labelRu: "Пескарь", labelEn: "Gudgeon" },
  { id: "ukleya", labelRu: "Уклея", labelEn: "Bleak" },
];

export function getSpeciesOptions(language: "ru" | "en" = "ru"): Array<{ id: string; label: string }> {
  return speciesOptions.map(s => ({
    id: s.id,
    label: language === "ru" ? s.labelRu : s.labelEn,
  }));
}

export function getSpeciesLabel(id?: string | null, language: "ru" | "en" = "ru"): string {
  if (!id) return language === "ru" ? "Неизвестно" : "Unknown";
  const f = speciesOptions.find((s) => s.id === id);
  if (!f) return id;
  return language === "ru" ? f.labelRu : f.labelEn;
}