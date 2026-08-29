import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/lib/theme';

type FishLoaderProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** A compact, animated loading state built around the StrikeFeed fish logo. */
export default function FishLoader({ size = 108, style }: FishLoaderProps) {
  const bubbleProgress = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        420,
        bubbleProgress.map((progress) =>
          Animated.timing(progress, {
            toValue: 1,
            duration: 1100,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ),
      { iterations: -1, resetBeforeIteration: true },
    );

    animation.start();
    return () => animation.stop();
  }, [bubbleProgress]);

  const fishSize = Math.round(size * 0.95);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[styles.container, { width: size, height: size }, style]}
    >
      {bubbleProgress.map((progress, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bubble,
            {
              width: index === 1 ? 10 : 14,
              height: index === 1 ? 10 : 14,
              left: size * 0.8 + index * 2,
              top: size * 0.4 + index * 3,
              opacity: progress.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.8, 0.55, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.18] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.28] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.15] }) },
              ],
            },
          ]}
        />
      ))}
      <View>
        <Image source={require('../assets/images/fish-loader-body.png')} style={{ width: fishSize, height: fishSize }} resizeMode="contain" />
        <View style={styles.tail}>
          <Image source={require('../assets/images/fish-loader-tail.png')} style={{ width: fishSize, height: fishSize }} resizeMode="contain" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  tail: {
    ...StyleSheet.absoluteFillObject,
  },
});
