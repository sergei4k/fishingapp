export type GearCategory = "lure" | "bait" | "rig";

export type GearOption = {
  id: string;
  labelRu: string;
  labelEn: string;
  category: GearCategory;
};

export const GEAR_CATEGORY_COLOR: Record<GearCategory, string> = {
  lure: "#60a5fa",
  bait: "#4ade80",
  rig:  "#f97316",
};

export const GEAR_CATEGORY_ICON: Record<GearCategory, string> = {
  lure: "bolt",
  bait: "leaf",
  rig:  "wrench",
};

const gearOptions: GearOption[] = [
  // ── Lures ──────────────────────────────────────────────────────────
  { id: "jig",         labelRu: "Джиг",            labelEn: "Jig",           category: "lure" },
  { id: "vobler",      labelRu: "Воблер",           labelEn: "Crankbait",     category: "lure" },
  { id: "vrashchalka", labelRu: "Вертушка",         labelEn: "Roostertail",       category: "lure" },
  { id: "spoon",       labelRu: "Колебалка",        labelEn: "Spoon",         category: "lure" },
  { id: "popper",      labelRu: "Поппер",           labelEn: "Popper",        category: "lure" },
  { id: "silikon",     labelRu: "Силикон",          labelEn: "Soft Plastic",  category: "lure" },
  { id: "mushka",      labelRu: "Мушка",            labelEn: "Fly",           category: "lure" },
  { id: "streamer",    labelRu: "Стример",          labelEn: "Streamer",      category: "lure" },
  { id: "twister",     labelRu: "Твистер",          labelEn: "Twister",       category: "lure" },
  { id: "pilker",       labelRu: "Пилькер",            labelEn: "Casting jig",         category: "lure" },
  { id: "glider",      labelRu: "Глайдер",          labelEn: "Glider",        category: "lure" },
  { id: "rattleback",  labelRu: "Ратлбэк",          labelEn: "Rattlebait",    category: "lure" },
  { id: "frog",        labelRu: "Лягушка",          labelEn: "Frog Lure",     category: "lure" },
  { id: "jerkbait",    labelRu: "Джеркбейт",        labelEn: "Jerkbait",      category: "lure" },
  // ── Bait ───────────────────────────────────────────────────────────
  { id: "chervyak",    labelRu: "Червь",            labelEn: "Worm",          category: "bait" },
  { id: "oparysh",     labelRu: "Опарыш",           labelEn: "Maggot",        category: "bait" },
  { id: "zhivec",      labelRu: "Живец",            labelEn: "Live Bait",     category: "bait" },
  { id: "kukuruza",    labelRu: "Кукуруза",         labelEn: "Corn",          category: "bait" },
  { id: "hleb",        labelRu: "Хлеб",             labelEn: "Bread",         category: "bait" },
  { id: "boyl",        labelRu: "Бойл",             labelEn: "Boilie",        category: "bait" },
  { id: "ikra",        labelRu: "Икра",             labelEn: "Roe",           category: "bait" },
  { id: "testo",       labelRu: "Тесто",            labelEn: "Dough",         category: "bait" },
  { id: "pellet",      labelRu: "Пеллет",           labelEn: "Pellet",        category: "bait" },
  { id: "mertvaya",    labelRu: "Мёртвая рыбка",    labelEn: "Dead Bait",     category: "bait" },
  { id: "kascha",      labelRu: "Каша",             labelEn: "Porridge",      category: "bait" },
  { id: "goroh",       labelRu: "Горох",            labelEn: "Peas",          category: "bait" },
  { id: "krevetka",   labelRu: "Креветка",         labelEn: "Shrimp",        category: "bait" },
  { id: "rak",        labelRu: "Рак",              labelEn: "Crawfish",      category: "bait" },
  { id: "krab",       labelRu: "Краб",             labelEn: "Crab",          category: "bait" },
  { id: "midiya",     labelRu: "Мидия",            labelEn: "Mussel",        category: "bait" },
  { id: "rakushka",   labelRu: "Ракушка",          labelEn: "Clam",          category: "bait" },
  { id: "kalmar",     labelRu: "Кальмар",          labelEn: "Squid",         category: "bait" },
  { id: "sverchok",   labelRu: "Сверчок",          labelEn: "Cricket",       category: "bait" },
  { id: "kuznechik",  labelRu: "Кузнечик",         labelEn: "Grasshopper",   category: "bait" },
];

export function getGearOptions(language: "ru" | "en" = "ru"): Array<{ id: string; label: string; labelRu: string; labelEn: string; category: GearCategory }> {
  return gearOptions.map(g => ({
    id: g.id,
    label: language === "ru" ? g.labelRu : g.labelEn,
    labelRu: g.labelRu,
    labelEn: g.labelEn,
    category: g.category,
  }));
}

export function getGearLabel(id?: string | null, language: "ru" | "en" = "ru"): string {
  if (!id) return "";
  const f = gearOptions.find(g => g.id === id);
  if (!f) return id;
  return language === "ru" ? f.labelRu : f.labelEn;
}
