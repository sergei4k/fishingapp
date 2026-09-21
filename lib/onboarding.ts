export const ONBOARDING_GOALS = [
  "log_catches",
  "discover_spots",
  "follow_anglers",
  "plan_trips",
] as const;

export const FISHING_STYLES = [
  "spinning",
  "float_feeder",
  "feeder",
  "bobber",
  "fly",
  "ice",
  "sea",
  "other",
] as const;

export const ONBOARDING_REFERRAL_SOURCES = [
  "instagram",
  "app_store_feed",
  "play_store_feed",
  "vkontakte",
  "threads",
  "google_search",
  "yandex",
  "friend",
  "other",
] as const;

export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];
export type FishingStyle = (typeof FISHING_STYLES)[number];
export type OnboardingReferralSource = (typeof ONBOARDING_REFERRAL_SOURCES)[number];
export type PreferredStartTab = "index" | "social" | "add" | "weather";

export type OnboardingLocation = {
  city?: string;
  region?: string;
  country?: string;
  longitude?: number | null;
  latitude?: number | null;
};

export type OnboardingPreferencesInput = {
  primaryGoal?: unknown;
  fishingStyles?: unknown;
  location?: OnboardingLocation | null;
  referralSource?: unknown;
  referralSourceOther?: unknown;
};

export type OnboardingPreferences = {
  primaryGoal: OnboardingGoal;
  fishingStyles: FishingStyle[];
  preferredStartTab: PreferredStartTab;
  referralSource: OnboardingReferralSource | "";
  referralSourceOther: string;
  location: {
    city: string;
    region: string;
    country: string;
    longitude: number | null;
    latitude: number | null;
  };
};

const GOAL_TO_TAB: Record<OnboardingGoal, PreferredStartTab> = {
  log_catches: "add",
  discover_spots: "index",
  follow_anglers: "social",
  plan_trips: "weather",
};

const TAB_TO_ROUTE: Record<PreferredStartTab, string> = {
  index: "/(tabs)",
  social: "/(tabs)/social",
  add: "/(tabs)/add",
  weather: "/(tabs)/weather",
};

const goalSet = new Set<string>(ONBOARDING_GOALS);
const fishingStyleSet = new Set<string>(FISHING_STYLES);
const referralSourceSet = new Set<string>(ONBOARDING_REFERRAL_SOURCES);

function cleanText(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanCoordinate(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

export function getPreferredStartTab(goal: unknown): PreferredStartTab {
  const normalizedGoal: OnboardingGoal = typeof goal === "string" && goalSet.has(goal)
    ? goal as OnboardingGoal
    : "discover_spots";
  return GOAL_TO_TAB[normalizedGoal];
}

export function getPreferredStartRoute(goal: unknown): string {
  return TAB_TO_ROUTE[getPreferredStartTab(goal)];
}

export function getPublicCity(location: OnboardingLocation | null | undefined): string {
  return cleanText(location?.city, 80) || cleanText(location?.region, 80);
}

export function needsOnboarding(user: unknown): boolean {
  return Boolean(user && typeof user === "object" && (user as { onboarding_pending?: unknown }).onboarding_pending === true);
}

export function normalizeOnboardingPreferences(input: OnboardingPreferencesInput): OnboardingPreferences {
  const primaryGoal: OnboardingGoal = typeof input.primaryGoal === "string" && goalSet.has(input.primaryGoal)
    ? input.primaryGoal as OnboardingGoal
    : "discover_spots";

  const rawStyles = Array.isArray(input.fishingStyles) ? input.fishingStyles : [];
  const fishingStyles = [...new Set(rawStyles)]
    .filter((style): style is FishingStyle => typeof style === "string" && fishingStyleSet.has(style));
  const referralSource: OnboardingReferralSource | "" = typeof input.referralSource === "string" && referralSourceSet.has(input.referralSource)
    ? input.referralSource as OnboardingReferralSource
    : "";
  const referralSourceOther = referralSource === "other" ? cleanText(input.referralSourceOther) : "";

  return {
    primaryGoal,
    fishingStyles,
    preferredStartTab: getPreferredStartTab(primaryGoal),
    referralSource,
    referralSourceOther,
    location: {
      city: cleanText(input.location?.city, 80),
      region: cleanText(input.location?.region, 120),
      country: cleanText(input.location?.country, 120),
      longitude: cleanCoordinate(input.location?.longitude, -180, 180),
      latitude: cleanCoordinate(input.location?.latitude, -90, 90),
    },
  };
}
