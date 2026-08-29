import { Text } from "@/components/AppText";
import { AppNewsItem, AppNewsLanguage } from "@/lib/appNews";
import { formatEuropeanDate } from "@/lib/dateFormat";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  items: AppNewsItem[];
  language: AppNewsLanguage;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onOpenLink: (url: string) => void;
};

const typeLabels: Record<AppNewsLanguage, Record<AppNewsItem["type"], string>> = {
  en: { update: "Update", promotion: "Promotion", announcement: "Announcement" },
  ru: { update: "Обновление", promotion: "Акция", announcement: "Новость" },
};

export default function AppNewsModal({
  visible,
  items,
  language,
  loading,
  refreshing,
  error,
  onClose,
  onRefresh,
  onOpenLink,
}: Props) {
  const ru = language === "ru";
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { paddingTop: Math.max(insets.top, theme.spacing.sm) }]}
        edges={["left", "right", "bottom"]}
        accessibilityViewIsModal
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={language === "ru" ? "Закрыть новости" : "Close news"}
          >
            <Ionicons name="close" size={24} color={theme.colors.text.primary} />
          </TouchableOpacity>
        </View>

        {loading && items.length === 0 ? (
          <View style={styles.centerState} accessibilityLabel={ru ? "Загрузка новостей" : "Loading news"}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error && items.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons name="cloud-offline-outline" size={46} color={theme.colors.text.muted} />
            <Text style={styles.stateTitle}>{ru ? "Не удалось загрузить новости" : "Couldn’t load news"}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh} accessibilityRole="button">
              <Text style={styles.retryText}>{ru ? "Повторить" : "Try again"}</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerState}>
            <Ionicons name="newspaper-outline" size={48} color={theme.colors.text.muted} />
            <Text style={styles.stateTitle}>{ru ? "Новостей пока нет" : "No news yet"}</Text>
            <Text style={styles.stateBody}>{ru ? "Загляните сюда позже." : "Check back again soon."}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
            renderItem={({ item }) => (
              <View style={styles.card}>
                {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" transition={180} /> : null}
                <View style={styles.cardBody}>
                  <View style={styles.metaRow}>
                    <View style={styles.typeChip}>
                      <Text style={styles.typeText}>{typeLabels[language][item.type]}</Text>
                    </View>
                    <Text style={styles.date}>{formatEuropeanDate(item.publishedAt)}</Text>
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                  {item.ctaUrl && item.ctaLabel ? (
                    <TouchableOpacity
                      style={styles.ctaButton}
                      onPress={() => onOpenLink(item.ctaUrl!)}
                      accessibilityRole="link"
                    >
                      <Text style={styles.ctaText}>{item.ctaLabel}</Text>
                      <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: theme.colors.surface },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  stateTitle: { marginTop: theme.spacing.sm, color: theme.colors.text.primary, fontFamily: theme.fonts.bodySemibold, fontSize: theme.fontSize.lg, textAlign: "center" },
  stateBody: { color: theme.colors.text.secondary, fontSize: theme.fontSize.base, textAlign: "center" },
  retryButton: { minHeight: 46, justifyContent: "center", marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.control, backgroundColor: theme.colors.primaryDark },
  retryText: { color: "#ffffff", fontFamily: theme.fonts.bodyBold, fontSize: theme.fontSize.base },
  list: { gap: theme.spacing.md, padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  card: { overflow: "hidden", borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.card, backgroundColor: theme.colors.surface },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.colors.surfaceRaised },
  cardBody: { padding: theme.spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.pill, backgroundColor: theme.colors.primaryMuted },
  typeText: { color: theme.colors.primary, fontFamily: theme.fonts.bodyBold, fontSize: 11, textTransform: "uppercase" },
  date: { color: theme.colors.text.muted, fontSize: theme.fontSize.sm },
  cardTitle: { marginTop: 12, color: theme.colors.text.primary, fontFamily: theme.fonts.bodyBold, fontSize: theme.fontSize.xl, lineHeight: 27 },
  body: { marginTop: theme.spacing.sm, color: theme.colors.text.secondary, fontSize: theme.fontSize.base, lineHeight: 21 },
  ctaButton: { alignSelf: "flex-start", minHeight: 46, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.control, backgroundColor: theme.colors.primaryDark },
  ctaText: { color: "#ffffff", fontFamily: theme.fonts.bodyBold, fontSize: theme.fontSize.base },
});
