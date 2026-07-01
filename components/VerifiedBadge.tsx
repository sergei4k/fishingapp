import { Ionicons } from "@expo/vector-icons";
import React from "react";

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color="#1d9bf0" />;
}
