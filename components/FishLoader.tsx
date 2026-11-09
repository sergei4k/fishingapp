import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type FishLoaderProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export default function FishLoader({ size = 108, style }: FishLoaderProps) {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const fishSize = Math.round(size * 0.95);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[styles.container, { width: size, height: size }, style]}
    >
      {reduceMotion ? (
        <View style={{ width: fishSize, height: fishSize }}>
          <Image source={require('../assets/images/fish-loader-body.png')} style={StyleSheet.absoluteFill} contentFit="contain" />
          <Image source={require('../assets/images/fish-loader-tail.png')} style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>
      ) : (
        <Image source={require('../assets/images/fish-swimming.gif')} style={{ width: fishSize, height: fishSize }} contentFit="contain" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
