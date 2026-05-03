import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { pb } from "./pocketbase";

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
    unknown: "Неизвестно",
    login: "Вход",
    register: "Регистрация",
    loginSubtitle: "Войдите чтобы сохранить ваши уловы",
    registerSubtitle: "Создайте аккаунт чтобы начать",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Пароль",
    namePlaceholder: "Имя",
    usernamePlaceholder: "Имя пользователя",
    loginButton: "Войти",
    registerButton: "Зарегистрироваться",
    noAccount: "Нет аккаунта?",
    hasAccount: "Уже есть аккаунт?",
    registerLink: "Зарегистрироваться",
    loginLink: "Войти",
    fillAllFields: "Заполните все поля",
    passwordTooShort: "Пароль должен содержать не менее 6 символов",
    confirmPasswordPlaceholder: "Подтвердите пароль",
    passwordsDoNotMatch: "Пароли не совпадают",
    passwordHint: "Минимум 6 символов",
    registerSuccess: "Регистрация успешна",
    registerSuccessMessage: "Вы зарегестрированы. Добро пожаловать!",
    signOut: "Выйти",
    signOutConfirm: "Выход",
    signOutConfirmMessage: "Вы уверены, что хотите выйти?",
    account: "Аккаунт",
    makePublic: "Сделать публичным",
    makePublicSub: "Другие пользователи увидят улов на карте",
    discover: "Лента",
    findAnglers: "Найти рыбаков",
    following: "Подписки",
    follow: "Подписаться",
    followingBtn: "Вы подписаны",
    signInToFollow: "Войдите, чтобы находить и подписываться на других рыбаков",
    noUsersFound: "Пользователи не найдены",
    searchPlaceholder: "Поиск по имени пользователя...",
    followToSeeCatches: "Подпишитесь на рыбаков, чтобы видеть их уловы здесь",
    noFollowingCatches: "У подписок пока нет уловов",
    publicCatches: "улова",
    publicCatchesTitle: "Публичные уловы",
    noPublicCatches: "Публичных уловов пока нет",
    welcome: "Добро пожаловать",
    welcomeSubtitle: "Найди свой круг общения",
    languageChanged: "Язык изменён",
    languageChangedMessage: "Язык приложения изменён. Перезапустите приложение, чтобы увидеть все изменения.",
    addComment: "Добавить комментарий...",
    registeringAgree: "Регистрируясь, вы соглашаетесь с нашей",
    deleteAccount: "Удалить аккаунт",
    deleteAccountMessage: "Это действие необратимо. Все ваши данные и уловы будут удалены навсегда.",
    deleteAccountError: "Не удалось удалить аккаунт. Попробуйте позже.",
    deleteAccountHint: "Вы можете удалить аккаунт в любое время в Настройках.",
    gear: "Снасть",
    gearNotSelected: "Снасть не выбрана",
    selectedGear: "Выбрана",
    selectGear: "Выберите снасть",
    gearCategoryLure: "Приманки",
    gearCategoryBait: "Наживка",
    gearCategoryRig: "Оснастка",
    forgotPassword: "Забыли пароль?",
    resetPassword: "Сбросить пароль",
    resetPasswordSent: "Письмо отправлено",
    resetPasswordSentMessage: "Проверьте почту и перейдите по ссылке для сброса пароля.",
    resetPasswordError: "Не удалось отправить письмо. Проверьте email и попробуйте снова.",
    resetEmailPlaceholder: "Введите ваш email",
    detectingWater: "Определение водоёма...",
    waterBody: "Водоём",
    pressureSteady: "Стабильное",
    pressureRising: "Растёт",
    pressureFalling: "Падает",
    fishFeedingActive: "Активный клёв",
    fishNormalActivity: "Обычная активность",
    fishGoDeep: "Рыба уходит в глубину",
    fishingExcellent: "Отлично",
    fishingGood: "Хорошо",
    fishingFair: "Удовлетворительно",
    fishingPoor: "Плохо",
    waveCalm: "Штиль",
    waveSlight: "Слабое волнение",
    waveModerate: "Умеренное волнение",
    waveRough: "Сильное волнение",
    waveVeryRough: "Очень сильное волнение",
    daySun: "Вс",
    dayMon: "Пн",
    dayTue: "Вт",
    dayWed: "Ср",
    dayThu: "Чт",
    dayFri: "Пт",
    daySat: "Сб",
    weatherClear: "Ясно",
    weatherCloudy: "Облачно",
    weatherFog: "Туман",
    weatherDrizzle: "Морось",
    weatherRain: "Дождь",
    weatherSnow: "Снег",
    weatherShowers: "Ливень",
    weatherSnowShowers: "Снегопад",
    weatherStorm: "Гроза",
    fishingConditions: "Клев",
    hourlyForecast: "Почасовой прогноз",
    weekForecast: "Прогноз на неделю",
    currentLocation: "Текущее местоположение",
    today: "Сегодня",
    now: "Сейчас",
    pressure: "Давление",
    seaConditions: "Морские условия",
    waveHeight: "Высота волны",
    wavePeriod: "Период волны",
    waveDir: "Направление",
    tides: "Приливы и отливы",
    highTide: "Прилив",
    lowTide: "Отлив",
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
    unknown: "Unknown",
    login: "Sign In",
    register: "Sign Up",
    loginSubtitle: "Sign in to save your catches",
    registerSubtitle: "Create an account to get started",
    emailPlaceholder: "Email",
    passwordPlaceholder: "Password",
    namePlaceholder: "Full Name",
    usernamePlaceholder: "Username",
    loginButton: "Sign In",
    registerButton: "Sign Up",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    registerLink: "Sign Up",
    loginLink: "Sign In",
    fillAllFields: "Please fill in all fields",
    passwordTooShort: "Password must be at least 6 characters",
    confirmPasswordPlaceholder: "Confirm Password",
    passwordsDoNotMatch: "Passwords do not match",
    passwordHint: "At least 6 characters",
    registerSuccess: "Registration Successful",
    registerSuccessMessage: "Check your email to confirm your account",
    signOut: "Sign Out",
    signOutConfirm: "Sign Out",
    signOutConfirmMessage: "Are you sure you want to sign out?",
    account: "Account",
    makePublic: "Make public",
    makePublicSub: "Visible to other users on the map",
    discover: "Discover",
    findAnglers: "Find Anglers",
    following: "Following",
    follow: "Follow",
    followingBtn: "Following",
    signInToFollow: "Sign in to find and follow other anglers",
    noUsersFound: "No users found",
    searchPlaceholder: "Search by username or name...",
    followToSeeCatches: "Follow anglers to see their catches here",
    noFollowingCatches: "No catches from people you follow yet",
    publicCatches: "public catches",
    publicCatchesTitle: "Public catches",
    noPublicCatches: "No public catches yet",
    welcome: "Welcome",
    welcomeSubtitle: "Find your fishing community",
    languageChanged: "Language Changed",
    languageChangedMessage: "The app language has been changed. Please restart the app to see all changes.",
    addComment: "Add a comment...",
    registeringAgree: "By registering, you agree to our",
    deleteAccount: "Delete Account",
    deleteAccountMessage: "This action is irreversible. All your data and catches will be permanently deleted.",
    deleteAccountError: "Failed to delete account. Please try again later.",
    deleteAccountHint: "You can delete your account at any time in Settings.",
    gear: "Gear",
    gearNotSelected: "No gear selected",
    selectedGear: "Selected",
    selectGear: "Select Gear",
    gearCategoryLure: "Lures",
    gearCategoryBait: "Bait",
    gearCategoryRig: "Rigs",
    forgotPassword: "Forgot password?",
    resetPassword: "Reset Password",
    resetPasswordSent: "Email Sent",
    resetPasswordSentMessage: "Check your inbox and follow the link to reset your password.",
    resetPasswordError: "Could not send email. Check the address and try again.",
    resetEmailPlaceholder: "Enter your email",
    detectingWater: "Detecting water body...",
    waterBody: "Water body",
    pressureSteady: "Steady",
    pressureRising: "Rising",
    pressureFalling: "Falling",
    fishFeedingActive: "Feeding active",
    fishNormalActivity: "Normal activity",
    fishGoDeep: "Fish go deep",
    fishingExcellent: "Excellent",
    fishingGood: "Good",
    fishingFair: "Fair",
    fishingPoor: "Poor",
    waveCalm: "Calm",
    waveSlight: "Slight",
    waveModerate: "Moderate",
    waveRough: "Rough",
    waveVeryRough: "Very Rough",
    daySun: "Sun",
    dayMon: "Mon",
    dayTue: "Tue",
    dayWed: "Wed",
    dayThu: "Thu",
    dayFri: "Fri",
    daySat: "Sat",
    weatherClear: "Clear",
    weatherCloudy: "Cloudy",
    weatherFog: "Foggy",
    weatherDrizzle: "Drizzle",
    weatherRain: "Rain",
    weatherSnow: "Snow",
    weatherShowers: "Showers",
    weatherSnowShowers: "Snow showers",
    weatherStorm: "Thunderstorm",
    fishingConditions: "Fishing Conditions",
    hourlyForecast: "Hourly Forecast",
    weekForecast: "7-Day Forecast",
    currentLocation: "Current Location",
    today: "Today",
    now: "Now",
    pressure: "Pressure",
    seaConditions: "Sea Conditions",
    waveHeight: "Wave Height",
    wavePeriod: "Wave Period",
    waveDir: "Direction",
    tides: "Tides",
    highTide: "High",
    lowTide: "Low",
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

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      const userId = pb.authStore.record?.id;
      if (!userId) return;

      const remote = pb.authStore.record?.language;
      if (remote === language) return;

      pb.collection("users").update(userId, { language }).catch((error) => {
        console.error("Failed to sync language on auth change:", error);
      });
    }, true);

    return () => unsub();
  }, [language]);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
      const remote = pb.authStore.record?.language;
      const chosen = remote === "en" || remote === "ru"
        ? remote
        : saved === "en" || saved === "ru"
          ? saved
          : "ru";

      setLanguageState(chosen);
      await AsyncStorage.setItem(LANGUAGE_KEY, chosen);

      const userId = pb.authStore.record?.id;
      if (userId && remote !== chosen) {
        try {
          await pb.collection("users").update(userId, { language: chosen });
        } catch (error) {
          console.error("Failed to sync remote language:", error);
        }
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
      const userId = pb.authStore.record?.id;
      if (userId) {
        try {
          await pb.collection("users").update(userId, { language: lang });
        } catch (error) {
          console.error("Failed to save remote language:", error);
        }
      }
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
