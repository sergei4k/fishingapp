export type GearCategory = "lure" | "bait" | "rig";
export type GearPickerTab = Exclude<GearCategory, "rig">;

export type GearOption = {
  id: string;
  labelRu: string;
  labelEn: string;
  category: GearCategory;
  selectable?: boolean;
};

export const GEAR_CATEGORY_COLOR: Record<GearCategory, string> = {
  lure: "#60a5fa",
  bait: "#4ade80",
  rig:  "#f97316",
};

export const GEAR_CATEGORY_ICON: Record<GearCategory, string> = {
  lure: "flash-outline",
  bait: "leaf-outline",
  rig:  "construct-outline",
};

const gearOptions: GearOption[] = [
  // ── Lures ──────────────────────────────────────────────────────────
  { id: "jig",         labelRu: "Джиг",            labelEn: "Jig",           category: "lure", selectable: false },
  { id: "vobler",      labelRu: "Воблер",           labelEn: "Crankbait",     category: "lure" },
  { id: "vrashchalka", labelRu: "Вертушка",         labelEn: "Roostertail",       category: "lure" },
  { id: "spoon",       labelRu: "Колебалка",        labelEn: "Spoon",         category: "lure" },
  { id: "popper",      labelRu: "Поппер",           labelEn: "Popper",        category: "lure" },
  { id: "silikon",     labelRu: "Силикон",          labelEn: "Soft Plastic",  category: "lure" },
  { id: "mushka",      labelRu: "Мушка",            labelEn: "Fly",           category: "lure" },
  { id: "streamer",    labelRu: "Стример",          labelEn: "Streamer",      category: "lure", selectable: false },
  { id: "twister",     labelRu: "Твистер",          labelEn: "Twister",       category: "lure", selectable: false },
  { id: "pilker",       labelRu: "Пилькер",            labelEn: "Casting jig",         category: "lure" },
  { id: "glider",      labelRu: "Глайдбейт",        labelEn: "Glidebait",     category: "lure" },
  { id: "rattleback",  labelRu: "Ратлбэк",          labelEn: "Rattlebait",    category: "lure" },
  { id: "frog",        labelRu: "Лягушка",          labelEn: "Frog Lure",     category: "lure" },
  { id: "jerkbait",    labelRu: "Джеркбейт",        labelEn: "Jerkbait",      category: "lure" },
  { id: "crawsoft",    labelRu: "Силиконовый рак",  labelEn: "Soft Craw",     category: "lure" },
  { id: "senko",       labelRu: "Сенко",            labelEn: "Senko",         category: "lure" },
  { id: "bucktail",    labelRu: "Бактейл",          labelEn: "Bucktail Jig",  category: "lure" },
  { id: "tailspinner", labelRu: "Тейлспиннер",      labelEn: "Tail Spinner",  category: "lure" },
  // ── Bait ───────────────────────────────────────────────────────────
  { id: "chervyak",    labelRu: "Червь",            labelEn: "Worm",          category: "bait" },
  { id: "motyl",       labelRu: "Мотыль",           labelEn: "Bloodworm",     category: "bait" },
  { id: "oparysh",     labelRu: "Опарыш",           labelEn: "Maggot",        category: "bait" },
  { id: "zhivec",      labelRu: "Живец",            labelEn: "Live Bait",     category: "bait" },
  { id: "kukuruza",    labelRu: "Кукуруза",         labelEn: "Corn",          category: "bait" },
  { id: "hleb",        labelRu: "Хлеб",             labelEn: "Bread",         category: "bait" },
  { id: "boyl",        labelRu: "Бойл",             labelEn: "Boilie",        category: "bait", selectable: false },
  { id: "ikra",        labelRu: "Икра",             labelEn: "Roe",           category: "bait" },
  { id: "testo",       labelRu: "Тесто",            labelEn: "Dough",         category: "bait" },
  { id: "pellet",      labelRu: "Пеллет",           labelEn: "Pellet",        category: "bait" },
  { id: "mertvaya",    labelRu: "Рыбные кусочки",   labelEn: "Fish Chunks",   category: "bait" },
  { id: "kascha",      labelRu: "Фидерная смесь",   labelEn: "Feeder Mix",    category: "bait" },
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
  return gearOptions.filter(g => g.selectable !== false).map(g => ({
    id: g.id,
    label: language === "ru" ? g.labelRu : g.labelEn,
    labelRu: g.labelRu,
    labelEn: g.labelEn,
    category: g.category,
  }));
}

export function filterGearOptions(language: "ru" | "en", tab: GearPickerTab, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return getGearOptions(language).filter((gear) => {
    if (gear.category !== tab) return false;
    if (!normalizedQuery) return true;
    return gear.labelRu.toLowerCase().includes(normalizedQuery) ||
      gear.labelEn.toLowerCase().includes(normalizedQuery);
  });
}

export function getGearPickerTab(id?: string | null): GearPickerTab {
  return gearOptions.find((gear) => gear.id === id)?.category === "bait" ? "bait" : "lure";
}

export function getGearLabel(id?: string | null, language: "ru" | "en" = "ru"): string {
  if (!id) return "";
  const f = gearOptions.find(g => g.id === id);
  if (!f) return id;
  return language === "ru" ? f.labelRu : f.labelEn;
}
