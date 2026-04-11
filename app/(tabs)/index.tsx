// MUST be the first import
import "react-native-gesture-handler";

import { useLanguage } from "@/lib/language";
import { getSpeciesLabel } from "@/lib/species";
import { getCatches } from "@/lib/storage";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { FontAwesome } from "@expo/vector-icons";
import MapboxGL from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
import { SafeAreaView } from "react-native-safe-area-context";


MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const STYLE_URL = "mapbox://styles/mapbox/satellite-streets-v12";

type CatchMarker = {
  id: number;
  lat: number;
  lon: number;
  image_uri: string | null;
  species: string | null;
  description: string | null;
  length_cm: number | null;
  weight_kg: number | null;
  created_at: number;
};



export default function Map() {
  const { focusLat, focusLon, catchId } = useLocalSearchParams<{
    focusLat?: string;
    focusLon?: string;
    catchId?: string;
  }>();

  const { language, t } = useLanguage();
  const { user } = useAuth();
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const mapReadyRef = useRef(false);

  const [markers, setMarkers] = useState<CatchMarker[]>([]);
  const [publicMarkers, setPublicMarkers] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [centerCoord] = useState<[number, number]>([37.618423, 55.751244]);
  const zoomLevelRef = useRef(10);

  const [previewCatch, setPreviewCatch] = useState<any>(null);
  const [detailCatch, setDetailCatch] = useState<any>(null);
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [fullscreenPhotos, setFullscreenPhotos] = useState<string[]>([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const fullscreenScrollRef = useRef<ScrollView>(null);
  const [highlightedCatchId, setHighlightedCatchId] = useState<string | null>(null);

  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likeId, setLikeId] = useState<string | null>(null);
  const [catchComments, setCatchComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(false);

  // ─── Likes & Comments ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!detailCatch) return;
    const catchId = String(detailCatch.id);
    setLikeCount(0);
    setIsLiked(false);
    setLikeId(null);
    setCatchComments([]);
    setNewComment("");
    setShowComments(false);
    (async () => {
      try {
        const [likesResult, commentsResult] = await Promise.all([
          pb.collection("likes").getFullList({ filter: `catch_id = "${catchId}"`, requestKey: null }),
          pb.collection("comments").getFullList({ filter: `catch_id = "${catchId}"`, sort: "created", requestKey: null }),
        ]);
        setLikeCount(likesResult.length);
        const myLike = likesResult.find((l: any) => l.user_id === user?.id);
        setIsLiked(!!myLike);
        setLikeId(myLike?.id ?? null);
        setCatchComments(commentsResult);
      } catch (e) {
        console.warn("fetchLikesAndComments error:", e);
      }
    })();
  }, [detailCatch?.id]);

  const toggleLike = async () => {
    if (!detailCatch || !user) return;
    const catchId = String(detailCatch.id);
    if (isLiked && likeId) {
      const prevId = likeId;
      setIsLiked(false);
      setLikeCount((c) => c - 1);
      setLikeId(null);
      try {
        await pb.collection("likes").delete(prevId);
      } catch (e) {
        setIsLiked(true);
        setLikeCount((c) => c + 1);
        setLikeId(prevId);
      }
    } else {
      setIsLiked(true);
      setLikeCount((c) => c + 1);
      try {
        const record = await pb.collection("likes").create({ catch_id: catchId, user_id: user.id });
        setLikeId(record.id);
      } catch (e) {
        setIsLiked(false);
        setLikeCount((c) => c - 1);
      }
    }
  };

  const submitComment = async () => {
    if (!newComment.trim() || !detailCatch || !user) return;
    const catchId = String(detailCatch.id);
    setSubmittingComment(true);
    try {
      const record = await pb.collection("comments").create({
        catch_id: catchId,
        user_id: user.id,
        username: user.username || user.name || "",
        text: newComment.trim(),
      });
      setCatchComments((prev) => [...prev, record]);
      setNewComment("");
    } catch (e) {
      console.warn("submitComment error:", e);
    } finally {
      setSubmittingComment(false);
    }
  };

  // ─── Location ────────────────────────────────────────────────────────────────

  useEffect(() => {
    requestLocation();
  }, []);

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("locationPermission"), t("locationPermissionMessage"));
        return;
      }
      // Try last-known first for instant map center
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last?.coords) {
        const coord: [number, number] = [last.coords.longitude, last.coords.latitude];
        setUserLocation(coord);
        cameraRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: 12, animationDuration: 0 });
        return;
      }
      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coord: [number, number] = [fresh.coords.longitude, fresh.coords.latitude];
      setUserLocation(coord);
      cameraRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: 12, animationDuration: 0 });
    } catch (e) {
      console.error("Location error:", e);
    }
  };

  const centerOnUser = () => {
    if (userLocation) {
      mapReadyRef.current && cameraRef.current?.setCamera({
        centerCoordinate: userLocation,
        zoomLevel: 14,
        animationDuration: 800,
        animationMode: "flyTo",
      });
    } else {
      requestLocation();
    }
  };

  // ─── Markers ─────────────────────────────────────────────────────────────────

  const refreshMarkers = useCallback(async () => {
    try {
      const items = await getCatches();
      const parsed: CatchMarker[] = items
        .filter((r) => r.lat != null && r.lon != null)
        .map((r) => ({
          id: Number(r.id),
          lat: Number(r.lat),
          lon: Number(r.lon),
          image_uri: r.image ?? null,
          species: r.species ?? null,
          description: r.description ?? null,
          length_cm: r.length ? Number(r.length) : null,
          weight_kg: r.weight ? Number(r.weight) : null,
          created_at: r.date ? new Date(r.date).getTime() : Date.now(),
        }));
      setMarkers(parsed);
    } catch (err) {
      console.error("refreshMarkers error:", err);
      setMarkers([]);
    }
  }, []);

  const refreshPublicMarkers = useCallback(async () => {
    try {
      const records = await pb.collection('catches').getFullList({
        filter: 'is_public = true',
        requestKey: null,
      });
      setPublicMarkers(
        records
          .filter((r: any) => r.user_id !== user?.id && r.lat != null && r.lon != null)
          .map((r: any) => ({
            ...r,
            image_uri: r.image
              ? `${pb.baseURL}/api/files/${r.collectionId}/${r.id}/${r.image}`
              : (r.image_uri || null),
          }))
      );
    } catch (e) {
      console.warn('Failed to fetch public markers:', e);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refreshMarkers();
      refreshPublicMarkers();
    }, [refreshMarkers, refreshPublicMarkers])
  );

  useEffect(() => {
    refreshMarkers();
    refreshPublicMarkers();
  }, [refreshMarkers, refreshPublicMarkers]);

  // ─── Focus on navigated-to catch ─────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      if (!focusLat || !focusLon) return;
      const lat = parseFloat(focusLat);
      const lon = parseFloat(focusLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      // Small delay so the camera is ready after the tab transition
      const timer = setTimeout(() => {
        mapReadyRef.current && cameraRef.current?.setCamera({
          centerCoordinate: [lon, lat],
          zoomLevel: 14,
          animationDuration: 800,
          animationMode: "flyTo",
        });
      }, 150);
      if (catchId) setHighlightedCatchId(catchId);
      return () => clearTimeout(timer);
    }, [focusLat, focusLon, catchId])
  );


  // ─── GeoJSON ──────────────────────────────────────────────────────────────────

  const catchesGeoJSON: GeoJSON.FeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: [
        ...markers
          .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon) && m.lat !== 0 && m.lon !== 0)
          .map((m) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [m.lon, m.lat] },
            properties: {
              id: m.id,
              species: m.species,
              image_uri: m.image_uri,
              description: m.description,
              length_cm: m.length_cm,
              weight_kg: m.weight_kg,
              created_at: m.created_at,
              source: "own",
            },
          })),
        ...publicMarkers
          .filter((m) => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)) && m.lat !== 0 && m.lon !== 0)
          .map((m) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [Number(m.lon), Number(m.lat)] },
            properties: {
              id: m.id,
              species: m.species,
              image_uri: m.image_uri,
              description: m.description,
              length_cm: m.length_cm,
              weight_kg: m.weight_kg,
              created_at: m.created_at,
              source: "public",
            },
          })),
      ],
    }),
    [markers, publicMarkers]
  );

  const handleMarkerPress = useCallback((e: any) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    if (p.cluster) {
      mapReadyRef.current && cameraRef.current?.setCamera({
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: zoomLevelRef.current + 2,
        animationDuration: 400,
        animationMode: "flyTo",
      });
      return;
    }
    setPreviewCatch({
      id: p.id,
      imageUrl: p.image_uri,
      species: p.species,
      description: p.description,
      length: p.length_cm,
      weight: p.weight_kg,
      createdAt: p.created_at,
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <MapboxGL.MapView
        style={{ flex: 1 }}
        styleURL={STYLE_URL}
        localizeLabels={{ locale: "ru" }}
        logoEnabled={false}
        attributionEnabled={true}
        onDidFinishLoadingMap={() => { mapReadyRef.current = true; }}
        onCameraChanged={(state) => { zoomLevelRef.current = state.properties.zoom; }}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: centerCoord, zoomLevel: 10 }}
        />

        <MapboxGL.UserLocation visible androidRenderMode="compass" />

        <MapboxGL.ShapeSource
          id="catches"
          shape={catchesGeoJSON}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
          onPress={handleMarkerPress}
        >
          {/* Cluster background circle */}
          <MapboxGL.CircleLayer
            id="clusters"
            filter={["has", "point_count"]}
            style={{
              circleRadius: ["step", ["get", "point_count"], 20, 10, 28, 30, 36],
              circleColor: "#0ea5e9",
              circleOpacity: 0.9,
              circleStrokeWidth: 2,
              circleStrokeColor: "#ffffff",
            }}
          />

          {/* Cluster count label */}
          <MapboxGL.SymbolLayer
            id="cluster-count"
            filter={["has", "point_count"]}
            style={{
              textField: ["get", "point_count_abbreviated"],
              textColor: "#ffffff",
              textSize: 14,
              textFont: ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            }}
          />

          {/* Individual catch marker */}
          <MapboxGL.CircleLayer
            id="catch-points"
            filter={["!", ["has", "point_count"]]}
            style={{
              circleRadius: 5,
              circleColor: [
                "match",
                ["get", "source"],
                "own", "#f97316",
                "#22c55e",
              ],
              circleStrokeWidth: 2.5,
              circleStrokeColor: "#ffffff",
            }}
          />
        </MapboxGL.ShapeSource>
      </MapboxGL.MapView>

      {/* Map controls */}
      <View style={styles.controls}>
        <Pressable
          style={styles.controlBtn}
          onPress={centerOnUser}
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Text style={styles.controlBtnText}>◎</Text>
        </Pressable>
        <Pressable
          style={styles.controlBtn}
          onPress={() =>
            mapReadyRef.current && cameraRef.current?.setCamera({
              zoomLevel: zoomLevelRef.current + 1,
              animationDuration: 300,
              animationMode: "easeTo",
            })
          }
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Text style={styles.controlBtnText}>＋</Text>
        </Pressable>
        <Pressable
          style={[styles.controlBtn, { marginBottom: 0 }]}
          onPress={() =>
            mapReadyRef.current && cameraRef.current?.setCamera({
              zoomLevel: zoomLevelRef.current - 1,
              animationDuration: 300,
              animationMode: "easeTo",
            })
          }
          android_ripple={{ color: "#00000020", borderless: false, radius: 22 }}
        >
          <Text style={styles.controlBtnText}>－</Text>
        </Pressable>
      </View>

      {/* Preview card */}
      {previewCatch && (
        <TouchableOpacity
          style={styles.previewCard}
          activeOpacity={0.97}
          onPress={() => { setDetailCatch(previewCatch); setPreviewCatch(null); }}
        >
          <ExpoImage
            source={previewCatch.imageUrl ? { uri: previewCatch.imageUrl } : require("../../assets/placeholder.png")}
            placeholder={require("../../assets/placeholder.png")}
            contentFit="cover"
            style={styles.previewCardImage}
          />
          <View style={styles.previewCardBody}>
            <Text style={styles.previewCardSpecies} numberOfLines={1}>
              {getSpeciesLabel(previewCatch.species, language)}
            </Text>
            <Text style={styles.previewCardDate}>
              {(() => {
                if (!previewCatch.createdAt) return t("recently");
                const d = new Date(previewCatch.createdAt);
                return isNaN(d.getTime()) ? t("recently") : d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
              })()}
            </Text>
            {previewCatch.description ? (
              <Text style={styles.previewCardDesc} numberOfLines={2}>{previewCatch.description}</Text>
            ) : null}
            <View style={styles.previewCardBtn}>
              <Text style={styles.previewCardBtnText}>{language === "ru" ? "Открыть" : "View catch"}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.previewCardClose} onPress={() => setPreviewCatch(null)} hitSlop={8}>
            <FontAwesome name="times" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Full screen catch detail modal */}
      <Modal
        visible={!!detailCatch}
        animationType="slide"
        onRequestClose={() => { setDetailCatch(null); setDetailPhotoIndex(0); }}
      >
        <SafeAreaView style={styles.detailScreen}>
          <View style={styles.detailHeader}>
            <TouchableOpacity style={styles.detailClose} onPress={() => { setDetailCatch(null); setDetailPhotoIndex(0); }}>
              <FontAwesome name="arrow-left" size={20} color="#e6eef8" />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>
              {getSpeciesLabel(detailCatch?.species, language)}
            </Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            {/* User info */}
            {user && (
              <View style={styles.detailUserRow}>
                <View style={styles.detailAvatar}>
                  {user.avatar ? (
                    <ExpoImage
                      source={{ uri: `${pb.baseURL}/api/files/_pb_users_auth_/${user.id}/${user.avatar}` }}
                      contentFit="cover"
                      style={styles.detailAvatarImg}
                    />
                  ) : (
                    <Text style={styles.detailAvatarText}>
                      {(user.name || user.username || "?").slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View>
                  {user.name ? <Text style={styles.detailUserName}>{user.name}</Text> : null}
                  {user.username ? <Text style={styles.detailUserHandle}>@{user.username}</Text> : null}
                </View>
              </View>
            )}

            {/* Photo carousel */}
            {(() => {
              const photos = [detailCatch?.imageUrl].filter(Boolean) as string[];
              if (photos.length === 0) return null;
              return (
                <View>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    style={{ width: SCREEN_WIDTH }}
                    onMomentumScrollEnd={(e) =>
                      setDetailPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
                    }
                  >
                    {photos.map((uri, i) => (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.9}
                        onPress={() => {
                          setFullscreenPhotos(photos);
                          setFullscreenIndex(i);
                          setTimeout(() => fullscreenScrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: false }), 50);
                        }}
                      >
                        <ExpoImage
                          source={{ uri }}
                          placeholder={require("../../assets/placeholder.png")}
                          contentFit="cover"
                          style={{ width: SCREEN_WIDTH, height: 280 }}
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {photos.length > 1 && (
                    <View style={styles.dotRow}>
                      {photos.map((_, i) => (
                        <View key={i} style={[styles.dot, i === detailPhotoIndex && styles.dotActive]} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Like and comment row */}
            <View style={styles.likeCommentRow}>
              <TouchableOpacity style={styles.likeBtn} onPress={toggleLike}>
                <FontAwesome
                  name={isLiked ? "thumbs-up" : "thumbs-o-up"}
                  size={22}
                  color={isLiked ? "#60a5fa" : "#64748b"}
                />
                <Text style={[styles.likeCount, isLiked && styles.likeCountActive]}>{likeCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.commentBtn} onPress={() => setShowComments((s) => !s)}>
                <FontAwesome name="comment-o" size={22} color="#64748b" />
                <Text style={styles.commentCount}>{catchComments.length}</Text>
              </TouchableOpacity>
            </View>

            {showComments && (
              <View style={styles.commentsSection}>
                {catchComments.map((c, i) => (
                  <View key={c.id || i} style={styles.commentItem}>
                    <Text style={styles.commentUsername}>@{c.username}</Text>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                ))}
                <View style={styles.commentInputRow}>
                  <TextInput
                    style={styles.commentInput}
                    value={newComment}
                    onChangeText={setNewComment}
                    placeholder={language === "ru" ? "Добавить комментарий..." : "Add a comment..."}
                    placeholderTextColor="#475569"
                    returnKeyType="send"
                    onSubmitEditing={submitComment}
                  />
                  <TouchableOpacity onPress={submitComment} disabled={submittingComment} style={{ padding: 8 }}>
                    {submittingComment ? (
                      <ActivityIndicator size="small" color="#60a5fa" />
                    ) : (
                      <FontAwesome name="send" size={18} color="#60a5fa" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.detailBody}>
              <Text style={styles.speciesText}>{getSpeciesLabel(detailCatch?.species, language)}</Text>
              <Text style={styles.dateText}>
                {(() => {
                  if (!detailCatch?.createdAt) return t("recently");
                  const d = new Date(detailCatch.createdAt);
                  return isNaN(d.getTime()) ? t("recently") : d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US");
                })()}
              </Text>

              {detailCatch?.description && (
                <Text style={styles.detailText}>{detailCatch.description}</Text>
              )}

              {(detailCatch?.length || detailCatch?.weight) && (
                <Text style={styles.detailText}>
                  {detailCatch.length ? `${detailCatch.length} ${language === "ru" ? "см" : "cm"}` : ""}
                  {detailCatch.length && detailCatch.weight ? " • " : ""}
                  {detailCatch.weight ? `${detailCatch.weight} ${language === "ru" ? "кг" : "kg"}` : ""}
                </Text>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Fullscreen photo viewer */}
      <Modal visible={fullscreenPhotos.length > 0} transparent animationType="fade" onRequestClose={() => setFullscreenPhotos([])}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <ScrollView
            ref={fullscreenScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            style={{ width: SCREEN_WIDTH, flex: 1 }}
            onMomentumScrollEnd={(e) =>
              setFullscreenIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
            }
          >
            {fullscreenPhotos.map((uri, i) => (
              <Pressable key={i} style={{ width: SCREEN_WIDTH, flex: 1, justifyContent: "center" }} onPress={() => setFullscreenPhotos([])}>
                <ExpoImage source={{ uri }} contentFit="contain" style={{ width: SCREEN_WIDTH, height: "100%" }} />
              </Pressable>
            ))}
          </ScrollView>
          {fullscreenPhotos.length > 1 && (
            <View style={{ position: "absolute", bottom: 40, width: "100%", flexDirection: "row", justifyContent: "center", gap: 6 }}>
              {fullscreenPhotos.map((_, i) => (
                <View key={i} style={{ width: i === fullscreenIndex ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === fullscreenIndex ? "#fff" : "rgba(255,255,255,0.35)" }} />
              ))}
            </View>
          )}
          <Pressable onPress={() => setFullscreenPhotos([])} style={{ position: "absolute", top: 52, right: 20, padding: 8 }}>
            <FontAwesome name="times" size={22} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    position: "absolute",
    left: 16,
    bottom: 196,
    alignItems: "center",
    zIndex: 9999,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  controlBtnText: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  closeBtn: {
    position: "absolute",
    top: 4,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  previewWrapper: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  previewImage: {
    width: 250,
    height: 250,
    borderRadius: 10,
    resizeMode: "cover",
  },
  speciesText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  detailText: {
    color: "#cbd5e1",
    fontSize: 16,
    marginBottom: 4,
  },
  dateText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 4,
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  detailScreen: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  detailClose: {
    padding: 16,
  },
  detailContent: {
    paddingBottom: 40,
  },
  detailImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    resizeMode: "cover",
    marginBottom: 20,
  },
  previewCard: {
    position: "absolute",
    bottom: 16,
    left: 12,
    right: 12,
    height: 160,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  previewCardImage: {
    width: 150,
    height: 160,
  },
  previewCardBody: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  previewCardSpecies: {
    color: "#e6eef8",
    fontSize: 16,
    fontWeight: "700",
  },
  previewCardDate: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 2,
  },
  previewCardDesc: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 4,
    flex: 1,
  },
  previewCardBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  previewCardBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  previewCardClose: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 4,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  detailHeaderTitle: {
    color: "#e6eef8",
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  detailUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  detailAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f3460",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  detailAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  detailAvatarText: { color: "#60a5fa", fontWeight: "700", fontSize: 15 },
  detailUserName: { color: "#e6eef8", fontSize: 15, fontWeight: "600" },
  detailUserHandle: { color: "#64748b", fontSize: 13 },
  detailBody: { paddingHorizontal: 20, paddingTop: 16 },
  dotRow: { flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#334155" },
  dotActive: { backgroundColor: "#60a5fa", width: 16 },
  likeCommentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  likeCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  likeCountActive: { color: "#60a5fa" },
  commentCount: { color: "#64748b", fontSize: 15, fontWeight: "600" },
  commentsSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  commentItem: { marginBottom: 10 },
  commentUsername: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },
  commentText: { color: "#cbd5e1", fontSize: 14, marginTop: 2 },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  commentInput: {
    flex: 1,
    color: "#e6eef8",
    fontSize: 14,
    paddingVertical: 10,
  },
});
