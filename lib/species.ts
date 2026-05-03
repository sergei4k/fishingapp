export type SpeciesOption = { id: string; labelRu: string; labelEn: string; scientificName: string };

const speciesOptions: SpeciesOption[] = [
  { id: "pike",       labelRu: "Щука",     labelEn: "Pike",         scientificName: "Esox lucius" },
  { id: "perch",      labelRu: "Окунь",    labelEn: "Perch",        scientificName: "Perca fluviatilis" },
  { id: "carp",       labelRu: "Карп",     labelEn: "Carp",         scientificName: "Cyprinus carpio" },
  { id: "pikeperch",  labelRu: "Берш",     labelEn: "Pikeperch",    scientificName: "Sander volgensis" },
  { id: "sudak",      labelRu: "Судак",    labelEn: "Zander",       scientificName: "Sander lucioperca" },
  { id: "leshch",     labelRu: "Лещ",      labelEn: "Bream",        scientificName: "Abramis brama" },
  { id: "nalim",      labelRu: "Налим",    labelEn: "Burbot",       scientificName: "Lota lota" },
  { id: "som",        labelRu: "Сом",      labelEn: "Catfish",      scientificName: "Silurus glanis" },
  { id: "forel",      labelRu: "Форель",   labelEn: "Trout",        scientificName: "Oncorhynchus mykiss" },
  { id: "sig",        labelRu: "Сиг",      labelEn: "Whitefish",    scientificName: "Coregonus lavaretus" },
  { id: "kharius",    labelRu: "Хариус",   labelEn: "Grayling",     scientificName: "Thymallus thymallus" },
  { id: "gustera",    labelRu: "Густера",  labelEn: "Silver Bream", scientificName: "Blicca bjoerkna" },
  { id: "karas",      labelRu: "Карась",   labelEn: "Crucian Carp", scientificName: "Carassius carassius" },
  { id: "lin",        labelRu: "Линь",     labelEn: "Tench",        scientificName: "Tinca tinca" },
  { id: "golavl",     labelRu: "Голавль",  labelEn: "Chub",         scientificName: "Squalius cephalus" },
  { id: "yaz",        labelRu: "Язь",      labelEn: "Ide",          scientificName: "Leuciscus idus" },
  { id: "plotva",     labelRu: "Плотва",   labelEn: "Roach",        scientificName: "Rutilus rutilus" },
  { id: "sazan",      labelRu: "Сазан",    labelEn: "Common Carp",  scientificName: "Cyprinus carpio haematopterus" },
  { id: "rotan",      labelRu: "Ротан",    labelEn: "Amur Sleeper", scientificName: "Perccottus glenii" },
  { id: "peskar",     labelRu: "Пескарь",      labelEn: "Gudgeon",         scientificName: "Gobio gobio" },
  { id: "ukleya",     labelRu: "Уклея",        labelEn: "Bleak",           scientificName: "Alburnus alburnus" },
  { id: "zhereh",      labelRu: "Жерех",             labelEn: "Asp",              scientificName: "Aspius aspius" },
  { id: "bass",        labelRu: "Басс",              labelEn: "Largemouth Bass",  scientificName: "Micropterus salmoides" },
  { id: "stripedbass", labelRu: "Полосатый окунь",   labelEn: "Striped Bass",     scientificName: "Morone saxatilis" },
  { id: "losos",       labelRu: "Лосось",            labelEn: "Salmon",           scientificName: "Salmo salar" },
  { id: "sterlyad",    labelRu: "Стерлядь",          labelEn: "Sterlet",          scientificName: "Acipenser ruthenus" },
  { id: "taimen",      labelRu: "Таймень",           labelEn: "Taimen",           scientificName: "Hucho taimen" },
  { id: "lenok",       labelRu: "Ленок",             labelEn: "Lenok",            scientificName: "Brachymystax lenok" },
  { id: "nelma",       labelRu: "Нельма",            labelEn: "Nelma",            scientificName: "Stenodus leucichthys" },
  { id: "muksun",      labelRu: "Муксун",            labelEn: "Muksun",           scientificName: "Coregonus muksun" },
  { id: "chir",        labelRu: "Чир",               labelEn: "Broad Whitefish",  scientificName: "Coregonus nasus" },
  { id: "ryapushka",   labelRu: "Ряпушка",           labelEn: "Vendace",          scientificName: "Coregonus albula" },
  { id: "koryushka",   labelRu: "Корюшка",           labelEn: "Smelt",            scientificName: "Osmerus eperlanus" },
  { id: "krasnoperka", labelRu: "Краснопёрка",       labelEn: "Rudd",             scientificName: "Scardinius erythrophthalmus" },
  { id: "ersh",        labelRu: "Ёрш",               labelEn: "Ruffe",            scientificName: "Gymnocephalus cernua" },
  { id: "elec",        labelRu: "Елец",              labelEn: "Dace",             scientificName: "Leuciscus leuciscus" },
  { id: "chekhon",     labelRu: "Чехонь",            labelEn: "Ziege",            scientificName: "Pelecus cultratus" },
  { id: "sinec",       labelRu: "Синец",             labelEn: "White Bream",      scientificName: "Ballerus ballerus" },
  { id: "rybec",       labelRu: "Рыбец",             labelEn: "Vimba",            scientificName: "Vimba vimba" },
  { id: "tolstolobik", labelRu: "Толстолобик",       labelEn: "Silver Carp",      scientificName: "Hypophthalmichthys molitrix" },
  { id: "amur",        labelRu: "Белый амур",        labelEn: "Grass Carp",       scientificName: "Ctenopharyngodon idella" },
  { id: "podust",      labelRu: "Подуст",            labelEn: "Nase",             scientificName: "Chondrostoma nasus" },
  { id: "golec",       labelRu: "Голец",             labelEn: "Arctic Char",      scientificName: "Salvelinus alpinus" },
  { id: "okun_morskoy",  labelRu: "Морской окунь",   labelEn: "Sea Bass",           scientificName: "Dicentrarchus labrax" },
  { id: "sudak_morskoy", labelRu: "Морской судак",   labelEn: "Walleye",            scientificName: "Sander vitreus" },
  { id: "kambala",       labelRu: "Камбала",           labelEn: "European Flounder",  scientificName: "Platichthys flesus" },
  { id: "tarpon",        labelRu: "Тарпон",            labelEn: "Tarpon",             scientificName: "Megalops atlanticus" },
  { id: "brook_trout",   labelRu: "Ручьевая форель",   labelEn: "Brook Trout",        scientificName: "Salvelinus fontinalis" },
  { id: "bull_shark",    labelRu: "Бычья акула",       labelEn: "Bull Shark",         scientificName: "Carcharhinus leucas" },
  { id: "lake_sturgeon", labelRu: "Озёрный осётр",     labelEn: "Lake Sturgeon",      scientificName: "Acipenser fulvescens" },
  { id: "pagr",          labelRu: "Пагр",              labelEn: "Porgy",              scientificName: "Pagrus pagrus" },
];

export function getSpeciesOptions(language: "ru" | "en" = "ru"): Array<{ id: string; label: string; labelRu: string; labelEn: string; scientificName: string }> {
  return speciesOptions.map(s => ({
    id: s.id,
    label: language === "ru" ? s.labelRu : s.labelEn,
    labelRu: s.labelRu,
    labelEn: s.labelEn,
    scientificName: s.scientificName,
  }));
}

export function getSpeciesLabel(id?: string | null, language: "ru" | "en" = "ru"): string {
  if (!id) return language === "ru" ? "Неизвестно" : "Unknown";
  const f = speciesOptions.find((s) => s.id === id);
  if (!f) return id;
  return language === "ru" ? f.labelRu : f.labelEn;
}