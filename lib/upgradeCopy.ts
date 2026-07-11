export function getUpgradeCopy(language: string) {
  const ru = language === "ru";
  return {
    activated: ru ? "Премиум активирован" : "Premium activated",
    restored: ru ? "Покупки восстановлены" : "Purchases restored",
    noneFound: ru ? "Покупки не найдены" : "No purchases found",
    sectionTitle: ru ? "Премиум" : "Premium",
    active: ru ? "Премиум активен" : "Premium active",
    manage: ru ? "Управление подпиской" : "Manage subscription",
    buy: ru ? "Купить Премиум" : "Buy Premium",
    benefit: ru ? "Значок верификации и премиум-функции" : "Verified badge & premium features",
    restoring: ru ? "Восстановление…" : "Restoring…",
    restore: ru ? "Восстановить покупки" : "Restore purchases",
    biteTitle: ru ? "Прогноз клёва — Премиум" : "Bite Forecast — Premium",
    biteSub: ru
      ? "Оценка клёва по ветру, давлению и погоде. Откройте с Премиум."
      : "A bite score from wind, pressure & conditions. Unlock with Premium.",
    biteButton: ru ? "Открыть Премиум" : "Unlock Premium",
  };
}
