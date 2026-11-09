import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StatusBar, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInRight, useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/AppText";
import { useLanguage } from "@/lib/language";
import { parsePhotoCatches } from "@/lib/photoCatches";
import { getSpeciesOptions } from "@/lib/species";
import speciesPhotos from "@/lib/speciesPhotos";
import { getCatches, type CatchItem } from "@/lib/storage";

type Chapter = "index" | "freshwater" | "saltwater" | "unknown";
type SpeciesGroup = { id: string; label: string; scientificName: string; habitat: Exclude<Chapter, "index">; catches: CatchItem[] };

export default function Journal() {
  const router = useRouter();
  const { language } = useLanguage();
  const ru = language === "ru";
  const reducedMotion = useReducedMotion();
  const [catches, setCatches] = useState<CatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [chapter, setChapter] = useState<Chapter>("index");
  const [caughtOnly, setCaughtOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    const entry = StatusBar.pushStackEntry({ barStyle: "dark-content" });
    return () => StatusBar.popStackEntry(entry);
  }, []));

  useFocusEffect(useCallback(() => {
    let active = true;
    void getCatches().then((items) => { if (active) { setCatches(items); setLoading(false); } });
    return () => { active = false; };
  }, []));

  const groups = useMemo(() => {
    const options = getSpeciesOptions(language);
    const result = new Map<string, SpeciesGroup>(options.filter((option) => !["spongebob", "patrick"].includes(option.id)).map((option) => [option.id, { id: option.id, label: option.label, scientificName: option.scientificName, habitat: option.habitat, catches: [] }]));
    const sorted = [...catches].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    for (const item of sorted) {
      const photoSpecies = parsePhotoCatches(item.photoCatches ?? item.photo_catches).map((entry) => entry?.species).filter((value): value is string => !!value?.trim());
      const values = [...new Set(photoSpecies.length ? photoSpecies : item.species?.trim() ? [item.species] : [])];
      if (!values.length) values.push("");
      const seen = new Set<string>();
      for (const value of values) {
        const option = options.find((species) => [species.id, species.labelEn, species.labelRu].some((name) => name.toLowerCase() === value.toLowerCase()));
        const id = option?.id ?? (value ? `other:${value.toLowerCase()}` : "unknown");
        if (seen.has(id)) continue;
        seen.add(id);
        const group = result.get(id) ?? { id, label: option?.label ?? (value || (ru ? "Без вида" : "Unidentified")), scientificName: option?.scientificName ?? "", habitat: option?.habitat ?? "unknown", catches: [] };
        group.catches.push(item);
        result.set(id, group);
      }
    }
    return [...result.values()].sort((a, b) => a.label.localeCompare(b.label, language === "ru" ? "ru" : "en"));
  }, [catches, language, ru]);

  const selectedGroup = groups.find((group) => group.id === selected);
  const visibleGroups = groups.filter((group) => (chapter === "index" || group.habitat === chapter) && (!caughtOnly || group.catches.length > 0));
  const goBack = useCallback(() => {
    if (selected) { setSelected(null); return true; }
    if (chapter !== "index") { setChapter("index"); return true; }
    if (router.canGoBack()) router.back(); else router.replace("/(tabs)/profile");
    return true;
  }, [chapter, router, selected]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => subscription.remove();
  }, [goBack]));

  const title = selectedGroup?.habitat === "freshwater" ? (ru ? "Пресная вода" : "Freshwater") : selectedGroup?.habitat === "saltwater" ? (ru ? "Морская вода" : "Saltwater") : (ru ? "Без определения" : "Unidentified");
  const imageUri = (item: CatchItem) => item.imageUrl ?? item.pbImageUrl ?? item.image;
  const dateLabel = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  };
  const countLabel = (count: number) => ru ? `Уловов: ${count}` : `${count} ${count === 1 ? "catch" : "catches"}`;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.topbar}>
        <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={ru ? "Назад" : "Go back"} style={styles.back}><Ionicons name="arrow-back" size={22} color="#39352c" /></Pressable>
        <Text style={styles.topTitle}>{ru ? "ДНЕВНИК РЫБОЛОВА" : "THE FISHING JOURNAL"}</Text>
        <View style={styles.back} />
      </View>
      <View style={styles.book}>
        <Animated.View key={`${chapter}:${selected ?? ""}`} entering={reducedMotion ? FadeIn.duration(120) : FadeInRight.duration(260)} style={styles.page}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pageContent}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>{ru ? "ПОЛЕВЫЕ ЗАМЕТКИ" : "FIELD NOTES"}</Text><Text style={styles.eyebrow}>{selected ? "03" : chapter === "index" ? "01" : "02"}</Text></View>
            {loading ? <ActivityIndicator color="#665a43" style={styles.loader} /> : selectedGroup ? (
              <>
                <Text style={styles.kicker}>{title}</Text>
                <Text style={styles.heading}>{selectedGroup.label}</Text>
                {!!selectedGroup.scientificName && <Text style={styles.scientific}>{selectedGroup.scientificName}</Text>}
                <View style={styles.rule} />
                <Text style={styles.body}>{countLabel(selectedGroup.catches.length)}</Text>
                <Text style={styles.sectionLabel}>{ru ? "ЗАПИСИ ОБ УЛОВАХ" : "CATCH RECORDS"}</Text>
                {selectedGroup.catches.map((item) => (
                  <View key={item.id} style={styles.record}>
                    {imageUri(item) ? <Image source={{ uri: imageUri(item) }} style={styles.recordPhoto} contentFit="cover" /> : <View style={[styles.recordPhoto, styles.photoEmpty]}><Ionicons name="image-outline" size={22} color="#81765f" /></View>}
                    <View style={styles.recordInfo}><Text style={styles.recordDate}>{dateLabel(item.date) || (ru ? "Дата не указана" : "Date unavailable")}</Text><Text style={styles.body}>{[item.length ? `${item.length} cm` : "", item.weight ? `${item.weight} kg` : ""].filter(Boolean).join("  ·  ") || (ru ? "Запись в журнале" : "A catch in your journal")}</Text></View>
                  </View>
                ))}
              </>
            ) : (
              <>
                <View style={styles.rule} />
                <View style={styles.stats}><View><Text style={styles.statNumber}>{visibleGroups.length}</Text><Text style={styles.statLabel}>{ru ? "ВИДОВ" : "SPECIES"}</Text></View><View style={styles.statDivider} /><View><Text style={styles.statNumber}>{catches.length}</Text><Text style={styles.statLabel}>{ru ? "УЛОВОВ" : "CATCHES"}</Text></View></View>
                <Text style={styles.sectionLabel}>{ru ? "КОЛЛЕКЦИЯ ВИДОВ" : "SPECIES COLLECTION"}</Text>
                <View style={styles.filters}>
                  {(["index", "freshwater", "saltwater"] as const).map((filter) => (
                    <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected: chapter === filter }} onPress={() => setChapter(filter)} style={[styles.filter, chapter === filter && styles.filterSelected]}>
                      <Text style={[styles.filterText, chapter === filter && styles.filterTextSelected]}>{filter === "index" ? (ru ? "Все" : "All") : filter === "freshwater" ? (ru ? "Пресные" : "Freshwater") : (ru ? "Морские" : "Saltwater")}</Text>
                    </Pressable>
                  ))}
                  <Pressable key="caughtOnly" accessibilityRole="button" accessibilityState={{ selected: caughtOnly }} onPress={() => setCaughtOnly(!caughtOnly)} style={[styles.filter, caughtOnly && styles.filterSelected]}>
                    <Text style={[styles.filterText, caughtOnly && styles.filterTextSelected]}>{ru ? "Только пойманные" : "Caught only"}</Text>
                  </Pressable>
                </View>
                <View style={styles.speciesGrid}>
                {visibleGroups.map((group) => {
                  const caught = group.catches.length > 0;
                  const art = speciesPhotos[group.id];
                  const hasSilhouette = art && group.id !== "atlantic_wolffish";
                  return <Pressable key={group.id} accessibilityRole="button" accessibilityState={{ disabled: !caught }} accessibilityLabel={`${group.label}, ${caught ? countLabel(group.catches.length) : (ru ? "ещё не пойман" : "not caught yet")}`} disabled={!group.catches.length} onPress={() => setSelected(group.id)} style={styles.speciesRow}>
                    <View style={styles.speciesArt}>{hasSilhouette || (art && caught) ? <Image source={art} style={[styles.fishImage, !caught && { tintColor: "#817b6e", opacity: 0.62 }]} contentFit="contain" /> : <Ionicons name="fish" size={36} color={caught ? "#716247" : "#a19a8c"} />}</View>
                    <Text style={[styles.speciesName, !caught && styles.uncaughtText]} numberOfLines={2}>{group.label}</Text><Text style={styles.speciesStatus}>{caught ? countLabel(group.catches.length) : (ru ? "Не пойман" : "Not caught")}</Text>
                  </Pressable>;
                })}
                </View>
              </>
            )}
            <View style={styles.footer}><View style={styles.footerLine} /><Text style={styles.footerText}>{ru ? "ВАШ ЛИЧНЫЙ ДНЕВНИК" : "A PERSONAL FIELD JOURNAL"}</Text><View style={styles.footerLine} /></View>
          </ScrollView>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#eee5d1" },
  topbar: { height: 56, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { color: "#625b4b", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  book: { flex: 1 },
  page: { flex: 1, backgroundColor: "#eee5d1", overflow: "hidden" },
  pageContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 28 },
  eyebrowRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 34 },
  eyebrow: { color: "#8a7a60", fontSize: 9, letterSpacing: 1.8, fontWeight: "700" },
  kicker: { color: "#8a7655", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 12 },
  heading: { color: "#302c25", fontFamily: "Georgia", fontSize: 38, lineHeight: 44 },
  intro: { color: "#6d6353", fontSize: 14, lineHeight: 21, marginTop: 14, maxWidth: 270 },
  scientific: { color: "#82745d", fontFamily: "Georgia", fontStyle: "italic", fontSize: 15, marginTop: 6 },
  scientificSmall: { color: "#82745d", fontFamily: "Georgia", fontStyle: "italic", fontSize: 12, marginTop: 3 },
  rule: { height: 1, backgroundColor: "#c8baa0", marginVertical: 24 },
  stats: { flexDirection: "row", alignItems: "center", gap: 30 },
  statNumber: { color: "#39352c", fontFamily: "Georgia", fontSize: 30 },
  statLabel: { color: "#8a7a60", fontSize: 9, fontWeight: "700", letterSpacing: 1.4, marginTop: 4 },
  statDivider: { height: 38, width: 1, backgroundColor: "#c8baa0" },
  sectionLabel: { color: "#8a7a60", fontSize: 10, fontWeight: "700", letterSpacing: 1.6, marginTop: 38, marginBottom: 12 },
  chapterRow: { minHeight: 78, borderBottomWidth: 1, borderColor: "#d5c9b2", flexDirection: "row", alignItems: "center", gap: 12 },
  chapterNumber: { color: "#aa9b80", fontFamily: "Georgia", fontSize: 12 },
  chapterIcon: { width: 42, height: 42, borderWidth: 1, borderColor: "#c6b99f", alignItems: "center", justifyContent: "center", borderRadius: 21 },
  chapterText: { flex: 1, minWidth: 0 },
  chapterTitle: { color: "#39352c", fontFamily: "Georgia", fontSize: 18 },
  chapterSub: { color: "#82745d", fontSize: 12, marginTop: 5 },
  chapterCount: { color: "#82745d", fontFamily: "Georgia", fontSize: 16 },
  filters: { flexDirection: "row", gap: 6, marginBottom: 12 },
  filter: { flexGrow: 1, minHeight: 44, paddingHorizontal: 8, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#c8baa0", borderRadius: 4 },
  filterSelected: { backgroundColor: "#5c604b", borderColor: "#5c604b" },
  filterText: { color: "#625b4b", fontSize: 11, fontWeight: "600" },
  filterTextSelected: { color: "#f5eddc" },
  speciesGrid: { flexDirection: "row", flexWrap: "wrap" },
  speciesRow: { width: "33.333%", alignItems: "center", paddingHorizontal: 3, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#d5c9b2" },
  speciesName: { color: "#39352c", fontFamily: "Georgia", fontSize: 13, textAlign: "center", minHeight: 34, marginTop: 4 },
  speciesStatus: { color: "#82745d", fontSize: 10, textAlign: "center", marginTop: 2 },
  speciesArt: { width: 82, height: 64, alignItems: "center", justifyContent: "center" },
  fishImage: { width: 82, height: 64 },
  uncaughtText: { color: "#8a8376" },
  speciesPhoto: { width: 76, height: 76, borderWidth: 4, borderColor: "#faf5e9" },
  photoEmpty: { backgroundColor: "#ded2ba", alignItems: "center", justifyContent: "center" },
  body: { color: "#6d6353", fontSize: 13, lineHeight: 19 },
  record: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderColor: "#d5c9b2" },
  recordPhoto: { width: 68, height: 68, borderWidth: 4, borderColor: "#faf5e9" },
  recordInfo: { flex: 1, gap: 5 },
  recordDate: { color: "#39352c", fontFamily: "Georgia", fontSize: 16 },
  empty: { color: "#746956", fontSize: 14, lineHeight: 22, marginTop: 22 },
  loader: { marginTop: 50 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: "auto", paddingTop: 48 },
  footerLine: { height: 1, flex: 1, backgroundColor: "#d5c9b2" },
  footerText: { color: "#9b8d74", fontSize: 8, letterSpacing: 1 },
});
