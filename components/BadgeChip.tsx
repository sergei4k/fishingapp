import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/AppText";
import { BADGES, BadgeId } from "@/lib/badges";

type Props = {
  badges: BadgeId[];
  language?: string;
  iconOnly?: boolean;
};

export default function BadgeChip({ badges, language = "ru", iconOnly = false }: Props) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeId | null>(null);
  const badge = selectedBadge ? BADGES[selectedBadge] : null;

  if (!badges.length) return null;
  return (
    <>
      <View style={styles.row}>
        {badges.map((id) => {
          const b = BADGES[id];
          const label = language === "ru" ? b.labelRu : b.labelEn;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.chip, { backgroundColor: b.bg }, iconOnly && styles.chipIcon]}
              onPress={() => setSelectedBadge(id)}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={language === "ru" ? `Подробнее о значке «${label}»` : `Learn about the ${label} badge`}
            >
              <Ionicons name={b.icon} size={iconOnly ? 15 : 12} color={b.color} />
              {!iconOnly && <Text style={[styles.label, { color: b.color }]}>{label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal transparent visible={!!badge} animationType="fade" onRequestClose={() => setSelectedBadge(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedBadge(null)}>
          <Pressable style={styles.dialog} onPress={() => undefined} accessibilityViewIsModal>
            {badge ? (
              <>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setSelectedBadge(null)}
                  accessibilityRole="button"
                  accessibilityLabel={language === "ru" ? "Закрыть" : "Close"}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color="#94a3b8" />
                </TouchableOpacity>
                <View style={[styles.dialogIcon, { backgroundColor: badge.bg }]}>
                  <Ionicons name={badge.icon} size={24} color={badge.color} />
                </View>
                <Text style={styles.dialogTitle}>{language === "ru" ? badge.labelRu : badge.labelEn}</Text>
                <Text style={styles.dialogDescription}>{language === "ru" ? badge.descriptionRu : badge.descriptionEn}</Text>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  chipIcon: {
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2, 6, 23, 0.72)",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e3a5f",
    backgroundColor: "#0f1e33",
    padding: 24,
    position: "relative",
  },
  dialogIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
  },
  dialogTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
  },
  dialogDescription: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
});
