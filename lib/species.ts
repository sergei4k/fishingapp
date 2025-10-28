export type SpeciesOption = { id: string; label: string };

const speciesOptions: SpeciesOption[] = [
  { id: "pike", label: "Щука" },
  { id: "perch", label: "Окунь" },
  { id: "carp", label: "Карп" },
  { id: "pikeperch", label: "Берш" },
  { id: "sudak", label: "Судак" },
  { id: "leshch", label: "Лещ" },
  { id: "nalim", label: "Налим" },
  { id: "som", label: "Сом" },
  { id: "forel", label: "Форель" },
  { id: "sig", label: "Сиг" },
  { id: "kharius", label: "Хариус" },
  { id: "gustera", label: "Густера" },
  { id: "karas", label: "Карась" },
  { id: "lin", label: "Линь" },
  { id: "golavl", label: "Голавль" },
  { id: "yaz", label: "Язь" },
  { id: "plotva", label: "Плотва" },
  { id: "sazan", label: "Сазан" },
  { id: "rotan", label: "Ротан" },
  { id: "peskar", label: "Пескарь" },
  { id: "ukleya", label: "Уклея" },
];

export function getSpeciesOptions(): SpeciesOption[] {
  return speciesOptions;
}

export function getSpeciesLabel(id?: string | null): string {
  if (!id) return "Неизвестно";
  const f = speciesOptions.find((s) => s.id === id);
  return f ? f.label : id;
}