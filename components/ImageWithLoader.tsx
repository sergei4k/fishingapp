import { Image as ExpoImage, ImageProps } from "expo-image";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

type Props = ImageProps & { loaderColor?: string };

export default function ImageWithLoader({ loaderColor = "#38bdf8", style, ...props }: Props) {
  const [loading, setLoading] = useState(true);

  return (
    <View style={[styles.wrapper, style as any]}>
      <ExpoImage
        {...props}
        style={StyleSheet.absoluteFill}
        cachePolicy="memory-disk"
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <ActivityIndicator
          size="small"
          color={loaderColor}
          style={styles.indicator}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: "hidden" },
  indicator: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignSelf: "center" },
});
