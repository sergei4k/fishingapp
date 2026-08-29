import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AvatarPreviewModalProps = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

export default function AvatarPreviewModal({ visible, uri, onClose }: AvatarPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const imageUri = uri ?? undefined;

  return (
    <Modal visible={visible && !!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Image source={{ uri: imageUri }} contentFit="contain" style={styles.image} />
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo preview"
        >
          <Ionicons name="close" size={30} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
});
