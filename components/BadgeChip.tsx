import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { BADGES, BadgeId } from "@/lib/badges";

type Props = {
  badges: BadgeId[];
  language?: string;
  iconOnly?: boolean;
};

export default function BadgeChip({ badges, language = "ru", iconOnly = false }: Props) {
  if (!badges.length) return null;
  return (
    <View style={styles.row}>
      {badges.map((id) => {
        const b = BADGES[id];
        return (
          <View key={id} style={[styles.chip, { backgroundColor: b.bg }, iconOnly && styles.chipIcon]}>
            <Text style={iconOnly ? styles.emojiLg : styles.emoji}>{b.emoji}</Text>
            {!iconOnly && (
              <Text style={[styles.label, { color: b.color }]}>
                {language === "ru" ? b.labelRu : b.labelEn}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  emoji: {
    fontSize: 12,
  },
  emojiLg: {
    fontSize: 15,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
