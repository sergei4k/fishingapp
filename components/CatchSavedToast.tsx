import { Ionicons } from "@expo/vector-icons";
import type { BaseToastProps } from "react-native-toast-message";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/AppText";
import { useLanguage } from "@/lib/language";
import { theme } from "@/lib/theme";

/** A short, tactile confirmation reserved for a successfully saved catch. */
export default function CatchSavedToast({ text1 }: BaseToastProps) {
  const { language } = useLanguage();

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text1}
      style={styles.container}
    >
      <View style={styles.iconBox}>
        <Ionicons name="checkmark" size={20} color={theme.colors.bite} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{language === "ru" ? "УЛОВ В ЖУРНАЛЕ" : "FISHING LOG"}</Text>
        <Text style={styles.text}>{text1}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#071828",
    borderColor: "#1a3a52",
    borderRadius: theme.radius.card,
    borderWidth: 1,
    elevation: 10,
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  iconBox: {
    alignItems: "center",
    backgroundColor: "#052e16",
    borderRadius: theme.radius.pill,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  copy: { flex: 1, gap: 1 },
  eyebrow: {
    color: theme.colors.bite,
    fontFamily: theme.fonts.displaySemibold,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  text: { color: theme.colors.text.primary, fontSize: 15, fontWeight: "700" },
});
