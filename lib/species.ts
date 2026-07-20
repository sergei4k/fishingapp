export type SpeciesHabitat = "freshwater" | "saltwater";
export type SpeciesOption = { id: string; labelRu: string; labelEn: string; scientificName: string; habitat: SpeciesHabitat };

const speciesOptions: SpeciesOption[] = [
  { id: "pike",       labelRu: "Щука",     labelEn: "Pike",         scientificName: "Esox lucius", habitat: "freshwater" },
  { id: "perch",      labelRu: "Окунь",    labelEn: "Perch",        scientificName: "Perca fluviatilis", habitat: "freshwater" },
  { id: "carp",       labelRu: "Карп",     labelEn: "Carp",         scientificName: "Cyprinus carpio", habitat: "freshwater" },
  { id: "pikeperch",  labelRu: "Берш",     labelEn: "Pikeperch",    scientificName: "Sander volgensis", habitat: "freshwater" },
  { id: "sudak",      labelRu: "Судак",    labelEn: "Zander",       scientificName: "Sander lucioperca", habitat: "freshwater" },
  { id: "leshch",     labelRu: "Лещ",      labelEn: "Bream",        scientificName: "Abramis brama", habitat: "freshwater" },
  { id: "nalim",      labelRu: "Налим",    labelEn: "Burbot",       scientificName: "Lota lota", habitat: "freshwater" },
  { id: "som",        labelRu: "Сом",      labelEn: "Catfish",      scientificName: "Silurus glanis", habitat: "freshwater" },
  { id: "forel",      labelRu: "Форель",   labelEn: "Trout",        scientificName: "Oncorhynchus mykiss", habitat: "freshwater" },
  { id: "sig",        labelRu: "Сиг",      labelEn: "Whitefish",    scientificName: "Coregonus lavaretus", habitat: "freshwater" },
  { id: "kharius",    labelRu: "Хариус",   labelEn: "Grayling",     scientificName: "Thymallus thymallus", habitat: "freshwater" },
  { id: "gustera",    labelRu: "Густера",  labelEn: "Silver Bream", scientificName: "Blicca bjoerkna", habitat: "freshwater" },
  { id: "karas",      labelRu: "Карась",   labelEn: "Crucian Carp", scientificName: "Carassius carassius", habitat: "freshwater" },
  { id: "lin",        labelRu: "Линь",     labelEn: "Tench",        scientificName: "Tinca tinca", habitat: "freshwater" },
  { id: "golavl",     labelRu: "Голавль",  labelEn: "Chub",         scientificName: "Squalius cephalus", habitat: "freshwater" },
  { id: "yaz",        labelRu: "Язь",      labelEn: "Ide",          scientificName: "Leuciscus idus", habitat: "freshwater" },
  { id: "plotva",     labelRu: "Плотва",   labelEn: "Roach",        scientificName: "Rutilus rutilus", habitat: "freshwater" },
  { id: "sazan",      labelRu: "Сазан",    labelEn: "Common Carp",  scientificName: "Cyprinus carpio haematopterus", habitat: "freshwater" },
  { id: "rotan",      labelRu: "Ротан",    labelEn: "Amur Sleeper", scientificName: "Perccottus glenii", habitat: "freshwater" },
  { id: "peskar",     labelRu: "Пескарь",      labelEn: "Gudgeon",         scientificName: "Gobio gobio", habitat: "freshwater" },
  { id: "ukleya",     labelRu: "Уклея",        labelEn: "Bleak",           scientificName: "Alburnus alburnus", habitat: "freshwater" },
  { id: "zhereh",      labelRu: "Жерех",             labelEn: "Asp",              scientificName: "Aspius aspius", habitat: "freshwater" },
  { id: "bass",        labelRu: "Басс",              labelEn: "Largemouth Bass",  scientificName: "Micropterus salmoides", habitat: "freshwater" },
  { id: "stripedbass", labelRu: "Полосатый окунь",   labelEn: "Striped Bass",     scientificName: "Morone saxatilis", habitat: "saltwater" },
  { id: "losos",       labelRu: "Лосось",            labelEn: "Salmon",           scientificName: "Salmo salar", habitat: "saltwater" },
  { id: "sterlyad",    labelRu: "Стерлядь",          labelEn: "Sterlet",          scientificName: "Acipenser ruthenus", habitat: "freshwater" },
  { id: "taimen",      labelRu: "Таймень",           labelEn: "Taimen",           scientificName: "Hucho taimen", habitat: "freshwater" },
  { id: "lenok",       labelRu: "Ленок",             labelEn: "Lenok",            scientificName: "Brachymystax lenok", habitat: "freshwater" },
  { id: "nelma",       labelRu: "Нельма",            labelEn: "Nelma",            scientificName: "Stenodus leucichthys", habitat: "freshwater" },
  { id: "muksun",      labelRu: "Муксун",            labelEn: "Muksun",           scientificName: "Coregonus muksun", habitat: "freshwater" },
  { id: "chir",        labelRu: "Чир",               labelEn: "Broad Whitefish",  scientificName: "Coregonus nasus", habitat: "freshwater" },
  { id: "ryapushka",   labelRu: "Ряпушка",           labelEn: "Vendace",          scientificName: "Coregonus albula", habitat: "freshwater" },
  { id: "koryushka",   labelRu: "Корюшка",           labelEn: "Smelt",            scientificName: "Osmerus eperlanus", habitat: "freshwater" },
  { id: "krasnoperka", labelRu: "Краснопёрка",       labelEn: "Rudd",             scientificName: "Scardinius erythrophthalmus", habitat: "freshwater" },
  { id: "ersh",        labelRu: "Ёрш",               labelEn: "Ruffe",            scientificName: "Gymnocephalus cernua", habitat: "freshwater" },
  { id: "elec",        labelRu: "Елец",              labelEn: "Dace",             scientificName: "Leuciscus leuciscus", habitat: "freshwater" },
  { id: "chekhon",     labelRu: "Чехонь",            labelEn: "Ziege",            scientificName: "Pelecus cultratus", habitat: "freshwater" },
  { id: "sinec",       labelRu: "Синец",             labelEn: "White Bream",      scientificName: "Ballerus ballerus", habitat: "freshwater" },
  { id: "rybec",       labelRu: "Рыбец",             labelEn: "Vimba",            scientificName: "Vimba vimba", habitat: "freshwater" },
  { id: "tolstolobik", labelRu: "Толстолобик",       labelEn: "Silver Carp",      scientificName: "Hypophthalmichthys molitrix", habitat: "freshwater" },
  { id: "amur",        labelRu: "Белый амур",        labelEn: "Grass Carp",       scientificName: "Ctenopharyngodon idella", habitat: "freshwater" },
  { id: "podust",      labelRu: "Подуст",            labelEn: "Nase",             scientificName: "Chondrostoma nasus", habitat: "freshwater" },
  { id: "golec",       labelRu: "Голец",             labelEn: "Arctic Char",      scientificName: "Salvelinus alpinus", habitat: "freshwater" },
  { id: "okun_morskoy",  labelRu: "Морской окунь",   labelEn: "Sea Bass",           scientificName: "Dicentrarchus labrax", habitat: "saltwater" },
  { id: "sudak_morskoy", labelRu: "Морской судак",   labelEn: "Walleye",            scientificName: "Sander vitreus", habitat: "freshwater" },
  { id: "kambala",       labelRu: "Камбала",           labelEn: "European Flounder",  scientificName: "Platichthys flesus", habitat: "saltwater" },
  { id: "tarpon",        labelRu: "Тарпон",            labelEn: "Tarpon",             scientificName: "Megalops atlanticus", habitat: "saltwater" },
  { id: "brook_trout",   labelRu: "Ручьевая форель",   labelEn: "Brook Trout",        scientificName: "Salvelinus fontinalis", habitat: "freshwater" },
  { id: "bull_shark",    labelRu: "Бычья акула",       labelEn: "Bull Shark",         scientificName: "Carcharhinus leucas", habitat: "saltwater" },
  { id: "lake_sturgeon", labelRu: "Озёрный осётр",     labelEn: "Lake Sturgeon",      scientificName: "Acipenser fulvescens", habitat: "freshwater" },
  { id: "pagr",          labelRu: "Пагр",              labelEn: "Porgy",              scientificName: "Pagrus pagrus", habitat: "saltwater" },
  { id: "bluefish",      labelRu: "Луфарь",            labelEn: "Bluefish",           scientificName: "Pomatomus saltatrix", habitat: "saltwater" },
  { id: "false_albacore", labelRu: "Ложный альбакор",   labelEn: "False Albacore",     scientificName: "Euthynnus alletteratus", habitat: "saltwater" },
  { id: "atlantic_mackerel", labelRu: "Атлантическая скумбрия", labelEn: "Atlantic Mackerel", scientificName: "Scomber scombrus", habitat: "saltwater" },
  { id: "dogfish",       labelRu: "Катран",            labelEn: "Dogfish",            scientificName: "Squalus acanthias", habitat: "saltwater" },
  { id: "goby",          labelRu: "Бычок",             labelEn: "Round Goby",         scientificName: "Neogobius melanostomus", habitat: "freshwater" },
];

export function getSpeciesOptions(language: "ru" | "en" = "ru"): Array<{ id: string; label: string; labelRu: string; labelEn: string; scientificName: string; habitat: SpeciesHabitat }> {
  return speciesOptions
    .map(s => ({
      id: s.id,
      label: language === "ru" ? s.labelRu : s.labelEn,
      labelRu: s.labelRu,
      labelEn: s.labelEn,
      scientificName: s.scientificName,
      habitat: s.habitat,
    }))
    .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
}

export function getSpeciesHabitat(id?: string | null): SpeciesHabitat {
  if (!id) return "freshwater";
  const normalizedId = normalizeSpeciesKey(id);
  return speciesOptions.find((s) => normalizeSpeciesKey(s.id) === normalizedId)?.habitat ?? "freshwater";
}

function normalizeSpeciesKey(value: string): string {
  return value
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

export function getSpeciesLabel(id?: string | null, language: "ru" | "en" = "ru"): string {
  if (!id) return language === "ru" ? "Неизвестно" : "Unknown";
  const normalizedId = normalizeSpeciesKey(id);
  const f = speciesOptions.find((s) =>
    normalizeSpeciesKey(s.id) === normalizedId ||
    normalizeSpeciesKey(s.labelEn) === normalizedId ||
    normalizeSpeciesKey(s.labelRu) === normalizedId
  );
  if (!f) return id.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  return language === "ru" ? f.labelRu : f.labelEn;
}
