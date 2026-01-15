import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type Language = "ru" | "en";

const LANGUAGE_KEY = "@fishingapp:language";

const translations = {
  ru: {
    settings: "Настройки",
    general: "Общие",
    notifications: "Уведомления",
    language: "Язык",
    data: "Данные",
    exportData: "Экспорт данных",
    clearAllData: "Очистить все данные",
    about: "О приложении",
    version: "Версия",
    privacyPolicy: "Политика конфиденциальности",
    myCatches: "Мой Улов",
    noDescription: "Без описания",
    edit: "Редактировать",
    save: "Сохранить",
    cancel: "Отмена",
    delete: "Удалить",
    description: "Описание",
    length: "Длина (cm)",
    weight: "Вес (kg)",
    showOnMap: "Показать на карте",
    empty: "Здесь пусто. Иди на рыбалку!",
    deleteConfirm: "Удалить запись",
    deleteConfirmMessage: "Вы уверены, что хотите удалить эту запись?",
    deleteError: "Не удалось удалить запись.",
    saveError: "Не удалось сохранить изменения",
    noCoordinates: "Нет координат",
    noCoordinatesMessage: "У этого улова нет сохранённых координат.",
    error: "Ошибка",
    locationPermission: "Разрешение на местоположение",
    locationPermissionMessage: "Для отображения вашего местоположения на карте необходимо предоставить разрешение",
    addPhoto: "Добавить фото",
    descriptionPlaceholder: "Описание",
    lengthPlaceholder: "Длина (см)",
    weightPlaceholder: "Вес (кг)",
    species: "Вид",
    more: "Ещё",
    selectedSpecies: "Выбран",
    speciesNotSelected: "Вид не выбран",
    uploading: "Загрузка...",
    upload: "Выложить",
    selectSpecies: "Выберите вид",
    gpsNotFound: "GPS не найден",
    gpsNotFoundMessage: "Фото не содержит геоданных. Убедитесь, что фото было сделано с включённой геолокацией.",
    photoError: "Не удалось выбрать фото или прочитать EXIF.",
    noCoordinatesInPhoto: "Нет координат в фото",
    noCoordinatesInPhotoMessage: "Фото не содержит GPS данных. Выберите фото с геолокацией.",
    uploadError: "Не удалось сохранить улов.",
    recently: "Недавно",
    appTitle: "Rybolov - твой портал в мир рыбалки 🎣🌍",
    appDescription: "Добавляй свои уловы с помощью фото чтобы они отображались на карте. Нажми на иконку рыбы чтобы увидеть детали улова. Записывай длину, вес, вид рыбы и описание. Удачной рыбалки!",
    unknown: "Неизвестно",
  },
  en: {
    settings: "Settings",
    general: "General",
    notifications: "Notifications",
    language: "Language",
    data: "Data",
    exportData: "Export Data",
    clearAllData: "Clear All Data",
    about: "About",
    version: "Version",
    privacyPolicy: "Privacy Policy",
    myCatches: "My Catches",
    noDescription: "No description",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    description: "Description",
    length: "Length (cm)",
    weight: "Weight (kg)",
    showOnMap: "Show on Map",
    empty: "It's empty here. Go fishing!",
    deleteConfirm: "Delete Record",
    deleteConfirmMessage: "Are you sure you want to delete this record?",
    deleteError: "Failed to delete record.",
    saveError: "Failed to save changes",
    noCoordinates: "No Coordinates",
    noCoordinatesMessage: "This catch has no saved coordinates.",
    error: "Error",
    locationPermission: "Location Permission",
    locationPermissionMessage: "To display your location on the map, you need to grant permission",
    addPhoto: "Add Photo",
    descriptionPlaceholder: "Description",
    lengthPlaceholder: "Length (cm)",
    weightPlaceholder: "Weight (kg)",
    species: "Species",
    more: "More",
    selectedSpecies: "Selected",
    speciesNotSelected: "Species not selected",
    uploading: "Uploading...",
    upload: "Upload",
    selectSpecies: "Select Species",
    gpsNotFound: "GPS Not Found",
    gpsNotFoundMessage: "Photo does not contain geodata. Make sure the photo was taken with geolocation enabled.",
    photoError: "Failed to select photo or read EXIF.",
    noCoordinatesInPhoto: "No Coordinates in Photo",
    noCoordinatesInPhotoMessage: "Photo does not contain GPS data. Select a photo with geolocation.",
    uploadError: "Failed to save catch.",
    recently: "Recently",
    appTitle: "Rybolov - your portal to the world of fishing 🎣🌍",
    appDescription: "Add your catches with photos so they appear on the map. Tap the fish icon to see catch details. Record length, weight, fish species and description. Happy fishing!",
    unknown: "Unknown",
  },
};

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: keyof typeof translations.en) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ru");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (saved === "en" || saved === "ru") {
        setLanguageState(saved);
      }
    } catch (error) {
      console.error("Failed to load language:", error);
    } finally {
      setLoading(false);
    }
  };

  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      setLanguageState(lang);
    } catch (error) {
      console.error("Failed to save language:", error);
    }
  };

  const t = (key: keyof typeof translations.en): string => {
    return translations[language][key] || key;
  };

  if (loading) {
    return null; // or a loading spinner
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
