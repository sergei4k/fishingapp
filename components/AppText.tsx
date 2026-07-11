import React from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextProps,
} from "react-native";

// Maps a React Native fontWeight onto the matching Inter face that we load at
// startup. Weights we don't bundle collapse onto the nearest one we do, so text
// never silently falls back to the system font.
const INTER_BY_WEIGHT: Record<string, string> = {
  "100": "Inter_300Light",
  "200": "Inter_300Light",
  "300": "Inter_300Light",
  "400": "Inter_400Regular",
  normal: "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
  bold: "Inter_700Bold",
  "800": "Inter_800ExtraBold",
  "900": "Inter_800ExtraBold",
};

function resolveFontFamily(flat: any): string {
  // An explicit fontFamily (e.g. the Oswald display face) always wins.
  if (flat?.fontFamily) return flat.fontFamily;
  const w = flat?.fontWeight != null ? String(flat.fontWeight) : "400";
  return INTER_BY_WEIGHT[w] ?? INTER_BY_WEIGHT["400"];
}

// Drop-in Text: applies the resolved family and strips fontWeight so Android
// doesn't synthesize a second layer of boldness on top of the weighted face.
export const Text = React.forwardRef<RNText, TextProps>((props, ref) => {
  const flat = StyleSheet.flatten(props.style) || {};
  const { fontWeight, ...clean } = flat as any;
  return <RNText ref={ref} {...props} style={[clean, { fontFamily: resolveFontFamily(flat) }]} />;
});
Text.displayName = "Text";

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>((props, ref) => {
  const flat = StyleSheet.flatten(props.style) || {};
  const { fontWeight, ...clean } = flat as any;
  return <RNTextInput ref={ref} {...props} style={[clean, { fontFamily: resolveFontFamily(flat) }]} />;
});
TextInput.displayName = "TextInput";

// Instance type aliases so `useRef<TextInput>()` / `useRef<Text>()` keep working
// (a value and a type may share a name within the same module).
export type Text = RNText;
export type TextInput = RNTextInput;
