import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  mode?: "single" | "multiple";
  accessibilityHint?: string;
};

const CHECK_ICON_WIDTH = 22;
const CHECK_ICON_GAP = 8;

export function SelectableOption({ label, selected, onPress, mode = "multiple", accessibilityHint }: Props) {
  const selectionProgress = useSharedValue(selected ? 1 : 0);
  const checkIconStyle = useAnimatedStyle(() => {
    const progress = selectionProgress.value;
    return {
      width: CHECK_ICON_WIDTH * progress,
      marginLeft: CHECK_ICON_GAP * progress,
      opacity: progress,
      transform: [{ scale: 0.75 + (0.25 * progress) }],
    };
  });

  useEffect(() => {
    selectionProgress.value = withTiming(selected ? 1 : 0, {
      duration: selected ? 220 : 150,
      easing: Easing.out(Easing.cubic),
    });

    return () => cancelAnimation(selectionProgress);
  }, [selected, selectionProgress]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={mode === "single" ? "radio" : "checkbox"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <Text
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={3}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
      <Animated.View style={[styles.checkIcon, checkIconStyle]}>
        <Ionicons
          name="checkmark"
          size={CHECK_ICON_WIDTH}
          color="#ffffff"
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    alignSelf: "center",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryMuted,
  },
  label: {
    flexShrink: 1,
    flexGrow: 0,
    color: theme.colors.text.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
  },
  labelSelected: { color: "#ffffff" },
  checkIcon: { flexShrink: 0, overflow: "hidden" },
});
